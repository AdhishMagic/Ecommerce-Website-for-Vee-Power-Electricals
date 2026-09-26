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

    VALID_TRANSITIONS = {
        QuotationStatus.DRAFT: [QuotationStatus.SENT],
        QuotationStatus.SENT: [QuotationStatus.APPROVED, QuotationStatus.REJECTED],
        QuotationStatus.APPROVED: [QuotationStatus.CONVERTED],
        QuotationStatus.REJECTED: [],
        QuotationStatus.CONVERTED: [],
    }

    @classmethod
    @transaction.atomic
    def transition_status(
        cls,
        quotation_id: int,
        target_status: str,
        changed_by=None,
        reason: str = ''
    ) -> Quotation:
        """
        Transition a quotation to target_status adhering to canonical quotation FSM:
        DRAFT -> SENT -> APPROVED -> CONVERTED (or SENT -> REJECTED).
        """
        quotation = Quotation.objects.select_for_update().get(pk=quotation_id)
        current_status = quotation.status

        # If identical status, treat as idempotent no-op
        if current_status == target_status:
            return quotation

        allowed_next = cls.VALID_TRANSITIONS.get(current_status, [])
        if target_status not in allowed_next:
            raise ValidationError(
                f"Invalid quotation status transition from '{current_status}' to '{target_status}'. "
                f"Allowed transitions: {[s.value for s in allowed_next]}."
            )

        # Direct transition to CONVERTED must be performed via convert_quotation_to_invoice
        if target_status == QuotationStatus.CONVERTED:
            raise ValidationError(
                "Direct transition to CONVERTED is not allowed. Use convert_quotation_to_invoice."
            )

        quotation.status = target_status
        if reason:
            if quotation.notes:
                quotation.notes = f"{quotation.notes}\n{reason}"
            else:
                quotation.notes = reason
        quotation.save(update_fields=['status', 'notes', 'updated_at'])

        # Dispatch communication
        from apps.core.services.communication_service import CommunicationService
        CommunicationService.send_quotation_notification(quotation=quotation, status_action=target_status)

        return quotation

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
            existing_invoice = Invoice.objects.filter(quotation=quotation).first()
            inv_ref = f" (Invoice #{existing_invoice.invoice_number})" if existing_invoice else ""
            raise ValidationError(f"Quotation #{quotation.quotation_number} has already been converted to an invoice{inv_ref}.")

        # 2. Strict status check: must be APPROVED
        if quotation.status == QuotationStatus.REJECTED:
            raise ValidationError(f"Cannot convert rejected quotation #{quotation.quotation_number}.")
        if quotation.status != QuotationStatus.APPROVED:
            raise ValidationError(
                f"Only approved quotations can be converted to an invoice. Current status: '{quotation.status}'."
            )

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
        quotation.save(update_fields=['status', 'updated_at'])

        return invoice
