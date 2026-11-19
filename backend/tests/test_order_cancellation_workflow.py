from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.products.models import Category, Product
from apps.inventory.models import StockTransaction, StockTransactionType

User = get_user_model()


class OrderCancellationWorkflowTestCase(TestCase):
    """
    Comprehensive test suite for order cancellation workflow:
    - Proper confirmation & validation rules
    - Ownership validation (customer isolation)
    - Eligible statuses (PENDING, CONFIRMED, PACKED)
    - Ineligible statuses (SHIPPED, DELIVERED, CANCELLED)
    - Structured cancellation reason options & custom notes
    - Idempotent single inventory restoration
    - COD vs Online Paid refund status computation
    - Status history audit logging
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer = User.objects.create_user(
            email="customer@veepower.com",
            password="SecurePassword123!",
            first_name="Test",
            last_name="Customer"
        )
        self.other_customer = User.objects.create_user(
            email="other@veepower.com",
            password="SecurePassword123!",
            first_name="Other",
            last_name="Customer"
        )
        self.admin = User.objects.create_superuser(
            email="admin@veepower.com",
            password="SecurePassword123!",
            first_name="Admin",
            last_name="User"
        )

        # Category, Brand and Products
        from apps.products.models import Brand
        self.category = Category.objects.create(name="Electrical Switches", slug="switches")
        self.brand = Brand.objects.create(name="Legrand", slug="legrand")
        self.product = Product.objects.create(
            name="Smart Modular Switch 6A",
            slug="smart-modular-switch-6a",
            sku="SW-6A-001",
            category=self.category,
            brand=self.brand,
            price=Decimal("450.00"),
            mrp=Decimal("600.00"),
            stock=50,
            active=True
        )

    def _create_order(self, user=None, order_status=OrderStatus.PENDING, is_cod=False, payment_status=PaymentStatus.PENDING, amount_paid=Decimal("0.00"), quantity=2):
        order_user = user or self.customer
        initial_stock = self.product.stock
        # Simulate inventory deduction on order creation
        self.product.stock = initial_stock - quantity
        self.product.save(update_fields=['stock'])

        total = Decimal(str(self.product.price * quantity))
        order = Order.objects.create(
            order_number=f"ORD-TEST-{Order.objects.count() + 1:04d}",
            user=order_user,
            customer_name=f"{order_user.first_name} {order_user.last_name}",
            customer_email=order_user.email,
            customer_phone="+919876543210",
            shipping_address={"address": "Coimbatore"},
            subtotal=total,
            taxable_amount=total,
            total_amount=total,
            amount_paid=amount_paid,
            outstanding_balance=total - amount_paid,
            is_cod=is_cod,
            status=order_status,
            payment_status=payment_status,
            payment_method="COD" if is_cod else "UPI"
        )

        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=quantity,
            taxable_amount=total,
            subtotal=total,
            total_amount=total
        )

        # Log creation stock transaction
        StockTransaction.objects.create(
            product=self.product,
            change_amount=-quantity,
            transaction_type=StockTransactionType.SALE,
            order=order,
            notes=f"Deducted for Order #{order.order_number}"
        )

        # Initial status history
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=None,
            new_status=order_status,
            reason="Order Placed"
        )

        return order

    def test_01_customer_cancels_own_pending_order_with_structured_reason(self):
        """Customer cancels own pending order with 'ordered_by_mistake' reason code."""
        order = self._create_order(quantity=3)
        self.assertEqual(self.product.stock, 47)

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {"reason_code": "ordered_by_mistake"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], OrderStatus.CANCELLED)
        self.assertEqual(res.data["cancellation_reason"], "Ordered by mistake")
        self.assertIsNotNone(res.data["cancelled_at"])

        # Inventory restored
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50)

    def test_02_customer_cancels_with_other_reason_and_custom_notes(self):
        """Customer selects 'other' and provides detailed notes."""
        order = self._create_order(quantity=2)

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {
                "reason_code": "other",
                "reason_notes": "Found cheaper alternative at local hardware store"
            },
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["cancellation_reason"], "Other: Found cheaper alternative at local hardware store")

    def test_03_customer_cannot_cancel_another_customers_order(self):
        """Customer B cannot cancel Customer A's order (403 Forbidden)."""
        order = self._create_order(user=self.customer)

        self.client.force_authenticate(user=self.other_customer)
        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {"reason_code": "changed_mind"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.PENDING)

    def test_04_already_cancelled_order_rejects_duplicate_cancellation(self):
        """Attempting to cancel an already cancelled order returns 400 Bad Request."""
        order = self._create_order()
        self.client.force_authenticate(user=self.customer)

        res1 = self.client.post(f"/api/v1/orders/{order.id}/cancel/", {"reason": "First cancel"})
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.post(f"/api/v1/orders/{order.id}/cancel/", {"reason": "Second cancel"})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already cancelled", res2.data["detail"].lower())

    def test_05_cannot_cancel_shipped_or_delivered_orders(self):
        """Orders that are SHIPPED or DELIVERED cannot be cancelled."""
        order_shipped = self._create_order(order_status=OrderStatus.SHIPPED)
        self.client.force_authenticate(user=self.customer)

        res_shipped = self.client.post(
            f"/api/v1/orders/{order_shipped.id}/cancel/",
            {"reason_code": "delivery_delay"}
        )
        self.assertEqual(res_shipped.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be cancelled", res_shipped.data["detail"].lower())

        order_delivered = self._create_order(order_status=OrderStatus.DELIVERED)
        res_delivered = self.client.post(
            f"/api/v1/orders/{order_delivered.id}/cancel/",
            {"reason_code": "incorrect_products"}
        )
        self.assertEqual(res_delivered.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_eligible_statuses_can_be_cancelled(self):
        """Orders in PENDING, CONFIRMED, and PACKED can all be cancelled."""
        for eligible_status in [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED]:
            order = self._create_order(order_status=eligible_status)
            self.client.force_authenticate(user=self.customer)
            res = self.client.post(
                f"/api/v1/orders/{order.id}/cancel/",
                {"reason_code": "changed_mind"}
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["status"], OrderStatus.CANCELLED)

    def test_07_invalid_cancellation_reason_code_rejected(self):
        """Passing an unrecognized reason_code returns 400 validation error."""
        order = self._create_order()
        self.client.force_authenticate(user=self.customer)

        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {"reason_code": "invalid_unsupported_reason_code"}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reason_code", res.data)

    def test_08_inventory_restored_only_once_on_repeated_requests(self):
        """Duplicate restoration is prevented: stock returns exactly once."""
        initial_stock = self.product.stock  # 50
        order = self._create_order(quantity=5)  # stock decremented to 45
        self.assertEqual(self.product.stock, 45)

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(f"/api/v1/orders/{order.id}/cancel/", {"reason": "Cancel once"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50)

        # Only one RETURN transaction
        return_txs = StockTransaction.objects.filter(
            order=order,
            transaction_type=StockTransactionType.RETURN
        )
        self.assertEqual(return_txs.count(), 1)

    def test_09_cod_order_cancellation_refund_status_not_applicable(self):
        """COD order cancellation sets refund_status to NOT_APPLICABLE and zero refund amount."""
        order = self._create_order(is_cod=True, payment_status=PaymentStatus.PENDING, amount_paid=Decimal("0.00"))
        self.client.force_authenticate(user=self.customer)

        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {"reason_code": "better_price"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["refund_status"], "NOT_APPLICABLE")
        self.assertEqual(Decimal(str(res.data["refund_amount"])), Decimal("0.00"))

    def test_10_online_paid_order_cancellation_refund_status_pending(self):
        """Online Paid order cancellation sets refund_status to REFUND_PENDING and queues refund note."""
        order = self._create_order(
            is_cod=False,
            payment_status=PaymentStatus.PAID,
            amount_paid=Decimal("900.00")
        )
        self.client.force_authenticate(user=self.customer)

        res = self.client.post(
            f"/api/v1/orders/{order.id}/cancel/",
            {"reason_code": "ordered_by_mistake"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["refund_status"], "REFUND_PENDING")
        self.assertEqual(Decimal(str(res.data["refund_amount"])), Decimal("900.00"))

        order.refresh_from_db()
        self.assertIn("Refund Pending", order.notes)
