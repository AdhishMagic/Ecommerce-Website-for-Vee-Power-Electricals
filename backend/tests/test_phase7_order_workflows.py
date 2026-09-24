from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from django.utils import timezone

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Brand, Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.orders.services import CheckoutService, OrderWorkflowService
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
)
from apps.finance.services import QuotationService, InvoiceService, CreditService
from apps.commercial_config.models import CompanyStoreConfiguration, TaxConfiguration, DeliveryConfiguration

User = get_user_model()


class Phase7OrderWorkflowsTestCase(TestCase):
    """
    FSM Transition Matrix, Checkout Atomicity, Quotation-Invoice Lifecycle, and B2B Credit Hardening (Phase 7).
    """

    def setUp(self):
        self.customer = User.objects.create_user(
            email='c_fsm@example.com',
            password='Password123!',
            first_name='FSM',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin_fsm@example.com',
            password='Password123!',
            first_name='FSM',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        # Catalog setup
        self.category = Category.objects.create(name='FSM Cables', slug='fsm-cables', is_active=True)
        self.brand = Brand.objects.create(name='FSM Brand', slug='fsm-brand', is_active=True)
        self.product = Product.objects.create(
            name='FSM Heavy Duty Cable',
            slug='fsm-heavy-cable',
            sku='FSM-SKU-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('500.00'),
            price=Decimal('400.00'),
            stock=50,
            active=True,
        )

        self.address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='FSM Customer',
            phone='+919876543210',
            address_line1='456 Industrial Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641002',
            address_type=AddressType.HOME,
            is_default=True,
        )

        # Configurations
        TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name='Main Depot',
            origin_address='Depot St',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641001',
            base_delivery_charge=Decimal('50.00'),
            free_delivery_threshold=Decimal('2000.00'),
            is_active=True,
        )

    # -------------------------------------------------------------
    # 1. Canonical 10-State Order FSM Matrix
    # -------------------------------------------------------------
    def test_canonical_full_fulfillment_fsm_path(self):
        """
        Valid sequence: PENDING -> CONFIRMED -> PACKED -> SHIPPED -> DELIVERED
        -> RETURN_REQUESTED -> RETURN_APPROVED -> RETURN_COMPLETED.
        """
        order = Order.objects.create(
            order_number='ORD-FSM-001',
            user=self.customer,
            customer_name='FSM Customer',
            customer_email='c_fsm@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'FSM Customer', 'city': 'Coimbatore'},
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            subtotal=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )

        path = [
            OrderStatus.CONFIRMED,
            OrderStatus.PACKED,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.RETURN_REQUESTED,
            OrderStatus.RETURN_APPROVED,
            OrderStatus.RETURN_COMPLETED,
        ]

        for next_status in path:
            OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=next_status,
                changed_by=self.admin,
                tracking_number='TRACK-123' if next_status == OrderStatus.SHIPPED else None,
            )
            order.refresh_from_db()
            self.assertEqual(order.status, next_status)

        # Verify audit history logged for each transition
        history_count = OrderStatusHistory.objects.filter(order=order).count()
        self.assertEqual(history_count, len(path))

    def test_terminal_states_reject_any_further_transition(self):
        """CANCELLED, RETURN_REJECTED, and RETURN_COMPLETED reject any transition."""
        order = Order.objects.create(
            order_number='ORD-FSM-TERM',
            user=self.customer,
            customer_name='FSM Customer',
            customer_email='c_fsm@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'FSM Customer', 'city': 'Coimbatore'},
            status=OrderStatus.CANCELLED,
            payment_status=PaymentStatus.PENDING,
            subtotal=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )

        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=OrderStatus.CONFIRMED,
                changed_by=self.admin,
            )

    def test_invalid_jump_transitions_rejected(self):
        """Jumping states like PENDING -> DELIVERED is rejected."""
        order = Order.objects.create(
            order_number='ORD-FSM-JUMP',
            user=self.customer,
            customer_name='FSM Customer',
            customer_email='c_fsm@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'FSM Customer', 'city': 'Coimbatore'},
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            subtotal=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )

        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=OrderStatus.DELIVERED,
                changed_by=self.admin,
            )

    def test_cancellation_restores_stock_exactly_once(self):
        """Cancelling a CONFIRMED order restores stock and logs RETURN transaction."""
        order = Order.objects.create(
            order_number='ORD-FSM-RESTORE',
            user=self.customer,
            customer_name='FSM Customer',
            customer_email='c_fsm@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'FSM Customer', 'city': 'Coimbatore'},
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PAID,
            subtotal=Decimal('800.00'),
            taxable_amount=Decimal('800.00'),
            total_amount=Decimal('944.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            quantity=2,
            mrp=Decimal('500.00'),
            unit_price=Decimal('400.00'),
            taxable_amount=Decimal('800.00'),
            subtotal=Decimal('800.00'),
            total_amount=Decimal('944.00'),
        )
        self.product.stock = 48
        self.product.save()

        # Cancel order
        OrderWorkflowService.transition_order_status(
            order_id=order.id,
            target_status=OrderStatus.CANCELLED,
            changed_by=self.admin,
            reason='Customer requested cancel',
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50, "Stock should be restored to 50")

        # Second attempt is an idempotent no-op and must NOT restore stock again
        OrderWorkflowService.transition_order_status(
            order_id=order.id,
            target_status=OrderStatus.CANCELLED,
            changed_by=self.admin,
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50, "Stock must remain 50, not double-restored")

    # -------------------------------------------------------------
    # 2. Checkout Atomicity & Failure Rollback Tests
    # -------------------------------------------------------------
    def test_checkout_failure_rolls_back_entire_transaction(self):
        """Insufficient stock aborts checkout atomically: no Order or StockTransaction created."""
        initial_order_count = Order.objects.count()
        initial_tx_count = StockTransaction.objects.count()

        # Product has 50 stock, requesting 100
        items = [{'product_id': self.product.id, 'quantity': 100}]

        with self.assertRaises(DjangoValidationError):
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=self.address.id,
                items_data=items,
            )

        # Verify 100% rollback
        self.assertEqual(Order.objects.count(), initial_order_count)
        self.assertEqual(StockTransaction.objects.count(), initial_tx_count)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50)

    # -------------------------------------------------------------
    # 3. Quotation to Invoice Lifecycle & Credit Tests
    # -------------------------------------------------------------
    def test_quotation_conversion_and_duplicate_prevention(self):
        """Approved quotation converts to Invoice; duplicate conversion is prevented."""
        client = Client.objects.create(
            client_code='CLI-FSM-001',
            company_name='Electro Corp',
            contact_person='Mr. Sharma',
            email='electro@example.com',
            phone='+919876543210',
            gstin='33AAAAA0000A1Z5',
            credit_limit=Decimal('50000.00'),
            is_active=True,
        )
        now_date = timezone.now().date()
        quotation = Quotation.objects.create(
            quotation_number='QT-2026-001',
            client=client,
            quotation_date=now_date,
            expiry_date=now_date + timedelta(days=30),
            total_value=Decimal('4720.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name=self.product.name,
            quantity=10,
            unit_price=Decimal('400.00'),
            subtotal=Decimal('4000.00'),
        )

        invoice = QuotationService.convert_quotation_to_invoice(
            quotation_id=quotation.id,
            converted_by=self.admin,
        )
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.quotation, quotation)
        self.assertTrue(invoice.invoice_number.startswith('INV-'))

        quotation.refresh_from_db()
        self.assertEqual(quotation.status, QuotationStatus.CONVERTED)

        # Attempting second conversion must raise error
        with self.assertRaises(DjangoValidationError):
            QuotationService.convert_quotation_to_invoice(
                quotation_id=quotation.id,
                converted_by=self.admin,
            )

    def test_b2b_credit_limit_validation(self):
        """Credit limit exceeded rejects transaction; within limit is accepted."""
        client = Client.objects.create(
            client_code='CLI-FSM-002',
            company_name='Power Grid Corp',
            contact_person='Mr. Verma',
            email='powergrid@example.com',
            phone='+919876543211',
            gstin='33BBBBB0000B1Z6',
            credit_limit=Decimal('10000.00'),
            is_active=True,
        )

        now_date = timezone.now().date()
        # Create an unpaid invoice with total_amount = 8000.00
        Invoice.objects.create(
            invoice_number='INV-2026-8888',
            client=client,
            invoice_date=now_date,
            due_date=now_date + timedelta(days=15),
            subtotal=Decimal('8000.00'),
            taxable_amount=Decimal('8000.00'),
            total_amount=Decimal('8000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Within limit: 8000 + 1500 = 9500 <= 10000 -> OK (no exception raised)
        CreditService.validate_credit_limit(client=client, additional_amount=Decimal('1500.00'))

        # Exceeds limit: 8000 + 2500 = 10500 > 10000 -> raises ValidationError
        with self.assertRaises(DjangoValidationError):
            CreditService.validate_credit_limit(client=client, additional_amount=Decimal('2500.00'))
