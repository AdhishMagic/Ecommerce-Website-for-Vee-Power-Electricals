from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from apps.finance.models import Client, Invoice, InvoiceStatus, PaymentTxStatus


class CreditService:
    """
    Domain service for B2B client credit limit verification, exposure monitoring,
    row-level concurrency safety, and audit logging.
    """

    @classmethod
    def get_outstanding_exposure(cls, client: Client, lock: bool = False) -> Decimal:
        """
        Calculate total outstanding exposure across unpaid and overdue invoices.
        Deducts confirmed successful payment transactions against those invoices.
        Paid, cancelled, or refunded invoices/records do not contribute to exposure.
        """
        qs = Invoice.objects.filter(
            client=client,
            status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]
        )
        if lock:
            # Force locking read to guarantee current committed data under repeatable read
            inv_ids = list(qs.select_for_update().values_list('id', flat=True))
            invoices = Invoice.objects.filter(id__in=inv_ids).prefetch_related('payments')
        else:
            invoices = qs.prefetch_related('payments')

        total_exposure = Decimal('0.00')
        for inv in invoices:
            successful_payments = sum(
                (p.amount for p in inv.payments.all() if p.status == PaymentTxStatus.SUCCESS),
                Decimal('0.00')
            )
            unpaid_balance = max(Decimal('0.00'), inv.total_amount - successful_payments)
            total_exposure += unpaid_balance

        return total_exposure.quantize(Decimal('0.01'))

    @classmethod
    def get_available_credit(cls, client: Client) -> Decimal:
        """
        Authoritative available credit = credit_limit - credit_exposure.
        """
        exposure = cls.get_outstanding_exposure(client)
        return max(Decimal('0.00'), client.credit_limit - exposure).quantize(Decimal('0.01'))

    @classmethod
    def check_credit_availability(
        cls,
        client: Client,
        additional_amount: Decimal = Decimal('0.00'),
        lock: bool = False
    ) -> dict:
        """
        Check if client can incur additional_amount without exceeding their credit limit.
        Returns detailed diagnostic dictionary.
        """
        if not isinstance(additional_amount, Decimal):
            additional_amount = Decimal(str(additional_amount))

        if additional_amount < Decimal('0.00'):
            raise ValidationError("Additional amount cannot be negative.")

        current_exposure = cls.get_outstanding_exposure(client, lock=lock)
        credit_limit = client.credit_limit
        projected_exposure = current_exposure + additional_amount

        # Inactive clients cannot consume credit
        if not client.is_active:
            return {
                'is_allowed': False,
                'client_code': client.client_code,
                'credit_limit': credit_limit,
                'current_exposure': current_exposure,
                'additional_amount': additional_amount,
                'projected_exposure': projected_exposure,
                'remaining_credit': Decimal('0.00'),
                'available_credit': Decimal('0.00'),
                'shortfall': additional_amount,
                'is_active': False,
                'reason': f"Client {client.company_name} ({client.client_code}) is inactive.",
            }

        # If credit limit is 0.00, credit facility is not extended (prepaid/cash only)
        # Note: If client has credit_limit == 0, B2B credit purchases are blocked
        is_allowed = projected_exposure <= credit_limit if credit_limit > Decimal('0.00') else (additional_amount == Decimal('0.00'))

        remaining_credit = max(Decimal('0.00'), credit_limit - current_exposure)
        shortfall = max(Decimal('0.00'), projected_exposure - credit_limit)

        return {
            'is_allowed': is_allowed,
            'client_code': client.client_code,
            'credit_limit': credit_limit,
            'current_exposure': current_exposure,
            'additional_amount': additional_amount,
            'projected_exposure': projected_exposure,
            'remaining_credit': remaining_credit,
            'available_credit': remaining_credit,
            'shortfall': shortfall,
            'is_active': True,
        }

    @classmethod
    def validate_credit_limit(
        cls,
        client: Client,
        additional_amount: Decimal = Decimal('0.00'),
        lock_client: bool = True
    ) -> None:
        """
        Validates credit limit and raises ValidationError if exceeded.
        Uses row-level locking on the client record to protect against concurrent credit race conditions.
        """
        if lock_client:
            client = Client.objects.select_for_update().get(pk=client.pk)

        check = cls.check_credit_availability(client, additional_amount, lock=lock_client)
        if not check['is_allowed']:
            if not check.get('is_active', True):
                raise ValidationError(check.get('reason', f"Client {client.company_name} is inactive."))
            raise ValidationError(
                f"Credit limit exceeded for client {client.company_name} ({client.client_code}). "
                f"Credit limit: ₹{check['credit_limit']}, Current exposure: ₹{check['current_exposure']}, "
                f"Requested: ₹{check['additional_amount']}, Shortfall: ₹{check['shortfall']}."
            )

    @classmethod
    @transaction.atomic
    def record_credit_limit_change(
        cls,
        client: Client,
        new_limit: Decimal,
        changed_by=None,
        reason: str = '',
        ip_address: str = None
    ) -> Client:
        """
        Update credit limit with immutable audit trail logged into AdminConfigAuditLog.
        """
        if not isinstance(new_limit, Decimal):
            new_limit = Decimal(str(new_limit))

        if new_limit < Decimal('0.00'):
            raise ValidationError("Credit limit cannot be negative.")

        client = Client.objects.select_for_update().get(pk=client.pk)
        old_limit = client.credit_limit
        if old_limit == new_limit:
            return client

        client.credit_limit = new_limit
        client.save(update_fields=['credit_limit', 'updated_at'])

        from apps.core.models import AdminConfigAuditLog, AuditActionType
        AdminConfigAuditLog.objects.create(
            admin_user=changed_by if (changed_by and getattr(changed_by, 'is_authenticated', False)) else None,
            domain='client_credit',
            record_id=client.id,
            action_type=AuditActionType.UPDATE,
            old_value={'credit_limit': str(old_limit)},
            new_value={'credit_limit': str(new_limit)},
            change_reason=reason or f"Credit limit updated from ₹{old_limit} to ₹{new_limit}",
            ip_address=ip_address,
        )
        return client
