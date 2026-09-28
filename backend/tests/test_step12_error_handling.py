import json
import logging
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase, RequestFactory
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import (
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError as DRFValidationError,
)
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    OrderDiscount,
    TaxConfiguration,
)
from apps.commercial_config.services import DiscountService, TaxService, DeliveryService
from apps.common.exceptions import (
    BusinessLogicError,
    ConfigurationConflictError,
    CouponExpiredError,
    DeliveryUnavailableError,
    DuplicatePaymentError,
    InsufficientCreditError,
    InsufficientStockError,
    InvalidCouponError,
    InvalidOrderTransitionError,
    InvoiceAlreadyPaidError,
    PaymentAlreadyProcessedError,
    PaymentAmountMismatchError,
    PaymentProcessingError,
    ResourceConflictError,
    ResourceNotFoundError,
    ReturnNotAllowedError,
    ServiceUnavailableError,
    custom_exception_handler,
    derive_machine_code,
    sanitize_error_string,
)
from apps.common.middleware import (
    RequestIdFilter,
    RequestIdMiddleware,
    get_current_request_id,
    set_current_request_id,
    clear_current_request_id,
)
from apps.finance.models import Client, Quotation, QuotationItem
from apps.finance.services.quotation_service import QuotationService
from apps.inventory.services.inventory_service import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.products.models import Brand, Category, Product, Subcategory

User = get_user_model()


