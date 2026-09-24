from datetime import date, datetime, timedelta
from decimal import Decimal
from django.test import TestCase, TransactionTestCase
from django.db import IntegrityError, models
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from apps.users.models import User, CustomerAddress, UserRole, AddressType
from apps.commercial_config.models import (
    TaxConfiguration,
    TaxMode,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
    CompanyStoreConfiguration,
    RoundingMode,
)
from apps.products.models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import (
    Order,
    OrderItem,
    OrderStatusHistory,
    OrderStatus,
    PaymentStatus as OrderPaymentStatus,
)
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    PayoutSettlement,
    SettlementStatus,
)
from apps.core.models import AdminConfigAuditLog, AuditActionType, ContactInquiry, InquiryStatus


class Phase3IdentityModelTests(TestCase):
    """Tests for User and CustomerAddress models."""

    def test_user_creation_and_role_staff_sync(self):
        # Customer user
        customer = User.objects.create_user(
            email="cust1@example.com",
            password="Password123!",
            first_name="Anand",
            last_name="R",
            role=UserRole.CUSTOMER,
        )
        self.assertEqual(customer.email, "cust1@example.com")
        self.assertFalse(customer.is_staff)
        self.assertFalse(customer.is_superuser)

        # Admin user - save() automatically syncs is_staff=True
        admin = User.objects.create_user(
            email="admin1@example.com",
            password="Password123!",
            first_name="Admin",
            last_name="User",
            role=UserRole.ADMIN,
        )
        self.assertTrue(admin.is_staff)

    def test_user_unique_email(self):
        User.objects.create_user(
            email="duplicate@example.com",
            password="Password123!",
            role=UserRole.CUSTOMER,
        )
        with self.assertRaises(IntegrityError):
            User.objects.create(
                email="duplicate@example.com",
                username="duplicate2",
                role=UserRole.CUSTOMER,
            )

    def test_customer_address_default_uniqueness_and_switch(self):
        user = User.objects.create_user(email="addr_test@example.com", password="Password123!")

        addr1 = CustomerAddress.objects.create(
            user=user,
            recipient_name="Home 1",
            phone="+919876543210",
            address_line1="100 Gandhipuram",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641012",
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.assertTrue(addr1.is_default)

        # Creating a second default address should automatically set addr1.is_default to False
        addr2 = CustomerAddress.objects.create(
            user=user,
            recipient_name="Work 2",
            phone="+919876543210",
            address_line1="200 RS Puram",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641002",
            address_type=AddressType.WORK,
            is_default=True,
        )
        addr1.refresh_from_db()
        self.assertFalse(addr1.is_default)
        self.assertTrue(addr2.is_default)


class Phase3CatalogInventoryModelTests(TransactionTestCase):
    """Tests for Category, Brand, Product, and StockTransaction models."""

    def setUp(self):
        self.category = Category.objects.create(name="Wires & Cables", slug="wires-cables")
        self.brand = Brand.objects.create(name="Polycab", slug="polycab")

    def test_product_creation_and_relationships(self):
        product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="Polycab 1.5 Sq mm Wire",
            slug="polycab-1-5-sq-mm-wire",
            sku="WIR-POL-002",
            mrp=Decimal("1800.00"),
            price=Decimal("1450.00"),
            stock=50,
            low_stock_threshold=10,
        )
        self.assertEqual(product.category.name, "Wires & Cables")
        self.assertEqual(product.brand.name, "Polycab")
        self.assertEqual(product.price, Decimal("1450.00"))

    def test_product_unique_sku_and_slug(self):
        Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="Product A",
            slug="prod-a",
            sku="SKU-AAA",
            mrp=Decimal("100.00"),
            price=Decimal("90.00"),
        )
        with self.assertRaises(IntegrityError):
            Product.objects.create(
                category=self.category,
                brand=self.brand,
                name="Product B",
                slug="prod-a",  # Duplicate slug
                sku="SKU-BBB",
                mrp=Decimal("100.00"),
                price=Decimal("90.00"),
            )

    def test_product_price_lte_mrp_check_constraint(self):
        # Database check constraint: price <= mrp
        with self.assertRaises(IntegrityError):
            Product.objects.create(
                category=self.category,
                brand=self.brand,
                name="Overpriced Product",
                slug="overpriced-prod",
                sku="SKU-OVER",
                mrp=Decimal("100.00"),
                price=Decimal("150.00"),  # Violates chk_product_price_mrp
            )

    def test_product_non_negative_stock_check_constraint(self):
        with self.assertRaises(IntegrityError):
            Product.objects.create(
                category=self.category,
                brand=self.brand,
                name="Negative Stock Item",
                slug="neg-stock",
                sku="SKU-NEG",
                mrp=Decimal("100.00"),
                price=Decimal("90.00"),
                stock=-5,  # Violates chk_product_stock_pos
            )

    def test_stock_transaction_protects_product_deletion(self):
        product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="Protected Product",
            slug="protected-prod",
            sku="SKU-PROT",
            mrp=Decimal("500.00"),
            price=Decimal("400.00"),
            stock=20,
        )
        StockTransaction.objects.create(
            product=product,
            change_amount=20,
            transaction_type=StockTransactionType.RESTOCK,
            notes="Initial stock",
        )
        # Deleting the product must raise ProtectedError to prevent stock ledger corruption
        with self.assertRaises(ProtectedError):
            product.delete()


