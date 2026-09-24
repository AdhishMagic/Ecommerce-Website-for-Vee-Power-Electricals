from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Subcategory, Brand, Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.inventory.services import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.orders.services import CheckoutService, OrderWorkflowService
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    TaxMode,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)
from apps.commercial_config.services import (
    TaxService,
    DiscountService,
    DeliveryService,
    BillingService,
)
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
)
from apps.finance.services import (
    CreditService,
    InvoiceService,
    QuotationService,
)

User = get_user_model()


class Phase6BaseTestCase(TestCase):
    def setUp(self):
        # 1. Users
        self.admin = User.objects.create_superuser(
            email='admin@veepower.com',
            password='AdminPass123!',
            first_name='Vee',
            last_name='Admin',
            role=UserRole.ADMIN,
        )
        self.customer = User.objects.create_user(
            email='customer@example.com',
            password='CustomerPass123!',
            first_name='Anand',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.other_customer = User.objects.create_user(
            email='other@example.com',
            password='OtherPass123!',
            first_name='Ravi',
            last_name='Shankar',
            role=UserRole.CUSTOMER,
        )

        # 2. Addresses
        self.tn_address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Anand Kumar',
            phone='+919876543210',
            address_line1='123 Cross Cut Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641012',
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.ka_address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Anand Bangalore',
            phone='+919876543210',
            address_line1='456 Indiranagar',
            city='Bangalore',
            state='Karnataka',
            pincode='560038',
            address_type=AddressType.WORK,
        )
        self.other_address = CustomerAddress.objects.create(
            user=self.other_customer,
            recipient_name='Ravi Shankar',
            phone='+919876543211',
            address_line1='789 Anna Nagar',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600040',
        )

        # 3. Catalog Products
        self.category = Category.objects.create(name='Cables & Wires', slug='cables-wires')
        self.subcategory = Subcategory.objects.create(category=self.category, name='Armoured Cables', slug='armoured-cables')
        self.brand = Brand.objects.create(name='Polycab', slug='polycab')

        self.product1 = Product.objects.create(
            name='Polycab 4 Sqmm 4 Core Armoured Cable',
            slug='polycab-4sqmm-4core',
            sku='POL-4SQ-001',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            mrp=Decimal('450.00'),
            price=Decimal('380.00'),
            stock=100,
            active=True,
        )
        self.product2 = Product.objects.create(
            name='Havells 16A MCB Single Pole',
            slug='havells-16a-mcb-sp',
            sku='HAV-MCB-16A',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            mrp=Decimal('220.00'),
            price=Decimal('180.00'),
            stock=50,
            active=True,
        )

        # 4. Commercial Configurations
        self.tax_config = TaxConfiguration.objects.create(
            tax_name='Standard GST FY26',
            default_tax_rate=Decimal('18.00'),
            cgst_rate=Decimal('9.00'),
            sgst_rate=Decimal('9.00'),
            igst_rate=Decimal('18.00'),
            tax_calculation_mode=TaxMode.TAX_EXCLUSIVE,
            business_state='Tamil Nadu',
            version_number=1,
            is_active=True,
        )

        self.delivery_config = DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Warehouse',
            origin_address='No 28/1, 2nd floor, MTP Road',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641031',
            latitude=Decimal('11.016800'),
            longitude=Decimal('76.955800'),
            base_delivery_charge=Decimal('100.00'),
            free_delivery_threshold=Decimal('1000.00'),
            version_number=1,
            is_active=True,
        )

        # Continuous half-open slabs [0, 15) and [15, 100)
        self.slab1 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('0.00'),
            max_distance_km=Decimal('15.00'),
            rate=Decimal('60.00'),
            sort_order=1,
            is_active=True,
        )
        self.slab2 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('15.00'),
            max_distance_km=Decimal('100.00'),
            rate=Decimal('150.00'),
            sort_order=2,
            is_active=True,
        )

        self.shipping_rule_ka = ShippingRule.objects.create(
            state='Karnataka',
            cost=Decimal('250.00'),
            estimated_days_min=3,
            estimated_days_max=5,
            is_active=True,
        )

        # 5. Coupons
        self.coupon_pct = OrderDiscount.objects.create(
            code='SAVE10',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('10.00'),
            min_order_value=Decimal('500.00'),
            max_discount_cap=Decimal('100.00'),
            is_active=True,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=30),
        )
        self.coupon_fixed = OrderDiscount.objects.create(
            code='FLAT50',
            discount_type=DiscountType.FIXED,
            discount_value=Decimal('50.00'),
            min_order_value=Decimal('300.00'),
            is_active=True,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=30),
        )


