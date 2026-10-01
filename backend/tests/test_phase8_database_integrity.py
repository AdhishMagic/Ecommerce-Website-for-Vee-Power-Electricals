"""
STEP 18 — DATABASE INTEGRITY REGRESSION SUITE (isolated test data).

Encodes the invariants verified by the read-only audit
(backend/tests/audit_step18_database_integrity.py) as executable regression
coverage:

- orphan relationships are structurally impossible (DB-level FK/CHECK)
- authoritative identifiers stay unique (SKU, order/invoice/quotation numbers,
  client_code, GSTIN, gateway transaction idempotency, config singleton)
- inventory ledger reconstructs physical stock; restoration is idempotent
- order/invoice totals follow the authoritative composition:
      total = taxable_amount(net of discounts) + tax + shipping
  with tax computed at order level (item tax_amount intentionally 0.00)
- a quotation converts to exactly one invoice — even when a legacy row left
  an invoice attached while the quotation status lagged behind (guard 1b)
- B2B credit exposure = sum of unpaid balances, bounded by credit_limit
- configuration versioning rejects overlapping active periods; audit trail
  attributes admin changes correctly

All tests use isolated data created in setUp and never touch live fixtures.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    DeliveryConfiguration,
    TaxConfiguration,
)
from apps.commercial_config.services import BillingService
from apps.core.models import AdminConfigAuditLog, CommunicationLog
from apps.finance.models import (
    Client,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    Quotation,
    QuotationItem,
    QuotationStatus,
)
from apps.finance.services import (
    CreditService,
    InvoiceService,
    QuotationService,
)
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.inventory.services import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, OrderStatusHistory, PaymentStatus
from apps.orders.services import CheckoutService, OrderWorkflowService
from apps.products.models import Brand, Category, Product
from apps.users.models import AddressType, CustomerAddress, UserRole

User = get_user_model()

TWO_PLACES = Decimal("0.01")


class IntegrityTestDataMixin:
    """Reusable isolated graph builder for integrity tests."""

    def make_users(self):
        self.customer = User.objects.create_user(
            email="integrity_customer@example.com",
            password="Password123!",
            first_name="Integrity",
            last_name="Customer",
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email="integrity_admin@example.com",
            password="Password123!",
            first_name="Integrity",
            last_name="Admin",
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

    def make_catalog(self, stock=50, price="400.00", sku="INT-SKU-001", slug="int-product"):
        self.category = Category.objects.create(name="Integrity Cables", slug="int-cables", is_active=True)
        self.brand = Brand.objects.create(name="Integrity Brand", slug="int-brand", is_active=True)
        self.product = Product.objects.create(
            name="Integrity Test Cable",
            slug=slug,
            sku=sku,
            category=self.category,
            brand=self.brand,
            mrp=Decimal("500.00"),
            price=Decimal(price),
            stock=stock,
            active=True,
        )
        return self.product

    def make_address(self, user, state="Tamil Nadu", pincode="641002"):
        return CustomerAddress.objects.create(
            user=user,
            recipient_name="Integrity Recipient",
            phone="+919876543210",
            address_line1="1 Integrity Road",
            city="Coimbatore",
            state=state,
            pincode=pincode,
            address_type=AddressType.HOME,
            is_default=True,
        )

    def make_configs(self):
        TaxConfiguration.objects.create(
            business_state="Tamil Nadu",
            default_tax_rate=Decimal("18.00"),
            cgst_rate=Decimal("9.00"),
            sgst_rate=Decimal("9.00"),
            igst_rate=Decimal("18.00"),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name="Integrity Depot",
            origin_address="Depot St",
            origin_city="Coimbatore",
            origin_state="Tamil Nadu",
            origin_pincode="641001",
            base_delivery_charge=Decimal("50.00"),
            free_delivery_threshold=Decimal("2000.00"),
            is_active=True,
        )

    def make_client(self, code="INT-001", gstin="33AABCI1234D1Z8", credit_limit="0.00"):
        return Client.objects.create(
            client_code=code,
            company_name="Integrity Corp",
            contact_person="Integrity Contact",
            gstin=gstin,
            email="integritycorp@example.com",
            phone="+919876543211",
            credit_limit=Decimal(credit_limit),
            is_active=True,
        )

    def make_manual_order(self, number="ORD-INT-001", status=OrderStatus.PENDING, payment_status=PaymentStatus.PENDING):
        return Order.objects.create(
            order_number=number,
            user=self.customer,
            customer_name="Integrity Customer",
            customer_email="integrity_customer@example.com",
            customer_phone="+919876543210",
            shipping_address={"city": "Coimbatore", "state": "Tamil Nadu"},
            status=status,
            payment_status=payment_status,
            subtotal=Decimal("400.00"),
            taxable_amount=Decimal("400.00"),
            total_amount=Decimal("472.00"),
        )

    def make_invoice(self, number, quotation=None, client=None, order=None, total="1180.00"):
        return Invoice.objects.create(
            invoice_number=number,
            invoice_date="2026-10-01",
            due_date="2026-10-31",
            order=order,
            client=client,
            quotation=quotation,
            subtotal=Decimal("1000.00"),
            taxable_amount=Decimal("1000.00"),
            cgst_amount=Decimal("90.00"),
            sgst_amount=Decimal("90.00"),
            igst_amount=Decimal("0.00"),
            tax_amount=Decimal("180.00"),
            total_amount=Decimal(total),
            status=InvoiceStatus.UNPAID,
            payment_status="Pending",
        )


class OrphanRelationshipIntegrityTests(IntegrityTestDataMixin, TestCase):
    """Structural orphan prevention: FK nullability and required back-references."""

    def setUp(self):
        self.make_users()
        self.make_catalog()
        self.make_configs()

    def test_order_item_without_order_is_structurally_impossible(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OrderItem.objects.create(
                    order=None,
                    product=self.product,
                    product_name="Ghost Item",
                    sku=self.product.sku,
                    mrp=self.product.mrp,
                    unit_price=self.product.price,
                    quantity=1,
                    taxable_amount=Decimal("400.00"),
                    subtotal=Decimal("400.00"),
                    total_amount=Decimal("472.00"),
                )

    def test_payment_without_order_and_invoice_is_structurally_impossible(self):
        # Domain rule (now DB-enforced via chk_pay_reference, migration 0002):
        # every payment references an order OR an invoice. Pre-invoice
        # order-linked payments are valid; fully unlinked rows are not.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PaymentTransaction.objects.create(
                    order=None,
                    invoice=None,
                    amount=Decimal("100.00"),
                    status="SUCCESS",
                )

    def test_every_created_order_carries_status_history(self):
        address = self.make_address(self.customer)
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=address.id,
            items_data=[{"product_id": self.product.id, "quantity": 1}],
            payment_method="UPI",
        )
        self.assertTrue(OrderStatusHistory.objects.filter(order=order).exists())
        first = order.status_history.order_by("created_at", "id").first()
        self.assertIsNone(first.previous_status)
        self.assertEqual(first.new_status, OrderStatus.PENDING)

    def test_stock_ledger_rows_always_reference_products(self):
        tx = StockTransaction.objects.create(
            product=self.product,
            change_amount=10,
            transaction_type=StockTransactionType.RESTOCK,
            performed_by=self.admin,
        )
        self.assertIsNotNone(tx.product_id)
        # product FK is PROTECT: ledger history survives, product deletion is blocked
        with self.assertRaises(ProtectedError):
            self.product.delete()


class AuthoritativeIdentifierUniquenessTests(IntegrityTestDataMixin, TestCase):
    """Duplicate prevention on authoritative identifiers."""

    def setUp(self):
        self.make_users()
        self.make_catalog()
        self.make_configs()

    def test_duplicate_product_sku_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Product.objects.create(
                    name="Duplicate SKU Product",
                    slug="dup-sku-product",
                    sku=self.product.sku,
                    category=self.category,
                    brand=self.brand,
                    mrp=Decimal("100.00"),
                    price=Decimal("90.00"),
                    stock=1,
                )

    def test_duplicate_order_number_rejected(self):
        order = self.make_manual_order(number="ORD-INT-DUP")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Order.objects.create(
                    order_number=order.order_number,
                    customer_name="X",
                    customer_email="x@example.com",
                    customer_phone="+919876543210",
                    shipping_address={},
                    subtotal=Decimal("1.00"),
                    taxable_amount=Decimal("1.00"),
                    total_amount=Decimal("1.18"),
                )

    def test_duplicate_invoice_number_rejected(self):
        client = self.make_client()
        invoice = self.make_invoice("INV-INT-DUP", client=client)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_invoice(invoice.invoice_number, client=client)

    def test_duplicate_client_code_and_gstin_rejected(self):
        client = self.make_client()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Client.objects.create(
                    client_code=client.client_code,
                    company_name="Other Corp",
                    contact_person="Other",
                    gstin="33AAOCS5678E1Z9",
                    email="other@example.com",
                    phone="+919876543212",
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Client.objects.create(
                    client_code="INT-OTHER",
                    company_name="Other Corp",
                    contact_person="Other",
                    gstin=client.gstin,
                    email="other@example.com",
                    phone="+919876543212",
                )

    def test_gateway_transaction_id_idempotency_at_service_level(self):
        # DB index is intentionally non-unique (INITIATED rows may precede the
        # gateway id); idempotency is enforced by the payment service.
        client = self.make_client()
        invoice = self.make_invoice("INV-INT-PAY", client=client)
        txn1 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal("500.00"),
            gateway_transaction_id="GW-INT-0001",
        )
        txn2 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal("500.00"),
            gateway_transaction_id="GW-INT-0001",
        )
        # exact replay: same gateway id returns the SAME transaction, no new row
        self.assertEqual(txn1.id, txn2.id)
        self.assertEqual(
            PaymentTransaction.objects.filter(gateway_transaction_id="GW-INT-0001").count(), 1
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal("500.00"))
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.payment_status, "Partially Paid")

        # a genuinely new gateway id creates a second payment (500 + 500 = 1000)
        txn3 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal("500.00"),
            gateway_transaction_id="GW-INT-0002",
        )
        self.assertNotEqual(txn1.id, txn3.id)
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal("1000.00"))
        # 1000 < 1180 total: still partial, flips to PAID only at >= total
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.payment_status, "Partially Paid")
        self.assertEqual(PaymentTransaction.objects.filter(invoice=invoice).count(), 2)

    def test_company_configuration_is_singleton(self):
        CompanyStoreConfiguration.objects.create()
        with self.assertRaises(DjangoValidationError):
            CompanyStoreConfiguration.objects.create()

    def test_communication_idempotency_key_unique(self):
        CommunicationLog.objects.create(
            event_type="order.confirmation",
            recipient="a@example.com",
            subject="s",
            idempotency_key="IDEM-0001",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CommunicationLog.objects.create(
                    event_type="order.confirmation",
                    recipient="a@example.com",
                    subject="s",
                    idempotency_key="IDEM-0001",
                )


class InventoryLedgerConsistencyTests(IntegrityTestDataMixin, TestCase):
    """Ledger reconstructs physical stock; restoration is idempotent; no overselling."""

    def setUp(self):
        self.make_users()
        self.make_configs()
        self.address = self.make_address(self.customer)

    def test_ledger_reconstructs_stock_from_zero_opening(self):
        product = self.make_catalog(stock=0, sku="INT-LEDGER-1", slug="int-ledger-1")
        InventoryService.restock_product(product.id, 10, performed_by=self.admin)
        InventoryService.sale_deduct_stock(product=product, quantity=3)
        InventoryService.adjust_stock(product.id, -2, performed_by=self.admin)
        product.refresh_from_db()
        self.assertEqual(product.stock, 5)
        ledger_sum = sum(
            StockTransaction.objects.filter(product=product).values_list("change_amount", flat=True)
        )
        self.assertEqual(ledger_sum, 5)
        self.assertEqual(product.stock, ledger_sum)

    def test_checkout_deducts_stock_and_writes_sale_row(self):
        product = self.make_catalog(stock=50, sku="INT-LEDGER-2", slug="int-ledger-2")
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{"product_id": product.id, "quantity": 2}],
        )
        product.refresh_from_db()
        self.assertEqual(product.stock, 48)
        sale = StockTransaction.objects.get(order=order, transaction_type=StockTransactionType.SALE)
        self.assertEqual(sale.change_amount, -2)
        self.assertEqual(sale.product_id, product.id)

    def test_cancellation_restores_stock_exactly_once(self):
        product = self.make_catalog(stock=50, sku="INT-LEDGER-3", slug="int-ledger-3")
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{"product_id": product.id, "quantity": 2}],
        )
        OrderWorkflowService.cancel_order(order.id, requested_by=self.admin, reason="integrity test")
        product.refresh_from_db()
        self.assertEqual(product.stock, 50)
        return_rows = StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN)
        self.assertEqual(return_rows.count(), 1)
        # idempotency: a second restoration attempt is a safe no-op
        result = InventoryService.restore_order_stock(order, performed_by=self.admin)
        self.assertEqual(result, [])
        self.assertEqual(
            StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN).count(), 1
        )
        product.refresh_from_db()
        self.assertEqual(product.stock, 50)

    def test_overselling_is_blocked_atomically(self):
        product = self.make_catalog(stock=1, sku="INT-LEDGER-4", slug="int-ledger-4")
        orders_before = Order.objects.count()
        items_before = OrderItem.objects.count()
        txs_before = StockTransaction.objects.count()
        with self.assertRaises(DjangoValidationError):
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=self.address.id,
                items_data=[{"product_id": product.id, "quantity": 5}],
            )
        # atomicity: no partial order/item/ledger residue
        self.assertEqual(Order.objects.count(), orders_before)
        self.assertEqual(OrderItem.objects.count(), items_before)
        self.assertEqual(StockTransaction.objects.count(), txs_before)
        product.refresh_from_db()
        self.assertEqual(product.stock, 1)

    def test_negative_stock_rejected_by_check_constraint(self):
        category = Category.objects.create(name="Neg Stock Cables", slug="neg-stock-cables", is_active=True)
        brand = Brand.objects.create(name="Neg Stock Brand", slug="neg-stock-brand", is_active=True)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Product.objects.create(
                    name="Negative Stock Product",
                    slug="neg-stock-product",
                    sku="INT-NEG-1",
                    category=category,
                    brand=brand,
                    mrp=Decimal("100.00"),
                    price=Decimal("90.00"),
                    stock=-1,
                )

    def test_adjustment_below_zero_rejected_by_service(self):
        product = self.make_catalog(stock=5, sku="INT-LEDGER-5", slug="int-ledger-5")
        with self.assertRaises(DjangoValidationError):
            InventoryService.adjust_stock(product.id, -10, performed_by=self.admin)


class OrderAndInvoiceTotalsIntegrityTests(IntegrityTestDataMixin, TestCase):
    """
    Authoritative composition: subtotal is NET of product discounts (price is
    the sellable amount; mrp - price is informational only) and
    total = subtotal + tax + shipping. Tax is computed at ORDER level; item
    rows intentionally carry tax_amount 0.00 (BillingService populates tax in
    the order-level aggregate only). invoice.total mirrors the order
    one-for-one; invoice.discount_amount is likewise informational.
    """

    def setUp(self):
        self.make_users()
        self.make_catalog(stock=100, price="400.00", sku="INT-MATH-1", slug="int-math-1")
        self.make_configs()
        self.address = self.make_address(self.customer)

    def test_checkout_totals_follow_authoritative_composition(self):
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{"product_id": self.product.id, "quantity": 2}],
        )
        # net subtotal = 2 x 400 = 800
        # informational MRP discount = 2 x (500 - 400) = 200 (already netted out)
        self.assertEqual(order.subtotal, Decimal("800.00"))
        self.assertEqual(order.total_discount, Decimal("200.00"))
        self.assertEqual(order.taxable_amount, Decimal("800.00"))
        self.assertEqual(order.tax_amount, Decimal("144.00"))  # 18% exclusive
        self.assertEqual(order.cgst_amount, Decimal("72.00"))
        self.assertEqual(order.sgst_amount, Decimal("72.00"))
        self.assertEqual(order.igst_amount, Decimal("0.00"))
        # authoritative composition: total = subtotal(net) + tax + shipping
        self.assertEqual(order.total_amount, Decimal("1044.00"))
        self.assertEqual(
            order.total_amount,
            order.subtotal + order.tax_amount + order.shipping_fee,
        )
        # item rows carry per-line totals; tax is aggregated at order level
        for item in order.items.all():
            self.assertEqual(item.taxable_amount, Decimal("800.00"))
            self.assertEqual(item.total_amount, Decimal("800.00"))
            self.assertEqual(item.tax_rate, Decimal("18.00"))
        # snapshot agrees with stored columns
        self.assertEqual(
            Decimal(order.calculation_snapshot["final_payable_amount"]), order.total_amount
        )

    def test_invoice_from_order_preserves_figures_and_settles_correctly(self):
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{"product_id": self.product.id, "quantity": 2}],
        )
        invoice = InvoiceService.create_invoice_for_order(order=order)
        self.assertEqual(invoice.total_amount, order.total_amount)
        self.assertEqual(invoice.taxable_amount, order.taxable_amount)
        self.assertEqual(invoice.tax_amount, order.tax_amount)
        self.assertEqual(invoice.shipping_fee, order.shipping_fee)
        self.assertEqual(invoice.subtotal, order.subtotal)
        self.assertEqual(invoice.discount_amount, order.total_discount)
        self.assertEqual(invoice.items.count(), order.items.count())
        # invoice composition mirrors the order: total = subtotal + tax + shipping
        # (discount_amount is informational; subtotal is already net of discounts)
        self.assertEqual(
            invoice.total_amount,
            invoice.subtotal + invoice.tax_amount + invoice.shipping_fee,
        )
        txn = InvoiceService.record_payment(
            invoice_id=invoice.id, amount=invoice.total_amount, gateway_transaction_id="GW-INT-FULL"
        )
        self.assertEqual(txn.status, "SUCCESS")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.outstanding_amount, Decimal("0.00"))

    def test_overpayment_beyond_outstanding_rejected(self):
        client = self.make_client(code="INT-PAY-1")
        invoice = self.make_invoice("INV-INT-OVER", client=client, total="1180.00")
        with self.assertRaises(DjangoValidationError):
            InvoiceService.record_payment(
                invoice_id=invoice.id, amount=Decimal("2000.00"), gateway_transaction_id="GW-INT-OVER"
            )

    def test_igst_path_for_inter_state_client_invoices(self):
        client = self.make_client(code="INT-KA-1", gstin="29AABCI9876K1Z5")
        quotation = Quotation.objects.create(
            quotation_number="QUO-INT-KA-1",
            client=client,
            quotation_date="2026-10-01",
            expiry_date="2026-10-31",
            total_value=Decimal("1000.00"),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name="Inter-state Integrity Item",
            quantity=2,
            unit_price=Decimal("500.00"),
            subtotal=Decimal("1000.00"),
        )
        invoice = InvoiceService.create_invoice_for_quotation(quotation=quotation)
        self.assertEqual(invoice.subtotal, Decimal("1000.00"))
        self.assertEqual(invoice.igst_amount, Decimal("180.00"))
        self.assertEqual(invoice.cgst_amount, Decimal("0.00"))
        self.assertEqual(invoice.sgst_amount, Decimal("0.00"))
        self.assertEqual(invoice.total_amount, invoice.subtotal + invoice.tax_amount)


class QuotationInvoiceConversionIntegrityTests(IntegrityTestDataMixin, TestCase):
    """One quotation converts to exactly one invoice — under every historical state."""

    def setUp(self):
        self.make_users()
        self.make_catalog(stock=100, sku="INT-QUO-1", slug="int-quo-1")
        self.make_configs()
        self.client = self.make_client(code="INT-QUO-C1", credit_limit="0.00")
        self.quotation = Quotation.objects.create(
            quotation_number="QUO-INT-0001",
            client=self.client,
            quotation_date="2026-10-01",
            expiry_date="2026-10-31",
            total_value=Decimal("1000.00"),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=self.quotation,
            product=self.product,
            item_name="Integrity Quoted Item",
            quantity=2,
            unit_price=Decimal("500.00"),
            subtotal=Decimal("1000.00"),
        )

    def _convert(self):
        return QuotationService.convert_quotation_to_invoice(
            quotation_id=self.quotation.id, converted_by=self.admin
        )

    def test_happy_path_converts_exactly_once(self):
        invoice = self._convert()
        self.quotation.refresh_from_db()
        self.assertEqual(self.quotation.status, QuotationStatus.CONVERTED)
        self.assertEqual(invoice.quotation_id, self.quotation.id)
        self.assertEqual(invoice.client_id, self.client.id)
        with self.assertRaises(DjangoValidationError):
            self._convert()

    def test_conversion_of_invoice_bearing_lagging_status_quotation_is_blocked(self):
        """
        Regression guard for the audited historical corruption: an invoice exists
        while the quotation status never reached CONVERTED. Re-conversion must be
        rejected on invoice existence, not only on status.
        """
        ghost = self.make_invoice("INV-INT-GHOST", quotation=self.quotation, client=self.client)
        self.quotation.refresh_from_db()
        self.assertEqual(self.quotation.status, QuotationStatus.APPROVED)
        with self.assertRaises(DjangoValidationError) as ctx:
            self._convert()
        self.assertIn(ghost.invoice_number, str(ctx.exception))

    def test_draft_and_rejected_quotations_cannot_convert(self):
        self.quotation.status = QuotationStatus.DRAFT
        self.quotation.save(update_fields=["status"])
        with self.assertRaises(DjangoValidationError):
            self._convert()
        self.quotation.status = QuotationStatus.REJECTED
        self.quotation.save(update_fields=["status"])
        with self.assertRaises(DjangoValidationError):
            self._convert()

    def test_invoice_snapshot_immutable_after_quotation_change(self):
        invoice = self._convert()
        original_total = invoice.total_amount
        original_number = invoice.calculation_snapshot["quotation_number"]
        self.quotation.total_value = Decimal("999999.00")
        self.quotation.save(update_fields=["total_value", "updated_at"])
        invoice.refresh_from_db()
        self.assertEqual(invoice.total_amount, original_total)
        self.assertEqual(invoice.calculation_snapshot["quotation_number"], original_number)


class B2BCreditIntegrityTests(IntegrityTestDataMixin, TestCase):
    """Exposure = sum of unpaid balances; available = max(0, limit - exposure)."""

    def setUp(self):
        self.make_users()
        self.make_catalog(stock=100, sku="INT-CR-1", slug="int-cr-1")
        self.make_configs()
        self.client = self.make_client(code="INT-CR-C1", credit_limit="5000.00")

    def _make_approved_quotation(self, number, value):
        quotation = Quotation.objects.create(
            quotation_number=number,
            client=self.client,
            quotation_date="2026-10-01",
            expiry_date="2026-10-31",
            total_value=Decimal(value),
            status=QuotationStatus.APPROVED,
        )
        unit_price = (Decimal(value) / Decimal("10")).quantize(TWO_PLACES)
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name=f"Credit Integrity Item ({number})",
            quantity=10,
            unit_price=unit_price,
            subtotal=Decimal(value),
        )
        return quotation

    def test_exposure_tracks_unpaid_invoices_and_payments_reduce_it(self):
        quotation = self._make_approved_quotation("QUO-INT-CR-1", "3000.00")
        invoice = QuotationService.convert_quotation_to_invoice(
            quotation_id=quotation.id, converted_by=self.admin
        )
        # converted invoice = value + 18% exclusive GST = 3540.00
        self.assertEqual(invoice.total_amount, Decimal("3540.00"))
        self.assertEqual(CreditService.get_outstanding_exposure(self.client), Decimal("3540.00"))
        InvoiceService.record_payment(
            invoice_id=invoice.id, amount=Decimal("1000.00"), gateway_transaction_id="GW-INT-CR-1"
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client), Decimal("2540.00"))
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)  # partial payment
        self.assertEqual(invoice.payment_status, "Partially Paid")

    def test_credit_limit_enforced_on_conversion(self):
        first = self._make_approved_quotation("QUO-INT-CR-2", "3000.00")
        QuotationService.convert_quotation_to_invoice(
            quotation_id=first.id, converted_by=self.admin
        )
        # exposure is now 3540 (3000 + GST); converting 3000 more (total 7080)
        # would breach the 5000 credit limit
        quotation2 = self._make_approved_quotation("QUO-INT-CR-3", "3000.00")
        with self.assertRaises(DjangoValidationError):
            QuotationService.convert_quotation_to_invoice(
                quotation_id=quotation2.id, converted_by=self.admin
            )

    def test_cancelled_invoice_releases_exposure(self):
        quotation = self._make_approved_quotation("QUO-INT-CR-4", "3000.00")
        invoice = QuotationService.convert_quotation_to_invoice(
            quotation_id=quotation.id, converted_by=self.admin
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client), Decimal("3540.00"))
        invoice.status = InvoiceStatus.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
        self.assertEqual(CreditService.get_outstanding_exposure(self.client), Decimal("0.00"))

    def test_available_credit_never_exceeds_limit(self):
        # unique GSTIN: client codes and GSTINs are both uniquely constrained
        client = self.make_client(
            code="INT-CR-C2", gstin="33AABCI2345E1Z9", credit_limit="10000.00"
        )
        self.client = client
        quotation = self._make_approved_quotation("QUO-INT-CR-5", "5000.00")
        QuotationService.convert_quotation_to_invoice(
            quotation_id=quotation.id, converted_by=self.admin
        )
        available = CreditService.get_available_credit(client)
        # 5900 exposure against a 10000 limit leaves 4100
        self.assertEqual(available, Decimal("4100.00"))
        self.assertLessEqual(available, client.credit_limit)

    def test_inactive_client_cannot_consume_credit(self):
        self.client.is_active = False
        self.client.save(update_fields=["is_active", "updated_at"])
        check = CreditService.check_credit_availability(self.client, Decimal("100.00"))
        self.assertFalse(check["is_allowed"])
        self.assertIn("inactive", check["reason"])


class ConfigurationAndAuditTrailIntegrityTests(IntegrityTestDataMixin, TestCase):
    """Configuration versioning, audit attribution, and append-only ledgers."""

    def setUp(self):
        self.make_users()

    def test_overlapping_active_tax_configuration_rejected(self):
        TaxConfiguration.objects.create(
            business_state="Tamil Nadu",
            default_tax_rate=Decimal("18.00"),
            effective_from="2026-01-01T00:00:00Z",
            effective_until=None,
            is_active=True,
        )
        overlapping = TaxConfiguration(
            business_state="Tamil Nadu",
            default_tax_rate=Decimal("18.00"),
            effective_from="2026-06-01T00:00:00Z",
            is_active=True,
        )
        with self.assertRaises(DjangoValidationError):
            overlapping.full_clean()

    def test_non_overlapping_tax_versions_allowed(self):
        TaxConfiguration.objects.create(
            business_state="Karnataka",
            default_tax_rate=Decimal("18.00"),
            effective_from="2026-01-01T00:00:00Z",
            effective_until="2026-12-31T00:00:00Z",
            is_active=True,
        )
        successor = TaxConfiguration(
            business_state="Karnataka",
            default_tax_rate=Decimal("18.00"),
            effective_from="2026-12-31T00:00:00Z",
            effective_until="2027-12-31T00:00:00Z",
            is_active=True,
        )
        successor.full_clean()  # must not raise
        successor.save()

    def test_credit_limit_change_writes_attributed_audit_log(self):
        client = self.make_client(code="INT-AUD-1")
        CreditService.record_credit_limit_change(
            client=client,
            new_limit=Decimal("9000.00"),
            changed_by=self.admin,
            reason="Step 18 integrity test",
            ip_address="127.0.0.1",
        )
        log = AdminConfigAuditLog.objects.filter(domain="client_credit", record_id=client.id).latest("id")
        self.assertEqual(log.action_type, "UPDATE")
        self.assertEqual(log.admin_user_id, self.admin.id)
        self.assertEqual(log.old_value, {"credit_limit": "0.00"})
        self.assertEqual(log.new_value, {"credit_limit": "9000.00"})

    def test_stock_transaction_ledger_is_append_only(self):
        product = self.make_catalog(stock=10, sku="INT-AUD-2", slug="int-aud-2")
        tx = StockTransaction.objects.create(
            product=product, change_amount=5, transaction_type=StockTransactionType.RESTOCK
        )
        with self.assertRaises(DjangoValidationError):
            tx.change_amount = 99
            tx.save()
        with self.assertRaises(DjangoValidationError):
            tx.delete()
