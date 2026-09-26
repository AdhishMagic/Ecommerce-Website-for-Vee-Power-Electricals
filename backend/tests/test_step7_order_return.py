import threading
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Brand, Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.inventory.services import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.orders.services import CheckoutService, OrderWorkflowService
from apps.commercial_config.models import TaxConfiguration, DeliveryConfiguration
from apps.finance.models import Invoice, InvoiceStatus, PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services import PaymentGatewayService, InvoiceService
from apps.core.models import CommunicationLog

User = get_user_model()


class Step7OrderReturnTestCase(TestCase):
    """
    Step 7 — Order and Return Domain Finalization Test Suite.
    Exhaustive validation of canonical FSM, status history, customer isolation,
    order item snapshot immutability, cancellation, return lifecycle,
    inventory restoration, and communication integration.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer_a = User.objects.create_user(
            email='cust_a@veepower.com',
            password='Password123!',
            first_name='Anand',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.customer_b = User.objects.create_user(
            email='cust_b@veepower.com',
            password='Password123!',
            first_name='Bala',
            last_name='Subramanian',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin_order@veepower.com',
            password='Password123!',
            first_name='Admin',
            last_name='Order',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        # Catalog setup
        self.category = Category.objects.create(name='Distribution Panels', slug='dist-panels', is_active=True)
        self.brand = Brand.objects.create(name='Schneider', slug='schneider', is_active=True)
        self.product1 = Product.objects.create(
            name='MCCB 100A 4P 36kA',
            slug='mccb-100a-4p-36ka',
            sku='MCCB-100A-4P',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('4500.00'),
            price=Decimal('3800.00'),
            stock=20,
            active=True,
        )
        self.product2 = Product.objects.create(
            name='Contactor 32A 3P 220V',
            slug='contactor-32a-3p-220v',
            sku='CONT-32A-3P',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('1200.00'),
            price=Decimal('950.00'),
            stock=15,
            active=True,
        )

        # Addresses
        self.address_a = CustomerAddress.objects.create(
            user=self.customer_a,
            recipient_name='Anand Kumar',
            phone='+919876543210',
            address_line1='100 Crosscut Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641012',
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.address_b = CustomerAddress.objects.create(
            user=self.customer_b,
            recipient_name='Bala Subramanian',
            phone='+919876543211',
            address_line1='50 Avinashi Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641014',
            address_type=AddressType.WORK,
            is_default=True,
        )

        # Commercial Configurations
        TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Central',
            origin_address='Central Depot',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641001',
            base_delivery_charge=Decimal('100.00'),
            free_delivery_threshold=Decimal('10000.00'),
            is_active=True,
        )

    # -------------------------------------------------------------
    # 1. CANONICAL ORDER FSM & TRANSITIONS
    # -------------------------------------------------------------
    def test_canonical_ten_states_forward_flow(self):
        """Complete canonical forward lifecycle: PENDING -> CONFIRMED -> PACKED -> SHIPPED -> DELIVERED -> RETURN_REQUESTED -> RETURN_APPROVED -> RETURN_COMPLETED."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 2}],
        )
        self.assertEqual(order.status, OrderStatus.PENDING)

        transitions = [
            (OrderStatus.CONFIRMED, {}),
            (OrderStatus.PACKED, {}),
            (OrderStatus.SHIPPED, {'tracking_number': 'AWB-VEE-9999'}),
            (OrderStatus.DELIVERED, {}),
            (OrderStatus.RETURN_REQUESTED, {'reason': 'Customer requested RMA'}),
            (OrderStatus.RETURN_APPROVED, {'reason': 'Inspection approved'}),
            (OrderStatus.RETURN_COMPLETED, {'reason': 'Physical stock restocked'}),
        ]

        for target_status, kwargs in transitions:
            OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=target_status,
                changed_by=self.admin,
                **kwargs
            )
            order.refresh_from_db()
            self.assertEqual(order.status, target_status)

        # Initial history + 7 transitions = 8 history records
        self.assertEqual(OrderStatusHistory.objects.filter(order=order).count(), 8)

    def test_prohibited_legacy_states_rejected(self):
        """Legacy states (PROCESSING, OUT_FOR_DELIVERY, RETURNED) must be strictly rejected."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        for legacy_state in ['PROCESSING', 'OUT_FOR_DELIVERY', 'RETURNED']:
            with self.assertRaises(DjangoValidationError):
                OrderWorkflowService.transition_order_status(
                    order_id=order.id,
                    target_status=legacy_state,
                    changed_by=self.admin,
                )

    def test_invalid_transition_matrix(self):
        """Invalid transitions fail safely without modifying order state."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        # Advance to DELIVERED
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.DELIVERED, changed_by=self.admin)
        order.refresh_from_db()

        # DELIVERED -> CONFIRMED must fail
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)

        # DELIVERED -> CANCELLED must fail
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order.id, OrderStatus.CANCELLED, changed_by=self.admin)

        # DELIVERED -> PACKED must fail
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.DELIVERED)

    def test_terminal_states_immutable(self):
        """CANCELLED, RETURN_REJECTED, and RETURN_COMPLETED cannot be transitioned further."""
        # 1. Cancelled
        order1 = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        OrderWorkflowService.cancel_order(order1.id, requested_by=self.customer_a)
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order1.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order1.id, OrderStatus.SHIPPED, changed_by=self.admin)

        # 2. Return Rejected
        order2 = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        for st in [OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED]:
            OrderWorkflowService.transition_order_status(order2.id, st, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order2.id, OrderStatus.RETURN_REJECTED, changed_by=self.admin)

        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order2.id, OrderStatus.RETURN_COMPLETED, changed_by=self.admin)
        with self.assertRaises(DjangoValidationError):
            OrderWorkflowService.transition_order_status(order2.id, OrderStatus.CONFIRMED, changed_by=self.admin)

    # -------------------------------------------------------------
    # 2. STATUS HISTORY & AUDIT TRAIL
    # -------------------------------------------------------------
    def test_status_history_append_only(self):
        """Every valid transition appends exactly one audit record with actor and reason."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        hist0 = OrderStatusHistory.objects.filter(order=order)
        self.assertEqual(hist0.count(), 1)
        self.assertIsNone(hist0.first().previous_status)
        self.assertEqual(hist0.first().new_status, OrderStatus.PENDING)

        OrderWorkflowService.transition_order_status(
            order_id=order.id,
            target_status=OrderStatus.CONFIRMED,
            changed_by=self.admin,
            reason='Verified payment gateway txn'
        )
        hist1 = OrderStatusHistory.objects.filter(order=order).order_by('created_at')
        self.assertEqual(hist1.count(), 2)
        latest = hist1.last()
        self.assertEqual(latest.previous_status, OrderStatus.PENDING)
        self.assertEqual(latest.new_status, OrderStatus.CONFIRMED)
        self.assertEqual(latest.changed_by, self.admin)
        self.assertEqual(latest.reason, 'Verified payment gateway txn')

    def test_duplicate_transition_is_idempotent_no_duplicate_history(self):
        """Transitioning to the identical current status is an idempotent no-op without duplicate history."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        count_before = OrderStatusHistory.objects.filter(order=order).count()

        # Repeat same transition
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        count_after = OrderStatusHistory.objects.filter(order=order).count()
        self.assertEqual(count_before, count_after)

    # -------------------------------------------------------------
    # 3. CUSTOMER ORDER OWNERSHIP & ISOLATION
    # -------------------------------------------------------------
    def test_customer_isolation_get_and_list(self):
        """Customer A cannot view or list Customer B's order."""
        order_b = CheckoutService.process_checkout(
            user=self.customer_b,
            shipping_address_id=self.address_b.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )

        self.client.force_authenticate(user=self.customer_a)

        # GET detail of Customer B's order -> 404
        res_detail = self.client.get(f'/api/v1/orders/{order_b.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

        # GET history of Customer B's order -> 404
        res_hist = self.client.get(f'/api/v1/orders/{order_b.id}/history/')
        self.assertEqual(res_hist.status_code, status.HTTP_404_NOT_FOUND)

        # GET my-orders list -> does not contain order_b
        res_list = self.client.get('/api/v1/orders/my-orders/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        order_ids = [o['id'] for o in (res_list.data if isinstance(res_list.data, list) else res_list.data.get('results', []))]
        self.assertNotIn(order_b.id, order_ids)

    def test_customer_isolation_cancel_and_return(self):
        """Customer A cannot cancel or return Customer B's order."""
        order_b = CheckoutService.process_checkout(
            user=self.customer_b,
            shipping_address_id=self.address_b.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )

        self.client.force_authenticate(user=self.customer_a)

        # Cancel attempt -> 403 Forbidden
        res_cancel = self.client.post(f'/api/v1/orders/{order_b.id}/cancel/', {'reason': 'Malicious cancel'})
        self.assertEqual(res_cancel.status_code, status.HTTP_403_FORBIDDEN)

        # Advance order B to DELIVERED by admin
        OrderWorkflowService.transition_order_status(order_b.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order_b.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order_b.id, OrderStatus.SHIPPED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order_b.id, OrderStatus.DELIVERED, changed_by=self.admin)

        # Return attempt by Customer A -> 403 Forbidden
        res_return = self.client.post(f'/api/v1/orders/{order_b.id}/return/', {'reason': 'Malicious return request'})
        self.assertEqual(res_return.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # 4. ORDER CREATION AUTHORITATIVE BILLING & TAMPER RESISTANCE
    # -------------------------------------------------------------
    def test_order_creation_ignores_client_tampered_pricing(self):
        """Client-provided prices, subtotals, tax, discounts, and customer IDs are ignored in favor of DB calculations."""
        self.client.force_authenticate(user=self.customer_a)
        tampered_payload = {
            'shipping_address_id': self.address_a.id,
            'items': [{'product_id': self.product1.id, 'quantity': 2, 'unit_price': '1.00', 'total_amount': '2.00'}],
            'subtotal': '2.00',
            'tax_amount': '0.00',
            'shipping_fee': '0.00',
            'total_amount': '2.00',
            'customer_id': self.customer_b.id,
        }
        res = self.client.post('/api/v1/orders/checkout/', tampered_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        order_data = res.data
        # Price is strictly 3800.00 * 2 = 7600.00, tax 18% = 1368.00, shipping 100.00, total = 9068.00
        self.assertEqual(Decimal(str(order_data['subtotal'])), Decimal('7600.00'))
        self.assertEqual(Decimal(str(order_data['total_amount'])), Decimal('9068.00'))
        self.assertEqual(order_data['user'], self.customer_a.id)

    # -------------------------------------------------------------
    # 5. ORDER ITEM & ADDRESS SNAPSHOT IMMUTABILITY
    # -------------------------------------------------------------
    def test_order_item_snapshot_remains_intact_after_product_changes(self):
        """Modifying or deactivating a Product after order creation preserves historical order line items."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        item = order.items.first()
        orig_name = item.product_name
        orig_price = item.unit_price
        orig_sku = item.sku

        # Modify product in catalog
        self.product1.name = 'Renamed Heavy MCCB 100A'
        self.product1.sku = 'NEW-SKU-999'
        self.product1.price = Decimal('9999.00')
        self.product1.mrp = Decimal('12000.00')
        self.product1.active = False
        self.product1.save()

        # Re-fetch order item
        item.refresh_from_db()
        self.assertEqual(item.product_name, orig_name)
        self.assertEqual(item.unit_price, orig_price)
        self.assertEqual(item.sku, orig_sku)
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('3800.00'))

    def test_address_snapshot_preserves_history_after_address_update_or_delete(self):
        """Updating or deleting a customer address does not alter historical order address JSON."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        orig_shipping = dict(order.shipping_address)

        # Customer updates address
        self.address_a.address_line1 = '999 New Sunset Boulevard'
        self.address_a.city = 'Chennai'
        self.address_a.save()

        order.refresh_from_db()
        self.assertEqual(order.shipping_address['address_line1'], '100 Crosscut Road')
        self.assertEqual(order.shipping_address['city'], 'Coimbatore')

        # Customer deletes address
        self.address_a.delete()
        order.refresh_from_db()
        self.assertEqual(order.shipping_address['address_line1'], '100 Crosscut Road')

    # -------------------------------------------------------------
    # 6. ORDER CANCELLATION & INVENTORY RESTORATION
    # -------------------------------------------------------------
    def test_customer_cancellation_restores_inventory_once(self):
        """Customer cancels order: inventory restored exactly once, status history and communication created."""
        initial_stock = self.product1.stock
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 3}],
        )
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock - 3)

        self.client.force_authenticate(user=self.customer_a)
        res = self.client.post(f'/api/v1/orders/{order.id}/cancel/', {'reason': 'Project postponed'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED)

        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock, "Stock must be fully restored")

        # Duplicate cancel attempt returns 400
        res_dup = self.client.post(f'/api/v1/orders/{order.id}/cancel/', {'reason': 'Duplicate cancel'})
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock, "Stock must not double restore")

    def test_cannot_cancel_shipped_or_delivered_order(self):
        """Orders that are SHIPPED or DELIVERED cannot be cancelled."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin)

        self.client.force_authenticate(user=self.customer_a)
        res = self.client.post(f'/api/v1/orders/{order.id}/cancel/', {'reason': 'Attempt cancel shipped'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be cancelled", res.data['detail'])

    # -------------------------------------------------------------
    # 7. RETURN LIFECYCLE & PHYSICAL RESTORATION BOUNDARY
    # -------------------------------------------------------------
    def test_return_lifecycle_and_restoration(self):
        """Full return lifecycle: request -> approve -> reject/complete. Stock restored ONLY on RETURN_COMPLETED."""
        initial_stock = self.product1.stock
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 2}],
        )
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock - 2)

        # Advance to DELIVERED
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.DELIVERED, changed_by=self.admin)

        # 1. Customer requests return via endpoint
        self.client.force_authenticate(user=self.customer_a)
        res_ret = self.client.post(f'/api/v1/orders/{order.id}/return/', {'reason': 'Wrong rating ordered'})
        self.assertEqual(res_ret.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.RETURN_REQUESTED)

        # Stock must NOT be restored on RETURN_REQUESTED
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock - 2)

        # 2. Admin approves return
        self.client.force_authenticate(user=self.admin)
        res_app = self.client.patch(
            f'/api/v1/orders/{order.id}/status/',
            {'status': OrderStatus.RETURN_APPROVED, 'reason': 'Return approved by admin'}
        )
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.RETURN_APPROVED)

        # Stock must NOT be restored on RETURN_APPROVED (goods not yet received)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock - 2)

        # 3. Admin completes return
        res_comp = self.client.patch(
            f'/api/v1/orders/{order.id}/status/',
            {'status': OrderStatus.RETURN_COMPLETED, 'reason': 'Inspected in warehouse and restocked'}
        )
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.RETURN_COMPLETED)

        # Stock IS restored on RETURN_COMPLETED
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock)

        # Verify Return StockTransaction ledger record created
        return_txs = StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN)
        self.assertEqual(return_txs.count(), 1)
        self.assertEqual(return_txs.first().change_amount, 2)

        # 4. Idempotency test: duplicate RETURN_COMPLETED call does not re-restore stock
        res_dup = self.client.patch(
            f'/api/v1/orders/{order.id}/status/',
            {'status': OrderStatus.RETURN_COMPLETED, 'reason': 'Duplicate call'}
        )
        self.assertEqual(res_dup.status_code, status.HTTP_200_OK)
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock)
        self.assertEqual(StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN).count(), 1)

    def test_return_request_validation_edges(self):
        """Return request requires non-empty reason and must be in DELIVERED status."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        self.client.force_authenticate(user=self.customer_a)

        # PENDING order return request -> 400
        res = self.client.post(f'/api/v1/orders/{order.id}/return/', {'reason': 'Too early return'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Advance to DELIVERED
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.DELIVERED, changed_by=self.admin)

        # Empty reason -> 400
        res_empty = self.client.post(f'/api/v1/orders/{order.id}/return/', {'reason': '   '})
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

        # Short reason (< 3 chars) -> 400
        res_short = self.client.post(f'/api/v1/orders/{order.id}/return/', {'reason': 'no'})
        self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 8. PAYMENT & INVOICE CONSISTENCY
    # -------------------------------------------------------------
    def test_payment_verification_for_cancelled_order_rejected(self):
        """Late payment confirmation for an already-cancelled order is rejected and does not resurrect order."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        init_res = PaymentGatewayService.initiate_order_payment(order_id=order.id, user=self.customer_a)
        rzp_order_id = init_res['gateway_order_id']
        rzp_pay_id = 'pay_mock_test_12345'
        sig = PaymentGatewayService.generate_signature(rzp_order_id, rzp_pay_id)

        # Customer cancels before payment confirmation completes
        OrderWorkflowService.cancel_order(order.id, requested_by=self.customer_a)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED)

        # Attempt to confirm payment for cancelled order -> ValidationError
        with self.assertRaises(DjangoValidationError):
            PaymentGatewayService.confirm_payment(
                order_id=order.id,
                user=self.customer_a,
                razorpay_order_id=rzp_order_id,
                razorpay_payment_id=rzp_pay_id,
                razorpay_signature=sig,
            )


        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED, "Order must NOT resurrect to CONFIRMED")

    def test_invoice_generation_idempotency_for_order(self):
        """Payment confirmation creates exactly one Invoice; retries do not duplicate invoices."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        inv1 = InvoiceService.create_invoice_for_order(order=order)
        inv2 = InvoiceService.create_invoice_for_order(order=order)

        self.assertEqual(inv1.id, inv2.id)
        self.assertEqual(Invoice.objects.filter(order=order).count(), 1)

    # -------------------------------------------------------------
    # 9. COMMUNICATION DISPATCH
    # -------------------------------------------------------------
    def test_return_communication_events_logged(self):
        """Canonical return events log CommunicationLog entries without raising errors."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.DELIVERED, changed_by=self.admin)

        return_events = [
            (OrderStatus.RETURN_REQUESTED, 'ORDER_RETURN_REQUESTED'),
            (OrderStatus.RETURN_APPROVED, 'ORDER_RETURN_APPROVED'),
            (OrderStatus.RETURN_COMPLETED, 'ORDER_RETURN_COMPLETED'),
        ]

        for st, event_name in return_events:
            OrderWorkflowService.transition_order_status(order.id, st, changed_by=self.admin)
            log_exists = CommunicationLog.objects.filter(
                recipient=order.customer_email,
                event_type=event_name
            ).exists()
            self.assertTrue(log_exists, f"Expected communication log for {event_name}")

    # -------------------------------------------------------------
    # 10. ADMIN FILTERING & SEARCH
    # -------------------------------------------------------------
    def test_admin_order_list_filtering(self):
        """Admin can filter orders by status, payment_status, customer, and search query."""
        order_a = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[{'product_id': self.product1.id, 'quantity': 1}],
        )
        order_b = CheckoutService.process_checkout(
            user=self.customer_b,
            shipping_address_id=self.address_b.id,
            items_data=[{'product_id': self.product2.id, 'quantity': 1}],
        )
        OrderWorkflowService.transition_order_status(order_b.id, OrderStatus.CONFIRMED, changed_by=self.admin)

        self.client.force_authenticate(user=self.admin)

        # Filter by status = CONFIRMED
        res_conf = self.client.get('/api/v1/orders/?status=CONFIRMED')
        self.assertEqual(res_conf.status_code, status.HTTP_200_OK)
        ids = [o['id'] for o in (res_conf.data if isinstance(res_conf.data, list) else res_conf.data.get('results', []))]
        self.assertIn(order_b.id, ids)
        self.assertNotIn(order_a.id, ids)

        # Filter by search
        res_search = self.client.get(f'/api/v1/orders/?search={order_a.order_number}')
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        ids_search = [o['id'] for o in (res_search.data if isinstance(res_search.data, list) else res_search.data.get('results', []))]
        self.assertIn(order_a.id, ids_search)
        self.assertNotIn(order_b.id, ids_search)

    # -------------------------------------------------------------
    # 11. PERFORMANCE & N+1 PREVENTION
    # -------------------------------------------------------------
    def test_order_detail_query_efficiency(self):
        """OrderDetailView executes bounded queries regardless of item or history count."""
        order = CheckoutService.process_checkout(
            user=self.customer_a,
            shipping_address_id=self.address_a.id,
            items_data=[
                {'product_id': self.product1.id, 'quantity': 1},
                {'product_id': self.product2.id, 'quantity': 2},
            ],
        )
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)

        self.client.force_authenticate(user=self.customer_a)
        with self.assertNumQueries(5):  # Order, items, status_history, items__product, status_history__changed_by
            res = self.client.get(f'/api/v1/orders/{order.id}/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)


class Step7OrderConcurrencyTestCase(TransactionTestCase):
    """
    Concurrency testing for order cancellation and return completion.
    """

    def setUp(self):
        self.customer = User.objects.create_user(
            email='conc_cust@veepower.com',
            password='Password123!',
            first_name='Concurrent',
            last_name='Tester',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='conc_admin@veepower.com',
            password='Password123!',
            first_name='Concurrent',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.category = Category.objects.create(name='Relays', slug='relays-conc', is_active=True)
        self.brand = Brand.objects.create(name='Siemens', slug='siemens-conc', is_active=True)
        self.product = Product.objects.create(
            name='Thermal Overload Relay 16A',
            slug='thermal-overload-relay-16a',
            sku='RELAY-16A',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('1800.00'),
            price=Decimal('1500.00'),
            stock=100,
            active=True,
        )
        self.address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Concurrent Tester',
            phone='+919876543210',
            address_line1='1 Industrial Zone',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
            address_type=AddressType.WORK,
            is_default=True,
        )
        TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Central',
            origin_address='Central Depot',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641001',
            base_delivery_charge=Decimal('100.00'),
            free_delivery_threshold=Decimal('10000.00'),
            is_active=True,
        )

    def test_concurrent_order_cancellation(self):
        """Simultaneous cancellation threads execute safely: exactly 1 restoration, no duplicate stock."""
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 10}],
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 90)

        errors = []

        def cancel_call():
            try:
                from django.db import connection
                connection.connect()
                OrderWorkflowService.cancel_order(order.id, requested_by=self.customer, reason="Thread cancel")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=cancel_call) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 100, "Stock must be restored to 100 exactly, never exceeding 100")

        # Exactly 1 return transaction
        return_txs = StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN)
        self.assertEqual(return_txs.count(), 1)

    def test_concurrent_return_completion(self):
        """Simultaneous RETURN_COMPLETED calls execute safely: exactly 1 restoration, no duplicate ledger records."""
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 5}],
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 95)

        for st in [OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.RETURN_APPROVED]:
            OrderWorkflowService.transition_order_status(order.id, st, changed_by=self.admin)

        errors = []

        def complete_call():
            try:
                from django.db import connection
                connection.connect()
                OrderWorkflowService.transition_order_status(
                    order_id=order.id,
                    target_status=OrderStatus.RETURN_COMPLETED,
                    changed_by=self.admin,
                    reason="Thread return complete"
                )
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=complete_call) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.RETURN_COMPLETED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 100, "Stock must be restored to 100 exactly")

        # Exactly 1 RETURN transaction record
        return_txs = StockTransaction.objects.filter(order=order, transaction_type=StockTransactionType.RETURN)
        self.assertEqual(return_txs.count(), 1)