class Phase3OrderModelTests(TestCase):
    """Tests for Order, OrderItem, and OrderStatusHistory models."""

    def setUp(self):
        self.user = User.objects.create_user(email="order_test@example.com", password="Password123!")
        self.category = Category.objects.create(name="Lighting", slug="lighting")
        self.brand = Brand.objects.create(name="Philips", slug="philips")
        self.product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="LED Bulb 9W",
            slug="led-bulb-9w",
            sku="LED-009",
            mrp=Decimal("150.00"),
            price=Decimal("100.00"),
            stock=100,
        )

    def test_order_creation_with_canonical_statuses(self):
        order = Order.objects.create(
            order_number="ORD-TEST-001",
            user=self.user,
            customer_name="Test Customer",
            customer_email="test@example.com",
            customer_phone="+919876543210",
            shipping_address={"city": "Coimbatore"},
            subtotal=Decimal("200.00"),
            taxable_amount=Decimal("200.00"),
            tax_amount=Decimal("36.00"),
            cgst_amount=Decimal("18.00"),
            sgst_amount=Decimal("18.00"),
            total_amount=Decimal("236.00"),
            status=OrderStatus.PENDING,
            payment_status=OrderPaymentStatus.PENDING,
            calculation_snapshot={"tax_rate": 18},
        )
        self.assertEqual(order.status, "PENDING")
        self.assertEqual(order.payment_status, "Pending")

        # Create OrderItem
        item = OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=2,
            subtotal=Decimal("200.00"),
            taxable_amount=Decimal("200.00"),
            total_amount=Decimal("236.00"),
        )
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().product_name, "LED Bulb 9W")

        # Track status history
        history = OrderStatusHistory.objects.create(
            order=order,
            previous_status=OrderStatus.PENDING,
            new_status=OrderStatus.CONFIRMED,
            changed_by=self.user,
            reason="Payment received",
        )
        self.assertEqual(order.status_history.count(), 1)


