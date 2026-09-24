from decimal import Decimal
from django.db.models import Sum
from django.core.exceptions import ValidationError
from apps.finance.models import Client, Invoice, InvoiceStatus


class CreditService:
    """
    Domain service for B2B client credit limit verification and exposure monitoring.
    """

    @classmethod
    def get_outstanding_exposure(cls, client: Client) -> Decimal:
        """
        Calculate total outstanding exposure across unpaid and overdue invoices.
        """
        result = Invoice.objects.filter(
            client=client,
            status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]
        ).aggregate(total=Sum('total_amount'))
        return result['total'] or Decimal('0.00')

    @classmethod
    def check_credit_availability(cls, client: Client, additional_amount: Decimal = Decimal('0.00')) -> dict:
        """
        Check if client can incur additional_amount without exceeding their credit limit.
        Returns detailed diagnostic dictionary.
        """
        current_exposure = cls.get_outstanding_exposure(client)
        credit_limit = client.credit_limit
        projected_exposure = current_exposure + additional_amount

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
            'shortfall': shortfall,
        }

    @classmethod
    def validate_credit_limit(cls, client: Client, additional_amount: Decimal = Decimal('0.00')) -> None:
        """
        Validates credit limit and raises ValidationError if exceeded.
        """
        check = cls.check_credit_availability(client, additional_amount)
        if not check['is_allowed']:
            raise ValidationError(
                f"Credit limit exceeded for client {client.company_name} ({client.client_code}). "
                f"Credit limit: ₹{check['credit_limit']}, Current exposure: ₹{check['current_exposure']}, "
                f"Requested: ₹{check['additional_amount']}, Shortfall: ₹{check['shortfall']}."
            )
