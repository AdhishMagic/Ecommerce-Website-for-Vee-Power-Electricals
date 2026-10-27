import hmac
import hashlib
from decimal import Decimal
from django.test import TestCase
from django.conf import settings
from rest_framework import status
from rest_framework.test import APIClient
from apps.users.models import User, UserRole
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService


class RazorpayStandardCheckoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.key_id = PaymentGatewayService.get_key_id()
        self.key_secret = PaymentGatewayService.get_key_secret()

        self.customer = User.objects.create_user(
            email='checkout_test@example.com',
            first_name='Test',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )

        self.order = Order.objects.create(
            order_number='ORD-STD-001',
            user=self.customer,
            customer_name='Test Customer',
            customer_email='checkout_test@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Test Customer', 'city': 'Coimbatore'},
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            tax_amount=Decimal('18.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('118.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )

    # -------------------------------------------------------------------------
    # STEP 1: Create Order Endpoint Tests
    # -------------------------------------------------------------------------
    def test_create_order_success(self):
        """Standard POST /api/create-order creates real Razorpay order."""
        res = self.client.post('/api/create-order', {
            'amount': 50000,  # 500.00 INR
            'currency': 'INR',
            'receipt': 'test_receipt_101',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('order_id', res.data)
        self.assertTrue(res.data['order_id'].startswith('order_'))
        self.assertEqual(res.data['amount'], 50000)
        self.assertEqual(res.data['currency'], 'INR')

    def test_create_order_slash_url_success(self):
        """Standard POST /api/create-order/ works with trailing slash."""
        res = self.client.post('/api/create-order/', {
            'amount': 25000,
            'currency': 'INR',
            'receipt': 'test_receipt_102',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('order_id', res.data)
        self.assertTrue(res.data['order_id'].startswith('order_'))
        self.assertEqual(res.data['amount'], 25000)

    def test_create_order_minimum_amount_validation(self):
        """Amounts under 100 paise must return 400 Bad Request."""
        res = self.client.post('/api/create-order', {
            'amount': 99,  # Less than 100 paise
            'currency': 'INR',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)
        self.assertIn('100 paise', res.data['error'])

    def test_create_order_missing_amount_validation(self):
        """Missing amount field must return 400 Bad Request."""
        res = self.client.post('/api/create-order', {
            'currency': 'INR',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)

    def test_create_order_with_internal_order_id(self):
        """Creating standard order with internal DB order_id links transaction."""
        res = self.client.post('/api/create-order', {
            'amount': int(self.order.total_amount * 100),
            'currency': 'INR',
            'receipt': self.order.order_number,
            'order_id': self.order.id,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.filter(order=self.order).first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.gateway_order_id, res.data['order_id'])
        self.assertEqual(txn.status, PaymentTxStatus.INITIATED)

    # -------------------------------------------------------------------------
    # STEP 3: Verify Payment Signature Tests
    # -------------------------------------------------------------------------
    def test_verify_payment_success(self):
        """Valid HMAC-SHA256 signature verifies payment and returns 200."""
        razorpay_order_id = 'order_test_999888'
        razorpay_payment_id = 'pay_test_777666'
        
        # Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
        msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode('utf-8')
        valid_signature = hmac.new(self.key_secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()

        res = self.client.post('/api/verify-payment', {
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': valid_signature,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')

    def test_verify_payment_signature_mismatch_rejected(self):
        """Invalid signature must return 400 Bad Request and status failed."""
        res = self.client.post('/api/verify-payment', {
            'razorpay_order_id': 'order_test_999888',
            'razorpay_payment_id': 'pay_test_777666',
            'razorpay_signature': 'tampered_invalid_signature_hex_value',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['status'], 'failed')

    def test_verify_payment_missing_fields_rejected(self):
        """Missing any required signature verification fields must return 400."""
        # Missing signature
        res1 = self.client.post('/api/verify-payment', {
            'razorpay_order_id': 'order_123',
            'razorpay_payment_id': 'pay_123',
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # Missing payment_id
        res2 = self.client.post('/api/verify-payment', {
            'razorpay_order_id': 'order_123',
            'razorpay_signature': 'sig_123',
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_payment_confirms_associated_order(self):
        """Verifying payment for an associated order updates order to PAID and CONFIRMED."""
        gateway_order_id = 'order_test_ord_link_123'
        PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_order_id=gateway_order_id,
            payment_method='UPI',
            amount=self.order.total_amount,
            currency='INR',
            status=PaymentTxStatus.INITIATED,
        )

        pay_id = 'pay_test_link_456'
        msg = f"{gateway_order_id}|{pay_id}".encode('utf-8')
        valid_signature = hmac.new(self.key_secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()

        res = self.client.post('/api/verify-payment/', {
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': pay_id,
            'razorpay_signature': valid_signature,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

    # -------------------------------------------------------------------------
    # Server-Controlled Config & Payment Handle Tests
    # -------------------------------------------------------------------------
    def test_payment_config_endpoint(self):
        """GET /api/payments-config returns public key and handle without leaking secrets."""
        res = self.client.get('/api/payments-config')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('key_id', res.data)
        self.assertIn('payment_handle', res.data)
        self.assertEqual(res.data['payment_handle'], 'https://razorpay.me/@veepowerelectricals')
        self.assertNotIn('key_secret', res.data)
        self.assertNotIn('secret', res.data)
        self.assertNotIn('webhook_secret', res.data)

    # -------------------------------------------------------------------------
    # Webhook Verification & Idempotency Tests
    # -------------------------------------------------------------------------
    def test_webhook_payment_captured_success(self):
        """Signed webhook event payment.captured idempotently confirms order."""
        import json
        gateway_order_id = 'order_wh_test_001'
        txn = PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_order_id=gateway_order_id,
            payment_method='UPI',
            amount=self.order.total_amount,
            currency='INR',
            status=PaymentTxStatus.INITIATED,
        )

        pay_id = 'pay_wh_captured_001'
        payload = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": pay_id,
                        "order_id": gateway_order_id,
                        "amount": int(self.order.total_amount * 100),
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')

        wh_secret = PaymentGatewayService.get_webhook_secret()
        valid_sig = hmac.new(wh_secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=valid_sig
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

    def test_webhook_invalid_signature_rejected(self):
        """Webhook with invalid signature must return 400 and not update order."""
        import json
        payload = json.dumps({
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": "pay_1", "order_id": "order_1"}}}
        }).encode('utf-8')

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE="tampered_bad_sig"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_webhook_duplicate_event_idempotent(self):
        """Duplicate webhook event on already-paid order returns idempotent_ok."""
        import json
        gateway_order_id = 'order_wh_dup_001'
        pay_id = 'pay_wh_dup_001'
        txn = PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_order_id=gateway_order_id,
            gateway_transaction_id=pay_id,
            payment_method='UPI',
            amount=self.order.total_amount,
            currency='INR',
            status=PaymentTxStatus.SUCCESS,
        )
        self.order.payment_status = PaymentStatus.PAID
        self.order.status = OrderStatus.CONFIRMED
        self.order.save()

        payload = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": pay_id,
                        "order_id": gateway_order_id,
                        "amount": int(self.order.total_amount * 100),
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')

        wh_secret = PaymentGatewayService.get_webhook_secret()
        valid_sig = hmac.new(wh_secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=valid_sig
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'idempotent_ok')

    def test_webhook_amount_mismatch_rejected(self):
        """Webhook with amount mismatch against authoritative total must return 400."""
        import json
        gateway_order_id = 'order_wh_mismatch_001'
        PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_order_id=gateway_order_id,
            payment_method='UPI',
            amount=self.order.total_amount,
            currency='INR',
            status=PaymentTxStatus.INITIATED,
        )

        payload = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_mismatch_001",
                        "order_id": gateway_order_id,
                        "amount": 999999,  # Mismatched amount
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')

        wh_secret = PaymentGatewayService.get_webhook_secret()
        valid_sig = hmac.new(wh_secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=valid_sig
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_webhook_payment_failed_recorded(self):
        """Webhook event payment.failed records failure without confirming order."""
        import json
        gateway_order_id = 'order_wh_fail_001'
        txn = PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_order_id=gateway_order_id,
            payment_method='UPI',
            amount=self.order.total_amount,
            currency='INR',
            status=PaymentTxStatus.INITIATED,
        )

        payload = json.dumps({
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_fail_001",
                        "order_id": gateway_order_id,
                        "error_code": "BAD_REQUEST_ERROR",
                        "error_description": "Payment was declined by issuing bank",
                    }
                }
            }
        }).encode('utf-8')

        wh_secret = PaymentGatewayService.get_webhook_secret()
        valid_sig = hmac.new(wh_secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/v1/payments/webhook/',
            data=payload,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=valid_sig
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        txn.refresh_from_db()
        self.assertEqual(txn.status, PaymentTxStatus.FAILED)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, PaymentStatus.PENDING)