class Phase3FinanceModelTests(TestCase):
    """Tests for Client, Quotation, Invoice, and PaymentTransaction models."""

    def setUp(self):
        self.user = User.objects.create_user(email="staff@example.com", password="Password123!", role=UserRole.ADMIN)
        self.client = Client.objects.create(
            client_code="CLI-TEST-001",
            company_name="Alpha Constructions",
            contact_person="Ravi K",
            gstin="33ABCDE1234F1Z5",
            email="ravi@alphaconstruct.com",
            phone="+919876543210",
            credit_limit=Decimal("200000.00"),
        )
        self.category = Category.objects.create(name="Switches", slug="switches")
        self.brand = Brand.objects.create(name="Legrand", slug="legrand")
        self.product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="Arteor Switch",
            slug="arteor-switch",
            sku="SWI-LEG-999",
            mrp=Decimal("200.00"),
            price=Decimal("150.00"),
            stock=100,
        )

    def test_quotation_and_invoice_acyclic_relationship(self):
        # 1. Create Quotation
        quotation = Quotation.objects.create(
            quotation_number="QUO-TEST-001",
            client=self.client,
            quotation_date=date.today(),
            expiry_date=date.today() + timedelta(days=30),
            total_value=Decimal("15000.00"),
            status=QuotationStatus.SENT,
            created_by=self.user,
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name=self.product.name,
            quantity=100,
            unit_price=Decimal("150.00"),
            subtotal=Decimal("15000.00"),
        )

        # 2. Quotation has NO converted_invoice_id field (unidirectional)
        self.assertFalse(hasattr(quotation, "converted_invoice_id"))

        # 3. Create Invoice pointing to Quotation
        invoice = Invoice.objects.create(
            invoice_number="INV-TEST-001",
            client=self.client,
            quotation=quotation,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=15),
            subtotal=Decimal("15000.00"),
            taxable_amount=Decimal("15000.00"),
            total_amount=Decimal("17700.00"),
            status=InvoiceStatus.UNPAID,
            calculation_snapshot={"tax_rate": 18},
        )

        # 4. Reverse relationship from Quotation to Invoices works cleanly
        self.assertEqual(quotation.invoices.count(), 1)
        self.assertEqual(quotation.invoices.first().invoice_number, "INV-TEST-001")

    def test_invoice_supports_multiple_invoices_per_order(self):
        order = Order.objects.create(
            order_number="ORD-MULTI-INV-001",
            customer_name="Corp Order",
            customer_email="corp@example.com",
            customer_phone="+919876543210",
            shipping_address={"city": "Chennai"},
            subtotal=Decimal("50000.00"),
            taxable_amount=Decimal("50000.00"),
            total_amount=Decimal("59000.00"),
            calculation_snapshot={},
        )
        inv1 = Invoice.objects.create(
            invoice_number="INV-PART-1",
            order=order,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=15),
            subtotal=Decimal("25000.00"),
            taxable_amount=Decimal("25000.00"),
            total_amount=Decimal("29500.00"),
            status=InvoiceStatus.UNPAID,
            calculation_snapshot={},
        )
        inv2 = Invoice.objects.create(
            invoice_number="INV-PART-2",
            order=order,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            subtotal=Decimal("25000.00"),
            taxable_amount=Decimal("25000.00"),
            total_amount=Decimal("29500.00"),
            status=InvoiceStatus.UNPAID,
            calculation_snapshot={},
        )
        self.assertEqual(order.invoices.count(), 2)


