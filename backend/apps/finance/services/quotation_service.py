from django.db import transaction
from django.core.exceptions import ValidationError
from apps.finance.models import Quotation, QuotationStatus, Invoice
from apps.finance.services.invoice_service import InvoiceService
from apps.finance.services.credit_service import CreditService


class QuotationService:
    """
    Domain service managing commercial estimate lifecycles, validations,
    and atomic conversion of approved quotations to statutory invoices.
    """

    @classmethod
    @transaction.atomic
    def convert_quotation_to_invoice(
        cls,
        quotation_id: int,
        converted_by=None,
        due_date=None,
        notes: str = None
    ) -> Invoice:
        """
        Convert an approved quotation into a legal tax invoice.
        Enforces acyclic invoice-quotation link, client credit checks,
        and duplicate conversion prevention.
        """
        quotation = Quotation.objects.select_for_update().get(pk=quotation_id)

        # 1. Duplicate conversion guard
        if quotation.status == QuotationStatus.CONVERTED:
            existing_invoice = quotation.invoices.first()
            inv_ref = f" (Invoice #{existing_invoice.invoice_number})" if existing_invoice else ""
            raise ValidationError(f"Quotation #{quotation.quotation_number} has already been converted to an invoice{inv_ref}.")

        # 2. Status validation
        if quotation.status == QuotationStatus.REJECTED:
            raise ValidationError(f"Cannot convert rejected quotation #{quotation.quotation_number}.")

        # 3. Validate line items presence
        if not quotation.items.exists():
            raise ValidationError(f"Quotation #{quotation.quotation_number} contains no line items and cannot be invoiced.")

        # 4. B2B Client Credit Limit Check
        client = quotation.client
        if client and client.credit_limit > 0:
            CreditService.validate_credit_limit(client, additional_amount=quotation.total_value)

        # 5. Create Invoice via InvoiceService
        invoice = InvoiceService.create_invoice_for_quotation(
            quotation=quotation,
            due_date=due_date,
            notes=notes or f"Converted from Quotation #{quotation.quotation_number} by {getattr(converted_by, 'username', 'admin')}"
        )

        # 6. Update Quotation Status to CONVERTED
        quotation.status = QuotationStatus.CONVERTED
        quotation.save(update_fields=['status'])

        return invoice
