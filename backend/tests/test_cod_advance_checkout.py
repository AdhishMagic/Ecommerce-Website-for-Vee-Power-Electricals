import hmac
import hashlib
from decimal import Decimal, ROUND_HALF_UP
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User, UserRole, CustomerAddress
from apps.products.models import Category, Brand, Product
from apps.orders.models import Order, OrderStatus, PaymentStatus, OrderItem, Cart, CartItem
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.orders.services.checkout_service import CheckoutService


class CodAdvanceCheckoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.key_id = PaymentGatewayService.get_key_id()
        self.key_secret = PaymentGatewayService.get_key_secret()

        # Customer User
        self.customer = User.objects.create_user(
            email='cod_customer@example.com',
            first_name='Ramesh',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )

        # Other Customer User (for isolation checks)
        self.other_customer = User.objects.create_user(
            email='other_customer@example.com',
            first_name='Suresh',
            last_name='Rao',
            role=UserRole.CUSTOMER,
        )

        # Admin User
        self.admin = User.objects.create_user(
            email='admin_cod@example.com',
            first_name='Admin',
            last_name='User',
            role=UserRole.ADMIN,
            is_staff=True,
        )

        # Product setup
        self.category = Category.objects.create(name='Cables', slug='cables')
        self.brand = Brand.objects.create(name='Havells', slug='havells')
        self.product = Product.objects.create(
            name='Copper Wire 2.5mm',
            slug='copper-wire-25mm',
            sku='WIRE-25MM',
            mrp=Decimal('1200.00'),
            price=Decimal('1000.00'),
            stock=100,
            category=self.category,
            brand=self.brand,
        )

    # -------------------------------------------------------------------------
    # 1. Decimal & Precision Tests for 50% Split
    # -------------------------------------------------------------------------
    def test_cod_split_exact_fifty_percent_odd_amount(self):
        """Total ₹19,815.74 splits into ₹9,907.87 advance and ₹9,907.87 balance."""
        total = Decimal('19815.74')
        advance = (total * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        balance = total - advance

        self.assertEqual(advance, Decimal('9907.87'))
        self.assertEqual(balance, Decimal('9907.87'))
        self.assertEqual(advance + balance, total)

    def test_cod_split_precision_with_one_paisa_remainder(self):
        """Total ₹100.01 splits into ₹50.01 advance and ₹50.00 balance so sum is exact."""
        total = Decimal('100.01')
        advance = (total * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        balance = total - advance

        self.assertEqual(advance, Decimal('50.01'))
        self.assertEqual(balance, Decimal('50.00'))
        self.assertEqual(advance + balance, total)

    def test_cod_split_even_amount(self):
        """Total ₹200.00 splits into ₹100.00 advance and ₹100.00 balance."""
        total = Decimal('200.00')
        advance = (total * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        balance = total - advance

        self.assertEqual(advance, Decimal('100.00'))
        self.assertEqual(balance, Decimal('100.00'))
        self.assertEqual(advance + balance, total)

    # -------------------------------------------------------------------------
    # 2. CheckoutService Order Creation with COD_50
    # -------------------------------------------------------------------------
    def test_create_order_with_cod_50_sets_split_fields_and_preserves_cart(self):
        """Creating an order with COD_50 populates COD split fields and keeps cart until verified."""
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(cart=cart, product=self.product, quantity=2)

        address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Ramesh Kumar',
            phone='+919876543210',
            address_line1='123 Main Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
        )

        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 2}],
            payment_method='COD_50',
        )

        self.assertTrue(order.is_cod)
        self.assertEqual(order.payment_method, 'COD')
        self.assertEqual(order.status, OrderStatus.PENDING)
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)

        expected_advance = (order.total_amount * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        expected_balance = order.total_amount - expected_advance

        self.assertEqual(order.cod_advance_amount, expected_advance)
        self.assertEqual(order.cod_balance_amount, expected_balance)
        self.assertEqual(order.amount_paid, Decimal('0.00'))
        self.assertEqual(order.outstanding_balance, order.total_amount)
        self.assertFalse(order.cod_balance_collected)

        # Cart should NOT be cleared yet (preserved for retry if customer cancels checkout)
        self.assertEqual(cart.items.count(), 1)

    def _create_test_order(self, **kwargs):
        defaults = {
            'order_number': 'ORD-COD-TEST-001',
            'user': self.customer,
            'customer_name': 'Ramesh Kumar',
            'customer_email': self.customer.email,
            'customer_phone': '+919876543210',
            'shipping_address': {'recipient_name': 'Ramesh Kumar', 'city': 'Coimbatore'},
            'subtotal': Decimal('1000.00'),
            'taxable_amount': Decimal('1000.00'),
            'tax_amount': Decimal('180.00'),
            'shipping_fee': Decimal('50.00'),
            'total_amount': Decimal('1230.00'),
            'status': OrderStatus.PENDING,
            'payment_status': PaymentStatus.PENDING,
            'payment_method': 'COD',
            'is_cod': True,
            'cod_advance_amount': Decimal('615.00'),
            'cod_balance_amount': Decimal('615.00'),
            'amount_paid': Decimal('0.00'),
            'outstanding_balance': Decimal('1230.00'),
        }
        defaults.update(kwargs)
        return Order.objects.create(**defaults)

    # -------------------------------------------------------------------------
    # 3. Payment Gateway Service Initiation for COD
    # -------------------------------------------------------------------------
    def test_initiate_order_payment_charges_only_advance_for_cod(self):
        """Initiate payment charges cod_advance_amount in paise, not full order amount."""
        order = self._create_test_order(order_number='ORD-COD-001')

        intent = PaymentGatewayService.initiate_order_payment(order.id, user=self.customer, payment_method='COD_50')

        self.assertTrue(intent['is_cod'])
        # Amount in paise must be 615.00 * 100 = 61500
        self.assertEqual(intent['amount'], 61500)
        self.assertEqual(Decimal(str(intent['amount_inr'])), Decimal('615.00'))
        self.assertEqual(Decimal(str(intent['advance_amount'])), Decimal('615.00'))
        self.assertEqual(Decimal(str(intent['balance_amount'])), Decimal('615.00'))
        self.assertEqual(intent['order_id'], order.id)
        self.assertTrue(intent['razorpay_order_id'].startswith('order_'))

        # Verify PaymentTransaction in DB
        tx = PaymentTransaction.objects.filter(order=order).latest('created_at')
        self.assertEqual(tx.amount, Decimal('615.00'))
        self.assertEqual(tx.status, PaymentTxStatus.INITIATED)

    # -------------------------------------------------------------------------
    # 4. Payment Gateway Service Verification for COD
    # -------------------------------------------------------------------------
    def test_confirm_payment_for_cod_transitions_to_partially_paid_and_confirmed(self):
        """Valid Razorpay signature confirms advance, marks Partially Paid, and clears cart."""
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        order = self._create_test_order(
            order_number='ORD-COD-002',
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('1180.00'),
            cod_advance_amount=Decimal('590.00'),
            cod_balance_amount=Decimal('590.00'),
            outstanding_balance=Decimal('1180.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=1,
            taxable_amount=Decimal('1000.00'),
            tax_rate=Decimal('18.00'),
            tax_amount=Decimal('180.00'),
            subtotal=Decimal('1000.00'),
            total_amount=Decimal('1180.00'),
        )

        intent = PaymentGatewayService.initiate_order_payment(order.id, user=self.customer, payment_method='COD_50')
        rzp_order_id = intent['razorpay_order_id']
        fake_payment_id = 'pay_test_advance_123'

        payload = f"{rzp_order_id}|{fake_payment_id}".encode('utf-8')
        valid_signature = hmac.new(
            self.key_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()

        # Confirm payment
        PaymentGatewayService.confirm_payment(
            order_id=order.id,
            user=self.customer,
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=fake_payment_id,
            razorpay_signature=valid_signature,
            payment_method='COD_50',
        )

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.payment_status, PaymentStatus.PARTIALLY_PAID)
        self.assertEqual(order.amount_paid, Decimal('590.00'))
        self.assertEqual(order.outstanding_balance, Decimal('590.00'))
        self.assertFalse(order.cod_balance_collected)

        # Cart should now be cleared on confirmed payment
        cart.refresh_from_db()
        self.assertEqual(cart.items.count(), 0)

    # -------------------------------------------------------------------------
    # 5. Invalid Signature Rejection
    # -------------------------------------------------------------------------
    def test_invalid_signature_rejects_and_preserves_pending_state(self):
        """Tampered or invalid signature fails verification and keeps order in PENDING."""
        order = self._create_test_order(order_number='ORD-COD-003')

        intent = PaymentGatewayService.initiate_order_payment(order.id, user=self.customer, payment_method='COD_50')

        with self.assertRaises(ValidationError):
            PaymentGatewayService.confirm_payment(
                order_id=order.id,
                user=self.customer,
                razorpay_order_id=intent['razorpay_order_id'],
                razorpay_payment_id='pay_fake_999',
                razorpay_signature='invalid_hex_signature',
                payment_method='COD_50',
            )

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.PENDING)
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)
        self.assertEqual(order.amount_paid, Decimal('0.00'))

    # -------------------------------------------------------------------------
    # 6. Admin Collect COD Balance View
    # -------------------------------------------------------------------------
    def test_admin_collect_cod_balance_success(self):
        """Admin can collect remaining COD balance, marking order Paid and balance 0.00."""
        order = self._create_test_order(
            order_number='ORD-COD-004',
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PARTIALLY_PAID,
            amount_paid=Decimal('615.00'),
            outstanding_balance=Decimal('615.00'),
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/v1/orders/{order.id}/collect-cod/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['payment_status'], PaymentStatus.PAID)
        self.assertTrue(res.data['cod_balance_collected'])
        self.assertEqual(Decimal(str(res.data['amount_paid'])), Decimal('1230.00'))
        self.assertEqual(Decimal(str(res.data['outstanding_balance'])), Decimal('0.00'))

        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.PAID)
        self.assertTrue(order.cod_balance_collected)
        self.assertIsNotNone(order.cod_collected_at)
        self.assertEqual(order.amount_paid, Decimal('1230.00'))
        self.assertEqual(order.outstanding_balance, Decimal('0.00'))

    def test_admin_cannot_collect_cod_balance_twice(self):
        """Attempting to collect COD balance twice returns 400 Bad Request."""
        order = self._create_test_order(
            order_number='ORD-COD-005',
            status=OrderStatus.DELIVERED,
            payment_status=PaymentStatus.PAID,
            amount_paid=Decimal('1230.00'),
            outstanding_balance=Decimal('0.00'),
            cod_balance_collected=True,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/v1/orders/{order.id}/collect-cod/')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already been collected', res.data['detail'])

    def test_non_admin_cannot_collect_cod_balance(self):
        """Regular customer cannot access admin COD collection endpoint (403 Forbidden)."""
        order = self._create_test_order(
            order_number='ORD-COD-006',
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PARTIALLY_PAID,
            amount_paid=Decimal('615.00'),
            outstanding_balance=Decimal('615.00'),
        )

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(f'/api/v1/orders/{order.id}/collect-cod/')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_collect_cod_on_non_cod_order(self):
        """Calling collect-cod on a regular online prepaid order returns 400 Bad Request."""
        order = self._create_test_order(
            order_number='ORD-ONLINE-001',
            is_cod=False,
            payment_status=PaymentStatus.PENDING,
            status=OrderStatus.PENDING,
            payment_method='UPI',
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/v1/orders/{order.id}/collect-cod/')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not a Cash on Delivery', res.data['detail'])

    # -------------------------------------------------------------------------
    # 7. Full Online Payment Regression (UPI / Card / NetBanking)
    # -------------------------------------------------------------------------
    def test_full_online_payment_charges_full_amount_and_marks_paid(self):
        """Prepaid online payment charges 100% and marks order Paid on verification."""
        order = self._create_test_order(
            order_number='ORD-ONLINE-002',
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            tax_amount=Decimal('0.00'),
            shipping_fee=Decimal('0.00'),
            total_amount=Decimal('500.00'),
            is_cod=False,
            payment_method='UPI',
        )

        intent = PaymentGatewayService.initiate_order_payment(order.id, user=self.customer, payment_method='UPI')
        self.assertFalse(intent['is_cod'])
        self.assertEqual(intent['amount'], 50000)  # 500.00 INR = 50000 paise
        self.assertEqual(Decimal(str(intent['amount_inr'])), Decimal('500.00'))

        rzp_order_id = intent['razorpay_order_id']
        fake_payment_id = 'pay_full_online_456'
        payload = f"{rzp_order_id}|{fake_payment_id}".encode('utf-8')
        valid_signature = hmac.new(
            self.key_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()

        PaymentGatewayService.confirm_payment(
            order_id=order.id,
            user=self.customer,
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=fake_payment_id,
            razorpay_signature=valid_signature,
            payment_method='UPI',
        )

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.payment_status, PaymentStatus.PAID)
        self.assertEqual(order.amount_paid, Decimal('500.00'))
        self.assertEqual(order.outstanding_balance, Decimal('0.00'))