class Phase3ConfigurationModelTests(TestCase):
    """Tests for TaxConfiguration, DeliveryConfiguration, DistanceSlab, and CompanyStoreConfiguration."""

    def test_distance_slab_range_validation(self):
        del_config = DeliveryConfiguration.objects.create(
            origin_name="Hub",
            origin_address="Address",
            origin_city="Coimbatore",
            origin_state="Tamil Nadu",
            origin_pincode="641031",
            base_delivery_charge=Decimal("100.00"),
            distance_slab_km=Decimal("10.00"),
            charge_per_slab=Decimal("100.00"),
            free_delivery_threshold=Decimal("999.00"),
            fallback_regional_rate=Decimal("100.00"),
        )
        slab = DistanceSlab.objects.create(
            delivery_config=del_config,
            min_distance_km=Decimal("0.00"),
            max_distance_km=Decimal("10.00"),
            rate=Decimal("100.00"),
            sort_order=1,
        )
        self.assertEqual(slab.rate, Decimal("100.00"))

        # Inverted distance slab range should fail check constraint max > min
        with self.assertRaises(IntegrityError):
            DistanceSlab.objects.create(
                delivery_config=del_config,
                min_distance_km=Decimal("20.00"),
                max_distance_km=Decimal("10.00"),  # Invalid: max <= min
                rate=Decimal("200.00"),
                sort_order=2,
            )

    def test_singleton_company_store_configuration(self):
        store = CompanyStoreConfiguration.objects.get_or_create(
            id=1,
            defaults={
                "legal_company_name": "Vee Power Electricals",
                "brand_name": "Vee Power Electricals",
                "gstin": "33AABFV1234A1ZX",
                "pan": "AABFV1234A",
                "registered_address": "MTP Road Coimbatore",
                "warehouse_address": "MTP Road Coimbatore",
                "support_email": "support@veepower.in",
                "support_phone": "+919876543210",
                "bank_name": "SBI",
                "bank_account_number": "1234567890",
                "bank_ifsc": "SBIN0001234",
                "bank_branch": "Coimbatore",
                "rounding_mode": RoundingMode.ROUND_HALF_UP,
                "auto_cancel_unpaid_minutes": 30,
                "cancellation_allowed_until": "CONFIRMED",
                "return_window_days": 7,
                "require_shipping_awb": True,
                "upi_enabled": True,
                "cards_enabled": True,
                "netbanking_enabled": True,
                "cod_enabled": True,
                "cod_max_limit": Decimal("10000.00"),
            },
        )
        self.assertEqual(store[0].id, 1)
        self.assertEqual(store[0].brand_name, "Vee Power Electricals")

    def test_tax_configuration_versioning_and_dates(self):
        user = User.objects.create_user(email="tax_admin@example.com", password="Password123!", role=UserRole.ADMIN)
        tax1 = TaxConfiguration.objects.create(
            tax_name="GST 2026",
            default_tax_rate=Decimal("18.00"),
            cgst_rate=Decimal("9.00"),
            sgst_rate=Decimal("9.00"),
            igst_rate=Decimal("18.00"),
            business_state="Tamil Nadu",
            version_number=1,
            is_active=True,
            created_by=user,
        )
        self.assertEqual(tax1.version_number, 1)
        self.assertEqual(tax1.default_tax_rate, Decimal("18.00"))

    def test_order_discount_coupon_constraints(self):
        user = User.objects.create_user(email="disc_admin@example.com", password="Password123!", role=UserRole.ADMIN)
        coupon = OrderDiscount.objects.create(
            code="SAVE10",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10.00"),
            min_order_value=Decimal("1000.00"),
            max_discount_cap=Decimal("500.00"),
            created_by=user,
        )
        self.assertEqual(coupon.code, "SAVE10")

        # Duplicate coupon code must fail
        with self.assertRaises(IntegrityError):
            OrderDiscount.objects.create(
                code="SAVE10",
                discount_type=DiscountType.FIXED,
                discount_value=Decimal("100.00"),
                created_by=user,
            )


class Phase3GovernanceModelTests(TestCase):
    """Tests for AdminConfigAuditLog and ContactInquiry models."""

    def test_admin_config_audit_log_creation(self):
        admin = User.objects.create_user(email="auditor@example.com", password="Password123!", role=UserRole.ADMIN)
        log = AdminConfigAuditLog.objects.create(
            admin_user=admin,
            domain="DELIVERY_CONFIGURATION",
            record_id=1,
            action_type=AuditActionType.UPDATE,
            old_value={"rate": "100.00"},
            new_value={"rate": "120.00"},
            change_reason="Fuel surcharge annual tariff increment",
            ip_address="192.168.1.10",
        )
        self.assertEqual(log.domain, "DELIVERY_CONFIGURATION")
        self.assertEqual(log.action_type, "UPDATE")

    def test_contact_inquiry_ticket_flow(self):
        inquiry = ContactInquiry.objects.create(
            name="Murugan",
            email="murugan@example.com",
            phone="+919876543210",
            subject="Bulk Wire Order",
            message="Looking for 100 coils of 4 sq mm Finolex wire.",
            status=InquiryStatus.NEW,
        )
        self.assertEqual(inquiry.status, "New")
        inquiry.status = InquiryStatus.RESOLVED
        inquiry.save()
        inquiry.refresh_from_db()
        self.assertEqual(inquiry.status, "Resolved")

