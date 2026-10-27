from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.products.models import Category, Brand, Product
from apps.users.models import UserRole, CustomerAddress
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, Cart, CartItem
from apps.orders.services.cart_service import CartService

User = get_user_model()


class CartUserIsolationTestCase(APITestCase):
    """
    Authoritative test suite verifying strict per-user store isolation,
    cross-account security, IDOR defenses, and backend cart ownership.
    """

    @classmethod
    def setUpTestData(cls):
        # 1. Create Category and Brand
        cls.category = Category.objects.create(
            name="Switches & Sockets",
            slug="switches-sockets"
        )
        cls.brand = Brand.objects.create(
            name="Anchor",
            slug="anchor"
        )

        # 2. Create Products
        cls.product_x = Product.objects.create(
            name="Anchor Roma 6A Switch",
            slug="anchor-roma-6a-switch",
            sku="ANCHOR-ROMA-6A",
            category=cls.category,
            brand=cls.brand,
            mrp=Decimal("150.00"),
            price=Decimal("100.00"),
            stock=25,
            active=True
        )
        cls.product_y = Product.objects.create(
            name="Anchor Roma 16A Socket",
            slug="anchor-roma-16a-socket",
            sku="ANCHOR-ROMA-16A",
            category=cls.category,
            brand=cls.brand,
            mrp=Decimal("300.00"),
            price=Decimal("250.00"),
            stock=20,
            active=True
        )

        # 3. Create Users
        cls.user_a = User.objects.create_user(
            email="user_a_iso@veepower.com",
            username="user_a_iso",
            password="Password123!",
            first_name="User",
            last_name="A",
            role=UserRole.CUSTOMER
        )
        cls.user_b = User.objects.create_user(
            email="user_b_iso@veepower.com",
            username="user_b_iso",
            password="Password123!",
            first_name="User",
            last_name="B",
            role=UserRole.CUSTOMER
        )
        cls.admin_user = User.objects.create_user(
            email="admin_iso@veepower.com",
            username="admin_iso",
            password="Password123!",
            first_name="Admin",
            last_name="User",
            role=UserRole.ADMIN,
            is_staff=True
        )

        # 4. Create Addresses for Users
        cls.address_a = CustomerAddress.objects.create(
            user=cls.user_a,
            recipient_name="User A Delivery",
            phone="9876543210",
            address_line1="123 Alpha St",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641001",
            address_type="home",
            is_default=True
        )
        cls.address_b = CustomerAddress.objects.create(
            user=cls.user_b,
            recipient_name="User B Delivery",
            phone="9123456780",
            address_line1="456 Beta Ave",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641002",
            address_type="home",
            is_default=True
        )

    def get_auth_client(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        return self.client

    def test_01_user_a_adds_product_x_to_cart(self):
        """User A adds Product X to their cart."""
        client = self.get_auth_client(self.user_a)
        res = client.post("/api/v1/cart/items/", {
            "product_id": self.product_x.id,
            "quantity": 2
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_items"], 2)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["product"]["id"], self.product_x.id)
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("200.00"))

        # Verify database record is linked to User A
        cart = Cart.objects.get(user=self.user_a, is_active=True)
        self.assertEqual(cart.items.count(), 1)
        item = cart.items.first()
        self.assertEqual(item.product, self.product_x)
        self.assertEqual(item.quantity, 2)

    def test_02_user_b_sees_only_own_empty_cart(self):
        """User B logs in and sees only User B's empty cart, never User A's items."""
        # Ensure User A has items in DB
        CartService.add_item(CartService.get_or_create_cart(user=self.user_a), self.product_x.id, 2)

        client = self.get_auth_client(self.user_b)
        res = client.get("/api/v1/cart/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_items"], 0)
        self.assertEqual(len(res.data["items"]), 0)
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("0.00"))

    def test_03_user_b_adds_product_y_and_cannot_see_product_x(self):
        """User B adds Product Y and cannot see Product X in their cart."""
        # User A has Product X
        CartService.add_item(CartService.get_or_create_cart(user=self.user_a), self.product_x.id, 2)

        # User B adds Product Y
        client = self.get_auth_client(self.user_b)
        res = client.post("/api/v1/cart/items/", {
            "product_id": self.product_y.id,
            "quantity": 3
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_items"], 3)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["product"]["id"], self.product_y.id)
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("750.00"))

        # Assert User B cart in database does not contain Product X
        cart_b = Cart.objects.get(user=self.user_b, is_active=True)
        self.assertFalse(cart_b.items.filter(product=self.product_x).exists())

    def test_04_user_a_logs_back_in_and_sees_original_cart(self):
        """User A logs back in and sees their original cart untouched by User B's activities."""
        # User A has Product X; User B has Product Y
        CartService.add_item(CartService.get_or_create_cart(user=self.user_a), self.product_x.id, 2)
        CartService.add_item(CartService.get_or_create_cart(user=self.user_b), self.product_y.id, 3)

        client = self.get_auth_client(self.user_a)
        res = client.get("/api/v1/cart/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_items"], 2)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["product"]["id"], self.product_x.id)
        self.assertEqual(Decimal(res.data["subtotal"]), Decimal("200.00"))

    def test_05_unauthenticated_request_rejected(self):
        """Anonymous requests without credentials or guest session are rejected."""
        self.client.credentials()  # clear auth
        res = self.client.get("/api/v1/cart/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_08_direct_api_cannot_retrieve_another_users_cart(self):
        """Direct API requests strictly derive identity from request.user, ignoring any injected parameters."""
        CartService.add_item(CartService.get_or_create_cart(user=self.user_a), self.product_x.id, 1)

        client = self.get_auth_client(self.user_b)
        # Attempt to spoof user A by passing user_id or cart_id
        res = client.get(f"/api/v1/cart/?user_id={self.user_a.id}&user={self.user_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Returns User B's cart (empty), not User A's cart
        self.assertEqual(res.data["total_items"], 0)

    def test_09_user_b_cannot_modify_or_delete_user_a_cart_items(self):
        """User B cannot modify or delete User A's cart items using guessed IDs (IDOR protection)."""
        cart_a = CartService.get_or_create_cart(user=self.user_a)
        item_a = CartService.add_item(cart_a, self.product_x.id, 2)

        client = self.get_auth_client(self.user_b)
        # User B attempts to change quantity of User A's cart item
        patch_res = client.patch(f"/api/v1/cart/items/{item_a.id}/", {"quantity": 99})
        self.assertEqual(patch_res.status_code, status.HTTP_404_NOT_FOUND)

        # User A's item remains unchanged in DB
        item_a.refresh_from_db()
        self.assertEqual(item_a.quantity, 2)

        # User B attempts to delete User A's cart item
        del_res = client.delete(f"/api/v1/cart/items/{item_a.id}/")
        self.assertEqual(del_res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(id=item_a.id).exists())

    def test_10_user_b_cannot_access_user_a_orders_or_addresses(self):
        """User B cannot access or manipulate User A's orders or saved addresses."""
        # Create Order for User A
        order_a = Order.objects.create(
            order_number="ORD-TEST-ISO-A1",
            user=self.user_a,
            customer_name="User A",
            customer_email=self.user_a.email,
            customer_phone="9876543210",
            shipping_address={"city": "Coimbatore"},
            subtotal=Decimal("200.00"),
            taxable_amount=Decimal("200.00"),
            total_amount=Decimal("236.00"),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING
        )

        client = self.get_auth_client(self.user_b)

        # 1. Order Detail IDOR defense
        res_order = client.get(f"/api/v1/orders/{order_a.id}/")
        self.assertEqual(res_order.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Order Cancel IDOR defense
        res_cancel = client.post(f"/api/v1/orders/{order_a.id}/cancel/", {"reason": "Malicious cancel"})
        self.assertEqual(res_cancel.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Address Detail IDOR defense
        res_addr = client.get(f"/api/v1/addresses/{self.address_a.id}/")
        self.assertEqual(res_addr.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Address Default IDOR defense
        res_addr_def = client.post(f"/api/v1/addresses/{self.address_a.id}/set-default/")
        self.assertEqual(res_addr_def.status_code, status.HTTP_404_NOT_FOUND)

    def test_11_guest_cart_remains_separate_and_can_be_merged(self):
        """Guest cart behavior remains separate and safely mergeable upon login."""
        self.client.credentials()  # unauthenticated
        guest_session_id = "guest_session_abc123"

        # Guest adds Product X (qty 1)
        res = self.client.post(
            "/api/v1/cart/items/",
            {"product_id": self.product_x.id, "quantity": 1},
            HTTP_X_GUEST_SESSION_ID=guest_session_id
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_items"], 1)

        # User A's cart is unaffected
        cart_a = CartService.get_or_create_cart(user=self.user_a)
        self.assertEqual(cart_a.items.count(), 0)

        # User A logs in and merges guest cart
        client = self.get_auth_client(self.user_a)
        merge_res = client.post("/api/v1/cart/merge/", {"guest_session_id": guest_session_id})
        self.assertEqual(merge_res.status_code, status.HTTP_200_OK)
        self.assertEqual(merge_res.data["total_items"], 1)

        # User B cannot merge another user's cart or already consumed guest cart
        client_b = self.get_auth_client(self.user_b)
        res_b_merge = client_b.post("/api/v1/cart/merge/", {"guest_session_id": guest_session_id})
        self.assertEqual(res_b_merge.status_code, status.HTTP_200_OK)
        # Guest cart was deactivated, User B gets 0 items
        self.assertEqual(res_b_merge.data["total_items"], 0)

    def test_13_simultaneous_requests_do_not_create_duplicate_active_carts(self):
        """Simultaneous cart initialization enforces exactly one active cart per user."""
        cart1 = CartService.get_or_create_cart(user=self.user_a)
        cart2 = CartService.get_or_create_cart(user=self.user_a)
        self.assertEqual(cart1.id, cart2.id)
        self.assertEqual(Cart.objects.filter(user=self.user_a, is_active=True).count(), 1)

    def test_14_checkout_cannot_consume_another_user_cart_or_address(self):
        """Checkout verifies address ownership and isolates orders to request.user."""
        client = self.get_auth_client(self.user_b)
        # User B attempts to checkout with User A's address
        res = client.post("/api/v1/orders/checkout/", {
            "shipping_address_id": self.address_a.id,
            "items": [{"product_id": self.product_y.id, "quantity": 1}],
            "payment_method": "COD"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid shipping address", res.data["detail"])

    def test_15_cart_cleared_upon_successful_checkout(self):
        """When an authenticated user completes checkout, their persistent cart is automatically cleared."""
        cart_a = CartService.get_or_create_cart(user=self.user_a)
        CartService.add_item(cart_a, self.product_x.id, 2)
        self.assertEqual(cart_a.items.count(), 1)

        client = self.get_auth_client(self.user_a)
        res = client.post("/api/v1/orders/checkout/", {
            "shipping_address_id": self.address_a.id,
            "items": [{"product_id": self.product_x.id, "quantity": 2}],
            "payment_method": "COD"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Cart is now empty in DB
        cart_a.refresh_from_db()
        self.assertEqual(cart_a.items.count(), 0)

    def test_16_admin_permissions_remain_correct(self):
        """Admin permissions protect administrative management from regular customers."""
        client_cust = self.get_auth_client(self.user_a)
        res_admin = client_cust.get("/api/v1/orders/operational-summary/")
        self.assertEqual(res_admin.status_code, status.HTTP_403_FORBIDDEN)

        client_admin = self.get_auth_client(self.admin_user)
        res_admin_ok = client_admin.get("/api/v1/orders/operational-summary/")
        self.assertEqual(res_admin_ok.status_code, status.HTTP_200_OK)
