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
    Expense,
)
from .serializers import (
    ClientSerializer,
    QuotationSerializer,
    InvoiceSerializer,
    PaymentTransactionSerializer,
    PayoutSettlementSerializer,
    ExpenseSerializer,
)


class ClientViewSet(viewsets.ModelViewSet):
    """
    Administrative management for B2B corporate buyers, builders, and contractors.
    Strict RBAC enforced: Admin/Staff only.
    """
    queryset = Client.objects.prefetch_related('invoices', 'quotations').all().order_by('company_name', 'id')
    serializer_class = ClientSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Client.objects.prefetch_related('invoices', 'quotations').all().order_by('company_name', 'id')
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(company_name__icontains=search) |
                Q(client_code__icontains=search) |
                Q(gstin__icontains=search) |
                Q(contact_person__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ['true', '1']:
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ['false', '0']:
                qs = qs.filter(is_active=False)
        return qs

    @action(detail=True, methods=['get'], url_path='credit')
    def credit_details(self, request, pk=None):
        """
        Returns authoritative real-time credit diagnosis for client.
        """
        client = self.get_object()
        from apps.finance.services.credit_service import CreditService
        credit_info = CreditService.check_credit_availability(client)
        return Response(credit_info, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch', 'post'], url_path='credit-limit')
    def adjust_credit_limit(self, request, pk=None):
        """
        Dedicated endpoint to update client credit limit with audit reason.
        """
        from decimal import Decimal
        from django.core.exceptions import ValidationError as DjangoValidationError
        client = self.get_object()
        new_limit = request.data.get('credit_limit')
        if new_limit is None:
            return Response({"detail": "credit_limit is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_limit = Decimal(str(new_limit))
        except (ValueError, TypeError):
            return Response({"detail": "Invalid credit limit value."}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '')
        from apps.finance.services.credit_service import CreditService
        try:
            client = CreditService.record_credit_limit_change(
                client=client,
                new_limit=new_limit,
                changed_by=request.user,
                reason=reason,
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return Response(ClientSerializer(client, context={'request': request}).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate_client(self, request, pk=None):
        """Deactivate a client account."""
        client = self.get_object()
        client.is_active = False
        client.save(update_fields=['is_active', 'updated_at'])
        from apps.core.models import AdminConfigAuditLog, AuditActionType
        AdminConfigAuditLog.objects.create(
            admin_user=request.user,
            domain='client',
            record_id=client.id,
            action_type=AuditActionType.DEACTIVATE,
            old_value={'is_active': True},
            new_value={'is_active': False},
            change_reason=request.data.get('reason', 'Client deactivated via API'),
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(ClientSerializer(client, context={'request': request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='activate')
    def activate_client(self, request, pk=None):
        """Activate a client account."""
        client = self.get_object()
        client.is_active = True
        client.save(update_fields=['is_active', 'updated_at'])
        from apps.core.models import AdminConfigAuditLog, AuditActionType
        AdminConfigAuditLog.objects.create(
            admin_user=request.user,
            domain='client',
            record_id=client.id,
            action_type=AuditActionType.UPDATE,
            old_value={'is_active': False},
            new_value={'is_active': True},
            change_reason=request.data.get('reason', 'Client activated via API'),
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response(ClientSerializer(client, context={'request': request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='quotations')
    def client_quotations(self, request, pk=None):
        """List all quotations associated with this client."""
        client = self.get_object()
        quotations = Quotation.objects.filter(client=client).select_related('created_by').prefetch_related('items__product').order_by('-created_at')
        from .serializers import QuotationSerializer
        page = self.paginate_queryset(quotations)
        if page is not None:
            serializer = QuotationSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = QuotationSerializer(quotations, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='invoices')
    def client_invoices(self, request, pk=None):
        """List all invoices associated with this client."""
        client = self.get_object()
        invoices = Invoice.objects.filter(client=client).select_related('order', 'quotation').prefetch_related('items__product').order_by('-created_at')
        from .serializers import InvoiceSerializer
        page = self.paginate_queryset(invoices)
        if page is not None:
            serializer = InvoiceSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = InvoiceSerializer(invoices, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='payments')
    def client_payments(self, request, pk=None):
        """List all payments associated with this client's invoices."""
        client = self.get_object()
        payments = PaymentTransaction.objects.filter(invoice__client=client).select_related('invoice', 'order').order_by('-created_at')
        from .serializers import PaymentTransactionSerializer
        page = self.paginate_queryset(payments)
        if page is not None:
            serializer = PaymentTransactionSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = PaymentTransactionSerializer(payments, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='audit-history')
    def client_audit_history(self, request, pk=None):
        """List credit limit and administrative audit trail for this client."""
        client = self.get_object()
        from apps.core.models import AdminConfigAuditLog
        logs = AdminConfigAuditLog.objects.filter(
            domain__in=['client', 'client_credit'],
            record_id=client.id
        ).select_related('admin_user').order_by('-created_at')
        data = [{
            'id': log.id,
            'domain': log.domain,
            'action_type': log.action_type,
            'old_value': log.old_value,
            'new_value': log.new_value,
            'change_reason': log.change_reason,
            'admin_user': log.admin_user.email if log.admin_user else 'System',
            'created_at': log.created_at.isoformat(),
        } for log in logs]
        return Response(data, status=status.HTTP_200_OK)


class QuotationViewSet(viewsets.ModelViewSet):
    """
    Administrative commercial quotations and estimates.
    """
    queryset = Quotation.objects.select_related('client', 'created_by').prefetch_related('items__product').all().order_by('-created_at')
    serializer_class = QuotationSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Quotation.objects.select_related('client', 'created_by').prefetch_related('items__product').all().order_by('-created_at')
        client_id = self.request.query_params.get('client') or self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(client_id=client_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        quotation = self.get_object()
        if quotation.status in [QuotationStatus.APPROVED, QuotationStatus.CONVERTED]:
            return Response(
                {"detail": f"Cannot modify quotation #{quotation.quotation_number} in '{quotation.status}' status."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        quotation = self.get_object()
        if quotation.status in [QuotationStatus.APPROVED, QuotationStatus.CONVERTED]:
            return Response(
                {"detail": f"Cannot delete quotation #{quotation.quotation_number} in '{quotation.status}' status."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from apps.finance.services import QuotationService

        quotation = self.get_object()
        new_status = request.data.get('status')
        if not new_status or new_status not in [s.value for s in QuotationStatus]:
            return Response(
                {"detail": f"Invalid quotation status. Valid choices are: {[s.value for s in QuotationStatus]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            quotation = QuotationService.transition_status(
                quotation_id=quotation.id,
                target_status=new_status,
                changed_by=request.user,
                reason=request.data.get('reason', '')
            )
            return Response(QuotationSerializer(quotation).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert_to_invoice(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from apps.finance.services import QuotationService

        quotation = self.get_object()
        notes = request.data.get('notes')
        try:
            invoice = QuotationService.convert_quotation_to_invoice(
                quotation_id=quotation.id,
                converted_by=request.user,
                notes=notes
            )
            return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    Administrative GST tax invoicing ledger adhering to 1:N order relationship.
    """
    queryset = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items__product').all().order_by('-created_at')
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items__product').all().order_by('-created_at')
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

    def destroy(self, request, *args, **kwargs):
        invoice = self.get_object()
        if invoice.status == InvoiceStatus.PAID:
            return Response(
                {"detail": f"Cannot delete paid statutory invoice #{invoice.invoice_number}."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        invoice = self.get_object()
        new_status = request.data.get('status')
        if not new_status or new_status not in [s.value for s in InvoiceStatus]:
            return Response(
                {"detail": f"Invalid invoice status. Valid choices are: {[s.value for s in InvoiceStatus]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.status = new_status
        if new_status == InvoiceStatus.PAID:
            invoice.payment_status = 'Paid'
        elif new_status == InvoiceStatus.CANCELLED:
            invoice.payment_status = 'Cancelled'
        invoice.save(update_fields=['status', 'payment_status', 'updated_at'])
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


class ExpenseViewSet(viewsets.ModelViewSet):
    """
    Administrative operational and capital expense tracking.
    Enforces RBAC controls (Admin/Staff only) and audit logging of creator.
    """
    queryset = Expense.objects.select_related('created_by').all().order_by('-expense_date', '-id')
    serializer_class = ExpenseSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Expense.objects.select_related('created_by').all().order_by('-expense_date', '-id')

        category = self.request.query_params.get('category')
        if category and category != 'All':
            qs = qs.filter(category=category)

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'All':
            qs = qs.filter(status=status_param)

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                Q(description__icontains=search) |
                Q(vendor__icontains=search) |
                Q(category__icontains=search)
            )

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(expense_date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(expense_date__lte=end_date)

        return qs

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()
