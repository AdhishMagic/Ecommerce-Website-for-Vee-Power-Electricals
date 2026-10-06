import calendar
import datetime
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.orders.models import Order, OrderStatus
from apps.users.permissions import IsAdminUser
from .models import (
    Client,
    Quotation,
    Invoice,
    PaymentTransaction,
    PaymentTxStatus,
    PayoutSettlement,
    QuotationStatus,
    InvoiceStatus,
    Expense,
    ExpenseStatus,
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
        from decimal import Decimal
        from django.db.models import Prefetch, Sum, Value, DecimalField
        from django.db.models.functions import Coalesce
        from .models import Invoice, InvoiceStatus, PaymentTransaction, PaymentTxStatus

        unpaid_invoices_prefetch = Prefetch(
            'invoices',
            queryset=Invoice.objects.filter(
                status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]
            ).prefetch_related(
                Prefetch(
                    'payments',
                    queryset=PaymentTransaction.objects.filter(status=PaymentTxStatus.SUCCESS)
                )
            ),
            to_attr='_unpaid_invoices_with_payments'
        )

        qs = Client.objects.prefetch_related(
            unpaid_invoices_prefetch,
            'quotations'
        ).annotate(
            annotated_total_invoiced=Coalesce(
                Sum('invoices__total_amount', filter=~Q(invoices__status=InvoiceStatus.CANCELLED)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2)
            )
        ).order_by('company_name', 'id')

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

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Database-wide aggregates for the B2B Clients Directory KPI cards.

        Computed over the complete ``clients``/``invoices`` tables in the database.
        The directory table is paginated, so summing the visible page would silently
        under-report every total as soon as the client book exceeds one page.
        """
        aggregates = Client.objects.aggregate(
            total_count=Count('id'),
            active_count=Count('id', filter=Q(is_active=True)),
            inactive_count=Count('id', filter=Q(is_active=False)),
            total_credit_limit=Sum('credit_limit'),
        )

        # Authoritative credit exposure: outstanding balance of every non-settled B2B
        # invoice. Materialised once (2 queries) so it agrees exactly with the dashboard
        # ``b2b_outstanding`` and never degrades into a per-client N+1.
        unpaid_invoices = list(
            Invoice.objects.filter(
                client__isnull=False,
                status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE],
            ).prefetch_related('payments')
        )
        total_exposure = sum(
            (inv.outstanding_amount for inv in unpaid_invoices), Decimal('0.00')
        ).quantize(Decimal('0.01'))

        return Response({
            'total_count': aggregates['total_count'] or 0,
            'active_count': aggregates['active_count'] or 0,
            'inactive_count': aggregates['inactive_count'] or 0,
            'total_credit_limit': str(aggregates['total_credit_limit'] or Decimal('0.00')),
            'total_exposure': str(total_exposure),
        }, status=status.HTTP_200_OK)

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
        # select_related('client') avoids one query per invoice for client_name;
        # prefetch_related('payments') lets the paid_amount/outstanding_amount model
        # properties resolve from cache instead of issuing a query per invoice.
        invoices = Invoice.objects.filter(client=client).select_related('client', 'order', 'quotation').prefetch_related('items__product', 'payments').order_by('-created_at')
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
        # invoice__client is required by PaymentTransactionSerializer.customer_email /
        # customer_name, which would otherwise query the client once per payment.
        payments = PaymentTransaction.objects.filter(invoice__client=client).select_related('invoice', 'invoice__client', 'order').order_by('-created_at')
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
        if status_param and status_param != 'All':
            qs = qs.filter(status=status_param)

        # Server-side search so the directory never filters only the visible page.
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(quotation_number__icontains=search) |
                Q(client__company_name__icontains=search) |
                Q(notes__icontains=search)
            )
        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Database-wide quotation aggregates for the Quotations KPI cards.

        Never derived from the paginated quotation page.
        """
        aggregates = Quotation.objects.aggregate(
            total_count=Count('id'),
            total_value=Sum('total_value'),
        )
        by_status = {
            row['status']: {
                'count': row['count'],
                'value': str(row['total'] or '0.00'),
            }
            for row in Quotation.objects.values('status').annotate(
                count=Count('id'), total=Sum('total_value')
            )
        }
        return Response({
            'total_count': aggregates['total_count'] or 0,
            'total_value': str(aggregates['total_value'] or Decimal('0.00')),
            'pending_count': (
                by_status.get(QuotationStatus.DRAFT, {}).get('count', 0)
                + by_status.get(QuotationStatus.SENT, {}).get('count', 0)
            ),
            'converted_count': by_status.get(QuotationStatus.CONVERTED, {}).get('count', 0),
            'approved_count': by_status.get(QuotationStatus.APPROVED, {}).get('count', 0),
            'rejected_count': by_status.get(QuotationStatus.REJECTED, {}).get('count', 0),
            'by_status': by_status,
        }, status=status.HTTP_200_OK)

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
    queryset = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items__product', 'payments').all().order_by('-created_at')
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Invoice.objects.select_related('client', 'order', 'quotation').prefetch_related('items__product', 'payments').all().order_by('-created_at')
        client_id = self.request.query_params.get('client')
        if client_id:
            qs = qs.filter(client_id=client_id)

        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(order_id=order_id)

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'All':
            # Case-insensitive status matching
            for choice in InvoiceStatus:
                if status_param.lower() in [choice.value.lower(), choice.name.lower()]:
                    qs = qs.filter(status=choice.value)
                    break

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(invoice_date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(invoice_date__lte=end_date)

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(invoice_number__icontains=search) |
                Q(client__company_name__icontains=search) |
                Q(order__order_number__icontains=search) |
                Q(quotation__quotation_number__icontains=search)
            )

        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Database-wide invoice aggregates for the Invoices KPI cards.

        Never derived from the paginated invoice page. Collected cash is read from
        successful ``PaymentTransaction`` rows (authoritative money received) rather
        than a derived invoice status flag.
        """
        total_invoiced = Invoice.objects.exclude(
            status=InvoiceStatus.CANCELLED
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

        by_status = {
            row['status']: {
                'count': row['count'],
                'amount': str(row['total'] or '0.00'),
            }
            for row in Invoice.objects.values('status').annotate(
                count=Count('id'), total=Sum('total_amount')
            )
        }

        total_collected = PaymentTransaction.objects.filter(
            status=PaymentTxStatus.SUCCESS
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        unpaid_invoices = list(
            Invoice.objects.filter(
                status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]
            ).prefetch_related('payments')
        )
        total_outstanding = sum(
            (inv.outstanding_amount for inv in unpaid_invoices), Decimal('0.00')
        ).quantize(Decimal('0.01'))

        return Response({
            'total_count': Invoice.objects.count(),
            'total_invoiced': str(total_invoiced),
            'total_collected': str(total_collected),
            'total_outstanding': str(total_outstanding),
            'by_status': by_status,
        }, status=status.HTTP_200_OK)

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
        raw_status = request.data.get('status')
        if not raw_status:
            return Response(
                {"detail": "status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        status_map = {s.value.lower(): s.value for s in InvoiceStatus}
        status_map.update({s.name.lower(): s.value for s in InvoiceStatus})
        normalized = status_map.get(str(raw_status).strip().lower())
        if not normalized:
            return Response(
                {"detail": f"Invalid invoice status. Valid choices are: {[s.value for s in InvoiceStatus]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if normalized == InvoiceStatus.PAID:
            if invoice.outstanding_amount > 0:
                return Response(
                    {"detail": f"Cannot mark invoice #{invoice.invoice_number} as PAID while an outstanding balance of ₹{invoice.outstanding_amount} remains. Record a payment to settle this invoice."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            invoice.payment_status = 'Paid'
        elif normalized == InvoiceStatus.CANCELLED:
            invoice.payment_status = 'Cancelled'
        elif normalized == InvoiceStatus.UNPAID:
            if invoice.paid_amount > 0:
                invoice.payment_status = 'Partially Paid'
            else:
                invoice.payment_status = 'Pending'

        invoice.status = normalized
        invoice.save(update_fields=['status', 'payment_status', 'updated_at'])
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """
        Record authoritative payment transaction against invoice.
        Enforces balance checks and transitions status upon full settlement.
        """
        from apps.finance.services.invoice_service import InvoiceService
        from django.core.exceptions import ValidationError as DjangoValidationError
        invoice = self.get_object()
        amount = request.data.get('amount')
        if amount is None:
            return Response({"detail": "amount is required."}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method', 'NEFT_RTGS')
        gateway = request.data.get('gateway', 'MANUAL')
        gateway_txn_id = request.data.get('gateway_transaction_id')
        notes = request.data.get('notes')

        try:
            txn = InvoiceService.record_payment(
                invoice_id=invoice.id,
                amount=amount,
                payment_method=payment_method,
                gateway=gateway,
                gateway_transaction_id=gateway_txn_id,
                user=request.user,
                notes=notes,
            )
            return Response(PaymentTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='payments')
    def invoice_payments(self, request, pk=None):
        """
        List all payments associated with this specific invoice.
        """
        invoice = self.get_object()
        payments = invoice.payments.all().order_by('-created_at')
        return Response(PaymentTransactionSerializer(payments, many=True).data, status=status.HTTP_200_OK)


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit visibility for payment transactions.
    """
    queryset = PaymentTransaction.objects.select_related('order', 'invoice', 'invoice__client').all().order_by('-created_at')
    serializer_class = PaymentTransactionSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = PaymentTransaction.objects.select_related('order', 'invoice', 'invoice__client').all().order_by('-created_at')
        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'All':
            qs = qs.filter(status=status_param.upper())

        order_param = self.request.query_params.get('order') or self.request.query_params.get('order_id')
        if order_param:
            qs = qs.filter(order_id=order_param)

        invoice_param = self.request.query_params.get('invoice') or self.request.query_params.get('invoice_id')
        if invoice_param:
            qs = qs.filter(invoice_id=invoice_param)

        gateway_param = self.request.query_params.get('gateway')
        if gateway_param and gateway_param != 'All':
            qs = qs.filter(gateway=gateway_param)

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Database-wide payment transaction aggregates for the Transactions KPI cards.
        """
        by_status = {
            row['status']: {
                'count': row['count'],
                'amount': str(row['total'] or '0.00'),
            }
            for row in PaymentTransaction.objects.values('status').annotate(
                count=Count('id'), total=Sum('amount')
            )
        }
        total_collected = PaymentTransaction.objects.filter(
            status=PaymentTxStatus.SUCCESS
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return Response({
            'total_count': PaymentTransaction.objects.count(),
            'total_collected': str(total_collected),
            'success_count': by_status.get(PaymentTxStatus.SUCCESS, {}).get('count', 0),
            'failed_count': by_status.get(PaymentTxStatus.FAILED, {}).get('count', 0),
            'initiated_count': by_status.get(PaymentTxStatus.INITIATED, {}).get('count', 0),
            'refunded_count': by_status.get(PaymentTxStatus.REFUNDED, {}).get('count', 0),
            'by_status': by_status,
        }, status=status.HTTP_200_OK)


class PayoutSettlementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit visibility for merchant bank settlements.
    """
    queryset = PayoutSettlement.objects.all().order_by('-settlement_date', '-id')
    serializer_class = PayoutSettlementSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = PayoutSettlement.objects.all().order_by('-settlement_date', '-id')
        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'All':
            qs = qs.filter(status=status_param)

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(settlement_date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(settlement_date__lte=end_date)

        return qs


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

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Database-wide expense aggregates for the Expenses KPI cards and category chart.

        Never derived from the paginated expense page.
        """
        aggregates = Expense.objects.aggregate(
            total_count=Count('id'),
            total_amount=Sum('amount'),
        )
        by_category = {
            row['category']: {
                'count': row['count'],
                'amount': str(row['total'] or '0.00'),
            }
            for row in Expense.objects.values('category').annotate(
                count=Count('id'), total=Sum('amount')
            )
        }
        by_status = {
            row['status']: {
                'count': row['count'],
                'amount': str(row['total'] or '0.00'),
            }
            for row in Expense.objects.values('status').annotate(
                count=Count('id'), total=Sum('amount')
            )
        }
        return Response({
            'total_count': aggregates['total_count'] or 0,
            'total_amount': str(aggregates['total_amount'] or Decimal('0.00')),
            'pending_count': by_status.get(ExpenseStatus.PENDING, {}).get('count', 0),
            'pending_amount': by_status.get(ExpenseStatus.PENDING, {}).get('amount', '0.00'),
            'by_category': by_category,
            'by_status': by_status,
        }, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()


def resolve_summary_date_range(filter_type, start_date_str=None, end_date_str=None, today=None):
    """
    Single authoritative resolver for every dashboard filter window.

    Returns ``(start_date, end_date)`` calendar dates. ``(None, None)`` means "no date
    restriction" (all-time). Raises ``ValueError`` for unsupported filter types so the
    API can fail loudly instead of silently reporting the wrong period.

    Definitions (project timezone, ``settings.TIME_ZONE``):
      * ``today``          -> today's calendar date only
      * ``current_month``  -> 1st of the current month through today
      * ``previous_month`` -> the complete previous calendar month
      * ``30_days``        -> rolling window: (today - 30 days) through today
      * ``all_time``       -> no restriction (all historical records)
      * ``custom``         -> explicit start/end dates (falls back to current_month when incomplete)
    """
    today = today or timezone.localdate()

    if filter_type == 'today':
        return today, today
    if filter_type == 'current_month':
        return today.replace(day=1), today
    if filter_type == 'previous_month':
        first_this_month = today.replace(day=1)
        prev_month_end = first_this_month - datetime.timedelta(days=1)
        return prev_month_end.replace(day=1), prev_month_end
    if filter_type == '30_days':
        return today - datetime.timedelta(days=30), today
    if filter_type == 'all_time':
        return None, None
    if filter_type == 'custom':
        if start_date_str and end_date_str:
            start_date = datetime.date.fromisoformat(start_date_str)
            end_date = datetime.date.fromisoformat(end_date_str)
            if end_date < start_date:
                start_date, end_date = end_date, start_date
            return start_date, end_date
        return today.replace(day=1), today
    raise ValueError(filter_type)


def resolve_datetime_bounds(start_date, end_date):
    """
    Convert an inclusive calendar-date window into timezone-aware, half-open datetime
    bounds ``[start, end + 1 day)`` for ``DateTimeField`` filters.

    This keeps day boundaries aligned with the project timezone and lets the database
    use the column index instead of evaluating a per-row date conversion.
    """
    tz = timezone.get_current_timezone()
    start_dt = None
    end_dt = None
    if start_date is not None:
        start_dt = datetime.datetime.combine(start_date, datetime.time.min).replace(tzinfo=tz)
    if end_date is not None:
        end_dt = datetime.datetime.combine(
            end_date + datetime.timedelta(days=1), datetime.time.min
        ).replace(tzinfo=tz)
    return start_dt, end_dt


class FinanceSummaryView(APIView):
    """
    Executive financial reporting and Admin dashboard metrics endpoint.
    Aggregates authoritative sales, payments, outstanding, expenses, B2B credit, payout
    settlements, and complete order/return counts directly in the database.
    Enforces strict admin RBAC and deterministic date range filtering.

    Single source of truth for dashboard metrics: no client may derive these totals from
    a paginated record page. Date-filtered metrics (``total_invoiced``, ``total_sales``,
    ``total_expenses``) follow ``filter_type``; balance/operational snapshots
    (``total_outstanding``, ``b2b_outstanding``, order and return counts) always describe
    the complete current database state.
    """
    permission_classes = [IsAdminUser]

    SUPPORTED_FILTERS = ('today', 'current_month', 'previous_month', '30_days', 'all_time', 'custom')
    # Business definition of an order that still requires fulfillment.
    OPEN_ORDER_STATUSES = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED]
    # Business definition of an order with an active/lodged return (rejected returns excluded).
    RETURN_ORDER_STATUSES = [
        OrderStatus.RETURN_REQUESTED,
        OrderStatus.RETURN_APPROVED,
        OrderStatus.RETURN_COMPLETED,
    ]

    def get(self, request):
        today = timezone.localdate()
        filter_type = (request.query_params.get('filter_type') or 'current_month').lower()
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        if filter_type not in self.SUPPORTED_FILTERS:
            return Response(
                {
                    'detail': (
                        f"Unsupported filter_type '{filter_type}'. Supported values: "
                        f"{', '.join(self.SUPPORTED_FILTERS)}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date, end_date = resolve_summary_date_range(
                filter_type, start_date_str, end_date_str, today=today
            )
        except (ValueError, TypeError):
            return Response(
                {
                    'detail': (
                        "Invalid start_date/end_date. Expected ISO dates (YYYY-MM-DD)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_dt, end_dt = resolve_datetime_bounds(start_date, end_date)

        # 1. Total Invoiced (non-cancelled invoices in date range)
        invoices_in_range = Invoice.objects.all()
        if start_date is not None:
            invoices_in_range = invoices_in_range.filter(invoice_date__gte=start_date)
        if end_date is not None:
            invoices_in_range = invoices_in_range.filter(invoice_date__lte=end_date)
        total_invoiced = invoices_in_range.exclude(status=InvoiceStatus.CANCELLED).aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0.00')

        # 2. Total Paid / Total Sales (successful payments in date range)
        payments_in_range = PaymentTransaction.objects.all()
        if start_dt is not None:
            payments_in_range = payments_in_range.filter(created_at__gte=start_dt)
        if end_dt is not None:
            payments_in_range = payments_in_range.filter(created_at__lt=end_dt)
        total_paid = payments_in_range.filter(status=PaymentTxStatus.SUCCESS).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        # 3. Authoritative Outstanding Balances
        # Materialise once: summing a queryset twice previously re-issued the
        # invoice scan (and its payments prefetch) for the B2B sub-total.
        all_unpaid_invoices = list(Invoice.objects.filter(
            status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]
        ).prefetch_related('payments'))
        total_outstanding = sum((inv.outstanding_amount for inv in all_unpaid_invoices), Decimal('0.00')).quantize(Decimal('0.01'))

        b2b_outstanding = sum(
            (inv.outstanding_amount for inv in all_unpaid_invoices if inv.client_id is not None),
            Decimal('0.00')
        ).quantize(Decimal('0.01'))

        # 4. Expenses in date range
        expenses_in_range = Expense.objects.all()
        if start_date is not None:
            expenses_in_range = expenses_in_range.filter(expense_date__gte=start_date)
        if end_date is not None:
            expenses_in_range = expenses_in_range.filter(expense_date__lte=end_date)
        total_expenses = expenses_in_range.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        paid_expenses = expenses_in_range.filter(status='Paid').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # 5. Net Income & Operating Margin
        net_profit = (total_paid - total_expenses).quantize(Decimal('0.01'))
        operating_margin = (
            ((net_profit / total_paid) * Decimal('100.00')).quantize(Decimal('0.01'))
            if total_paid > Decimal('0.00') else Decimal('0.00')
        )

        # 5b. Authoritative order metrics: counted in the database across the COMPLETE
        # orders table (single aggregate query, never derived from a paginated API page).
        order_counts = Order.objects.aggregate(
            total_orders_count=Count('id'),
            pending_orders_count=Count('id', filter=Q(status=OrderStatus.PENDING)),
            confirmed_orders_count=Count('id', filter=Q(status=OrderStatus.CONFIRMED)),
            packed_orders_count=Count('id', filter=Q(status=OrderStatus.PACKED)),
            shipped_orders_count=Count('id', filter=Q(status=OrderStatus.SHIPPED)),
            delivered_orders_count=Count('id', filter=Q(status=OrderStatus.DELIVERED)),
            cancelled_orders_count=Count('id', filter=Q(status=OrderStatus.CANCELLED)),
            return_requested_count=Count('id', filter=Q(status=OrderStatus.RETURN_REQUESTED)),
            return_approved_count=Count('id', filter=Q(status=OrderStatus.RETURN_APPROVED)),
            return_rejected_count=Count('id', filter=Q(status=OrderStatus.RETURN_REJECTED)),
            return_completed_count=Count('id', filter=Q(status=OrderStatus.RETURN_COMPLETED)),
        )
        total_orders_count = order_counts['total_orders_count']
        open_orders_count = sum(
            order_counts[key] for key in (
                'pending_orders_count', 'confirmed_orders_count', 'packed_orders_count'
            )
        )
        # Courier hand-over state governed by the canonical order FSM ('SHIPPED').
        out_for_delivery_count = order_counts['shipped_orders_count']
        returns_count = sum(
            order_counts[key] for key in (
                'return_requested_count', 'return_approved_count', 'return_completed_count'
            )
        )

        # 6. Payout Settlements in date range
        payouts_in_range = PayoutSettlement.objects.all()
        if start_date is not None:
            payouts_in_range = payouts_in_range.filter(settlement_date__gte=start_date)
        if end_date is not None:
            payouts_in_range = payouts_in_range.filter(settlement_date__lte=end_date)
        settled_payouts = payouts_in_range.filter(status='Settled').aggregate(
            gross=Sum('gross_amount'),
            fees=Sum('gateway_fee'),
            net=Sum('net_amount')
        )

        # 7. 6-Month Monthly Trend
        monthly_trend = []
        for i in range(5, -1, -1):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            month_start = datetime.date(y, m, 1)
            _, num_days = calendar.monthrange(y, m)
            month_end = datetime.date(y, m, num_days)

            month_start_dt, month_end_dt = resolve_datetime_bounds(month_start, month_end)
            m_rev = PaymentTransaction.objects.filter(
                status=PaymentTxStatus.SUCCESS,
                created_at__gte=month_start_dt,
                created_at__lt=month_end_dt
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            m_exp = Expense.objects.filter(
                expense_date__gte=month_start,
                expense_date__lte=month_end
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            month_name = month_start.strftime("%b")
            month_label = month_start.strftime("%b %Y")
            monthly_trend.append({
                'month': month_name,
                'month_label': month_label,
                'revenue': float(m_rev),
                'expenses': float(m_exp),
                'net': float(m_rev - m_exp),
            })

        # 8. Status breakdowns
        inv_counts = invoices_in_range.values('status').annotate(
            count=Count('id'),
            total=Sum('total_amount')
        )
        invoice_status_summary = {
            item['status']: {
                'count': item['count'],
                'amount': str(item['total'] or '0.00')
            }
            for item in inv_counts
        }

        pay_counts = payments_in_range.values('status').annotate(
            count=Count('id'),
            total=Sum('amount')
        )
        payment_status_summary = {
            item['status']: {
                'count': item['count'],
                'amount': str(item['total'] or '0.00')
            }
            for item in pay_counts
        }

        exp_counts = expenses_in_range.values('category').annotate(
            count=Count('id'),
            total=Sum('amount')
        )
        expense_category_summary = {
            item['category']: {
                'count': item['count'],
                'amount': str(item['total'] or '0.00')
            }
            for item in exp_counts
        }

        return Response({
            'date_range': {
                'filter_type': filter_type,
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
            },
            'kpis': {
                'total_invoiced': str(total_invoiced),
                'total_paid': str(total_paid),
                'total_outstanding': str(total_outstanding),
                'b2b_outstanding': str(b2b_outstanding),
                'total_expenses': str(total_expenses),
                'paid_expenses': str(paid_expenses),
                'net_profit': str(net_profit),
                'operating_margin': str(operating_margin),
            },
            # Flat, authoritative dashboard contract. These mirror the kpis block exactly
            # (same computed values, single implementation) plus the complete order counts.
            'total_sales': str(total_paid),
            'total_invoiced': str(total_invoiced),
            'total_outstanding': str(total_outstanding),
            'b2b_outstanding': str(b2b_outstanding),
            'total_expenses': str(total_expenses),
            'open_orders_count': open_orders_count,
            'confirmed_orders_count': order_counts['confirmed_orders_count'],
            'out_for_delivery_count': out_for_delivery_count,
            'returns_count': returns_count,
            'total_orders_count': total_orders_count,
            'order_metrics': {
                'scope': 'snapshot',
                'total_orders_count': total_orders_count,
                'open_orders_count': open_orders_count,
                'confirmed_orders_count': order_counts['confirmed_orders_count'],
                'out_for_delivery_count': out_for_delivery_count,
                'returns_count': returns_count,
                'pending_orders_count': order_counts['pending_orders_count'],
                'packed_orders_count': order_counts['packed_orders_count'],
                'shipped_orders_count': order_counts['shipped_orders_count'],
                'delivered_orders_count': order_counts['delivered_orders_count'],
                'cancelled_orders_count': order_counts['cancelled_orders_count'],
                'returns_by_status': {
                    'RETURN_REQUESTED': order_counts['return_requested_count'],
                    'RETURN_APPROVED': order_counts['return_approved_count'],
                    'RETURN_REJECTED': order_counts['return_rejected_count'],
                    'RETURN_COMPLETED': order_counts['return_completed_count'],
                },
            },
            'payouts_summary': {
                'gross_amount': str(settled_payouts['gross'] or '0.00'),
                'fees': str(settled_payouts['fees'] or '0.00'),
                'net_amount': str(settled_payouts['net'] or '0.00'),
            },
            'monthly_trend': monthly_trend,
            'breakdowns': {
                'invoices': invoice_status_summary,
                'payments': payment_status_summary,
                'expenses': expense_category_summary,
            }
        }, status=status.HTTP_200_OK)