class CommercialBillingEngineTests(Phase6BaseTestCase):
    """
    Test Tax, Discount, Delivery, and Unified Billing Pipeline Engines.
    """

    def test_tax_calculation_exclusive_intra_state(self):
        # Intra-state Tamil Nadu: 9% CGST + 9% SGST
        res = TaxService.calculate_tax(
            amount=Decimal('1000.00'),
            destination_state='Tamil Nadu',
            tax_config=self.tax_config,
        )
        self.assertEqual(res.taxable_amount, Decimal('1000.00'))
        self.assertEqual(res.cgst_amount, Decimal('90.00'))
        self.assertEqual(res.sgst_amount, Decimal('90.00'))
        self.assertEqual(res.igst_amount, Decimal('0.00'))
        self.assertEqual(res.tax_amount, Decimal('180.00'))
        self.assertEqual(res.total_amount, Decimal('1180.00'))
        self.assertTrue(res.is_intra_state)

    def test_tax_calculation_exclusive_inter_state(self):
        # Inter-state Karnataka: 18% IGST
        res = TaxService.calculate_tax(
            amount=Decimal('1000.00'),
            destination_state='Karnataka',
            tax_config=self.tax_config,
        )
        self.assertEqual(res.taxable_amount, Decimal('1000.00'))
        self.assertEqual(res.cgst_amount, Decimal('0.00'))
        self.assertEqual(res.sgst_amount, Decimal('0.00'))
        self.assertEqual(res.igst_amount, Decimal('180.00'))
        self.assertEqual(res.tax_amount, Decimal('180.00'))
        self.assertEqual(res.total_amount, Decimal('1180.00'))
        self.assertFalse(res.is_intra_state)

    def test_tax_calculation_inclusive(self):
        # 18% inclusive on ₹1180.00 -> Base = 1180 / 1.18 = 1000.00
        inclusive_cfg = TaxConfiguration.objects.create(
            tax_name='Inclusive GST',
            default_tax_rate=Decimal('18.00'),
            cgst_rate=Decimal('9.00'),
            sgst_rate=Decimal('9.00'),
            igst_rate=Decimal('18.00'),
            tax_calculation_mode=TaxMode.TAX_INCLUSIVE,
            business_state='Tamil Nadu',
            version_number=2,
            is_active=True,
        )
        res = TaxService.calculate_tax(
            amount=Decimal('1180.00'),
            destination_state='Tamil Nadu',
            tax_config=inclusive_cfg,
        )
        self.assertEqual(res.taxable_amount, Decimal('1000.00'))
        self.assertEqual(res.cgst_amount, Decimal('90.00'))
        self.assertEqual(res.sgst_amount, Decimal('90.00'))
        self.assertEqual(res.tax_amount, Decimal('180.00'))
        self.assertEqual(res.total_amount, Decimal('1180.00'))

    def test_discount_percentage_with_cap(self):
        # 10% on ₹1500 = ₹150, but max cap is ₹100
        res = DiscountService.evaluate_order_discount(
            code='SAVE10',
            order_amount=Decimal('1500.00'),
        )
        self.assertTrue(res.is_valid)
        self.assertEqual(res.calculated_discount, Decimal('100.00'))

    def test_discount_fixed_amount(self):
        # Flat ₹50 on ₹400
        res = DiscountService.evaluate_order_discount(
            code='FLAT50',
            order_amount=Decimal('400.00'),
        )
        self.assertTrue(res.is_valid)
        self.assertEqual(res.calculated_discount, Decimal('50.00'))

    def test_discount_min_order_value_enforced(self):
        # SAVE10 requires min_order_value ₹500; try with ₹400
        res = DiscountService.evaluate_order_discount(
            code='SAVE10',
            order_amount=Decimal('400.00'),
        )
        self.assertFalse(res.is_valid)
        self.assertIn('Minimum order amount', res.error_message)

    def test_discount_stacking_limit(self):
        # Combined discount capped at 50%
        OrderDiscount.objects.create(
            code='STACKTEST',
            discount_type=DiscountType.FIXED,
            discount_value=Decimal('50.00'),
            min_order_value=Decimal('50.00'),
            is_active=True,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=30),
        )
        res = DiscountService.evaluate_order_discount(
            code='STACKTEST',
            order_amount=Decimal('80.00'),
            existing_product_discounts=Decimal('10.00'),
        )
        # 50% of ₹80 is ₹40. Existing is ₹10. Remaining allowable order discount is ₹30.
        self.assertTrue(res.is_valid)
        self.assertEqual(res.calculated_discount, Decimal('30.00'))

    def test_delivery_distance_slab_continuous_half_open(self):
        # Distance = 10 km falls into slab1 [0, 15) -> ₹60
        res10 = DeliveryService.calculate_delivery(
            subtotal=Decimal('400.00'),
            state='Tamil Nadu',
            distance_km=Decimal('10.00'),
        )
        self.assertEqual(res10.shipping_fee, Decimal('60.00'))
        self.assertFalse(res10.is_free_delivery)

        # Distance = 15 km falls into slab2 [15, 100) -> ₹150
        res15 = DeliveryService.calculate_delivery(
            subtotal=Decimal('400.00'),
            state='Tamil Nadu',
            distance_km=Decimal('15.00'),
        )
        self.assertEqual(res15.shipping_fee, Decimal('150.00'))

    def test_delivery_free_threshold(self):
        # Subtotal ₹1200 >= threshold ₹1000 -> free delivery
        res = DeliveryService.calculate_delivery(
            subtotal=Decimal('1200.00'),
            state='Tamil Nadu',
            distance_km=Decimal('20.00'),
        )
        self.assertEqual(res.shipping_fee, Decimal('0.00'))
        self.assertTrue(res.is_free_delivery)
        self.assertEqual(res.shipping_discount, Decimal('150.00'))

    def test_delivery_state_fallback_rule(self):
        # Karnataka has flat rate ₹250
        res = DeliveryService.calculate_delivery(
            subtotal=Decimal('500.00'),
            state='Karnataka',
        )
        self.assertEqual(res.shipping_fee, Decimal('250.00'))

    def test_billing_service_pipeline_and_snapshot(self):
        items_data = [
            {'product': self.product1, 'quantity': 2},  # 2 x 380 = 760
            {'product': self.product2, 'quantity': 1},  # 1 x 180 = 180
        ]
        # subtotal = 940.00
        # Coupon FLAT50 -> subtotal = 940 - 50 = 890.00 taxable
        # Intra-state Tamil Nadu: CGST 9% (80.10) + SGST 9% (80.10) = 160.20
        # Delivery: under ₹1000 threshold, distance slab1 = ₹60.00
        # Final Total: 890.00 + 160.20 + 60.00 = 1110.20
        res = BillingService.calculate_order(
            items_data=items_data,
            destination_state='Tamil Nadu',
            distance_km=Decimal('10.00'),
            coupon_code='FLAT50',
        )
        self.assertEqual(res.subtotal, Decimal('940.00'))
        self.assertEqual(res.order_discount, Decimal('50.00'))
        self.assertEqual(res.taxable_amount, Decimal('890.00'))
        self.assertEqual(res.cgst_amount, Decimal('80.10'))
        self.assertEqual(res.sgst_amount, Decimal('80.10'))
        self.assertEqual(res.tax_amount, Decimal('160.20'))
        self.assertEqual(res.shipping_fee, Decimal('60.00'))
        self.assertEqual(res.total_amount, Decimal('1110.20'))
        self.assertIn('subtotal', res.calculation_snapshot)
        self.assertIn('applied_coupon', res.calculation_snapshot)


