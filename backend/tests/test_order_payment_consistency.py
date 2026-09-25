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
from apps.inventory.models import StockTransaction
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.orders.services import OrderWorkflowService
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus, Invoice, InvoiceStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.finance.services.invoice_service import InvoiceService

User = get_user_model()


class OrderPaymentConsistencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer1 = User.objects.create_user(
            email='c1_consistency@example.com',
            first_name='Anand',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='c2_consistency@example.com',
            first_name='Priya',
            last_name='Nair',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin_consistency@veepower.in',
            first_name='Vee',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_c1 = str(AccessToken.for_user(self.customer1))
        self.token_c2 = str(AccessToken.for_user(self.customer2))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Catalog setup
        self.category = Category.objects.create(name='Wires', slug='wires-consistency', is_active=True)
        self.brand = Brand.objects.create(name='Finolex', slug='finolex-consistency', is_active=True)
        self.product = Product.objects.create(
            name='1.5 sq mm Copper Wire',
            slug='1-5-copper-wire',
            sku='WIRE-15-COP',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('600.00'),
            price=Decimal('500.00'),
            stock=100,
            active=True,
        )

        # Order 1 (Customer 1, ₹500.00)
        self.order1 = Order.objects.create(
            order_number='ORD-CONSIST-001',
            user=self.customer1,
            customer_name='Anand Kumar',
            customer_email='c1_consistency@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Anand Kumar', 'city': 'Coimbatore'},
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            tax_amount=Decimal('90.00'),
            shipping_fee=Decimal('50.00'),
            total_amount=Decimal('640.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='UPI',
        )
        OrderItem.objects.create(
            order=self.order1,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=1,
            taxable_amount=Decimal('500.00'),
            tax_rate=Decimal('18.00'),
            tax_amount=Decimal('90.00'),
            subtotal=Decimal('500.00'),
            total_amount=Decimal('640.00'),
        )

        # Order 2 (Customer 2, ₹1280.00)
        self.order2 = Order.objects.create(
            order_number='ORD-CONSIST-002',
            user=self.customer2,
            customer_name='Priya Nair',
            customer_email='c2_consistency@example.com',
            customer_phone='+919876543211',
            shipping_address={'recipient_name': 'Priya Nair', 'city': 'Bangalore'},
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            shipping_fee=Decimal('100.00'),
            total_amount=Decimal('1280.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='CARD',
        )

    # -------------------------------------------------------------------------
    # 1. Successful Payment & Exact State Transitions
    # -------------------------------------------------------------------------
    def test_successful_payment_order_consistency(self):
        """
        Payment success transitions PaymentTransaction to SUCCESS, order to CONFIRMED,
        payment_status to PAID, creates exactly 1 Invoice, and logs exactly 1 status history.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(init_res.status_code, status.HTTP_200_OK)
        gateway_order_id = init_res.data['gateway_order_id']
        gateway_pay_id = 'pay_success_1001'

        sig = PaymentGatewayService.generate_signature(gateway_order_id, gateway_pay_id)

        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': gateway_pay_id,
            'razorpay_signature': sig,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CONFIRMED)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PAID)

        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.status, PaymentTxStatus.SUCCESS)
        self.assertEqual(txn.gateway_transaction_id, gateway_pay_id)
        self.assertIsNotNone(txn.invoice)

        # Invoice integrity
        invoices = Invoice.objects.filter(order=self.order1)
        self.assertEqual(invoices.count(), 1)
        inv = invoices.first()
        self.assertEqual(inv.status, InvoiceStatus.PAID)
        self.assertEqual(inv.total_amount, self.order1.total_amount)

        # Status history integrity
        history = OrderStatusHistory.objects.filter(order=self.order1)
        self.assertEqual(history.count(), 1)
        self.assertEqual(history.first().new_status, OrderStatus.CONFIRMED)

    # -------------------------------------------------------------------------
    # 2. Failed Payment Consistency
    # -------------------------------------------------------------------------
    def test_failed_payment_order_consistency(self):
        """
        Payment failure records transaction as FAILED, keeps order in PENDING,
        does not mark Paid, and does not generate an Invoice.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']

        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': 'pay_invalid_sig',
            'razorpay_signature': 'invalid_bad_sig_123',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.PENDING)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PENDING)

        txn = PaymentTransaction.objects.get(order=self.order1)
        self.assertEqual(txn.status, PaymentTxStatus.FAILED)
        self.assertIsNone(txn.invoice)
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 0)
        self.assertEqual(OrderStatusHistory.objects.filter(order=self.order1).count(), 0)

    # -------------------------------------------------------------------------
    # 3. Server-Authoritative Amount Enforcement
    # -------------------------------------------------------------------------
    def test_server_authoritative_amount_tampering_rejected(self):
        """
        Client attempts to tamper with the amount: the server derives amount strictly
        from the database order total (paise = total_amount * 100).
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        # Attacker submits ₹10.00 instead of ₹640.00
        res = self.client.post('/api/v1/payments/initiate/', {
            'order_id': self.order1.id,
            'amount': 1000,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Expected: 640.00 * 100 = 64000 paise
        self.assertEqual(res.data['amount'], 64000)
        self.assertEqual(res.data['amount_inr'], '640.00')

    # -------------------------------------------------------------------------
    # 4. Duplicate Verification Idempotency (2, 3, 5 Repeated Requests)
    # -------------------------------------------------------------------------
    def test_duplicate_verification_idempotency(self):
        """
        Sending repeated verification requests for the same payment produces
        exactly one logical transition, one invoice, and one history record.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']
        gateway_pay_id = 'pay_repeat_1234'
        sig = PaymentGatewayService.generate_signature(gateway_order_id, gateway_pay_id)

        payload = {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': gateway_pay_id,
            'razorpay_signature': sig,
        }

        # Fire 5 repeated verification calls
        for _ in range(5):
            res = self.client.post('/api/v1/payments/verify/', payload)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'SUCCESS')

        # Total payment transactions for this order = 1
        self.assertEqual(PaymentTransaction.objects.filter(order=self.order1).count(), 1)
        # Total invoices = 1
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 1)
        # Total status history = 1
        self.assertEqual(OrderStatusHistory.objects.filter(order=self.order1).count(), 1)

    # -------------------------------------------------------------------------
    # 5. Duplicate Webhook Idempotency
    # -------------------------------------------------------------------------
    def test_duplicate_webhook_idempotency(self):
        """
        Repeated webhook deliveries for payment.captured produce exactly one transition
        and return idempotent_ok on subsequent deliveries.
        """
        init_data = PaymentGatewayService.initiate_order_payment(self.order2.id, self.customer2)
        gateway_order_id = init_data['gateway_order_id']

        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wh_multi_5566",
                        "order_id": gateway_order_id,
                        "amount": 128000,
                        "currency": "INR",
                        "method": "CARD",
                    }
                }
            }
        }).encode('utf-8')

        sig = hmac.new(
            PaymentGatewayService.get_webhook_secret().encode('utf-8'),
            webhook_body,
            hashlib.sha256
        ).hexdigest()

        self.client.credentials()
        # Delivery 1
        res1 = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sig)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'success')

        # Deliveries 2 to 5
        for _ in range(4):
            res = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sig)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'idempotent_ok')

        self.assertEqual(Invoice.objects.filter(order=self.order2).count(), 1)
        self.assertEqual(OrderStatusHistory.objects.filter(order=self.order2).count(), 1)

    # -------------------------------------------------------------------------
    # 6. Webhook + Verification Simulating Near-Simultaneous Race
    # -------------------------------------------------------------------------
    def test_webhook_and_verification_race_safety(self):
        """
        When webhook and client verification both arrive for the same payment,
        both complete without error, creating exactly 1 confirmed state and 1 invoice.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gateway_order_id = init_res.data['gateway_order_id']
        gateway_pay_id = 'pay_race_7788'
        sig = PaymentGatewayService.generate_signature(gateway_order_id, gateway_pay_id)

        # 1. Webhook arrives first
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": gateway_pay_id,
                        "order_id": gateway_order_id,
                        "amount": 64000,
                        "currency": "INR",
                        "method": "UPI",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(
            PaymentGatewayService.get_webhook_secret().encode('utf-8'),
            webhook_body,
            hashlib.sha256
        ).hexdigest()

        self.client.credentials()
        wh_res = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(wh_res.status_code, status.HTTP_200_OK)

        # 2. Client verification arrives second
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        client_res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': gateway_pay_id,
            'razorpay_signature': sig,
        })
        self.assertEqual(client_res.status_code, status.HTTP_200_OK)

        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 1)
        self.assertEqual(PaymentTransaction.objects.filter(order=self.order1).count(), 1)
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CONFIRMED)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PAID)

    # -------------------------------------------------------------------------
    # 7. Authorization & Cross-Customer Protection
    # -------------------------------------------------------------------------
    def test_wrong_customer_payment_blocked(self):
        """Customer B cannot confirm payment for Customer A's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c2}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': 'order_fake',
            'razorpay_payment_id': 'pay_fake',
            'razorpay_signature': 'sig_fake',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not authorized", res.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 8. Cross-Order Gateway ID Mismatch Protection
    # -------------------------------------------------------------------------
    def test_wrong_gateway_order_id_cross_order_blocked(self):
        """
        Using a gateway_order_id that belongs to Order 2 to verify Order 1 is rejected.
        """
        init1 = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        init2 = PaymentGatewayService.initiate_order_payment(self.order2.id, self.customer2)

        # Attacker tries to verify Order 1 using Order 2's gateway order ID
        sig = PaymentGatewayService.generate_signature(init2['gateway_order_id'], 'pay_mismatch_1')

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': init2['gateway_order_id'],
            'razorpay_payment_id': 'pay_mismatch_1',
            'razorpay_signature': sig,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("belongs to a different order", res.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 9. Payment ID Reuse Across Orders Blocked
    # -------------------------------------------------------------------------
    def test_payment_id_reuse_across_orders_blocked(self):
        """
        The same razorpay_payment_id cannot be reused to pay for another order.
        """
        init1 = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        init2 = PaymentGatewayService.initiate_order_payment(self.order2.id, self.customer2)

        pay_id = 'pay_shared_replay_001'
        sig1 = PaymentGatewayService.generate_signature(init1['gateway_order_id'], pay_id)

        # Successfully confirm Order 1
        PaymentGatewayService.confirm_payment(
            order_id=self.order1.id,
            user=self.customer1,
            razorpay_order_id=init1['gateway_order_id'],
            razorpay_payment_id=pay_id,
            razorpay_signature=sig1,
        )

        # Now try to use the same pay_id to confirm Order 2
        sig2 = PaymentGatewayService.generate_signature(init2['gateway_order_id'], pay_id)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c2}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order2.id,
            'razorpay_order_id': init2['gateway_order_id'],
            'razorpay_payment_id': pay_id,
            'razorpay_signature': sig2,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been credited", res.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 10. Webhook Amount Consistency
    # -------------------------------------------------------------------------
    def test_wrong_amount_in_webhook_rejected(self):
        """Webhook with mismatched payable amount is rejected with 400 Bad Request."""
        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        gateway_order_id = init_data['gateway_order_id']

        # Order 1 total is ₹640.00 = 64000 paise. Send 1000 paise.
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wrong_amt",
                        "order_id": gateway_order_id,
                        "amount": 1000,
                        "currency": "INR",
                    }
                }
            }
        }).encode('utf-8')
        sig = hmac.new(
            PaymentGatewayService.get_webhook_secret().encode('utf-8'),
            webhook_body,
            hashlib.sha256
        ).hexdigest()

        self.client.credentials()
        res = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sig)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount mismatch", res.data['detail'].lower())

        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.PENDING)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PENDING)

    # -------------------------------------------------------------------------
    # 11. Currency Validation
    # -------------------------------------------------------------------------
    def test_wrong_currency_rejected(self):
        """Non-INR currency in verify or webhook is rejected."""
        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        gateway_order_id = init_data['gateway_order_id']

        # 1. Non-INR in verification
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': 'pay_usd',
            'razorpay_signature': 'some_sig',
            'currency': 'USD',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid currency", res.data['detail'].lower())

        # 2. Non-INR in webhook
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_usd_wh",
                        "order_id": gateway_order_id,
                        "amount": 64000,
                        "currency": "EUR",
                    }
                }
            }
        }).encode('utf-8')
        sig = hmac.new(
            PaymentGatewayService.get_webhook_secret().encode('utf-8'),
            webhook_body,
            hashlib.sha256
        ).hexdigest()
        self.client.credentials()
        res_wh = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=sig)
        self.assertEqual(res_wh.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("currency mismatch", res_wh.data['detail'].lower())

    # -------------------------------------------------------------------------
    # 12. Cancelled Order Protection
    # -------------------------------------------------------------------------
    def test_cancelled_order_late_payment_no_resurrection(self):
        """
        If an order is cancelled, a late verification attempt is rejected,
        and a late webhook logs payment for audit without resurrecting the order.
        """
        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        gateway_order_id = init_data['gateway_order_id']

        # Cancel the order
        OrderWorkflowService.cancel_order(self.order1.id, requested_by=self.customer1, reason="Customer cancelled")
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CANCELLED)

        # 1. Verification attempt must be rejected
        sig = PaymentGatewayService.generate_signature(gateway_order_id, 'pay_late_123')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gateway_order_id,
            'razorpay_payment_id': 'pay_late_123',
            'razorpay_signature': sig,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cancelled order", res.data['detail'].lower())

        # 2. Webhook arrival must record audit without resurrecting order
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_late_wh",
                        "order_id": gateway_order_id,
                        "amount": 64000,
                        "currency": "INR",
                    }
                }
            }
        }).encode('utf-8')
        wh_sig = hmac.new(
            PaymentGatewayService.get_webhook_secret().encode('utf-8'),
            webhook_body,
            hashlib.sha256
        ).hexdigest()
        self.client.credentials()
        res_wh = self.client.post('/api/v1/payments/webhook/', data=webhook_body, content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=wh_sig)
        self.assertEqual(res_wh.status_code, status.HTTP_200_OK)
        self.assertEqual(res_wh.data['status'], 'cancelled_order_payment')

        # Order must remain CANCELLED
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CANCELLED)
        # Invoice must NOT have been generated
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 0)

    # -------------------------------------------------------------------------
    # 13. Retry Flow After Failed Payment
    # -------------------------------------------------------------------------
    def test_retry_after_failed_payment(self):
        """
        Failed payment marks transaction 1 as FAILED.
        Customer retries, creates transaction 2 as INITIATED, and successfully confirms.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')

        # 1. Attempt 1 fails
        init1 = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gw_order1 = init1.data['gateway_order_id']
        self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gw_order1,
            'razorpay_payment_id': 'pay_failed_attempt',
            'razorpay_signature': 'bogus_sig',
        })
        txn1 = PaymentTransaction.objects.get(gateway_order_id=gw_order1)
        self.assertEqual(txn1.status, PaymentTxStatus.FAILED)

        # 2. Attempt 2 (Retry)
        init2 = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gw_order2 = init2.data['gateway_order_id']
        self.assertNotEqual(gw_order1, gw_order2)

        sig2 = PaymentGatewayService.generate_signature(gw_order2, 'pay_success_attempt')
        res2 = self.client.post('/api/v1/payments/verify/', {
            'order_id': self.order1.id,
            'razorpay_order_id': gw_order2,
            'razorpay_payment_id': 'pay_success_attempt',
            'razorpay_signature': sig2,
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        # Verify historical preservation: both transactions exist
        self.assertEqual(PaymentTransaction.objects.filter(order=self.order1).count(), 2)
        txn1.refresh_from_db()
        self.assertEqual(txn1.status, PaymentTxStatus.FAILED)
        txn2 = PaymentTransaction.objects.get(gateway_order_id=gw_order2)
        self.assertEqual(txn2.status, PaymentTxStatus.SUCCESS)

        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CONFIRMED)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PAID)

    # -------------------------------------------------------------------------
    # 14. Invoice Idempotency Guarantee
    # -------------------------------------------------------------------------
    def test_invoice_duplication_protection(self):
        """Calling create_invoice_for_order multiple times returns the same invoice."""
        inv1 = InvoiceService.create_invoice_for_order(self.order1)
        inv2 = InvoiceService.create_invoice_for_order(self.order1)
        self.assertEqual(inv1.id, inv2.id)
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 1)

    # -------------------------------------------------------------------------
    # 15. Inventory Non-Duplication
    # -------------------------------------------------------------------------
    def test_inventory_non_duplication(self):
        """Payment confirmation does not deduct inventory a second time."""
        # Baseline stock
        initial_stock = self.product.stock
        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        sig = PaymentGatewayService.generate_signature(init_data['gateway_order_id'], 'pay_stock_chk')

        # Confirm payment
        PaymentGatewayService.confirm_payment(
            order_id=self.order1.id,
            user=self.customer1,
            razorpay_order_id=init_data['gateway_order_id'],
            razorpay_payment_id='pay_stock_chk',
            razorpay_signature=sig,
        )

        self.product.refresh_from_db()
        # Stock remains at initial_stock (deducted at checkout, not re-deducted at payment confirmation)
        self.assertEqual(self.product.stock, initial_stock)

    # -------------------------------------------------------------------------
    # 16. Refund Automation Boundary
    # -------------------------------------------------------------------------
    def test_refund_boundary_not_implemented(self):
        """Refund processing raises NotImplementedError per deferred project scope."""
        with self.assertRaises(NotImplementedError):
            PaymentGatewayService.process_refund(self.order1.id, self.customer1)

    # -------------------------------------------------------------------------
    # 17. Payment Cancellation / Window Dismissal Consistency
    # -------------------------------------------------------------------------
    def test_user_cancelled_payment_maintains_order_pending(self):
        """
        When user cancels payment or closes the modal, the order remains in PENDING
        status and payment remains PENDING. Order is NOT falsely confirmed.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        self.assertEqual(init_res.status_code, status.HTTP_200_OK)

        # User closes the Razorpay modal or navigates away. No verify call is sent.
        # Order must remain PENDING, no invoice created, no inventory restored or re-deducted
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.PENDING)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PENDING)
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 0)

    # -------------------------------------------------------------------------
    # 18. Non-Existent or Wrong Order ID
    # -------------------------------------------------------------------------
    def test_wrong_order_id_rejected(self):
        """Initiating or verifying with a non-existent order ID returns 400 or 404."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.post('/api/v1/payments/initiate/', {'order_id': 99999})
        self.assertIn(res.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])

        res_v = self.client.post('/api/v1/payments/verify/', {
            'order_id': 99999,
            'razorpay_order_id': 'order_none',
            'razorpay_payment_id': 'pay_none',
            'razorpay_signature': 'sig_none',
        })
        self.assertIn(res_v.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])

    # -------------------------------------------------------------------------
    # 19. Atomic Rollback on Failure
    # -------------------------------------------------------------------------
    def test_atomic_rollback_on_confirmation_exception(self):
        """
        If an unexpected error occurs during order state transition,
        the entire transaction rolls back atomically.
        """
        from unittest.mock import patch

        init_data = PaymentGatewayService.initiate_order_payment(self.order1.id, self.customer1)
        gw_order_id = init_data['gateway_order_id']
        sig = PaymentGatewayService.generate_signature(gw_order_id, 'pay_atomic_err')

        # Simulate OrderWorkflowService.transition_order_status failing
        with patch('apps.orders.services.OrderWorkflowService.transition_order_status', side_effect=RuntimeError("Transition DB failure")):
            with self.assertRaises(RuntimeError):
                PaymentGatewayService.confirm_payment(
                    order_id=self.order1.id,
                    user=self.customer1,
                    razorpay_order_id=gw_order_id,
                    razorpay_payment_id='pay_atomic_err',
                    razorpay_signature=sig,
                )

        # Database state must be rolled back: order remains PENDING
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.PENDING)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PENDING)
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 0)
        self.assertEqual(OrderStatusHistory.objects.filter(order=self.order1).count(), 0)

    # -------------------------------------------------------------------------
    # 20. Concurrent Multi-Confirmation Protection (10 Requests)
    # -------------------------------------------------------------------------
    def test_concurrent_multi_confirmation_protection(self):
        """
        10 repeated confirmation requests resolve into exactly 1 invoice,
        1 status transition, and exactly 1 successful PaymentTransaction.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        init_res = self.client.post('/api/v1/payments/initiate/', {'order_id': self.order1.id})
        gw_order_id = init_res.data['gateway_order_id']
        sig = PaymentGatewayService.generate_signature(gw_order_id, 'pay_concurrent_10')

        payload = {
            'order_id': self.order1.id,
            'razorpay_order_id': gw_order_id,
            'razorpay_payment_id': 'pay_concurrent_10',
            'razorpay_signature': sig,
        }

        # Issue 10 verification requests
        responses = [self.client.post('/api/v1/payments/verify/', payload) for _ in range(10)]
        for r in responses:
            self.assertEqual(r.status_code, status.HTTP_200_OK)

        self.assertEqual(PaymentTransaction.objects.filter(order=self.order1).count(), 1)
        self.assertEqual(Invoice.objects.filter(order=self.order1).count(), 1)
        self.assertEqual(OrderStatusHistory.objects.filter(order=self.order1).count(), 1)
        self.order1.refresh_from_db()
        self.assertEqual(self.order1.status, OrderStatus.CONFIRMED)
        self.assertEqual(self.order1.payment_status, PaymentStatus.PAID)

