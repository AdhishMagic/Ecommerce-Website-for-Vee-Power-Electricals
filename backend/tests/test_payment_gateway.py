import json
import hmac
import hashlib
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService

User = get_user_model()


class PaymentGatewayTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer1 = User.objects.create_user(
            email='customer1@example.com',
            first_name='Anand',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='customer2@example.com',
            first_name='Priya',
            last_name='Nair',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin@veepower.in',
            first_name='Vee',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_c1 = str(AccessToken.for_user(self.customer1))
        self.token_c2 = str(AccessToken.for_user(self.customer2))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Sample Orders
        self.order1 = Order.objects.create(
            order_number='ORD-PG-001',
            user=self.customer1,
            customer_name='Anand Kumar',
            customer_email='customer1@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Anand Kumar', 'city': 'Chennai'},
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            shipping_fee=Decimal('50.00'),
            total_amount=Decimal('1230.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )

        self.order2 = Order.objects.create(
            order_number='ORD-PG-002',
            user=self.customer2,
            customer_name='Priya Nair',
            customer_email='customer2@example.com',
            customer_phone='+919876543211',
            shipping_address={'recipient_name': 'Priya Nair', 'city': 'Bangalore'},
            subtotal=Decimal('2000.00'),
            taxable_amount=Decimal('2000.00'),
            tax_amount=Decimal('360.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('2360.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='CARD',
        )

    # -------------------------------------------------------------------------
    # 1. Authentication & Permissions
    # -------------------------------------------------------------------------
    def test_unauthenticated_initiate_rejected(self):
        """Anonymous access to payment initiation must return 401."""
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_verify_rejected(self):
        """Anonymous access to payment verification must return 401."""
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': 'order_123',
            'razorpay_payment_id': 'pay_123',
            'razorpay_signature': 'sig_123',
        })
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------------------------------
    # 2. Authorization & Cross-Customer Protection
    # -------------------------------------------------------------------------
    def test_cross_customer_payment_initiation_rejected(self):
        """Customer 2 cannot initiate payment for Customer 1's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c2}')
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not authorized", res.data['detail'].lower())

    def test_cross_customer_payment_verification_rejected(self):
        """Customer 2 cannot verify payment for Customer 1's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c2}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': 'order_123',
            'razorpay_payment_id': 'pay_123',
            'razorpay_signature': 'sig_123',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not authorized", res.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 3. Server Amount Authoritativeness
    # -------------------------------------------------------------------------
    def test_payment_initiation_server_authoritative_amount(self):
        """
        The payable amount in paise is calculated strictly from the server-side order total.
        Client cannot pass or manipulate the amount.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/initiate/', {
            'order_id': self.order1.id,
            'payment_method': 'UPI',
            'amount': 100,  # Attacker attempts to pass ₹1 instead of ₹1230.00
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # 1230.00 INR = 123000 paise
        self.assertEqual(res.data['amount'], 123000)
        self.assertEqual(res.data['amount_inr'], '1230.00')
        self.assertTrue(res.data['gateway_order_id'].startswith('order_rzp_'))

        # Verify PaymentTransaction record created
        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.amount, Decimal('1230.00'))
        self.assertEqual(txn.status, PaymentTxStatus.INITIATED)
        self.assertEqual(txn.gateway, PaymentGateway.RAZORPAY)

    def test_payment_initiation_already_paid_rejected(self):
        """Cannot initiate payment for an already paid order."""
        self.order1.payment_status = PaymentStatus.PAID
        self.order1.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been paid", res.data['detail'].lower())

    def test_payment_initiation_cancelled_order_rejected(self):
        """Cannot initiate payment for a cancelled order."""
        self.order1.status = OrderStatus.CANCELLED
        self.order1.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cancelled", res.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 4. Signature Verification & Payment Confirmation
    # -------------------------------------------------------------------------
    def test_payment_verify_valid_signature_success(self):
        """
        Valid cryptographic signature confirms payment, transitions order to CONFIRMED,
        updates payment_status to PAID, and generates tax invoice.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']
        gateway_payment_id = 'pay_test_success_9988'

        # Generate authentic HMAC-SHA256 signature
        valid_signature = PaymentGatewayService.generate_signature(gateway_order_id, gateway_payment_id)

        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': gateway_payment_id,
            'razorpay_signature': valid_signature,
            'payment_method': 'UPI',
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'SUCCESS')
        self.assertEqual(res.data['payment_status'], 'Paid')
        self.assertEqual(res.data['order_status'], OrderStatus.CONFIRMED)

        # Verify DB state
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order1.status, OrderStatus.CONFIRMED)

        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.status, PaymentTxStatus.SUCCESS)
        self.assertEqual(txn.gateway_transaction_id, gateway_payment_id)
        self.assertIsNotNone(txn.invoice)

    def test_payment_verify_invalid_signature_rejected(self):
        """Tampered or invalid signature is rejected and marks transaction as FAILED."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']

        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': 'pay_test_tampered',
            'razorpay_signature': 'tampered_bogus_sha256_hex_digest',
            'payment_method': 'UPI',
        })

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid payment signature", res.data['detail'].lower())

        # Verify DB transaction marked as FAILED
        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.status, PaymentTxStatus.FAILED)
        self.assertEqual(txn.error_code, 'INVALID_SIGNATURE')

        # Order remains PENDING
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.payment_status, PaymentStatus.PENDING)
        self.assertEqual(self.order1.status, OrderStatus.PENDING)

    def test_payment_verify_idempotency(self):
        """Submitting verify multiple times with valid signature is idempotent and safe."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']
        gateway_payment_id = 'pay_test_idem_1122'
        valid_signature = PaymentGatewayService.generate_signature(gateway_order_id, gateway_payment_id)

        payload = {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': gateway_payment_id,
            'razorpay_signature': valid_signature,
            'payment_method': 'UPI',
        }

        # First confirmation
        res1 = self.client.post('/api/v1/payments/verify/', payload)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Duplicate confirmation
        res2 = self.client.post('/api/v1/payments/verify/', payload)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'SUCCESS')

    # -------------------------------------------------------------------------
    # 5. Asynchronous Webhooks
    # -------------------------------------------------------------------------
    def test_webhook_payment_captured_success(self):
        """Webhook payment.captured event authoritatively transitions order state."""
        # Initiate payment first
        init_data = PaymentGatewayService.initiate_order_payment(self.order2.id, self.customer2)
        gateway_order_id = init_data['gateway_order_id']

        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wh_captured_4455",
                        "order_id": gateway_order_id,
                        "amount": 236000,
                        "method": "card",
                    }
                }
            }
        }).encode('utf-8')

        webhook_secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(webhook_secret.encode('utf-8'), webhook_body, hashlib.sha256).hexdigest()

        # Send public webhook request (no auth headers needed)
        self.client.credentials()  # Unauthenticated
        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['order_id'], self.order2.id)

        self.order2.refresh_from_db()
        self.assertEqual(self.order2.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order2.status, OrderStatus.CONFIRMED)

    def test_webhook_duplicate_event_idempotency(self):
        """Duplicate webhook event returns idempotent_ok without duplicated actions."""
        init_data = PaymentGatewayService.initiate_order_payment(self.order2.id, self.customer2)
        gateway_order_id = init_data['gateway_order_id']

        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wh_dup_7788",
                        "order_id": gateway_order_id,
                        "amount": 236000,
                        "method": "netbanking",
                    }
                }
            }
        }).encode('utf-8')

        webhook_secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(webhook_secret.encode('utf-8'), webhook_body, hashlib.sha256).hexdigest()

        self.client.credentials()
        # First delivery
        res1 = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'success')

        # Duplicate delivery
        res2 = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'idempotent_ok')

    def test_webhook_invalid_signature_rejected(self):
        """Webhook with invalid signature returns 400 Bad Request."""
        webhook_body = json.dumps({"event": "payment.captured"}).encode('utf-8')
        self.client.credentials()
        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE='invalid_webhook_signature'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid webhook signature", res.data['detail'].lower())

    def test_webhook_missing_signature_rejected(self):
        """Webhook without signature header returns 400 Bad Request."""
        webhook_body = json.dumps({"event": "payment.captured"}).encode('utf-8')
        self.client.credentials()
        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("missing", res.data['detail'].lower())

    def test_webhook_malformed_payload_rejected(self):
        """Malformed non-JSON payload with valid signature header returns 400."""
        raw_body = b"not-a-valid-json-string-payload"
        webhook_secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(webhook_secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()

        self.client.credentials()
        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=raw_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("malformed", res.data['detail'].lower())

    def test_webhook_payment_failed_records_failure(self):
        """Webhook payment.failed event marks the payment transaction as FAILED."""
        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        gateway_order_id = init_data['gateway_order_id']

        webhook_body = json.dumps({
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_failed_3322",
                        "order_id": gateway_order_id,
                        "error_code": "BAD_REQUEST_ERROR",
                        "error_description": "Card declined by issuing bank",
                    }
                }
            }
        }).encode('utf-8')

        webhook_secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(webhook_secret.encode('utf-8'), webhook_body, hashlib.sha256).hexdigest()

        self.client.credentials()
        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=webhook_body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'failed_recorded')

        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.status, PaymentTxStatus.FAILED)
        self.assertEqual(txn.error_code, 'BAD_REQUEST_ERROR')
        self.assertEqual(txn.error_message, 'Card declined by issuing bank')

    # -------------------------------------------------------------------------
    # 6. Order Payment Status Endpoint
    # -------------------------------------------------------------------------
    def test_payment_order_status_endpoint(self):
        """Owner can check payment status, cross-customer is blocked, admin has access."""
        PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)

        # Owner access -> 200
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res_c1 = self.client.get(f'/api/v1/payments/order/{self.order1.id}/')
        self.assertEqual(res_c1.status_code, status.HTTP_200_OK)
        self.assertEqual(res_c1.data['order'], self.order1.id)

        # Cross-customer access -> 403 Forbidden
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c2}')
        res_c2 = self.client.get(f'/api/v1/payments/order/{self.order1.id}/')
        self.assertEqual(res_c2.status_code, status.HTTP_403_FORBIDDEN)

        # Admin access -> 200
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_admin = self.client.get(f'/api/v1/payments/order/{self.order1.id}/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

    # -------------------------------------------------------------------------
    # 7. Security: Secrets not exposed & Deferred Refund
    # -------------------------------------------------------------------------
    def test_security_secrets_not_exposed(self):
        """Initiation and verification responses must never expose secret keys."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        response_json = json.dumps(res.data)
        self.assertNotIn("mock_veepower_secret_key", response_json)
        self.assertNotIn("mock_veepower_webhook_secret", response_json)

    def test_deferred_refund_raises_not_implemented(self):
        """Direct gateway refund is deferred for this release and raises NotImplementedError."""
        with self.assertRaises(NotImplementedError):
            PaymentGatewayService.process_refund(self.order1.id, self.customer1)