class InventoryWorkflowEngineTests(Phase6BaseTestCase):
    """
    Test atomic stock operations, ledgers, and duplicate restoration guards.
    """

    def test_restock_product(self):
        initial_stock = self.product1.stock
        prod, tx = InventoryService.restock_product(
            product_id=self.product1.id,
            quantity=20,
            performed_by=self.admin,
            notes='Shipment received from factory',
        )
        self.assertEqual(prod.stock, initial_stock + 20)
        self.assertEqual(tx.transaction_type, StockTransactionType.RESTOCK)
        self.assertEqual(tx.change_amount, 20)

    def test_sale_deduct_stock(self):
        initial_stock = self.product1.stock
        prod, tx = InventoryService.sale_deduct_stock(
            product_id=self.product1.id,
            quantity=5,
            performed_by=self.customer,
        )
        self.assertEqual(prod.stock, initial_stock - 5)
        self.assertEqual(tx.transaction_type, StockTransactionType.SALE)
        self.assertEqual(tx.change_amount, -5)

    def test_sale_insufficient_stock_fails(self):
        with self.assertRaises(ValidationError) as ctx:
            InventoryService.sale_deduct_stock(
                product_id=self.product1.id,
                quantity=1000,
            )
        self.assertIn('Insufficient stock', str(ctx.exception))

    def test_adjust_stock_positive_and_negative(self):
        initial_stock = self.product2.stock  # 50
        # Positive adjustment
        p1, tx1 = InventoryService.adjust_stock(
            product_id=self.product2.id,
            change_amount=10,
            performed_by=self.admin,
        )
        self.assertEqual(p1.stock, 60)
        self.assertEqual(tx1.transaction_type, StockTransactionType.ADJUSTMENT)

        # Negative adjustment (damage)
        p2, tx2 = InventoryService.adjust_stock(
            product_id=self.product2.id,
            change_amount=-15,
            performed_by=self.admin,
        )
        self.assertEqual(p2.stock, 45)
        self.assertEqual(tx2.change_amount, -15)

    def test_adjust_stock_prevent_negative_balance(self):
        with self.assertRaises(ValidationError) as ctx:
            InventoryService.adjust_stock(
                product_id=self.product2.id,
                change_amount=-100,
            )
        self.assertIn('Insufficient stock', str(ctx.exception))

    def test_restore_order_stock_idempotency(self):
        # Create an order with 1 item of quantity 4
        order = Order.objects.create(
            order_number='ORD-TEST-RESTORE-01',
            user=self.customer,
            customer_name='Anand Kumar',
            customer_email='customer@example.com',
            customer_phone='+919876543210',
            subtotal=Decimal('380.00'),
            taxable_amount=Decimal('380.00'),
            total_amount=Decimal('380.00'),
            status=OrderStatus.PENDING,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product1,
            product_name=self.product1.name,
            sku=self.product1.sku,
            mrp=self.product1.mrp,
            unit_price=self.product1.price,
            quantity=4,
            taxable_amount=Decimal('380.00'),
            subtotal=Decimal('380.00'),
            total_amount=Decimal('380.00'),
        )
        # Deduct stock first
        self.product1.stock -= 4
        self.product1.save()
        initial_stock = self.product1.stock

        # First restoration
        restored = InventoryService.restore_order_stock(order, performed_by=self.admin)
        self.assertTrue(restored)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock + 4)

        # Verify RETURN transaction logged
        ret_tx = StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN).first()
        self.assertIsNotNone(ret_tx)
        self.assertEqual(ret_tx.change_amount, 4)

        # Second restoration attempt MUST be safely ignored (prevent duplicate stock restoration)
        second_restored = InventoryService.restore_order_stock(order, performed_by=self.admin)
        self.assertFalse(second_restored)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock + 4)  # No change!


