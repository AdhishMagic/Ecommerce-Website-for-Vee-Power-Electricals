"""
Administrative Settings API views.

Every endpoint in this module is gated by the project's existing ``IsAdminUser``
permission, which yields 401 for unauthenticated callers (JWT authentication
provides the challenge), 403 for authenticated non-administrators, and 200 for
administrators. Frontend route guards are never relied upon.

All operations act on the *authenticated* administrator (``request.user``); no
endpoint accepts a user id, so one administrator can never read or modify
another account (no IDOR, no privileged-field mass assignment).
"""
import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.commercial_config.services.audit_service import log_admin_config_change
from apps.core.models import AdminConfigAuditLog
from apps.users.permissions import IsAdminUser

from .models import NotificationSettings
from .serializers import (
    NotificationSettingsSerializer,
    PasswordChangeSerializer,
    SecurityOverviewSerializer,
    SystemInformationSerializer,
)
from .services import build_system_information, issue_token_pair, revoke_all_sessions, session_overview

logger = logging.getLogger(__name__)


def _client_ip(request) -> str | None:
    return request.META.get('REMOTE_ADDR')


def _rotate_and_respond(user, message: str, sessions_revoked: int) -> Response:
    """Revoke every existing refresh session and continue the current one."""
    access, refresh = issue_token_pair(user)
    return Response(
        {
            'message': message,
            'sessions_revoked': sessions_revoked,
            'access': access,
            'refresh': refresh,
        },
        status=status.HTTP_200_OK,
    )


class NotificationSettingsView(APIView):
    """
    GET   /api/v1/settings/notifications/  (Admin)
    PATCH /api/v1/settings/notifications/  (Admin)

    Read and update the system-wide outbound notification policy. Persisted in
    MySQL and enforced by ``CommunicationService`` at dispatch time.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        policy = NotificationSettings.get_solo()
        return Response(NotificationSettingsSerializer(policy).data)

    def patch(self, request):
        policy = NotificationSettings.get_solo()
        old_value = NotificationSettingsSerializer(policy).data

        serializer = NotificationSettingsSerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)

        policy.refresh_from_db()
        new_value = NotificationSettingsSerializer(policy).data

        log_admin_config_change(
            domain='notifications',
            record_id=policy.id,
            action_type='UPDATE',
            user=request.user,
            old_value=old_value,
            new_value=new_value,
            change_reason=request.data.get(
                'change_reason', 'Updated outbound notification policy'
            ),
            ip_address=_client_ip(request),
        )

        # Return the authoritative persisted row, not the request payload.
        return Response(new_value, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """
    POST /api/v1/settings/change-password/  (Admin)

    Verifies the current password, applies the project's Django password
    validators, stores only the hash (via ``set_password``), revokes every
    existing refresh session, and returns a fresh token pair for the current
    session following the existing SimpleJWT policy.

    Plaintext and hashed passwords are never logged or returned.
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        sessions_revoked = revoke_all_sessions(user)

        # Security audit trail: records that a credential change happened, never
        # the credential itself. ``log_admin_config_change`` additionally strips
        # any key whose name looks sensitive.
        log_admin_config_change(
            domain='admin_account',
            record_id=user.id,
            action_type='UPDATE',
            user=user,
            old_value=None,
            new_value={
                'event': 'PASSWORD_CHANGED',
                'sessions_revoked': sessions_revoked,
            },
            change_reason='Administrator password changed',
            ip_address=_client_ip(request),
        )

        logger.info(
            'Password changed for user id=%s; %s existing session(s) revoked',
            user.id,
            sessions_revoked,
        )

        return _rotate_and_respond(
            user,
            'Password changed successfully. Other sessions have been signed out.',
            sessions_revoked,
        )


class SecurityOverviewView(APIView):
    """
    GET /api/v1/settings/security/  (Admin)

    Read-only security posture for the authenticated administrator: role, account
    status, last recorded login, live session count (from the SimpleJWT blacklist
    tables), and this administrator's configuration-change history.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        user = request.user
        sessions = session_overview(user)

        changes = AdminConfigAuditLog.objects.filter(admin_user=user)
        last_change = changes.order_by('-created_at').values_list('created_at', flat=True).first()

        payload = {
            'email': user.email,
            'role': user.role,
            'role_display': user.get_role_display(),
            'is_active': user.is_active,
            'account_status': 'Active' if user.is_active else 'Disabled',
            'last_login': user.last_login,
            'account_created_at': getattr(user, 'created_at', None),
            'active_sessions_count': sessions['count'],
            'recent_sessions': sessions['recent'],
            'configuration_changes_count': changes.count(),
            'last_configuration_change_at': last_change,
        }
        return Response(SecurityOverviewSerializer(payload).data)


class RevokeSessionsView(APIView):
    """
    POST /api/v1/settings/security/revoke-sessions/  (Admin)

    Signs the administrator out of every other device by blacklisting all
    outstanding refresh tokens, then issues a fresh pair so the current session
    continues uninterrupted.
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        sessions_revoked = revoke_all_sessions(request.user)

        log_admin_config_change(
            domain='admin_account',
            record_id=request.user.id,
            action_type='UPDATE',
            user=request.user,
            old_value=None,
            new_value={'event': 'SESSIONS_REVOKED', 'sessions_revoked': sessions_revoked},
            change_reason='Administrator revoked all active sessions',
            ip_address=_client_ip(request),
        )

        return _rotate_and_respond(
            request.user,
            f'{sessions_revoked} session(s) signed out.',
            sessions_revoked,
        )


class SystemInformationView(APIView):
    """
    GET /api/v1/settings/system/  (Admin)

    Read-only environment and dependency diagnostics. Contains no secret and no
    private infrastructure detail (see ``services.build_system_information``).
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(SystemInformationSerializer(build_system_information()).data)
