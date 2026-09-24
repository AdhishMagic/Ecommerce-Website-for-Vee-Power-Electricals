from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.permissions import IsAdminUser
from .models import (
    Client,
    Quotation,
    Invoice,
    PaymentTransaction,
    PayoutSettlement,
    QuotationStatus,
    InvoiceStatus,
)
from .serializers import (
    ClientSerializer,
    QuotationSerializer,
    InvoiceSerializer,
    PaymentTransactionSerializer,
    PayoutSettlementSerializer,
)


class ClientViewSet(viewsets.ModelViewSet):
    """
    Administrative management for B2B corporate buyers, builders, and contractors.
    """
    queryset = Client.objects.all().order_by('company_name')
    serializer_class = ClientSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Client.objects.all().order_by('company_name')
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                Q(company_name__icontains=search) |
                Q(client_code__icontains=search) |
                Q(gstin__icontains=search) |
                Q(contact_person__icontains=search)
            )
        return qs


class QuotationViewSet(viewsets.ModelViewSet):
    """
    Administrative commercial quotations and estimates.
    """
    queryset = Quotation.objects.select_related('client').prefetch_related('items').all().order_by('-created_at')
    serializer_class = QuotationSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Quotation.objects.select_related('client').prefetch_related('items').all().order_by('-created_at')
        client_id = self.request.query_params.get('client') or self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(client_id=client_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        quotation = self.get_object()
        new_status = request.data.get('status')
        if new_status not in [s.value for s in QuotationStatus]:
            return Response(
                {"detail": f"Invalid quotation status. Valid choices are: {[s.value for s in QuotationStatus]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quotation.status = new_status
        quotation.save()
        return Response(QuotationSerializer(quotation).data, status=status.HTTP_200_OK)


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    Administrative GST tax invoicing ledger adhering to 1:N order relationship.
    """
    queryset = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items').all().order_by('-created_at')
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items').all().order_by('-created_at')
        client_id = self.request.query_params.get('client')
        if client_id:
            qs = qs.filter(client_id=client_id)

        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(order_id=order_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        invoice = self.get_object()
        new_status = request.data.get('status')
        if new_status not in [s.value for s in InvoiceStatus]:
            return Response(
                {"detail": f"Invalid invoice status. Valid choices are: {[s.value for s in InvoiceStatus]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.status = new_status
        invoice.save()
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_200_OK)


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit visibility for payment transactions.
    """
    queryset = PaymentTransaction.objects.select_related('order', 'invoice').all().order_by('-created_at')
    serializer_class = PaymentTransactionSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = PaymentTransaction.objects.select_related('order', 'invoice').all().order_by('-created_at')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class PayoutSettlementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit visibility for merchant bank settlements.
    """
    queryset = PayoutSettlement.objects.all().order_by('-created_at')
    serializer_class = PayoutSettlementSerializer
    permission_classes = [IsAdminUser]