class OrderWorkflowServiceTests(Phase6BaseTestCase):
    """
    Test canonical 10-state FSM transitions, terminal protections, and business effects.
    """

    def setUp(self):
        super().setUp()
        self.order = Order.objects.create(
            order_number='ORD-FSM-001',
            user=self.customer,
            customer_name='Anand Kumar',
            customer_email='customer@example.com',
            customer_phone='+919876543210',
            subtotal=Decimal('760.00'),
            taxable_amount=Decimal('760.00'),
            total_amount=Decimal('760.00'),
            status=OrderStatus.PENDING,
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product1,
            product_name=self.product1.name,
            sku=self.product1.sku,
            mrp=self.product1.mrp,
            unit_price=self.product1.price,
            quantity=2,
            taxable_amount=Decimal('760.00'),
            subtotal=Decimal('760.00'),
            total_amount=Decimal('760.00'),
        )

    def test_canonical_10_state_transitions(self):
        # PENDING -> CONFIRMED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

        # CONFIRMED -> PACKED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.PACKED)

        # PACKED -> SHIPPED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.SHIPPED, changed_by=self.admin, tracking_number='BLUEDART-123')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.SHIPPED)
        self.assertEqual(self.order.tracking_number, 'BLUEDART-123')

        # SHIPPED -> DELIVERED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.DELIVERED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.DELIVERED)

        # DELIVERED -> RETURN_REQUESTED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.RETURN_REQUESTED, changed_by=self.customer, reason='Defective switch')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.RETURN_REQUESTED)

        # RETURN_REQUESTED -> RETURN_APPROVED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.RETURN_APPROVED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.RETURN_APPROVED)

        # RETURN_APPROVED -> RETURN_COMPLETED
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.RETURN_COMPLETED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.RETURN_COMPLETED)

    def test_invalid_transition_fails(self):
        # Direct PENDING -> DELIVERED is forbidden
        with self.assertRaises(ValidationError) as ctx:
            OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.DELIVERED)
        self.assertIn('Invalid status transition', str(ctx.exception))

    def test_terminal_state_protection(self):
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CANCELLED, changed_by=self.admin)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CANCELLED)

        # Cannot move out of CANCELLED
        with self.assertRaises(ValidationError):
            OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)

    def test_order_cancellation_restores_stock(self):
        # Deduct stock first simulating checkout
        self.product1.stock -= 2
        self.product1.save()
        initial_stock = self.product1.stock

        OrderWorkflowService.cancel_order(self.order.id, requested_by=self.admin, reason='Customer request')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CANCELLED)

        # Stock should be restored
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock + 2)


