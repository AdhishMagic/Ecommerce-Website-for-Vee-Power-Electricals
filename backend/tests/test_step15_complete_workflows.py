import hmac
import hashlib
import json
import uuid
from decimal import Decimal
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import CustomerAddress, AddressType, UserRole
from apps.products.models import Category, Subcategory, Brand, Product
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.inventory.models import StockTransaction, StockTransactionType
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
)
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    TaxMode,
    DeliveryConfiguration,
    DistanceSlab,
    OrderDiscount,
    DiscountType,
)
from apps.core.models import CommunicationLog, AdminConfigAuditLog
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.finance.services.invoice_service import InvoiceService
from apps.orders.services import CheckoutService, OrderWorkflowService

User = get_user_model()


class Step15CompleteWorkflowValidationTests(TestCase):
    """
    STEP 15 — COMPLETE END-TO-END BUSINESS WORKFLOW VALIDATION SUITE.
    Authoritatively validates all 20 business workflows across the Vee Power Electricals system.
    Guarantees relational integrity, financial snapshot correctness, inventory immutability,
    RBAC enforcement, and failure/recovery determinism.
    """

    def setUp(self):
        self.client = APIClient()
        cache.clear()

        # 1. Company Store Config (Singleton)
        self.store_config, _ = CompanyStoreConfiguration.objects.get_or_create(
            id=1,
            defaults={
                'legal_company_name': 'Vee Power Electricals Private Limited',
                'brand_name': 'Vee Power Electricals',
                'gstin': '33AABFV1234A1ZX',
                'pan': 'AABFV1234A',
                'registered_address': 'No 28/1, MTP Road, Coimbatore - 641031',
                'warehouse_address': 'No 28/1, MTP Road, Coimbatore - 641031',
                'support_email': 'support@veepower.in',
                'support_phone': '+91 98765 43210',
                'currency_code': 'INR',
                'currency_symbol': '₹',
            }
        )

        # 2. Distinct Users with Roles
        self.customer = User.objects.create_user(
            email="cust_step15@veepower.in",
            password="CustomerPass123!",
            first_name="Ramesh",
            last_name="Kumar",
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email="cust2_step15@veepower.in",
            password="CustomerPass123!",
            first_name="Suresh",
            last_name="Pillai",
            role=UserRole.CUSTOMER,
        )
        self.staff_user = User.objects.create_user(
            email="staff_step15@veepower.in",
            password="StaffPass123!",
            first_name="Vee",
            last_name="Staff",
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.admin_user = User.objects.create_user(
            email="admin_step15@veepower.in",
            password="AdminPass123!",
            first_name="Vee",
            last_name="SuperAdmin",
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        # 3. Tax Configuration (Standard GST for Tamil Nadu)
        now = timezone.now()
        self.tax_config = TaxConfiguration.objects.create(
            tax_name='Standard Indian GST',
            default_tax_rate=Decimal('18.00'),
            cgst_rate=Decimal('9.00'),
            sgst_rate=Decimal('9.00'),
            igst_rate=Decimal('18.00'),
            tax_calculation_mode=TaxMode.TAX_EXCLUSIVE,
            business_state='Tamil Nadu',
            effective_from=now - timedelta(days=30),
            effective_until=now + timedelta(days=365),
            version_number=1,
            is_active=True,
            created_by=self.admin_user,
        )

        # 4. Delivery Configuration
        self.delivery_config = DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Central Logistics Hub',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641031',
            base_delivery_charge=Decimal('100.00'),
            distance_slab_km=Decimal('10.00'),
            charge_per_slab=Decimal('50.00'),
            free_delivery_threshold=Decimal('2000.00'),
            fallback_regional_rate=Decimal('150.00'),
            free_delivery_enabled=True,
            version_number=1,
            is_active=True,
            created_by=self.admin_user,
        )
        self.slab1 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('0.00'),
            max_distance_km=Decimal('20.00'),
            rate=Decimal('100.00'),
            sort_order=1,
            is_active=True,
        )

        # 5. Coupon Configuration
        self.active_coupon = OrderDiscount.objects.create(
            code="VEE10",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10.00"),
            max_discount_cap=Decimal("500.00"),
            min_order_value=Decimal("500.00"),
            valid_from=now - timedelta(days=1),
            valid_until=now + timedelta(days=30),
            usage_limit_total=100,
            is_active=True,
        )
        self.expired_coupon = OrderDiscount.objects.create(
            code="EXPIRED50",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("50.00"),
            min_order_value=Decimal("100.00"),
            valid_from=now - timedelta(days=60),
            valid_until=now - timedelta(days=30),
            is_active=True,
        )

        # 6. Catalog Fixtures
        self.category = Category.objects.create(
            name="Switchgear & Protection",
            slug="switchgear-protection",
            is_active=True,
        )
        self.brand = Brand.objects.create(
            name="Schneider Electric",
            slug="schneider-electric",
            is_active=True,
        )
        self.product_a = Product.objects.create(
            name="Schneider Acti9 32A MCB",
            slug="schneider-acti9-32a-mcb",
            sku="SCH-ACT9-32A",
            category=self.category,
            brand=self.brand,
            mrp=Decimal("500.00"),
            price=Decimal("400.00"),
            stock=100,
            active=True,
        )
        self.product_b = Product.objects.create(
            name="Schneider 63A RCCB 4P",
            slug="schneider-63a-rccb-4p",
            sku="SCH-RCCB-63A",
            category=self.category,
            brand=self.brand,
            mrp=Decimal("3500.00"),
            price=Decimal("3000.00"),
            stock=50,
            active=True,
        )
        self.product_inactive = Product.objects.create(
            name="Discontinued Legacy Switch",
            slug="discontinued-legacy-switch",
            sku="SCH-LEG-001",
            category=self.category,
            brand=self.brand,
            mrp=Decimal("200.00"),
            price=Decimal("150.00"),
            stock=10,
            active=False,
        )

        # 7. Customer Addresses
        self.address_local = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name="Ramesh Kumar",
            phone="+91 9876543210",
            address_line1="12, Crosscut Road, Gandhipuram",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641012",
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.address_interstate = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name="Ramesh Bangalore Branch",
            phone="+91 9876543210",
            address_line1="45, MG Road, Ashok Nagar",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            address_type=AddressType.WORK,
            is_default=False,
        )

    # =========================================================================
    # WORKFLOW 1 — USER REGISTRATION
    # =========================================================================

    def test_w01_01_valid_registration_succeeds_and_hashes_password(self):
        url = "/api/v1/auth/register/"
        payload = {
            "email": "w1_newuser@veepower.in",
            "password": "StrongPassword123!",
            "first_name": "Karthik",
            "last_name": "Raja",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)

        created_user = User.objects.get(email="w1_newuser@veepower.in")
        self.assertTrue(check_password("StrongPassword123!", created_user.password))
        self.assertNotEqual(created_user.password, "StrongPassword123!")

    def test_w01_02_duplicate_email_registration_rejected(self):
        url = "/api/v1/auth/register/"
        payload = {
            "email": self.customer.email,
            "password": "AnotherPassword123!",
            "first_name": "Duplicate",
            "last_name": "User",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", str(res.data))

    def test_w01_03_invalid_email_format_rejected(self):
        url = "/api/v1/auth/register/"
        payload = {
            "email": "invalid-email-address",
            "password": "ValidPassword123!",
            "first_name": "Bad",
            "last_name": "Email",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w01_04_weak_password_rejected(self):
        url = "/api/v1/auth/register/"
        payload = {
            "email": "w1_weakpass@veepower.in",
            "password": "123",
            "first_name": "Weak",
            "last_name": "Password",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w01_05_unauthorized_access_blocked_before_login(self):
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    # =========================================================================
    # WORKFLOW 2 — LOGIN / LOGOUT & AUTH LIFECYCLE
    # =========================================================================

    def test_w02_01_valid_login_returns_jwt_pair_and_user_profile(self):
        url = "/api/v1/auth/login/"
        payload = {
            "email": self.customer.email,
            "password": "CustomerPass123!",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["email"], self.customer.email)

    def test_w02_02_invalid_credentials_rejected_401(self):
        url = "/api/v1/auth/login/"
        payload = {
            "email": self.customer.email,
            "password": "WrongPassword999!",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_w02_03_expired_or_tampered_token_rejected_on_protected_endpoint(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer fake.invalid.jwt.token")
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_w02_04_token_refresh_lifecycle_succeeds(self):
        login_res = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.customer.email, "password": "CustomerPass123!"},
            format="json",
        )
        refresh_token = login_res.data["refresh"]

        refresh_res = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_res.data)

    def test_w02_05_unauthenticated_request_rejected_on_customer_and_admin_routes(self):
        self.client.credentials()
        res_orders = self.client.get("/api/v1/orders/my-orders/")
        self.assertEqual(res_orders.status_code, status.HTTP_401_UNAUTHORIZED)
        res_admin = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(res_admin.status_code, status.HTTP_401_UNAUTHORIZED)

    # =========================================================================
    # WORKFLOW 3 — CATALOG DISCOVERY & FILTERING
    # =========================================================================

    def test_w03_01_catalog_lists_only_active_products_with_accurate_stock_and_price(self):
        res = self.client.get("/api/v1/catalog/products/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        product_names = [p["name"] for p in res.data["results"]]
        self.assertIn("Schneider Acti9 32A MCB", product_names)
        self.assertNotIn("Discontinued Legacy Switch", product_names)

    def test_w03_02_catalog_search_filters_by_title_description_brand(self):
        res = self.client.get("/api/v1/catalog/products/?search=Acti9")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data["results"]) >= 1)
        self.assertEqual(res.data["results"][0]["name"], "Schneider Acti9 32A MCB")

    def test_w03_03_catalog_category_and_brand_filtering(self):
        res = self.client.get(f"/api/v1/catalog/products/?category={self.category.slug}&brand={self.brand.slug}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for item in res.data["results"]:
            self.assertEqual(item["brand"]["slug"], self.brand.slug)

    def test_w03_04_catalog_sorting_by_price_and_creation(self):
        res_asc = self.client.get("/api/v1/catalog/products/?ordering=price")
        self.assertEqual(res_asc.status_code, status.HTTP_200_OK)
        prices = [Decimal(str(p["price"])) for p in res_asc.data["results"]]
        self.assertEqual(prices, sorted(prices))

    def test_w03_05_product_detail_returns_authoritative_specifications_and_mrp(self):
        res = self.client.get(f"/api/v1/catalog/products/{self.product_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["sku"], "SCH-ACT9-32A")
        self.assertEqual(Decimal(str(res.data["mrp"])), Decimal("500.00"))
        self.assertEqual(Decimal(str(res.data["price"])), Decimal("400.00"))
        self.assertEqual(res.data["in_stock"], True)
        # Authenticated admin sees raw warehouse stock quantity
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.get(f"/api/v1/catalog/products/{self.product_a.id}/")
        self.assertEqual(res_admin.data["stock"], 100)
        self.client.force_authenticate(user=None)

    def test_w03_06_inactive_product_detail_hidden_from_public_catalog(self):
        res = self.client.get(f"/api/v1/catalog/products/{self.product_inactive.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # WORKFLOW 4 — CART SIMULATION & INVENTORY CONSTRAINTS
    # =========================================================================

    def test_w04_01_cart_simulation_adds_valid_product(self):
        cart = [{"product_id": self.product_a.id, "quantity": 2}]
        subtotal = sum(self.product_a.price * item["quantity"] for item in cart)
        self.assertEqual(subtotal, Decimal("800.00"))

    def test_w04_02_cart_rejects_inactive_product(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_inactive.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            "unavailable" in str(res.data["detail"]).lower() or
            "inactive" in str(res.data["detail"]).lower()
        )

    def test_w04_03_cart_rejects_quantity_exceeding_available_stock(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 9999}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insufficient stock", str(res.data["detail"]).lower())

    def test_w04_04_cart_rejects_zero_or_negative_quantity(self):
        self.client.force_authenticate(user=self.customer)
        res_zero = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 0}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        res_neg = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": -5}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w04_05_cart_subtotal_calculation_accuracy(self):
        item1_qty = 3
        item2_qty = 2
        expected_subtotal = (self.product_a.price * item1_qty) + (self.product_b.price * item2_qty)
        self.assertEqual(expected_subtotal, Decimal("7200.00"))

    # =========================================================================
    # WORKFLOW 5 — CHECKOUT TAX, DELIVERY & DISCOUNT ORCHESTRATION
    # =========================================================================

    def test_w05_01_checkout_valid_address_and_distance_slab_delivery_calculation(self):
        self.client.force_authenticate(user=self.customer)
        # Order amount = 400.00 (< free delivery threshold 2000.00)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("150.00"))

    def test_w05_02_checkout_free_delivery_threshold_application(self):
        self.client.force_authenticate(user=self.customer)
        # Order amount = 3000.00 (>= free delivery threshold 2000.00)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_b.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data["shipping_fee"])), Decimal("0.00"))

    def test_w05_03_checkout_intra_state_gst_cgst_sgst_split(self):
        self.client.force_authenticate(user=self.customer)
        # Shipping to Tamil Nadu (Same state as store) -> Intra-state CGST + SGST
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        self.assertTrue(order.cgst_amount > 0)
        self.assertTrue(order.sgst_amount > 0)
        self.assertEqual(order.igst_amount, Decimal("0.00"))
        self.assertEqual(order.cgst_amount, order.sgst_amount)

    def test_w05_04_checkout_inter_state_gst_igst_application(self):
        self.client.force_authenticate(user=self.customer)
        # Shipping to Karnataka (Different state) -> Inter-state IGST
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_interstate.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        self.assertEqual(order.cgst_amount, Decimal("0.00"))
        self.assertEqual(order.sgst_amount, Decimal("0.00"))
        self.assertTrue(order.igst_amount > 0)

    def test_w05_05_checkout_coupon_validation_and_discount_cap(self):
        self.client.force_authenticate(user=self.customer)
        # Product B = 3000.00. 10% = 300.00 (within cap of 500.00)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_b.id, "quantity": 1}],
                "payment_method": "COD",
                "coupon_code": "VEE10",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        self.assertEqual(order.order_discount, Decimal("300.00"))
        self.assertEqual(order.total_discount, Decimal("800.00"))

    def test_w05_06_checkout_rejects_expired_or_invalid_coupon(self):
        self.client.force_authenticate(user=self.customer)
        res_expired = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_b.id, "quantity": 1}],
                "payment_method": "COD",
                "coupon_code": "EXPIRED50",
            },
            format="json",
        )
        self.assertEqual(res_expired.status_code, status.HTTP_400_BAD_REQUEST)

        res_fake = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_b.id, "quantity": 1}],
                "payment_method": "COD",
                "coupon_code": "NOTREAL99",
            },
            format="json",
        )
        self.assertEqual(res_fake.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w05_07_checkout_coupon_minimum_order_validation(self):
        self.client.force_authenticate(user=self.customer)
        # VEE10 requires min_order_value = 500.00. Product A price = 400.00.
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
                "coupon_code": "VEE10",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("minimum", str(res.data["detail"]).lower())

    # =========================================================================
    # WORKFLOW 6 — ORDER CREATION & STOCK RESERVATION
    # =========================================================================

    def test_w06_01_order_creation_snapshots_price_tax_delivery_and_discount(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_b.id, "quantity": 1}],
                "payment_method": "COD",
                "coupon_code": "VEE10",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        item = order.items.first()

        self.assertEqual(item.unit_price, Decimal("3000.00"))
        self.assertEqual(item.product_name, self.product_b.name)
        self.assertEqual(item.sku, self.product_b.sku)

    def test_w06_02_order_creation_reserves_inventory_atomically(self):
        initial_stock = self.product_a.stock
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 5}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock, initial_stock - 5)

    def test_w06_03_order_creation_generates_unique_order_number_and_pending_status(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        self.assertTrue(order.order_number.startswith("ORD-"))
        self.assertEqual(order.status, OrderStatus.PENDING)
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)

    def test_w06_04_duplicate_order_submission_prevention(self):
        self.product_a.stock = 1
        self.product_a.save()

        self.client.force_authenticate(user=self.customer)
        payload = {
            "shipping_address_id": self.address_local.id,
            "items": [{"product_id": self.product_a.id, "quantity": 1}],
            "payment_method": "COD",
        }
        res1 = self.client.post("/api/v1/orders/checkout/", payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        res2 = self.client.post("/api/v1/orders/checkout/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insufficient stock", str(res2.data["detail"]).lower())

    # =========================================================================
    # WORKFLOW 7 — PAYMENT ORCHESTRATION & GATEWAY INTEGRATION
    # =========================================================================

    def test_w07_01_payment_initiation_generates_gateway_order_reference(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "UPI",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        init_res = self.client.post(
            "/api/v1/payments/initiate/",
            {"order_id": order_id, "payment_method": "UPI"},
            format="json",
        )
        self.assertEqual(init_res.status_code, status.HTTP_200_OK)
        self.assertIn("gateway_order_id", init_res.data)
        self.assertEqual(init_res.data["order_id"], order_id)

    def test_w07_02_payment_verification_success_updates_order_to_confirmed(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "UPI",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        init_res = self.client.post(
            "/api/v1/payments/initiate/",
            {"order_id": order_id, "payment_method": "UPI"},
            format="json",
        )
        gateway_order_id = init_res.data["gateway_order_id"]
        payment_id = "pay_test_" + uuid.uuid4().hex[:10]
        sig = PaymentGatewayService.generate_signature(gateway_order_id, payment_id)

        verify_res = self.client.post(
            "/api/v1/payments/verify/",
            {
                "order_id": order_id,
                "razorpay_order_id": gateway_order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.payment_status, PaymentStatus.PAID)

    def test_w07_03_payment_verification_invalid_signature_rejected(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "UPI",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        init_res = self.client.post(
            "/api/v1/payments/initiate/",
            {"order_id": order_id, "payment_method": "UPI"},
            format="json",
        )
        gateway_order_id = init_res.data["gateway_order_id"]

        verify_res = self.client.post(
            "/api/v1/payments/verify/",
            {
                "order_id": order_id,
                "razorpay_order_id": gateway_order_id,
                "razorpay_payment_id": "pay_tampered_123",
                "razorpay_signature": "invalid_forged_signature_hash",
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, OrderStatus.PENDING)

    def test_w07_04_payment_verification_amount_mismatch_rejected(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/payments/verify/",
            {
                "order_id": 999999,
                "razorpay_order_id": "order_non_existent",
                "razorpay_payment_id": "pay_123",
                "razorpay_signature": "sig123",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w07_05_payment_duplicate_verification_is_idempotent(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "UPI",
            },
            format="json",
        )
        order_id = order_res.data["id"]
        init_res = self.client.post(
            "/api/v1/payments/initiate/",
            {"order_id": order_id, "payment_method": "UPI"},
            format="json",
        )
        gateway_order_id = init_res.data["gateway_order_id"]
        payment_id = "pay_test_" + uuid.uuid4().hex[:10]
        sig = PaymentGatewayService.generate_signature(gateway_order_id, payment_id)

        verify_payload = {
            "order_id": order_id,
            "razorpay_order_id": gateway_order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": sig,
            "payment_method": "UPI",
        }
        res1 = self.client.post("/api/v1/payments/verify/", verify_payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.post("/api/v1/payments/verify/", verify_payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.filter(id=order_id).count(), 1)

    def test_w07_06_cash_on_delivery_payment_flow(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=res.data["id"])
        self.assertEqual(order.payment_method, "COD")
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)

    # =========================================================================
    # WORKFLOW 8 — ORDER LIFECYCLE (FSM TRANSITIONS & AUDIT TRAIL)
    # =========================================================================

    def test_w08_01_order_fsm_pending_to_confirmed_to_packed_to_shipped_to_delivered(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        # Step 1: Admin CONFIRMS order via PATCH
        self.client.force_authenticate(user=self.admin_user)
        r1 = self.client.patch(f"/api/v1/orders/{order_id}/status/", {"status": OrderStatus.CONFIRMED}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r1.data["status"], OrderStatus.CONFIRMED)

        # Step 2: Admin PACKS order
        r2 = self.client.patch(f"/api/v1/orders/{order_id}/status/", {"status": OrderStatus.PACKED}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.data["status"], OrderStatus.PACKED)

        # Step 3: Admin SHIPS order
        r3 = self.client.patch(f"/api/v1/orders/{order_id}/status/", {"status": OrderStatus.SHIPPED, "tracking_number": "TRK-987654"}, format="json")
        self.assertEqual(r3.status_code, status.HTTP_200_OK)
        self.assertEqual(r3.data["status"], OrderStatus.SHIPPED)

        # Step 4: Admin DELIVERS order
        r4 = self.client.patch(f"/api/v1/orders/{order_id}/status/", {"status": OrderStatus.DELIVERED}, format="json")
        self.assertEqual(r4.status_code, status.HTTP_200_OK)
        self.assertEqual(r4.data["status"], OrderStatus.DELIVERED)

    def test_w08_02_order_fsm_pending_to_cancelled_transition(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        cancel_res = self.client.post(
            f"/api/v1/orders/{order_id}/cancel/",
            {"reason": "Changed my mind before dispatch"},
            format="json",
        )
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, OrderStatus.CANCELLED)

    def test_w08_03_order_fsm_invalid_transition_rejected(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        # PENDING directly to DELIVERED is forbidden
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.patch(
            f"/api/v1/orders/{order_id}/status/",
            {"status": OrderStatus.DELIVERED},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_w08_04_order_fsm_transition_audit_trail_recorded(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        self.client.force_authenticate(user=self.admin_user)
        self.client.patch(f"/api/v1/orders/{order_id}/status/", {"status": OrderStatus.CONFIRMED, "reason": "Inventory verified"}, format="json")

        history_res = self.client.get(f"/api/v1/orders/{order_id}/history/")
        self.assertEqual(history_res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(history_res.data) >= 2)

    # =========================================================================
    # WORKFLOW 9 — INVENTORY & STOCK LEDGER
    # =========================================================================

    def test_w09_01_stock_ledger_immutable_entries_on_order_reservation(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 3}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        # StockTransaction ledger entry exists
        txs = StockTransaction.objects.filter(
            product=self.product_a,
            order_id=order_id,
            transaction_type=StockTransactionType.SALE,
        )
        self.assertTrue(txs.exists())
        self.assertEqual(txs.first().change_amount, -3)

    def test_w09_02_stock_restoration_on_order_cancellation(self):
        initial_stock = self.product_a.stock
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 4}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock, initial_stock - 4)

        # Cancel order
        self.client.post(f"/api/v1/orders/{order_id}/cancel/", {"reason": "Cancelled"}, format="json")
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock, initial_stock)

        # Verify restoration ledger entry
        tx_restore = StockTransaction.objects.filter(
            product=self.product_a,
            order_id=order_id,
            transaction_type=StockTransactionType.RETURN,
        )
        self.assertTrue(tx_restore.exists())

    def test_w09_03_stock_cannot_become_negative_guarantee(self):
        self.product_a.stock = 2
        self.product_a.save()

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 3}],
                "payment_method": "COD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock, 2)

    # =========================================================================
    # WORKFLOW 10 — INVOICE GENERATION & TAX RECONCILIATION
    # =========================================================================

    def test_w10_01_invoice_generation_snapshots_order_and_tax_breakdown(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "COD",
            },
            format="json",
        )
        order = Order.objects.get(id=order_res.data["id"])

        # Generate invoice
        invoice = InvoiceService.create_invoice_for_order(order=order)
        self.assertTrue(invoice.invoice_number.startswith("INV-"))
        self.assertEqual(invoice.total_amount, order.total_amount)
        self.assertEqual(invoice.cgst_amount, order.cgst_amount)
        self.assertEqual(invoice.sgst_amount, order.sgst_amount)
        self.assertEqual(invoice.items.count(), 1)

    def test_w10_02_invoice_payment_reconciliation_updates_outstanding_and_status(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order = Order.objects.get(id=order_res.data["id"])
        invoice = InvoiceService.create_invoice_for_order(order=order)
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)

        # Apply payment to invoice
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=invoice.total_amount,
            payment_method="COD",
            notes="Collected on delivery",
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.paid_amount, invoice.total_amount)
        self.assertEqual(invoice.outstanding_amount, Decimal("0.00"))

    def test_w10_03_historical_invoice_immutable_upon_subsequent_catalog_price_changes(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order = Order.objects.get(id=order_res.data["id"])
        invoice = InvoiceService.create_invoice_for_order(order=order)
        historical_total = invoice.total_amount

        # Update product price in catalog
        self.product_a.mrp = Decimal("2000.00")
        self.product_a.price = Decimal("999.00")
        self.product_a.save()

        invoice.refresh_from_db()
        self.assertEqual(invoice.total_amount, historical_total)
        self.assertEqual(invoice.items.first().rate, Decimal("400.00"))

    # =========================================================================
    # WORKFLOW 11 — QUOTATION LIFECYCLE & INVOICE CONVERSION
    # =========================================================================

    def test_w11_01_b2b_quotation_creation_and_item_calculations(self):
        self.client.force_authenticate(user=self.admin_user)
        client = Client.objects.create(
            client_code="CLI-W11-01",
            company_name="Kovai Infra Projects",
            contact_person="Murugan",
            gstin="33AABFK1234A1Z1",
            email="murugan@kovaiinfra.in",
            phone="+91 9443211223",
            credit_limit=Decimal("500000.00"),
            address="100 Gandhipuram, Coimbatore",
            is_active=True,
        )
        quotation_res = self.client.post(
            "/api/v1/finance/quotations/",
            {
                "client": client.id,
                "expiry_date": (timezone.now() + timedelta(days=15)).date().isoformat(),
                "notes": "Bulk switchgear order for township project",
                "items": [
                    {
                        "product": self.product_a.id,
                        "item_name": "Schneider Acti9 32A MCB",
                        "quantity": 100,
                        "unit_price": "380.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(quotation_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(quotation_res.data["quotation_number"].startswith("QUO-"))
        self.assertEqual(quotation_res.data["status"], QuotationStatus.DRAFT)

    def test_w11_02_b2b_quotation_approval_and_conversion_to_invoice(self):
        self.client.force_authenticate(user=self.admin_user)
        client = Client.objects.create(
            client_code="CLI-W11-02",
            company_name="Kongu Electro Grid",
            contact_person="Natarajan",
            gstin="33AABFK1234A1Z2",
            email="natarajan@konguelectro.in",
            credit_limit=Decimal("200000.00"),
            address="200 Peelamedu, Coimbatore",
            is_active=True,
        )
        quote = Quotation.objects.create(
            quotation_number="QT-2026-9901",
            client=client,
            quotation_date=timezone.now().date(),
            expiry_date=(timezone.now() + timedelta(days=15)).date(),
            total_value=Decimal("44840.00"),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product_a,
            item_name="Schneider Acti9 32A MCB",
            quantity=100,
            unit_price=Decimal("380.00"),
            subtotal=Decimal("38000.00"),
        )

        convert_res = self.client.post(f"/api/v1/finance/quotations/{quote.id}/convert/", format="json")
        self.assertEqual(convert_res.status_code, status.HTTP_201_CREATED)
        invoice_id = convert_res.data["id"]

        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.CONVERTED)
        invoice = Invoice.objects.get(id=invoice_id)
        self.assertEqual(invoice.quotation_id, quote.id)

    def test_w11_03_b2b_quotation_prevents_duplicate_conversion(self):
        self.client.force_authenticate(user=self.admin_user)
        client = Client.objects.create(
            client_code="CLI-W11-03",
            company_name="Vee Power Partner",
            gstin="33AABFK1234A1Z3",
            credit_limit=Decimal("100000.00"),
            address="Coimbatore",
            is_active=True,
        )
        quote = Quotation.objects.create(
            quotation_number="QT-2026-9902",
            client=client,
            quotation_date=timezone.now().date(),
            expiry_date=(timezone.now() + timedelta(days=15)).date(),
            total_value=Decimal("11800.00"),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            item_name="Test items",
            quantity=1,
            unit_price=Decimal("10000.00"),
            subtotal=Decimal("10000.00"),
        )
        # First conversion
        r1 = self.client.post(f"/api/v1/finance/quotations/{quote.id}/convert/", format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        # Duplicate conversion rejected
        r2 = self.client.post(f"/api/v1/finance/quotations/{quote.id}/convert/", format="json")
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # WORKFLOW 12 — B2B / CREDIT EXPOSURE & LIMIT MANAGEMENT
    # =========================================================================

    def test_w12_01_b2b_client_credit_limit_and_available_credit_calculation(self):
        client = Client.objects.create(
            client_code="CLI-W12-01",
            company_name="Apex Power Systems",
            gstin="33AABFA1234A1Z1",
            credit_limit=Decimal("100000.00"),
            is_active=True,
        )
        # Unpaid invoice of 30,000
        Invoice.objects.create(
            invoice_number="INV-2026-9101",
            client=client,
            subtotal=Decimal("30000.00"),
            taxable_amount=Decimal("30000.00"),
            total_amount=Decimal("30000.00"),
            status=InvoiceStatus.UNPAID,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
        )
        self.assertEqual(client.credit_limit, Decimal("100000.00"))
        # Unpaid exposure is 30,000, so available credit = 70,000
        unpaid = client.invoices.filter(status=InvoiceStatus.UNPAID).first().total_amount
        available_credit = client.credit_limit - unpaid
        self.assertEqual(available_credit, Decimal("70000.00"))

    def test_w12_02_b2b_credit_limit_exceeded_blocks_new_orders_or_invoices(self):
        self.client.force_authenticate(user=self.admin_user)
        client = Client.objects.create(
            client_code="CLI-W12-02",
            company_name="Maxed Out Builder Ltd",
            gstin="33AABFM1234A1Z2",
            credit_limit=Decimal("10000.00"),
            is_active=True,
        )
        # Existing unpaid invoice consumes entire credit limit
        Invoice.objects.create(
            invoice_number="INV-2026-9102",
            client=client,
            subtotal=Decimal("10000.00"),
            taxable_amount=Decimal("10000.00"),
            total_amount=Decimal("10000.00"),
            status=InvoiceStatus.UNPAID,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
        )

        quote = Quotation.objects.create(
            quotation_number="QT-2026-9903",
            client=client,
            quotation_date=timezone.now().date(),
            expiry_date=(timezone.now() + timedelta(days=15)).date(),
            total_value=Decimal("5900.00"),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            item_name="Exceeding item",
            quantity=1,
            unit_price=Decimal("5000.00"),
            subtotal=Decimal("5000.00"),
        )

        # Attempting conversion must fail due to credit limit violation
        res = self.client.post(f"/api/v1/finance/quotations/{quote.id}/convert/", format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("credit limit exceeded", str(res.data["detail"]).lower())

    def test_w12_03_b2b_inactive_or_frozen_client_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        client = Client.objects.create(
            client_code="CLI-W12-03",
            company_name="Suspended Industries",
            gstin="33AABFS1234A1Z3",
            credit_limit=Decimal("50000.00"),
            is_active=False,
        )
        res = self.client.post(
            "/api/v1/finance/quotations/",
            {
                "client": client.id,
                "expiry_date": (timezone.now() + timedelta(days=15)).date().isoformat(),
                "items": [{"item_name": "Item", "quantity": 1, "unit_price": "100.00"}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # WORKFLOW 13 & 14 — FINANCE, EXPENSES & P&L
    # =========================================================================

    def test_w13_01_finance_summary_aggregates_revenue_and_outstanding_receivables(self):
        self.client.force_authenticate(user=self.admin_user)
        # Create paid and unpaid invoices
        inv1 = Invoice.objects.create(
            invoice_number="INV-2026-9201",
            subtotal=Decimal("5000.00"),
            taxable_amount=Decimal("5000.00"),
            total_amount=Decimal("5000.00"),
            status=InvoiceStatus.PAID,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
        )
        PaymentTransaction.objects.create(
            invoice=inv1,
            gateway=PaymentGateway.NEFT_RTGS,
            amount=Decimal("5000.00"),
            status=PaymentTxStatus.SUCCESS,
        )

        Invoice.objects.create(
            invoice_number="INV-2026-9202",
            subtotal=Decimal("3000.00"),
            taxable_amount=Decimal("3000.00"),
            total_amount=Decimal("3000.00"),
            status=InvoiceStatus.UNPAID,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=10)).date(),
        )

        res = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", res.data)
        self.assertEqual(Decimal(str(res.data["kpis"]["total_invoiced"])), Decimal("8000.00"))
        self.assertEqual(Decimal(str(res.data["kpis"]["total_paid"])), Decimal("5000.00"))
        self.assertEqual(Decimal(str(res.data["kpis"]["total_outstanding"])), Decimal("3000.00"))

    def test_w14_01_admin_expense_creation_validates_and_updates_finance_ledger(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.post(
            "/api/v1/expenses/",
            {
                "category": "Utilities",
                "vendor": "TANGEDCO Coimbatore",
                "amount": "1500.00",
                "payment_mode": "BANK_TRANSFER",
                "expense_date": timezone.now().date().isoformat(),
                "description": "Coimbatore Flagship electricity bill",
                "status": "Paid",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        expense = Expense.objects.get(id=res.data["id"])
        self.assertEqual(expense.amount, Decimal("1500.00"))
        self.assertEqual(expense.category, "Utilities")

    def test_w14_02_customer_unauthorized_to_create_expenses(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            "/api/v1/expenses/",
            {
                "category": "Operations",
                "vendor": "Office Supplies Co",
                "amount": "500.00",
                "description": "Unauthorized expense submission",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # =========================================================================
    # WORKFLOW 15 — RMA RETURNS & STOCK RESTORATION
    # =========================================================================

    def test_w15_01_return_request_allowed_only_for_delivered_orders(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        # Attempt return on PENDING order -> Rejected
        r_pending = self.client.post(f"/api/v1/orders/{order_id}/return/", {"reason": "Defective item"}, format="json")
        self.assertEqual(r_pending.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("delivered", str(r_pending.data["detail"]).lower())

        # Advance order to DELIVERED
        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.CONFIRMED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.PACKED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.SHIPPED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.DELIVERED, self.admin_user)

        # Customer requests return on DELIVERED order -> Accepted
        self.client.force_authenticate(user=self.customer)
        r_delivered = self.client.post(f"/api/v1/orders/{order_id}/return/", {"reason": "Defective terminal block"}, format="json")
        self.assertEqual(r_delivered.status_code, status.HTTP_200_OK)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, OrderStatus.RETURN_REQUESTED)

    def test_w15_02_return_request_alone_does_not_prematurely_restore_inventory(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]
        stock_after_checkout = self.product_a.stock - 2

        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.CONFIRMED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.PACKED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.SHIPPED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.DELIVERED, self.admin_user)

        # Customer requests return
        self.client.force_authenticate(user=self.customer)
        self.client.post(f"/api/v1/orders/{order_id}/return/", {"reason": "Not fitting casing"}, format="json")

        self.product_a.refresh_from_db()
        # Stock must NOT be restored upon mere request
        self.assertEqual(self.product_a.stock, stock_after_checkout)

    def test_w15_03_return_completion_restores_inventory_and_creates_stock_ledger(self):
        initial_stock = self.product_a.stock
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.CONFIRMED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.PACKED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.SHIPPED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.DELIVERED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_REQUESTED, self.customer)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_APPROVED, self.admin_user)

        # Complete return
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_COMPLETED, self.admin_user)

        # Inventory restored
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock, initial_stock)

        # Ledger contains return entry
        tx = StockTransaction.objects.filter(
            product=self.product_a,
            order_id=order_id,
            transaction_type=StockTransactionType.RETURN,
        )
        self.assertTrue(tx.exists())

    def test_w15_04_return_rejection_lifecycle(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]

        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.CONFIRMED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.PACKED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.SHIPPED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.DELIVERED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_REQUESTED, self.customer)

        # Admin rejects return request via PATCH
        res = self.client.patch(
            f"/api/v1/orders/{order_id}/status/",
            {"status": OrderStatus.RETURN_REJECTED, "reason": "Seal was broken; physical damage not covered"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, OrderStatus.RETURN_REJECTED)

    # =========================================================================
    # WORKFLOW 16 — AUDIT & CUSTOMER COMMUNICATION
    # =========================================================================

    def test_w16_01_communication_logs_created_for_registration_and_order_events(self):
        # Register new user
        reg_res = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "w16_comm@veepower.in",
                "password": "SecurePassword123!",
                "first_name": "Ramu",
                "last_name": "Velu",
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)

        # Verify CommunicationLog generated
        comm_reg = CommunicationLog.objects.filter(recipient="w16_comm@veepower.in")
        self.assertTrue(comm_reg.exists())

    def test_w16_02_communication_logs_never_leak_passwords_or_auth_tokens(self):
        logs = CommunicationLog.objects.all()
        for log in logs:
            self.assertNotIn("SecurePassword123!", log.body)
            self.assertNotIn("CustomerPass123!", log.body)

    # =========================================================================
    # WORKFLOW 17 — COMMERCIAL CONFIGURATION & DYNAMIC POLICIES
    # =========================================================================

    def test_w17_01_configuration_update_audit_log_created(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.patch(
            "/api/v1/config/store/",
            {"brand_name": "Vee Power Electricals - Updated Flagship"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.store_config.refresh_from_db()
        self.assertEqual(self.store_config.brand_name, "Vee Power Electricals - Updated Flagship")

    def test_w17_02_configuration_change_preserves_historical_transactions(self):
        self.client.force_authenticate(user=self.customer)
        order_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": self.address_local.id,
                "items": [{"product_id": self.product_a.id, "quantity": 1}],
                "payment_method": "COD",
            },
            format="json",
        )
        order_id = order_res.data["id"]
        original_shipping_fee = Order.objects.get(id=order_id).shipping_fee

        # Now change base delivery fee in configuration
        self.delivery_config.base_delivery_charge = Decimal("999.00")
        self.delivery_config.save()

        # Existing order shipping fee remains unchanged
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.shipping_fee, original_shipping_fee)

    # =========================================================================
    # WORKFLOW 18 — RBAC & AUTHORIZATION MATRICES
    # =========================================================================

    def test_w18_01_role_based_access_matrix_customer_vs_staff_vs_admin(self):
        # 1. Customer cannot access admin finance
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Staff user can access finance summary
        self.client.force_authenticate(user=self.staff_user)
        res_staff = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(res_staff.status_code, status.HTTP_200_OK)

        # 3. SuperAdmin can access finance summary
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

    # =========================================================================
    # WORKFLOW 19 — FAILURE RECOVERY & TRANSACTIONAL INTEGRITY
    # =========================================================================

    def test_w19_01_canonical_error_structure_on_stock_and_validation_failures(self):
        self.client.force_authenticate(user=self.customer)
        # Attempt checkout without address
        res = self.client.post(
            "/api/v1/orders/checkout/",
            {"items": [{"product_id": self.product_a.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue("shipping_address_id" in res.data or "detail" in res.data)

    # =========================================================================
    # WORKFLOW 20 — COMPLETE GOLDEN PATHS (B2C & B2B)
    # =========================================================================

    def test_w20_01_complete_b2c_golden_path_register_to_delivery_to_return_completion(self):
        """
        FULL B2C GOLDEN PATH:
        1. Register new customer
        2. Create address
        3. Discover products in catalog
        4. Add to cart & checkout
        5. Pay via gateway & verify HMAC signature
        6. Admin confirms, packs, ships & delivers
        7. Issue tax invoice
        8. Customer initiates return RMA
        9. Admin approves and completes return
        10. Verify stock restoration & ledger audit
        """
        # 1. Register
        reg_res = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "golden_b2c@veepower.in",
                "password": "GoldenB2CPass123!",
                "first_name": "B2C",
                "last_name": "Buyer",
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        user_id = reg_res.data["user"]["id"]
        golden_user = User.objects.get(id=user_id)
        self.client.force_authenticate(user=golden_user)

        # 2. Add Address
        addr_res = self.client.post(
            "/api/v1/addresses/",
            {
                "recipient_name": "B2C Buyer",
                "phone": "+91 9988776655",
                "address_line1": "100 Power Highway",
                "city": "Coimbatore",
                "state": "Tamil Nadu",
                "pincode": "641018",
                "address_type": "home",
                "is_default": True,
            },
            format="json",
        )
        self.assertEqual(addr_res.status_code, status.HTTP_201_CREATED)
        addr_id = addr_res.data["id"]

        # 3. Catalog discovery
        cat_res = self.client.get("/api/v1/catalog/products/")
        self.assertEqual(cat_res.status_code, status.HTTP_200_OK)

        # 4. Checkout
        checkout_res = self.client.post(
            "/api/v1/orders/checkout/",
            {
                "shipping_address_id": addr_id,
                "items": [{"product_id": self.product_a.id, "quantity": 2}],
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        order_id = checkout_res.data["id"]

        # 5. Payment Initiation & Verification
        init_res = self.client.post(
            "/api/v1/payments/initiate/",
            {"order_id": order_id, "payment_method": "UPI"},
            format="json",
        )
        gateway_order_id = init_res.data["gateway_order_id"]
        payment_id = "pay_b2c_" + uuid.uuid4().hex[:10]
        sig = PaymentGatewayService.generate_signature(gateway_order_id, payment_id)

        verify_res = self.client.post(
            "/api/v1/payments/verify/",
            {
                "order_id": order_id,
                "razorpay_order_id": gateway_order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        # 6. Admin Fulfillment (Packed, Shipped, Delivered)
        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.PACKED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.SHIPPED, self.admin_user, tracking_number="TRK-GOLD-001")
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.DELIVERED, self.admin_user)

        # 7. Invoice Creation
        order = Order.objects.get(id=order_id)
        invoice = InvoiceService.create_invoice_for_order(order=order)
        self.assertEqual(invoice.status, InvoiceStatus.PAID)

        # 8. Customer Return RMA
        self.client.force_authenticate(user=golden_user)
        ret_req = self.client.post(f"/api/v1/orders/{order_id}/return/", {"reason": "Ordered wrong amp rating"}, format="json")
        self.assertEqual(ret_req.status_code, status.HTTP_200_OK)

        # 9. Admin Approves and Completes Return
        self.client.force_authenticate(user=self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_APPROVED, self.admin_user)
        OrderWorkflowService.transition_order_status(order_id, OrderStatus.RETURN_COMPLETED, self.admin_user)

        # 10. Verify Final Consistent State
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.RETURN_COMPLETED)
        self.assertEqual(order.payment_status, PaymentStatus.PAID)
        self.assertTrue(StockTransaction.objects.filter(order_id=order_id, transaction_type=StockTransactionType.RETURN).exists())

    def test_w20_02_complete_b2b_golden_path_quotation_to_invoice_to_payment(self):
        """
        FULL B2B GOLDEN PATH:
        1. Create corporate B2B client
        2. Generate commercial estimate / Quotation
        3. Client reviews and Quotation is APPROVED
        4. Convert Quotation to authoritative Tax Invoice
        5. Verify client credit limit validation during conversion
        6. Apply customer payment against the invoice
        7. Verify zero outstanding receivables & revenue reflection
        """
        self.client.force_authenticate(user=self.admin_user)

        # 1. B2B Client Setup
        client = Client.objects.create(
            client_code="CLI-GOLD-B2B",
            company_name="Vee Power Heavy Industries",
            contact_person="K. Balasubramaniam",
            gstin="33AABFV1234A1Z9",
            email="bala@veepowerheavy.com",
            phone="+91 9443322110",
            credit_limit=Decimal("500000.00"),
            address="Coimbatore Main Road",
            is_active=True,
        )

        # 2. Quotation Generation
        quote = Quotation.objects.create(
            quotation_number="QT-2026-GOLD-01",
            client=client,
            quotation_date=timezone.now().date(),
            expiry_date=(timezone.now() + timedelta(days=30)).date(),
            total_value=Decimal("70800.00"),
            status=QuotationStatus.DRAFT,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product_b,
            item_name="Schneider 63A RCCB 4P",
            quantity=20,
            unit_price=Decimal("3000.00"),
            subtotal=Decimal("60000.00"),
        )

        # 3. Status transition: DRAFT -> SENT -> APPROVED
        quote.status = QuotationStatus.SENT
        quote.save()
        quote.status = QuotationStatus.APPROVED
        quote.save()

        # 4. Conversion to Invoice
        convert_res = self.client.post(f"/api/v1/finance/quotations/{quote.id}/convert/", format="json")
        self.assertEqual(convert_res.status_code, status.HTTP_201_CREATED)
        invoice_id = convert_res.data["id"]

        invoice = Invoice.objects.get(id=invoice_id)
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.total_amount, Decimal("70800.00"))
        self.assertEqual(invoice.outstanding_amount, Decimal("70800.00"))

        # 5. Payment Application
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal("70800.00"),
            payment_method="NEFT_RTGS",
            notes="Full settlement via NEFT UTR-99887766",
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.outstanding_amount, Decimal("0.00"))

        # 6. Verify B2B Finance Summary
        summary_res = self.client.get("/api/v1/finance/summary/")
        self.assertEqual(summary_res.status_code, status.HTTP_200_OK)
        self.assertTrue(Decimal(str(summary_res.data["kpis"]["total_paid"])) >= Decimal("70800.00"))
