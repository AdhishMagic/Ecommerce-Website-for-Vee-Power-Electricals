from rest_framework import permissions
from apps.users.models import UserRole


class IsCustomer(permissions.BasePermission):
    """
    Allows access only to authenticated users with the Customer role.
    Excludes staff and administrative users.
    """
    message = "Access restricted to customer accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == UserRole.CUSTOMER
            and not request.user.is_staff
            and not request.user.is_superuser
        )


class IsAdminUser(permissions.BasePermission):
    """
    Allows access to users with ADMIN role, staff status, or superuser status.
    """
    message = "Administrative privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.role == UserRole.ADMIN
                or request.user.is_staff
                or request.user.is_superuser
            )
        )


class IsStaffOrReadOnly(permissions.BasePermission):
    """
    Allows read-only access (GET, HEAD, OPTIONS) to authenticated users,
    and write access (POST, PUT, PATCH, DELETE) only to staff or admin users.
    """
    message = "Staff privileges required for write actions."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user.role == UserRole.ADMIN
            or request.user.is_staff
            or request.user.is_superuser
        )


class IsSuperAdminUser(permissions.BasePermission):
    """
    Allows access only to superusers.
    """
    message = "Superuser privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission allowing the owner of an object or an admin to access/modify it.
    """
    message = "You do not have permission to access or modify this resource."

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role == UserRole.ADMIN or request.user.is_staff or request.user.is_superuser:
            return True
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return obj == request.user