class Step12ErrorHandlingTestCase(TestCase):
    """
    Step 12 Comprehensive Error Handling Test Suite.
    Validates canonical error contract, HTTP status codes, security/sanitization,
    request correlation, business exceptions, and backward compatibility.
    """

    @classmethod
    def setUpTestData(cls):
        # 1. Base Users
        cls.admin = User.objects.create_superuser(
            email='admin_err@veepower.in',
            password='StrongAdminPassword123!',
            first_name='Admin',
            last_name='User',
        )
        cls.customer = User.objects.create_user(
            email='customer_err@veepower.in',
            password='StrongCustomerPassword123!',
            first_name='Customer',
            last_name='User',
        )

        # 2. Base Catalog
        cls.category = Category.objects.create(name='Error Testing Cat', slug='error-cat')
        cls.subcategory = Subcategory.objects.create(
            category=cls.category,
            name='Error Testing Subcat',
            slug='error-subcat',
        )
        cls.brand = Brand.objects.create(name='Error Brand', slug='error-brand')
        cls.product = Product.objects.create(
            name='Test Switchgear Item',
            slug='test-switchgear-item',
            sku='ERR-SW-001',
            category=cls.category,
            subcategory=cls.subcategory,
            brand=cls.brand,
            price=Decimal('500.00'),
            mrp=Decimal('600.00'),
            stock=10,
            active=True,
        )

        # 3. Base Store Config
        cls.company_config, _ = CompanyStoreConfiguration.objects.get_or_create(
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

    def setUp(self):
        self.client = APIClient()
        self.factory = RequestFactory()
        clear_current_request_id()

    # --------------------------------------------------------------------------
    # 1. Malformed Request & Bad Request (400)
    # --------------------------------------------------------------------------
    def test_01_malformed_request_400(self):
        """Malformed request payload returns HTTP 400 with canonical error contract."""
        res = self.client.post(
            '/api/v1/auth/login/',
            data="not-a-valid-json",
            content_type="application/json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        self.assertIn('error', res.data)
        self.assertIn(res.data['error']['code'], ['VALIDATION_ERROR', 'BAD_REQUEST', 'PARSE_ERROR'])
        self.assertIn('request_id', res.data['error'])
        self.assertTrue(res['X-Request-ID'])

    # --------------------------------------------------------------------------
    # 2. Field Validation Error (400)
    # --------------------------------------------------------------------------
    def test_02_field_validation_error_400(self):
        """Field validation failure returns structured details and backward compatible keys."""
        res = self.client.post('/api/v1/auth/register/', {
            'email': 'invalid-email-format',
            'password': '123',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'VALIDATION_ERROR')
        self.assertIn('email', res.data['error']['details'])
        # Backward compatibility with existing frontend/tests
        self.assertIn('email', res.data)
        self.assertIn('detail', res.data)

    # --------------------------------------------------------------------------
    # 3. Missing Authentication (401)
    # --------------------------------------------------------------------------
    def test_03_missing_authentication_401(self):
        """Accessing protected endpoint without credentials returns 401 NOT_AUTHENTICATED."""
        res = self.client.get('/api/v1/orders/my-orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'NOT_AUTHENTICATED')
        self.assertIn('request_id', res.data['error'])
        self.assertIn('detail', res.data)

    # --------------------------------------------------------------------------
    # 4. Invalid Authentication Token (401)
    # --------------------------------------------------------------------------
    def test_04_invalid_authentication_401(self):
        """Accessing with forged or corrupted token returns 401 AUTHENTICATION_FAILED."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer completely.bogus.jwt.token')
        res = self.client.get('/api/v1/orders/my-orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'AUTHENTICATION_FAILED')

    # --------------------------------------------------------------------------
    # 5. Insufficient Permission / RBAC (403)
    # --------------------------------------------------------------------------
    def test_05_insufficient_permission_403(self):
        """Authenticated customer accessing admin routes returns 403 PERMISSION_DENIED."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/orders/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'PERMISSION_DENIED')

    # --------------------------------------------------------------------------
    # 6. Missing Resource (404)
    # --------------------------------------------------------------------------
    def test_06_missing_resource_404(self):
        """Non-existent resource returns 404 RESOURCE_NOT_FOUND with safe message."""
        res = self.client.get('/api/v1/catalog/products/999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'RESOURCE_NOT_FOUND')
        self.assertIn('detail', res.data)

    # --------------------------------------------------------------------------
    # 7. Duplicate Resource Conflict (409)
    # --------------------------------------------------------------------------
    def test_07_duplicate_resource_conflict_409(self):
        """IntegrityError is intercepted and mapped to 409 RESOURCE_CONFLICT without raw SQL."""
        request = self.factory.get('/test/')
        request.id = 'req_test_conflict_01'
        exc = IntegrityError("Duplicate entry 'test_slug' for key 'products_product.slug'")
        response = custom_exception_handler(exc, {'request': request})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['error']['code'], 'RESOURCE_CONFLICT')
        self.assertNotIn("Duplicate entry", response.data['error']['message'])
        self.assertNotIn("products_product", response.data['error']['message'])

    # --------------------------------------------------------------------------
    # 8. Invalid Order State Transition (400/409)
    # --------------------------------------------------------------------------
    def test_08_invalid_state_transition(self):
        """Attempting invalid order FSM transition returns INVALID_ORDER_TRANSITION."""
        order = Order.objects.create(
            order_number='ORD-ERR-001',
            user=self.customer,
            customer_name='Err Customer',
            customer_email=self.customer.email,
            customer_phone='9876543210',
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            total_amount=Decimal('500.00'),
            status=OrderStatus.DELIVERED,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/orders/{order.id}/status/', {
            'status': OrderStatus.PENDING,
            'reason': 'Illegal rollback',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['error']['code'], 'INVALID_ORDER_TRANSITION')

    # --------------------------------------------------------------------------
    # 9. Business Exception Hierarchy
    # --------------------------------------------------------------------------
    def test_09_business_exception_hierarchy(self):
        """Verify business exception subclasses inherit correctly and have stable codes."""
        exceptions_to_check = [
            (BusinessLogicError(), 400, 'BUSINESS_LOGIC_ERROR'),
            (InvalidOrderTransitionError(), 409, 'INVALID_ORDER_TRANSITION'),
            (InsufficientStockError(), 400, 'INSUFFICIENT_STOCK'),
            (InsufficientCreditError(), 400, 'INSUFFICIENT_CREDIT'),
            (PaymentProcessingError(), 400, 'PAYMENT_PROCESSING_ERROR'),
            (PaymentAlreadyProcessedError(), 409, 'PAYMENT_ALREADY_PROCESSED'),
            (PaymentAmountMismatchError(), 400, 'PAYMENT_AMOUNT_MISMATCH'),
            (DuplicatePaymentError(), 409, 'DUPLICATE_PAYMENT'),
            (InvalidCouponError(), 400, 'INVALID_COUPON'),
            (CouponExpiredError(), 400, 'COUPON_EXPIRED'),
            (DeliveryUnavailableError(), 400, 'DELIVERY_UNAVAILABLE'),
            (ReturnNotAllowedError(), 400, 'RETURN_NOT_ALLOWED'),
            (InvoiceAlreadyPaidError(), 409, 'INVOICE_ALREADY_PAID'),
            (ResourceConflictError(), 409, 'RESOURCE_CONFLICT'),
            (ConfigurationConflictError(), 409, 'CONFIGURATION_CONFLICT'),
            (ResourceNotFoundError(), 404, 'RESOURCE_NOT_FOUND'),
            (ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE'),
        ]
        for exc, expected_status, expected_code in exceptions_to_check:
            self.assertEqual(exc.status_code, expected_status)
            self.assertEqual(exc.default_code, expected_code)

    # --------------------------------------------------------------------------
    # 10. Database IntegrityError Mapping without Raw SQL Leakage
    # --------------------------------------------------------------------------
    def test_10_database_integrity_error_no_leakage(self):
        """Verifies raw database constraint errors do not leak table names or SQL queries."""
        request = self.factory.post('/test/')
        request.id = 'req_leak_check'
        exc = IntegrityError("INSERT INTO orders (id) VALUES (1) FAILS FOREIGN KEY CONSTRAINT tbl_fk")
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertNotIn("INSERT INTO", resp.data['error']['message'])
        self.assertNotIn("tbl_fk", resp.data['error']['message'])
        self.assertEqual(resp.data['error']['code'], 'RESOURCE_CONFLICT')

    # --------------------------------------------------------------------------
    # 11. Transaction Rollback on Failure
    # --------------------------------------------------------------------------
    def test_11_transaction_rollback_on_failure(self):
        """Failed operations within atomic blocks rollback and leave zero partial records."""
        initial_order_count = Order.objects.count()

        try:
            with transaction.atomic():
                Order.objects.create(
                    order_number='ORD-ROLLBACK-001',
                    user=self.customer,
                    customer_name='Rollback Cust',
                    customer_email=self.customer.email,
                    customer_phone='9876543210',
                    subtotal=Decimal('100.00'),
                    taxable_amount=Decimal('100.00'),
                    total_amount=Decimal('100.00'),
                )
                # Intentionally trigger an error
                raise DRFValidationError({'test': 'Forced transaction abort'})
        except DRFValidationError:
            pass

        self.assertEqual(Order.objects.count(), initial_order_count)

    # --------------------------------------------------------------------------
    # 12. Concurrency Failure Behavior
    # --------------------------------------------------------------------------
    def test_12_concurrency_failure_behavior(self):
        """Simultaneous conflicting stock deductions fail gracefully without server crash."""
        product = Product.objects.create(
            name='Concurrency Stock Switch',
            slug='concurrency-stock-switch',
            sku='CONC-SW-001',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            price=Decimal('100.00'),
            mrp=Decimal('120.00'),
            stock=1,
            active=True,
        )
        # First deduction of 1 succeeds
        res1 = InventoryService.sale_deduct_stock(product=product, quantity=1, notes='First order')
        self.assertIsNotNone(res1)
        product.refresh_from_db()
        self.assertEqual(product.stock, 0)

        # Second deduction of 1 raises ValidationError (INSUFFICIENT_STOCK)
        with self.assertRaises((DRFValidationError, DjangoValidationError)) as ctx:
            InventoryService.sale_deduct_stock(product=product, quantity=1, notes='Second order')
        self.assertIn('insufficient', str(ctx.exception).lower())

    # --------------------------------------------------------------------------
    # 13. Payment Failure Mapping
    # --------------------------------------------------------------------------
    def test_13_payment_failure_mapping(self):
        """Payment failures yield safe PAYMENT_PROCESSING_ERROR code."""
        request = self.factory.post('/api/v1/payments/verify/')
        request.id = 'req_pay_fail'
        exc = PaymentProcessingError('Gateway connection timed out.')
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error']['code'], 'PAYMENT_PROCESSING_ERROR')
        self.assertEqual(resp.data['error']['message'], 'Gateway connection timed out.')

    # --------------------------------------------------------------------------
    # 14. Payment Amount Mismatch Mapping
    # --------------------------------------------------------------------------
    def test_14_payment_amount_mismatch_mapping(self):
        """Payment amount mismatch yields PAYMENT_AMOUNT_MISMATCH code."""
        request = self.factory.post('/api/v1/payments/verify/')
        request.id = 'req_mismatch'
        exc = PaymentAmountMismatchError('Captured amount 100.00 does not match order total 200.00.')
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error']['code'], 'PAYMENT_AMOUNT_MISMATCH')

    # --------------------------------------------------------------------------
    # 15. Inventory Adjustment Failure
    # --------------------------------------------------------------------------
    def test_15_inventory_adjustment_failure(self):
        """Adjusting inventory with invalid parameters yields structured validation error."""
        with self.assertRaises((DRFValidationError, DjangoValidationError)):
            InventoryService.adjust_stock(
                product_id=self.product.id,
                change_amount=0,  # Zero adjustment is prohibited
                notes='Invalid zero adjustment',
            )

    # --------------------------------------------------------------------------
    # 16. Insufficient Stock Error Mapping
    # --------------------------------------------------------------------------
    def test_16_insufficient_stock_error_mapping(self):
        """Insufficient stock error maps to code INSUFFICIENT_STOCK in custom_exception_handler."""
        request = self.factory.post('/api/v1/orders/checkout/')
        request.id = 'req_stock_01'
        exc = DRFValidationError("Insufficient stock for 'Test Item'. Available: 0, requested: 2.")
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error']['code'], 'INSUFFICIENT_STOCK')

    # --------------------------------------------------------------------------
    # 17. B2B Credit Limit Failure Mapping
    # --------------------------------------------------------------------------
    def test_17_b2b_credit_limit_failure(self):
        """Credit limit breach maps to INSUFFICIENT_CREDIT."""
        request = self.factory.post('/api/v1/finance/orders/credit/')
        request.id = 'req_credit_01'
        exc = DRFValidationError("Insufficient credit limit available. Required: 50000, Available: 10000.")
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error']['code'], 'INSUFFICIENT_CREDIT')

    # --------------------------------------------------------------------------
    # 18. Invalid Configuration Mapping
    # --------------------------------------------------------------------------
    def test_18_invalid_configuration_mapping(self):
        """Duplicate active company store configuration is rejected safely."""
        dup = CompanyStoreConfiguration(
            legal_company_name='Second Vee Power Ltd',
            brand_name='Second Vee Power',
            gstin='33AABFV1234A1ZX',
            pan='AABFV1234A',
            registered_address='No 28/1, MTP Road, Coimbatore - 641031',
            warehouse_address='No 28/1, MTP Road, Coimbatore - 641031',
            support_email='second@veepower.in',
            support_phone='+91 98765 43210',
        )
        with self.assertRaises((DRFValidationError, DjangoValidationError)):
            dup.clean()

    # --------------------------------------------------------------------------
    # 19. Expired Discount Coupon Mapping
    # --------------------------------------------------------------------------
    def test_19_expired_discount_coupon_mapping(self):
        """Expired discount coupon evaluation yields COUPON_EXPIRED error code."""
        coupon = OrderDiscount.objects.create(
            code='EXPIREDTEST',
            discount_type='percentage',
            discount_value=Decimal('10.00'),
            valid_from=timezone.now() - timezone.timedelta(days=10),
            valid_until=timezone.now() - timezone.timedelta(days=2),
            is_active=True,
            created_by=self.admin,
        )
        res = DiscountService.evaluate_order_discount('EXPIREDTEST', Decimal('1000.00'))
        self.assertFalse(res.is_valid)
        self.assertIn('expired', res.error_message.lower())

        request = self.factory.post('/api/v1/config/coupons/validate/')
        request.id = 'req_coupon_exp'
        exc = DRFValidationError("The coupon code has expired.")
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.data['error']['code'], 'COUPON_EXPIRED')

    # --------------------------------------------------------------------------
    # 20. Invalid Delivery Condition
    # --------------------------------------------------------------------------
    def test_20_invalid_delivery_condition(self):
        """DeliveryUnavailableError maps to code DELIVERY_UNAVAILABLE with safe message."""
        request = self.factory.post('/api/v1/orders/checkout/')
        request.id = 'req_delivery_unavail'
        exc = DeliveryUnavailableError("Delivery is not available for the specified destination.")
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error']['code'], 'DELIVERY_UNAVAILABLE')

    # --------------------------------------------------------------------------
    # 21. Unexpected Exception (500) Without Stack Trace Disclosure
    # --------------------------------------------------------------------------
    def test_21_unexpected_exception_500_safe(self):
        """Unhandled exceptions return 500 INTERNAL_SERVER_ERROR without exposing internal traces."""
        request = self.factory.get('/test-crash/')
        request.id = 'req_crash_123'
        exc = RuntimeError("Database query failed at /var/www/veepower/backend/internal.py line 42")
        resp = custom_exception_handler(exc, {'request': request})

        self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(resp.data['success'])
        self.assertEqual(resp.data['error']['code'], 'INTERNAL_SERVER_ERROR')
        self.assertEqual(resp.data['error']['message'], 'An unexpected error occurred. Please try again later.')
        self.assertNotIn('/var/www', str(resp.data))
        self.assertNotIn('internal.py', str(resp.data))
        self.assertEqual(resp.data['error']['request_id'], 'req_crash_123')

    # --------------------------------------------------------------------------
    # 22. Request ID Generation
    # --------------------------------------------------------------------------
    def test_22_request_id_generation(self):
        """When no X-Request-ID is supplied, middleware generates a unique ID."""
        req = self.factory.get('/api/v1/catalog/products/')
        middleware = RequestIdMiddleware(lambda r: Response({'ok': True}))
        middleware.process_request(req)
        self.assertTrue(hasattr(req, 'id'))
        self.assertTrue(req.id.startswith('req_'))

    # --------------------------------------------------------------------------
    # 23. Request ID Response Header Propagation
    # --------------------------------------------------------------------------
    def test_23_request_id_response_header(self):
        """Incoming safe X-Request-ID is echoed back in the response header and error payload."""
        custom_id = 'client-trace-id-abc12345'
        res = self.client.get('/api/v1/orders/my-orders/', HTTP_X_REQUEST_ID=custom_id)
        self.assertEqual(res['X-Request-ID'], custom_id)
        self.assertEqual(res.data['error']['request_id'], custom_id)

    # --------------------------------------------------------------------------
    # 24. Request ID Unsafe Sanitization
    # --------------------------------------------------------------------------
    def test_24_request_id_unsafe_sanitization(self):
        """Unsafe incoming request IDs containing invalid characters are discarded."""
        unsafe_id = 'bad id with spaces; DROP TABLE users;'
        res = self.client.get('/api/v1/orders/my-orders/', HTTP_X_REQUEST_ID=unsafe_id)
        self.assertNotEqual(res['X-Request-ID'], unsafe_id)
        self.assertTrue(res['X-Request-ID'].startswith('req_'))

    # --------------------------------------------------------------------------
    # 25. Secret Redaction in Error Messages
    # --------------------------------------------------------------------------
    def test_25_secret_redaction_in_errors(self):
        """Sanitization engine scrubs raw database statements or paths."""
        raw_msg = "SELECT * FROM secret_table WHERE password='my_secret_password'"
        sanitized = sanitize_error_string(raw_msg)
        self.assertEqual(sanitized, 'A database operation could not be completed.')

    # --------------------------------------------------------------------------
    # 26. RequestIdFilter for Structured Logging
    # --------------------------------------------------------------------------
    def test_26_request_id_logging_filter(self):
        """RequestIdFilter correctly assigns the current request ID to logging records."""
        set_current_request_id('req_log_filter_test')
        log_filter = RequestIdFilter()
        record = logging.LogRecord(
            name='test_logger',
            level=logging.INFO,
            pathname='test.py',
            lineno=1,
            msg='Test log',
            args=(),
            exc_info=None,
        )
        self.assertTrue(log_filter.filter(record))
        self.assertEqual(record.request_id, 'req_log_filter_test')
        clear_current_request_id()

    # --------------------------------------------------------------------------
    # 27. 429 Too Many Requests Handling
    # --------------------------------------------------------------------------
    def test_27_throttled_429_handling(self):
        """DRF Throttled exception maps to 429 TOO_MANY_REQUESTS."""
        request = self.factory.get('/throttled/')
        request.id = 'req_throttle_01'
        exc = Throttled(wait=60)
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resp.data['error']['code'], 'TOO_MANY_REQUESTS')

    # --------------------------------------------------------------------------
    # 28. 503 Service Unavailable Handling
    # --------------------------------------------------------------------------
    def test_28_service_unavailable_503(self):
        """ServiceUnavailableError maps to 503 SERVICE_UNAVAILABLE."""
        request = self.factory.get('/service/')
        request.id = 'req_service_01'
        exc = ServiceUnavailableError()
        resp = custom_exception_handler(exc, {'request': request})
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(resp.data['error']['code'], 'SERVICE_UNAVAILABLE')

    # --------------------------------------------------------------------------
    # 29. Backward Compatibility Fields
    # --------------------------------------------------------------------------
    def test_29_backward_compatibility_fields(self):
        """Error responses preserve both new canonical error envelope and legacy detail/errors."""
        res = self.client.post('/api/v1/auth/login/', {'email': '', 'password': ''})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # New canonical structure
        self.assertIn('success', res.data)
        self.assertFalse(res.data['success'])
        self.assertIn('error', res.data)
        self.assertIn('code', res.data['error'])
        self.assertIn('message', res.data['error'])
        self.assertIn('details', res.data['error'])
        self.assertIn('request_id', res.data['error'])

        # Legacy structure preserved for client and test compatibility
        self.assertIn('detail', res.data)
        self.assertIn('errors', res.data)
        self.assertIn('email', res.data)
        self.assertIn('password', res.data)

    # --------------------------------------------------------------------------
    # 30. Successful Workflow Regression
    # --------------------------------------------------------------------------
    def test_30_successful_workflow_regression(self):
        """Successful API requests (200/201) return normal payloads without alteration."""
        res = self.client.get('/api/v1/catalog/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Normal catalog payload is unaltered
        self.assertIn('results', res.data)
        self.assertNotIn('error', res.data)
        self.assertTrue(res['X-Request-ID'])
