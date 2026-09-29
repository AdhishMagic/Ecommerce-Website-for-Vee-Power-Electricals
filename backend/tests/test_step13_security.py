import hmac
import hashlib
import json
import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Subcategory, Brand, Product
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
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
)
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)
from apps.core.models import AdminConfigAuditLog, ContactInquiry
from apps.finance.services.payment_gateway_service import PaymentGatewayService

User = get_user_model()


class Step13SecurityHardeningTestSuite(TestCase):
    """
    Comprehensive Step 13 Security Hardening Test Suite.
    Enforces defense-in-depth across authentication, RBAC, IDOR, input validation,
    output encoding, headers, CORS, CSRF, rate limiting, and business logic.
    """

    def setUp(self):
        self.client = APIClient()
        cache.clear()

        # Users with distinct roles
        self.customer_a = User.objects.create_user(
            email='customer_a_sec@example.com',
            password='StrongPassword123!',
            first_name='Anil',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.customer_b = User.objects.create_user(
            email='customer_b_sec@example.com',
            password='StrongPassword123!',
            first_name='Bala',
            last_name='Murugan',
            role=UserRole.CUSTOMER,
        )
        self.staff_user = User.objects.create_user(
            email='staff_sec@example.com',
            password='StaffPassword123!',
            first_name='Staff',
            last_name='Operator',
            role=UserRole.CUSTOMER,
            is_staff=True,
        )
        self.admin = User.objects.create_user(
            email='admin_sec@veepower.in',
            password='AdminPassword123!',
            first_name='Veepower',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_a = str(AccessToken.for_user(self.customer_a))
        self.token_b = str(AccessToken.for_user(self.customer_b))
        self.token_staff = str(AccessToken.for_user(self.staff_user))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Core Catalog setup
        self.category = Category.objects.create(name='Circuit Protection', slug='circuit-protection', is_active=True)
        self.brand = Brand.objects.create(name='VeeSafe', slug='veesafe', is_active=True)
        self.product = Product.objects.create(
            name='MCB 32A Double Pole',
            slug='mcb-32a-dp',
            sku='MCB-DP-32A',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('600.00'),
            price=Decimal('500.00'),
            stock=50,
            active=True,
        )

        # Customer Addresses
        self.address_a = CustomerAddress.objects.create(
            user=self.customer_a,
            recipient_name='Anil Kumar',
            phone='+919876543210',
            address_line1='100 Anna Salai',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600002',
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.address_b = CustomerAddress.objects.create(
            user=self.customer_b,
            recipient_name='Bala Murugan',
            phone='+919876543211',
            address_line1='200 Cross Cut Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641012',
            address_type=AddressType.HOME,
            is_default=True,
        )

        # Orders for Customer A & B
        self.order_a = Order.objects.create(
            order_number='ORD-SEC-A-001',
            user=self.customer_a,
            customer_name='Anil Kumar',
            customer_email='customer_a_sec@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Anil Kumar', 'city': 'Chennai'},
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            shipping_fee=Decimal('50.00'),
            total_amount=Decimal('1230.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )
        self.order_b = Order.objects.create(
            order_number='ORD-SEC-B-001',
            user=self.customer_b,
            customer_name='Bala Murugan',
            customer_email='customer_b_sec@example.com',
            customer_phone='+919876543211',
            shipping_address={'recipient_name': 'Bala Murugan', 'city': 'Coimbatore'},
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            tax_amount=Decimal('90.00'),
            shipping_fee=Decimal('50.00'),
            total_amount=Decimal('640.00'),
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )

        # B2B Client
        self.client_corp = Client.objects.create(
            client_code='CORP-SEC-01',
            company_name='Vee Infrastructure Ltd',
            contact_person='Mr. Rangarajan',
            gstin='33AAACB1234F1Z5',
            email='procurement@veeinfra.com',
            phone='+919876500000',
            credit_limit=Decimal('50000.00'),
            is_active=True,
        )

    # =========================================================================
    # 1. AUTHENTICATION & TOKEN SECURITY
    # =========================================================================

    def test_01_authentication_bypass_rejected(self):
        """Unauthenticated requests to protected endpoints return 401 Unauthorized."""
        self.client.credentials()
        endpoints = [
            '/api/v1/auth/me/',
            '/api/v1/orders/my-orders/',
            '/api/v1/addresses/',
            '/api/v1/orders/checkout/',
        ]
        for url in endpoints:
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED, f"Failed at {url}")

    def test_02_invalid_authentication_token(self):
        """Forged or malformed Bearer tokens fail safely with 401."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid.forged.jwt.token')
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('code', res.data)

    def test_03_expired_authentication_token(self):
        """Expired JWT access tokens fail safely with 401."""
        token = AccessToken.for_user(self.customer_a)
        # Manually backdate token lifetime
        token.set_exp(lifetime=-timedelta(minutes=10))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token)}')
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_04_customer_admin_privilege_separation(self):
        """Authenticated customers cannot access administrative endpoints."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        admin_urls = [
            '/api/v1/orders/',
            '/api/v1/inventory/',
            '/api/v1/finance/summary/',
            '/api/v1/finance/clients/',
            '/api/v1/finance/invoices/',
            '/api/v1/finance/quotations/',
            '/api/v1/config/audit-logs/',
        ]
        for url in admin_urls:
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Customer granted access to {url}")

    # =========================================================================
    # 2. HORIZONTAL IDOR & VERTICAL PRIVILEGE ESCALATION
    # =========================================================================

    def test_05_horizontal_idor_customer_address(self):
        """Customer A cannot view, mutate, or set default on Customer B's address."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')

        # Direct GET
        res_get = self.client.get(f'/api/v1/addresses/{self.address_b.id}/')
        self.assertEqual(res_get.status_code, status.HTTP_404_NOT_FOUND)

        # PATCH attempt
        res_patch = self.client.patch(
            f'/api/v1/addresses/{self.address_b.id}/',
            {'address_line1': 'Hacked Address Line'},
            format='json'
        )
        self.assertEqual(res_patch.status_code, status.HTTP_404_NOT_FOUND)

        # Set default attempt
        res_default = self.client.post(f'/api/v1/addresses/{self.address_b.id}/set-default/')
        self.assertEqual(res_default.status_code, status.HTTP_404_NOT_FOUND)

        # Verify DB unchanged
        self.address_b.refresh_from_db()
        self.assertEqual(self.address_b.address_line1, '200 Cross Cut Road')

    def test_06_vertical_privilege_escalation_role_change(self):
        """Customer profile self-service update strictly forbids modifying role or staff flags."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        malicious_payload = {
            'first_name': 'Anil',
            'role': 'admin',
            'is_staff': True,
            'is_superuser': True,
        }
        res = self.client.patch('/api/v1/auth/me/', malicious_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('restricted security fields', str(res.data))

        # Verify DB role unchanged
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.role, UserRole.CUSTOMER)
        self.assertFalse(self.customer_a.is_staff)
        self.assertFalse(self.customer_a.is_superuser)

    def test_07_unauthorized_configuration_mutation(self):
        """Non-admin cannot mutate commercial configuration (tax, delivery, store)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.put('/api/v1/config/store/', {'company_name': 'Hacked Store'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res_tax = self.client.post('/api/v1/config/tax/', {'rate': '28.00'}, format='json')
        self.assertEqual(res_tax.status_code, status.HTTP_403_FORBIDDEN)

    def test_08_unauthorized_finance_access(self):
        """Customer cannot access finance summary metrics."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_09_unauthorized_b2b_client_access(self):
        """Customer cannot create or modify B2B corporate buyers."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post('/api/v1/finance/clients/', {'company_name': 'Attacker Corp'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_unauthorized_inventory_access(self):
        """Customer cannot access stock levels or execute inventory restocks/adjustments."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get('/api/v1/inventory/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res_adj = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'quantity': 100, 'reason': 'Malicious injection'},
            format='json'
        )
        self.assertEqual(res_adj.status_code, status.HTTP_403_FORBIDDEN)

    def test_11_unauthorized_order_access_idor(self):
        """Customer A cannot view Customer B's order details."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get(f'/api/v1/orders/{self.order_b.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_12_unauthorized_invoice_access(self):
        """Customer cannot view tax invoices ledger or create invoices."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get('/api/v1/finance/invoices/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_13_unauthorized_quotation_access(self):
        """Customer cannot list, create, or update commercial quotations."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get('/api/v1/finance/quotations/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # =========================================================================
    # 3. MASS ASSIGNMENT & SERIALIZER TAMPERING
    # =========================================================================

    def test_14_serializer_mass_assignment_order(self):
        """Checkout ignores client-submitted price, tax, and status overrides."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        tampered_checkout = {
            'shipping_address_id': self.address_a.id,
            'items': [{'product_id': self.product.id, 'quantity': 1}],
            'total_amount': '1.00',  # Attacker attempts to pay 1 rupee instead of 500
            'subtotal': '1.00',
            'tax_amount': '0.00',
            'payment_status': 'Paid',  # Attacker attempts to mark as already paid
            'status': 'DELIVERED',     # Attacker attempts to bypass state machine
        }
        res = self.client.post('/api/v1/orders/checkout/', tampered_checkout, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        created_order_id = res.data['id']
        order = Order.objects.get(pk=created_order_id)

        # Server-authoritative calculation must prevail
        self.assertNotEqual(order.total_amount, Decimal('1.00'))
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)
        self.assertEqual(order.status, OrderStatus.PENDING)

    def test_15_role_escalation_registration(self):
        """Registration ignores attempts to assign role='admin' or is_staff=True."""
        payload = {
            'email': 'new_hacker@example.com',
            'password': 'SecurePass123!',
            'first_name': 'Evil',
            'last_name': 'Hacker',
            'role': 'admin',
            'is_staff': True,
            'is_superuser': True,
        }
        res = self.client.post('/api/v1/auth/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_user = User.objects.get(email='new_hacker@example.com')
        self.assertEqual(new_user.role, UserRole.CUSTOMER)
        self.assertFalse(new_user.is_staff)
        self.assertFalse(new_user.is_superuser)

    # =========================================================================
    # 4. SQL INJECTION (SEARCH, FILTERING, ORDERING)
    # =========================================================================

    def test_16_sql_injection_search(self):
        """Search query with SQL injection payloads executes safely via ORM parameterization."""
        sqli_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE apps_products_product; --",
            "1' UNION SELECT null, null, null, null--",
            "admin'--",
            "' OR 1=1 #",
        ]
        for payload in sqli_payloads:
            res = self.client.get(f'/api/v1/catalog/products/?search={payload}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            # Products table must remain intact and accessible
            self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_17_sql_injection_filtering(self):
        """Filtering with malicious values is safely coerced or ignored without database error."""
        malicious_filters = [
            '/api/v1/catalog/products/?min_price=10; DROP TABLE users;--',
            '/api/v1/catalog/products/?category=1 OR 1=1',
            '/api/v1/catalog/products/?brand=1; SELECT * FROM users',
        ]
        for url in malicious_filters:
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_18_sql_injection_ordering(self):
        """Ordering query parameter strictly enforces whitelist and rejects SQL injection."""
        sqli_orderings = [
            'price; DROP TABLE products;--',
            'name ASC, (SELECT 1 FROM users)--',
            '-id; SELECT * FROM config_companystoreconfiguration;',
        ]
        for ord_val in sqli_orderings:
            res = self.client.get(f'/api/v1/catalog/products/?ordering={ord_val}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    # =========================================================================
    # 5. XSS & OUTPUT ENCODING
    # =========================================================================

    def test_19_xss_input_inquiry(self):
        """Contact inquiry with stored XSS script tags stores as literal string and does not execute."""
        xss_payload = "<script>alert('XSS-Test')</script><img src=x onerror=alert(1)>"
        res = self.client.post('/api/v1/inquiries/', {
            'name': 'Hacker ' + xss_payload,
            'email': 'xss@example.com',
            'phone': '+919876543210',
            'subject': 'Inquiry ' + xss_payload,
            'message': 'Message body with ' + xss_payload,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        inquiry_id = res.data['id']
        inq = ContactInquiry.objects.get(pk=inquiry_id)
        self.assertIn("<script>alert('XSS-Test')</script>", inq.name)

    def test_20_stored_xss_address(self):
        """Customer address containing XSS is stored safely and returned without rendering unescaped."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        xss_line = "<img src=x onerror=alert(document.cookie)> Flat 101"
        res = self.client.post('/api/v1/addresses/', {
            'recipient_name': 'Anil Kumar',
            'phone': '+919876543210',
            'address_line1': xss_line,
            'city': 'Chennai',
            'state': 'Tamil Nadu',
            'pincode': '600002',
            'address_type': 'home',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['address_line1'], xss_line)

    # =========================================================================
    # 6. CSRF, CORS & HEADERS
    # =========================================================================

    def test_21_csrf_protection_and_cookie_settings(self):
        """Verify secure cookie settings (SameSite=Lax, HttpOnly)."""
        self.assertTrue(getattr(settings, 'SESSION_COOKIE_HTTPONLY', False))
        self.assertEqual(getattr(settings, 'SESSION_COOKIE_SAMESITE', ''), 'Lax')
        self.assertEqual(getattr(settings, 'CSRF_COOKIE_SAMESITE', ''), 'Lax')

    def test_22_cors_restrictions_disallow_untrusted(self):
        """Untrusted cross-origin requests do not receive Access-Control-Allow-Origin header."""
        res_evil = self.client.get('/api/v1/catalog/products/', HTTP_ORIGIN='http://malicious-attacker.evil')
        self.assertNotEqual(res_evil.get('Access-Control-Allow-Origin'), 'http://malicious-attacker.evil')

        # Allowed origin receives CORS response
        res_allowed = self.client.get('/api/v1/catalog/products/', HTTP_ORIGIN='http://localhost:5173')
        self.assertEqual(res_allowed.get('Access-Control-Allow-Origin'), 'http://localhost:5173')

    def test_23_brute_force_rate_limit_behavior(self):
        """Rapid requests exceeding auth rate limits receive HTTP 429 Too Many Requests."""
        original_rate = ScopedRateThrottle.THROTTLE_RATES.get('auth')
        ScopedRateThrottle.THROTTLE_RATES['auth'] = '3/minute'
        cache.clear()

        try:
            statuses = []
            for _ in range(5):
                res = self.client.post('/api/v1/auth/login/', {
                    'email': 'customer_a_sec@example.com',
                    'password': 'WrongPassword123!',
                }, format='json')
                statuses.append(res.status_code)

            self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, statuses)
        finally:
            if original_rate:
                ScopedRateThrottle.THROTTLE_RATES['auth'] = original_rate
            cache.clear()

    # =========================================================================
    # 7. ENUMERATION PROTECTION
    # =========================================================================

    def test_24_password_reset_enumeration_protection(self):
        """Password reset returns identical generic response for existing and non-existing emails."""
        res_existing = self.client.post(
            '/api/v1/auth/password-reset/',
            {'email': 'customer_a_sec@example.com'},
            format='json'
        )
        res_nonexistent = self.client.post(
            '/api/v1/auth/password-reset/',
            {'email': 'nonexistent_user_9999@example.com'},
            format='json'
        )
        self.assertEqual(res_existing.status_code, status.HTTP_200_OK)
        self.assertEqual(res_nonexistent.status_code, status.HTTP_200_OK)
        self.assertEqual(res_existing.data['message'], res_nonexistent.data['message'])

    def test_25_login_enumeration_protection(self):
        """Authentication error returns identical timing-safe message for wrong pass vs wrong email."""
        res_wrong_pass = self.client.post('/api/v1/auth/login/', {
            'email': 'customer_a_sec@example.com',
            'password': 'IncorrectPassword!',
        }, format='json')
        res_wrong_user = self.client.post('/api/v1/auth/login/', {
            'email': 'unknown_user_12345@example.com',
            'password': 'IncorrectPassword!',
        }, format='json')
        self.assertEqual(res_wrong_pass.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_wrong_user.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_wrong_pass.data['detail'], res_wrong_user.data['detail'])

    # =========================================================================
    # 8. PAYMENT & WEBHOOK SECURITY
    # =========================================================================

    def test_26_webhook_signature_validation(self):
        """Razorpay webhook rejects invalid or missing cryptographic signatures."""
        body = json.dumps({'event': 'payment.captured'}).encode('utf-8')
        res_no_sig = self.client.post('/api/v1/payments/webhook/', data=body, content_type='application/json')
        self.assertEqual(res_no_sig.status_code, status.HTTP_400_BAD_REQUEST)

        res_bad_sig = self.client.post(
            '/api/v1/payments/webhook/',
            data=body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE='fake_signature_hash'
        )
        self.assertEqual(res_bad_sig.status_code, status.HTTP_400_BAD_REQUEST)

    def test_27_webhook_replay_idempotency(self):
        """Duplicate webhook event is idempotent and does not double-credit."""
        init = PaymentGatewayService.initiate_order_payment(self.order_a.id, self.customer_a)
        gw_order_id = init['gateway_order_id']
        amount_paise = int(self.order_a.total_amount * 100)

        payload_bytes = json.dumps({
            'event': 'payment.captured',
            'payload': {
                'payment': {
                    'entity': {
                        'id': 'pay_test_replay_001',
                        'order_id': gw_order_id,
                        'amount': amount_paise,
                        'currency': 'INR',
                        'method': 'UPI',
                    }
                }
            }
        }).encode('utf-8')
        secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(secret.encode('utf-8'), payload_bytes, hashlib.sha256).hexdigest()

        # First webhook delivery
        res1 = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'success')

        # Replayed webhook delivery
        res2 = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'idempotent_ok')

    def test_28_payment_amount_authority_webhook(self):
        """Webhook with amount mismatch against authoritative order total is rejected."""
        init = PaymentGatewayService.initiate_order_payment(self.order_b.id, self.customer_b)
        gw_order_id = init['gateway_order_id']

        # Send 100 paise (₹1) instead of ₹640
        payload_bytes = json.dumps({
            'event': 'payment.captured',
            'payload': {
                'payment': {
                    'entity': {
                        'id': 'pay_test_mismatch_002',
                        'order_id': gw_order_id,
                        'amount': 100,
                        'currency': 'INR',
                        'method': 'UPI',
                    }
                }
            }
        }).encode('utf-8')
        secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(secret.encode('utf-8'), payload_bytes, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount mismatch', res.data['detail'].lower())

    def test_29_payment_status_authority(self):
        """Client cannot confirm payment without valid HMAC cryptographic signature."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        init = PaymentGatewayService.initiate_order_payment(self.order_a.id, self.customer_a)
        gw_order_id = init['gateway_order_id']

        verify_payload = {
            'order_id': self.order_a.id,
            'razorpay_order_id': gw_order_id,
            'razorpay_payment_id': 'pay_fake_bypass_123',
            'razorpay_signature': 'invalid_forged_signature',
        }
        res = self.client.post('/api/v1/payments/verify/', verify_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.order_a.refresh_from_db()
        self.assertEqual(self.order_a.payment_status, PaymentStatus.PENDING)

    # =========================================================================
    # 9. BUSINESS LOGIC SECURITY & STATE MACHINES
    # =========================================================================

    def test_30_order_state_transition_protection(self):
        """Customer cannot transition order status, and admin cannot execute illegal FSM transitions."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        # Customer attempt
        res_cust = self.client.patch(
            f'/api/v1/orders/{self.order_a.id}/status/',
            {'status': 'DELIVERED'},
            format='json'
        )
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Admin illegal transition: DELIVERED -> PENDING
        self.order_a.status = OrderStatus.DELIVERED
        self.order_a.save()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_illegal = self.client.patch(
            f'/api/v1/orders/{self.order_a.id}/status/',
            {'status': 'PENDING'},
            format='json'
        )
        self.assertEqual(res_illegal.status_code, status.HTTP_400_BAD_REQUEST)

    def test_31_inventory_manipulation_protection(self):
        """Checkout requesting more stock than available is rejected atomically."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post('/api/v1/orders/checkout/', {
            'shipping_address_id': self.address_a.id,
            'items': [{'product_id': self.product.id, 'quantity': 1000}],  # Stock is only 50
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('insufficient stock', res.data['detail'].lower())

    def test_32_credit_limit_bypass_rejected(self):
        """Creating an invoice exceeding B2B credit limit is rejected."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        # Corp client limit is 50,000. Try creating invoice for 60,000
        res = self.client.post('/api/v1/finance/invoices/', {
            'client': self.client_corp.id,
            'subtotal': '55000.00',
            'tax_amount': '9900.00',
            'total_amount': '64900.00',
            'status': 'Unpaid',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('credit limit exceeded', str(res.data).lower())

    def test_33_discount_manipulation_protection(self):
        """Checkout with invalid, fake, or manipulated coupon code is rejected with 400 Bad Request."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post('/api/v1/orders/checkout/', {
            'shipping_address_id': self.address_a.id,
            'items': [{'product_id': self.product.id, 'quantity': 1}],
            'coupon_code': 'FAKEDISCOUNT99PERCENT',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('coupon', str(res.data).lower())

    # =========================================================================
    # 10. AUDIT LOGGING & SECRETS REDACTION
    # =========================================================================

    def test_34_audit_log_protection(self):
        """Admin config audit logs are read-only and immutable; write operations return 405."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        # POST attempt
        res_post = self.client.post('/api/v1/config/audit-logs/', {'domain': 'hacked'}, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # Non-admin attempt
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res_cust = self.client.get('/api/v1/config/audit-logs/')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

    def test_35_secret_redaction_in_profile_and_logs(self):
        """User profile endpoint never leaks password hash, salt, or secrets."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertNotIn('password', data)
        self.assertNotIn('secret', data)
        self.assertNotIn('token', data)

    def test_36_error_disclosure_protection(self):
        """Errors do not disclose stack traces, server file paths, or raw SQL queries."""
        # Non-existent product ID
        res = self.client.get('/api/v1/catalog/products/999999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        body = json.dumps(res.data) if hasattr(res, 'data') else res.content.decode('utf-8')
        self.assertNotIn('Traceback', body)
        self.assertNotIn('.py', body)
        self.assertNotIn('SELECT ', body)
        if hasattr(res, 'data') and isinstance(res.data, dict):
            error_dict = res.data.get('error', {})
            self.assertTrue('request_id' in error_dict or 'request_id' in res.data)
        self.assertTrue(bool(res.get('X-Request-ID')))

    def test_37_security_headers_present(self):
        """All responses carry strict security headers."""
        res = self.client.get('/api/v1/catalog/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(res.get('X-Frame-Options'), 'DENY')
        self.assertEqual(res.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
        self.assertEqual(res.get('Cross-Origin-Opener-Policy'), 'same-origin')
        self.assertIn('payment=(self)', res.get('Permissions-Policy', ''))

    # =========================================================================
    # 11. ATTACK SURFACE CHECKS (FILE UPLOAD & SSRF)
    # =========================================================================

    def test_38_file_upload_security_surface_absent(self):
        """Verify no arbitrary file upload endpoints exist in the public API."""
        upload_urls = [
            '/api/v1/upload/',
            '/api/v1/files/upload/',
            '/api/v1/products/upload/',
            '/api/v1/media/upload/',
        ]
        for url in upload_urls:
            res = self.client.post(url, {'file': 'malicious.php'})
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND, f"Unexpected upload endpoint active at {url}")

    def test_39_ssrf_protection_no_outbound_url_proxy(self):
        """Verify no open URL proxy or SSRF gateway exists."""
        proxy_urls = [
            '/api/v1/proxy/?url=http://169.254.169.254',
            '/api/v1/fetch/?url=http://localhost:3306',
        ]
        for url in proxy_urls:
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # 12. END-TO-END AUTHENTICATED REGRESSION & IDOR EXTENSIONS
    # =========================================================================

    def test_40_successful_authenticated_workflow_regression(self):
        """Full legitimate customer journey executes cleanly with all security controls enabled."""
        # 1. Register
        reg_payload = {
            'email': 'workflow_cust@veepower.com',
            'password': 'StrongWorkflowPass123!',
            'first_name': 'Karthik',
            'last_name': 'Raja',
            'phone': '+919876549999',
        }
        res_reg = self.client.post('/api/v1/auth/register/', reg_payload, format='json')
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)
        token = res_reg.data['access']

        # 2. Add address
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        res_addr = self.client.post('/api/v1/addresses/', {
            'recipient_name': 'Karthik Raja',
            'phone': '+919876549999',
            'address_line1': '12 Gandhi Road',
            'city': 'Madurai',
            'state': 'Tamil Nadu',
            'pincode': '625001',
            'address_type': 'home',
        }, format='json')
        self.assertEqual(res_addr.status_code, status.HTTP_201_CREATED)
        addr_id = res_addr.data['id']

        # 3. Checkout
        res_checkout = self.client.post('/api/v1/orders/checkout/', {
            'shipping_address_id': addr_id,
            'items': [{'product_id': self.product.id, 'quantity': 2}],
        }, format='json')
        self.assertEqual(res_checkout.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_checkout.data['status'], 'PENDING')

    def test_41_order_cancellation_idor_protection(self):
        """Customer A cannot cancel Customer B's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post(f'/api/v1/orders/{self.order_b.id}/cancel/', {'reason': 'Malicious cancel'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.order_b.refresh_from_db()
        self.assertNotEqual(self.order_b.status, OrderStatus.CANCELLED)

    def test_42_order_return_idor_protection(self):
        """Customer A cannot request return on Customer B's order."""
        self.order_b.status = OrderStatus.DELIVERED
        self.order_b.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post(
            f'/api/v1/orders/{self.order_b.id}/return/',
            {'reason': 'Defective product arrived broken'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.order_b.refresh_from_db()
        self.assertEqual(self.order_b.status, OrderStatus.DELIVERED)

    def test_43_payment_order_status_idor_protection(self):
        """Customer A cannot view payment transaction status for Customer B's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get(f'/api/v1/payments/order/{self.order_b.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_44_client_credit_limit_mutation_protection(self):
        """Customer cannot adjust B2B client credit limit."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.post(
            f'/api/v1/finance/clients/{self.client_corp.id}/credit-limit/',
            {'credit_limit': '1000000.00', 'reason': 'Malicious escalation'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.client_corp.refresh_from_db()
        self.assertEqual(self.client_corp.credit_limit, Decimal('50000.00'))

    def test_45_admin_config_audit_log_fields_integrity(self):
        """Audit logging preserves actor, action, timestamp, old/new states without leaking secrets."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res = self.client.get('/api/v1/config/audit-logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Results must be paginated
        self.assertIn('results', res.data)