class CheckoutServiceWorkflowTests(Phase6BaseTestCase):
    """
    Test CheckoutService atomic workflow: stock locking, billing, snapshot, and order placement.
    """

    def test_valid_checkout_workflow(self):
        initial_stock1 = self.product1.stock
        initial_stock2 = self.product2.stock

        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.tn_address.id,
            items_data=[
                {'product_id': self.product1.id, 'quantity': 2},
                {'product_id': self.product2.id, 'quantity': 1},
            ],
            payment_method='UPI',
            notes='Leave at security gate',
            coupon_code='FLAT50',
        )

        self.assertIsNotNone(order.id)
        self.assertTrue(order.order_number.startswith('ORD-'))
        self.assertEqual(order.status, OrderStatus.PENDING)
        self.assertEqual(order.subtotal, Decimal('940.00'))
        self.assertEqual(order.order_discount, Decimal('50.00'))
        self.assertEqual(order.items.count(), 2)

        # Verify physical stock was decremented
        self.product1.refresh_from_db()
        self.product2.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock1 - 2)
        self.assertEqual(self.product2.stock, initial_stock2 - 1)

        # Verify SALE stock transactions created
        txs = StockTransaction.objects.filter(order=order)
        self.assertEqual(txs.count(), 2)
        self.assertTrue(all(t.transaction_type == StockTransactionType.SALE for t in txs))

        # Verify OrderStatusHistory
        history = order.status_history.first()
        self.assertIsNotNone(history)
        self.assertEqual(history.new_status, OrderStatus.PENDING)

    def test_checkout_unowned_shipping_address_fails(self):
        with self.assertRaises(ValidationError) as ctx:
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=self.other_address.id,  # Belongs to other_customer
                items_data=[{'product_id': self.product1.id, 'quantity': 1}],
            )
        self.assertIn('Invalid shipping address', str(ctx.exception))

    def test_checkout_insufficient_stock_fails(self):
        with self.assertRaises(ValidationError) as ctx:
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=self.tn_address.id,
                items_data=[{'product_id': self.product1.id, 'quantity': 5000}],
            )
        self.assertIn('Insufficient stock', str(ctx.exception))

    def test_checkout_inactive_product_fails(self):
        self.product2.active = False
        self.product2.save()

        with self.assertRaises(ValidationError) as ctx:
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=self.tn_address.id,
                items_data=[{'product_id': self.product2.id, 'quantity': 1}],
            )
        self.assertIn('currently unavailable', str(ctx.exception))


