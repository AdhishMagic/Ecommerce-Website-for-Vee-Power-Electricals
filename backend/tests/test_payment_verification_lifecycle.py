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
from apps.products.models import Category, Brand, Product
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService

User = get_user_model()


class PaymentVerificationLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.customer = User.objects.create_user(
            email='lifecycle_customer@example.com',
            first_name='Karthik',
            last_name='Rajan',
            role=UserRole.CUSTOMER,
        )
        self.token = str(AccessToken.for_user(self.customer))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

        self.category = Category.objects.create(name='Pumps', slug='pumps', is_active=True)
        self.brand = Brand.objects.create(name='Crompton', slug='crompton', is_active=True)
        self.product = Product.objects.create(
            name='0.5HP Water Pump',
            slug='0-5hp-water-pump',
            sku='PUMP-05HP',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('4500.00'),
            price=Decimal('3800.00'),
            stock=50,
            active=True,
        )

        self.order = Order.objects.create(
            order_number='ORD-LIFE-001',
            user=self.customer,
            customer_name='Karthik Rajan',
            customer_email='lifecycle_customer@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Karthik Rajan', 'city': 'Coimbatore'},
            subtotal=Decimal('3800.00'),
            taxable_amount=Decimal('3800.00'),
            tax_amount=Decimal('684.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('4484.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )

    def test_scenario_successful_gpay_payment(self):
        """Scenario 1: Direct verification callback confirms payment immediately."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_gpay_{self.order.id}"
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        res = self.client.post('/api/v1/payments/verify/', data={
            "order_id": self.order.id,
            "razorpay_order_id": gw_order_id,
            "razorpay_payment_id": pay_id,
            "razorpay_signature": sig,
            "payment_method": "UPI",
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'SUCCESS')

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

    def test_scenario_delayed_webhook_remains_pending(self):
        """Scenario 2: When webhook is delayed, status API reports PENDING without false failure."""
        PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)

        res = self.client.get(f'/api/v1/payments/order/{self.order.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['definitive_status'], 'PENDING')
        self.assertFalse(res.data['is_final'])
        self.assertNotEqual(res.data['status'], 'FAILED')

    def test_scenario_successful_payment_callback_before_webhook(self):
        """Scenario 3: Callback confirms payment before webhook arrives."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_cb_first_{self.order.id}"
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        # 1. Callback arrives
        res = self.client.post('/api/v1/payments/verify/', data={
            "order_id": self.order.id,
            "razorpay_order_id": gw_order_id,
            "razorpay_payment_id": pay_id,
            "razorpay_signature": sig,
            "payment_method": "UPI",
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 2. Webhook arrives after callback
        self.client.credentials()  # Unauthenticated webhook
        wh_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": pay_id,
                        "order_id": gw_order_id,
                        "amount": int(self.order.total_amount * 100),
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(PaymentGatewayService.get_webhook_secret().encode('utf-8'), wh_body, hashlib.sha256).hexdigest()
        wh_res = self.client.post('/api/v1/payments/webhook/', data=wh_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(wh_res.status_code, status.HTTP_200_OK)
        self.assertEqual(wh_res.data['status'], 'idempotent_ok')

    def test_scenario_webhook_arrives_before_frontend_callback(self):
        """Scenario 4: Webhook arrives before frontend callback; callback returns SUCCESS."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_wh_first_{self.order.id}"

        # 1. Webhook arrives
        self.client.credentials()
        wh_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": pay_id,
                        "order_id": gw_order_id,
                        "amount": int(self.order.total_amount * 100),
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(PaymentGatewayService.get_webhook_secret().encode('utf-8'), wh_body, hashlib.sha256).hexdigest()
        wh_res = self.client.post('/api/v1/payments/webhook/', data=wh_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(wh_res.status_code, status.HTTP_200_OK)
        self.assertEqual(wh_res.data['status'], 'success')

        # 2. Frontend callback arrives
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)
        cb_res = self.client.post('/api/v1/payments/verify/', data={
            "order_id": self.order.id,
            "razorpay_order_id": gw_order_id,
            "razorpay_payment_id": pay_id,
            "razorpay_signature": sig,
            "payment_method": "UPI",
        }, format='json')
        self.assertEqual(cb_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cb_res.data['status'], 'SUCCESS')

    def test_scenario_delayed_webhook_does_not_overwrite_paid_order(self):
        """Scenario 5: A delayed failed webhook does not overwrite an already-confirmed order."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_success_{self.order.id}"
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        # Confirm payment
        PaymentGatewayService.confirm_payment(
            order_id=self.order.id,
            user=self.customer,
            razorpay_order_id=gw_order_id,
            razorpay_payment_id=pay_id,
            razorpay_signature=sig,
        )

        # Delayed failed webhook arrives
        self.client.credentials()
        wh_body = json.dumps({
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_late_fail_123",
                        "order_id": gw_order_id,
                        "error_code": "BAD_REQUEST_ERROR",
                        "error_description": "Delayed failure notice",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(PaymentGatewayService.get_webhook_secret().encode('utf-8'), wh_body, hashlib.sha256).hexdigest()
        wh_res = self.client.post('/api/v1/payments/webhook/', data=wh_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(wh_res.status_code, status.HTTP_200_OK)
        self.assertEqual(wh_res.data['status'], 'ignored')

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, PaymentStatus.PAID)
        self.assertEqual(self.order.status, OrderStatus.CONFIRMED)

    def test_scenario_duplicate_webhooks_handled_idempotently(self):
        """Scenario 6: Multiple identical webhook events do not duplicate confirmation."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_dup_{self.order.id}"

        self.client.credentials()
        wh_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": pay_id,
                        "order_id": gw_order_id,
                        "amount": int(self.order.total_amount * 100),
                        "currency": "INR",
                        "method": "upi",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(PaymentGatewayService.get_webhook_secret().encode('utf-8'), wh_body, hashlib.sha256).hexdigest()

        # Webhook 1
        res1 = self.client.post('/api/v1/payments/webhook/', data=wh_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(res1.data['status'], 'success')

        # Webhook 2 (duplicate)
        res2 = self.client.post('/api/v1/payments/webhook/', data=wh_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(res2.data['status'], 'idempotent_ok')

    def test_scenario_user_refreshes_success_order_remains_paid(self):
        """Scenario 7: When user refreshes success page, status API confirms order remains PAID."""
        init = PaymentGatewayService.initiate_order_payment(self.order.id, self.customer)
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_refresh_{self.order.id}"
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        PaymentGatewayService.confirm_payment(
            order_id=self.order.id,
            user=self.customer,
            razorpay_order_id=gw_order_id,
            razorpay_payment_id=pay_id,
            razorpay_signature=sig,
        )

        res = self.client.get(f'/api/v1/payments/order/{self.order.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'SUCCESS')
        self.assertEqual(res.data['definitive_status'], 'SUCCESS')
        self.assertTrue(res.data['is_final'])
        self.assertEqual(res.data['order_payment_status'], PaymentStatus.PAID)

    def test_scenario_cod_order_preserves_functionality(self):
        """Scenario 8: COD orders with 50% advance confirm PARTIALLY_PAID."""
        cod_order = Order.objects.create(
            order_number='ORD-LIFE-COD-001',
            user=self.customer,
            customer_name='Karthik Rajan',
            customer_email='lifecycle_customer@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Karthik Rajan', 'city': 'Coimbatore'},
            subtotal=Decimal('2000.00'),
            taxable_amount=Decimal('2000.00'),
            tax_amount=Decimal('360.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('2360.00'),
            is_cod=True,
            cod_advance_amount=Decimal('1180.00'),
            cod_balance_amount=Decimal('1180.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='COD',
        )

        init = PaymentGatewayService.initiate_order_payment(cod_order.id, self.customer, payment_method='COD')
        gw_order_id = init['gateway_order_id']
        pay_id = f"pay_cod_{cod_order.id}"
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        PaymentGatewayService.confirm_payment(
            order_id=cod_order.id,
            user=self.customer,
            razorpay_order_id=gw_order_id,
            razorpay_payment_id=pay_id,
            razorpay_signature=sig,
            payment_method='COD',
        )

        cod_order.refresh_from_db()
        self.assertEqual(cod_order.payment_status, PaymentStatus.PARTIALLY_PAID)
        self.assertEqual(cod_order.status, OrderStatus.CONFIRMED)
        self.assertEqual(cod_order.amount_paid, Decimal('1180.00'))
        self.assertEqual(cod_order.outstanding_balance, Decimal('1180.00'))
