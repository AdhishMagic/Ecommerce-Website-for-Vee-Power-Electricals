import datetime
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.finance.models import Invoice, InvoiceItem, InvoiceStatus, Quotation
from apps.orders.models import Order
from apps.commercial_config.services.tax_service import TaxService


class InvoiceService:
    """
    Domain service for immutable GST tax invoice generation, sequential numbering,
    and historical snapshot preservation.
    """

    @classmethod
    def generate_invoice_number(cls, date: datetime.date = None) -> str:
        """
        Generate statutory unique invoice number: INV-{YEAR}-{SEQUENCE:04d}.
        E.g., INV-2026-0001
        """
        if not date:
            date = timezone.now().date()
        year = date.year
        prefix = f"INV-{year}-"

        # Find the highest existing invoice sequence for the given year
        last_invoice = Invoice.objects.filter(
            invoice_number__startswith=prefix
        ).order_by('-invoice_number').first()

        if last_invoice:
            try:
                seq_str = last_invoice.invoice_number.replace(prefix, '')
                next_seq = int(seq_str) + 1
            except (ValueError, TypeError):
                next_seq = Invoice.objects.filter(invoice_number__startswith=prefix).count() + 1
        else:
            next_seq = 1

        # Format with 4 digits padding
        return f"{prefix}{next_seq:04d}"

    @classmethod
    @transaction.atomic
    def create_invoice_for_order(
        cls,
        order: Order,
        due_date: datetime.date = None,
        notes: str = None
    ) -> Invoice:
        """
        Generate a statutory GST invoice from an Order.
        Preserves frozen historical values from the order and its items.
        """
        invoice_date = timezone.now().date()
        if not due_date:
            due_date = invoice_date + datetime.timedelta(days=30)

        # Idempotency: Return existing invoice for order if already generated
        existing = Invoice.objects.filter(order=order).first()
        if existing:
            if order.payment_status == 'Paid' and existing.status != InvoiceStatus.PAID:
                existing.status = InvoiceStatus.PAID
                existing.payment_status = 'Paid'
                existing.save(update_fields=['status', 'payment_status'])
            return existing

        # Generate unique invoice sequence
        invoice_number = cls.generate_invoice_number(invoice_date)
        while Invoice.objects.filter(invoice_number=invoice_number).exists():
            # If concurrent collision, advance sequence
            seq_part = int(invoice_number.split('-')[-1]) + 1
            year_part = invoice_number.split('-')[1]
            invoice_number = f"INV-{year_part}-{seq_part:04d}"

        # Determine payment status
        inv_status = InvoiceStatus.PAID if order.payment_status == 'Paid' else InvoiceStatus.UNPAID

        # Build snapshot copy
        snapshot = dict(order.calculation_snapshot or {})
        snapshot['order_number'] = order.order_number
        snapshot['generated_at'] = timezone.now().isoformat()

        invoice = Invoice.objects.create(
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            order=order,
            client=None,
            quotation=None,
            subtotal=order.subtotal,
            discount_amount=order.total_discount,
            taxable_amount=order.taxable_amount,
            cgst_amount=order.cgst_amount,
            sgst_amount=order.sgst_amount,
            igst_amount=order.igst_amount,
            tax_amount=order.tax_amount,
            shipping_fee=order.shipping_fee,
            total_amount=order.total_amount,
            status=inv_status,
            payment_status=order.payment_status,
            notes=notes or f"Generated for Order #{order.order_number}",
            calculation_snapshot=snapshot,
        )

        is_intra = snapshot.get('is_intra_state', True)

        # Create InvoiceItems from OrderItems preserving exact figures
        for item in order.items.all():
            if is_intra:
                cgst = (item.tax_amount / Decimal('2.00')).quantize(Decimal('0.01'))
                sgst = (item.tax_amount - cgst).quantize(Decimal('0.01'))
                igst = Decimal('0.00')
            else:
                cgst = Decimal('0.00')
                sgst = Decimal('0.00')
                igst = item.tax_amount

            InvoiceItem.objects.create(
                invoice=invoice,
                product=item.product,
                item_name=item.product_name,
                sku=item.sku,
                quantity=item.quantity,
                rate=item.unit_price,
                taxable_amount=item.taxable_amount,
                tax_percent=item.tax_rate,
                cgst_amount=cgst,
                sgst_amount=sgst,
                igst_amount=igst,
                tax_amount=item.tax_amount,
                total_amount=item.total_amount,
            )

        # Dispatch statutory tax invoice communication
        from apps.core.services.communication_service import CommunicationService
        CommunicationService.send_invoice_notification(invoice=invoice)

        return invoice

    @classmethod
    @transaction.atomic
    def create_invoice_for_quotation(
        cls,
        quotation: Quotation,
        due_date: datetime.date = None,
        notes: str = None
    ) -> Invoice:
        """
        Generate a statutory GST invoice from an approved Quotation.
        Preserves line items and computes accurate GST breakdown using TaxService.
        """
        client = quotation.client
        invoice_date = timezone.now().date()
        if not due_date:
            due_date = invoice_date + datetime.timedelta(days=30)

        # Idempotency guard: Return existing invoice for quotation if already generated
        existing = Invoice.objects.filter(quotation=quotation).first()
        if existing:
            return existing

        invoice_number = cls.generate_invoice_number(invoice_date)
        while Invoice.objects.filter(invoice_number=invoice_number).exists():
            seq_part = int(invoice_number.split('-')[-1]) + 1
            year_part = invoice_number.split('-')[1]
            invoice_number = f"INV-{year_part}-{seq_part:04d}"


        # Determine tax split based on client GSTIN or state
        # GSTIN starting with '33' is Tamil Nadu (Intra-state)
        is_intra_state = True
        if client.gstin:
            is_intra_state = client.gstin.startswith('33')

        subtotal = Decimal('0.00')
        tax_amount = Decimal('0.00')
        cgst_total = Decimal('0.00')
        sgst_total = Decimal('0.00')
        igst_total = Decimal('0.00')

        items_to_create = []

        for q_item in quotation.items.all():
            line_subtotal = (q_item.unit_price * q_item.quantity).quantize(Decimal('0.01'))
            subtotal += line_subtotal

            destination_state = 'Tamil Nadu' if is_intra_state else 'Karnataka'
            tax_res = TaxService.calculate_tax(
                amount=line_subtotal,
                destination_state=destination_state,
            )

            cgst_total += tax_res.cgst_amount
            sgst_total += tax_res.sgst_amount
            igst_total += tax_res.igst_amount
            tax_amount += tax_res.tax_amount

            items_to_create.append({
                'product': q_item.product,
                'item_name': q_item.item_name,
                'sku': q_item.product.sku if q_item.product else 'CUSTOM',
                'quantity': q_item.quantity,
                'rate': q_item.unit_price,
                'taxable_amount': line_subtotal,
                'tax_percent': tax_res.total_tax_rate,
                'cgst_amount': tax_res.cgst_amount,
                'sgst_amount': tax_res.sgst_amount,
                'igst_amount': tax_res.igst_amount,
                'tax_amount': tax_res.tax_amount,
                'total_amount': line_subtotal + tax_res.tax_amount,
            })

        total_amount = subtotal + tax_amount

        snapshot = {
            'quotation_number': quotation.quotation_number,
            'client_code': client.client_code,
            'client_gstin': client.gstin,
            'is_intra_state': is_intra_state,
            'subtotal': str(subtotal),
            'tax_amount': str(tax_amount),
            'total_amount': str(total_amount),
            'generated_at': timezone.now().isoformat(),
        }

        invoice = Invoice.objects.create(
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            order=None,
            client=client,
            quotation=quotation,
            subtotal=subtotal,
            discount_amount=Decimal('0.00'),
            taxable_amount=subtotal,
            cgst_amount=cgst_total,
            sgst_amount=sgst_total,
            igst_amount=igst_total,
            tax_amount=tax_amount,
            shipping_fee=Decimal('0.00'),
            total_amount=total_amount,
            status=InvoiceStatus.UNPAID,
            payment_status='Pending',
            notes=notes or f"Generated from Quotation #{quotation.quotation_number}",
            calculation_snapshot=snapshot,
        )

        for item_data in items_to_create:
            InvoiceItem.objects.create(
                invoice=invoice,
                **item_data
            )

        # Dispatch statutory tax invoice communication
        from apps.core.services.communication_service import CommunicationService
        CommunicationService.send_invoice_notification(invoice=invoice)

        return invoice