class FinanceAndInvoicingServicesTests(Phase6BaseTestCase):
    """
    Test InvoiceService, QuotationService conversion, and B2B CreditService.
    """

    def setUp(self):
        super().setUp()
        self.client_obj = Client.objects.create(
            client_code='CL-SUSIN-01',
            company_name='Susin Technologies Pvt Ltd',
            contact_person='Murugan S',
            gstin='33AAACS1234F1Z5',
            email='procurement@susin.com',
            phone='+919443322110',
            credit_limit=Decimal('50000.00'),
        )

    def test_create_invoice_for_order(self):
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.tn_address.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 2}],
            payment_method='UPI',
        )

        invoice = InvoiceService.create_invoice_for_order(order)
        self.assertIsNotNone(invoice.id)
        self.assertTrue(invoice.invoice_number.startswith('INV-'))
        self.assertEqual(invoice.order, order)
        self.assertEqual(invoice.subtotal, order.subtotal)
        self.assertEqual(invoice.total_amount, order.total_amount)
        self.assertEqual(invoice.items.count(), 1)
        self.assertEqual(invoice.items.first().product, self.product1)

    def test_quotation_conversion_to_invoice(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QT-2026-001',
            client=self.client_obj,
            quotation_date=today,
            expiry_date=today + timedelta(days=15),
            total_value=Decimal('10000.00'),
            status=QuotationStatus.APPROVED,
            created_by=self.admin,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=10,
            unit_price=Decimal('380.00'),
            subtotal=Decimal('3800.00'),
        )

        invoice = QuotationService.convert_quotation_to_invoice(
            quotation_id=quote.id,
            converted_by=self.admin,
        )

        self.assertIsNotNone(invoice.id)
        self.assertEqual(invoice.quotation, quote)
        self.assertEqual(invoice.client, self.client_obj)

        # Quotation status updated to CONVERTED
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.CONVERTED)

    def test_quotation_duplicate_conversion_blocked(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QT-2026-002',
            client=self.client_obj,
            quotation_date=today,
            expiry_date=today + timedelta(days=15),
            total_value=Decimal('5000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product2,
            item_name=self.product2.name,
            quantity=5,
            unit_price=Decimal('180.00'),
            subtotal=Decimal('900.00'),
        )

        # First conversion succeeds
        QuotationService.convert_quotation_to_invoice(quote.id)

        # Second conversion must fail
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIn('already been converted', str(ctx.exception))

    def test_quotation_rejected_conversion_blocked(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QT-2026-003',
            client=self.client_obj,
            quotation_date=today,
            expiry_date=today + timedelta(days=15),
            total_value=Decimal('5000.00'),
            status=QuotationStatus.REJECTED,
        )
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIn('Cannot convert rejected quotation', str(ctx.exception))

    def test_b2b_credit_limit_enforced(self):
        # Client has credit_limit = ₹50,000.00
        # Create existing unpaid invoice of ₹40,000.00
        Invoice.objects.create(
            invoice_number='INV-PRE-01',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            client=self.client_obj,
            subtotal=Decimal('40000.00'),
            taxable_amount=Decimal('40000.00'),
            total_amount=Decimal('40000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Check exposure: ₹40,000
        exposure = CreditService.get_outstanding_exposure(self.client_obj)
        self.assertEqual(exposure, Decimal('40000.00'))

        # A new transaction of ₹15,000 would result in ₹55,000 > ₹50,000 limit -> FAILS
        check = CreditService.check_credit_availability(self.client_obj, additional_amount=Decimal('15000.00'))
        self.assertFalse(check['is_allowed'])
        self.assertEqual(check['shortfall'], Decimal('5000.00'))

        with self.assertRaises(ValidationError) as ctx:
            CreditService.validate_credit_limit(self.client_obj, additional_amount=Decimal('15000.00'))
        self.assertIn('Credit limit exceeded', str(ctx.exception))

        # A new transaction of ₹5,000 results in ₹45,000 <= ₹50,000 limit -> ALLOWED
        check_ok = CreditService.check_credit_availability(self.client_obj, additional_amount=Decimal('5000.00'))
        self.assertTrue(check_ok['is_allowed'])
