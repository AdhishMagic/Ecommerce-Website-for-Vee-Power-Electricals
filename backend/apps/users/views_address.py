from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CustomerAddress
from .serializers_address import CustomerAddressSerializer


class CustomerAddressViewSet(viewsets.ModelViewSet):
    """
    CRUD API for Customer Addresses strictly scoped to authenticated request.user.
    Provides dedicated `set-default` action enforcing single-default-address per user.
    """
    serializer_class = CustomerAddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        # Admin can view other users' addresses with explicit query params (e.g., in backoffice tools)
        if (user.is_staff or getattr(user, 'role', '') == 'admin') and (
            params.get('all') == 'true' or params.get('user_id')
        ):
            user_param = params.get('user_id')
            if user_param:
                return CustomerAddress.objects.filter(user_id=user_param).order_by('-is_default', '-id')
            return CustomerAddress.objects.all().order_by('-is_default', '-id')
        # Default: each user (including admin shopping in retail storefront) strictly sees their own addresses
        return CustomerAddress.objects.filter(user=user).order_by('-is_default', '-id')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='set-default')
    def set_default(self, request, pk=None):
        address = self.get_object()
        with transaction.atomic():
            address.is_default = True
            address.save()

        serializer = self.get_serializer(address)
        return Response(
            {
                "message": "Address set as default successfully.",
                "address": serializer.data
            },
            status=status.HTTP_200_OK
        )
