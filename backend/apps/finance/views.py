from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response

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

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()


class FinanceSummaryView(APIView):
    """
    Executive financial reporting and dashboard metrics endpoint.
    Aggregates authoritative sales, payments, outstanding, expenses, B2B credit, and payout settlements.
    Enforces strict admin RBAC and deterministic date range filtering.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum, Count
        from django.utils import timezone
        import datetime
        import calendar

        today = timezone.now().date()
        filter_type = request.query_params.get('filter_type', 'current_month').lower()
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        if filter_type == 'today':
            start_date = today
            end_date = today
        elif filter_type == 'previous_month':
            first_this_month = today.replace(day=1)
            prev_month_end = first_this_month - datetime.timedelta(days=1)
            start_date = prev_month_end.replace(day=1)
            end_date = prev_month_end
        elif filter_type == 'custom' and start_date_str and end_date_str:
            try:
                start_date = datetime.date.fromisoformat(start_date_str)
                end_date = datetime.date.fromisoformat(end_date_str)
                if end_date < start_date:
                    start_date, end_date = end_date, start_date
            except (ValueError, TypeError):
                start_date = today.replace(day=1)
                end_date = today
        else:  # current_month default
            start_date = today.replace(day=1)
            end_date = today

        # 1. Total Invoiced (non-cancelled invoices in date range)
        invoices_in_range = Invoice.objects.filter(invoice_date__gte=start_date, invoice_date__lte=end_date)
        total_invoiced = invoices_in_range.exclude(status=InvoiceStatus.CANCELLED).aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0.00')

        # 2. Total Paid (successful payments in date range)
        payments_in_range = PaymentTransaction.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        )
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
        expenses_in_range = Expense.objects.filter(expense_date__gte=start_date, expense_date__lte=end_date)
        total_expenses = expenses_in_range.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        paid_expenses = expenses_in_range.filter(status='Paid').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # 5. Net Income & Operating Margin
        net_profit = (total_paid - total_expenses).quantize(Decimal('0.01'))
        operating_margin = (
            ((net_profit / total_paid) * Decimal('100.00')).quantize(Decimal('0.01'))
            if total_paid > Decimal('0.00') else Decimal('0.00')
        )

        # 6. Payout Settlements in date range
        payouts_in_range = PayoutSettlement.objects.filter(settlement_date__gte=start_date, settlement_date__lte=end_date)
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

            m_rev = PaymentTransaction.objects.filter(
                status=PaymentTxStatus.SUCCESS,
                created_at__date__gte=month_start,
                created_at__date__lte=month_end
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
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
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
