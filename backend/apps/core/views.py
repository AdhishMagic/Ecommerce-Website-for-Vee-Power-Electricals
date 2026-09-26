from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from apps.users.permissions import IsAdminUser
from .models import ContactInquiry
from .serializers import (
    ContactInquiryPublicSerializer,
    ContactInquiryAdminSerializer,
)


class ContactInquiryViewSet(viewsets.ModelViewSet):
    """
    Public customer contact form submission (POST) and administrative ticket management.
    """
    queryset = ContactInquiry.objects.all().order_by('-created_at')

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == 'create':
            return ContactInquiryPublicSerializer
        return ContactInquiryAdminSerializer

    def perform_create(self, serializer):
        inquiry = serializer.save()
        from apps.core.services.communication_service import CommunicationService
        CommunicationService.send_inquiry_acknowledgement(inquiry)


    def get_queryset(self):
        qs = ContactInquiry.objects.all().order_by('-created_at')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(phone__icontains=search) |
                Q(email__icontains=search) |
                Q(subject__icontains=search)
            )
        return qs


# Aliases for backwards compatibility with prior imports
ContactInquiryPublicCreateView = ContactInquiryViewSet
ContactInquiryAdminViewSet = ContactInquiryViewSet
