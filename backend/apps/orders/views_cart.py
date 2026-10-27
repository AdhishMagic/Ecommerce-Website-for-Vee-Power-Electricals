import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.orders.models import Cart
from apps.orders.services.cart_service import CartService
from apps.orders.serializers_cart import (
    CartSerializer,
    AddToCartSerializer,
    UpdateCartItemSerializer,
    MergeGuestCartSerializer,
)

logger = logging.getLogger('apps.orders.cart')


def resolve_cart_for_request(request, auto_create=True) -> Cart:
    """
    Authoritative cart resolution strictly scoped to request.user or valid guest session.
    Never trusts frontend-supplied user_id or cart_id.
    """
    user = request.user if getattr(request.user, 'is_authenticated', False) else None
    guest_session_id = request.headers.get('X-Guest-Session-Id') or request.query_params.get('guest_session_id')

    if not user and not guest_session_id:
        raise DRFValidationError(
            {"detail": "Authentication credentials were not provided and no guest session identifier was supplied."},
            code='unauthorized'
        )

    if auto_create:
        return CartService.get_or_create_cart(user=user, session_key=guest_session_id)
    else:
        cart = CartService.get_cart(user=user, session_key=guest_session_id)
        if not cart and auto_create:
            cart = CartService.get_or_create_cart(user=user, session_key=guest_session_id)
        return cart


class CartView(APIView):
    """
    GET /api/v1/cart/
    Retrieve current customer's shopping cart.
    Strictly isolated: Authenticated User A only sees User A's cart.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            if not request.user.is_authenticated and not request.headers.get('X-Guest-Session-Id') and not request.query_params.get('guest_session_id'):
                return Response(
                    {"detail": "Authentication required to access cart without a guest session."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            cart = resolve_cart_for_request(request, auto_create=True)
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class CartItemAddView(APIView):
    """
    POST /api/v1/cart/items/
    Add product line item to current user's active cart.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not request.user.is_authenticated and not request.headers.get('X-Guest-Session-Id') and not request.query_params.get('guest_session_id'):
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cart = resolve_cart_for_request(request, auto_create=True)
            CartService.add_item(
                cart=cart,
                product_id=serializer.validated_data['product_id'],
                quantity=serializer.validated_data.get('quantity', 1)
            )
            # Re-fetch fresh cart state
            cart.refresh_from_db()
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class CartItemDetailView(APIView):
    """
    PATCH /api/v1/cart/items/<int:item_id>/
    DELETE /api/v1/cart/items/<int:item_id>/
    Update or delete a line item in current user's active cart.
    Also supports by_product lookup when product_id is specified.
    Validates item ownership strictly through the parent cart.
    """
    permission_classes = [AllowAny]

    def patch(self, request, item_id=None, product_id=None):
        if not request.user.is_authenticated and not request.headers.get('X-Guest-Session-Id') and not request.query_params.get('guest_session_id'):
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cart = resolve_cart_for_request(request, auto_create=True)
            by_product = product_id is not None
            identifier = product_id if by_product else item_id

            CartService.update_item_quantity(
                cart=cart,
                identifier=identifier,
                quantity=serializer.validated_data['quantity'],
                by_product=by_product
            )
            cart.refresh_from_db()
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            status_code = status.HTTP_404_NOT_FOUND if "not found in your cart" in msg.lower() else status.HTTP_400_BAD_REQUEST
            return Response({"detail": msg}, status=status_code)

    def delete(self, request, item_id=None, product_id=None):
        if not request.user.is_authenticated and not request.headers.get('X-Guest-Session-Id') and not request.query_params.get('guest_session_id'):
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            cart = resolve_cart_for_request(request, auto_create=True)
            by_product = product_id is not None
            identifier = product_id if by_product else item_id

            CartService.remove_item(
                cart=cart,
                identifier=identifier,
                by_product=by_product
            )
            cart.refresh_from_db()
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            status_code = status.HTTP_404_NOT_FOUND if "not found in your cart" in msg.lower() else status.HTTP_400_BAD_REQUEST
            return Response({"detail": msg}, status=status_code)


class CartClearView(APIView):
    """
    DELETE /api/v1/cart/clear/
    POST /api/v1/cart/clear/
    Clear all items in the current user's active cart.
    """
    permission_classes = [AllowAny]

    def _clear(self, request):
        if not request.user.is_authenticated and not request.headers.get('X-Guest-Session-Id') and not request.query_params.get('guest_session_id'):
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            cart = resolve_cart_for_request(request, auto_create=True)
            CartService.clear_cart(cart)
            cart.refresh_from_db()
            return Response(
                {
                    "detail": "Cart cleared successfully.",
                    "cart": CartSerializer(cart).data
                },
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        return self._clear(request)

    def post(self, request):
        return self._clear(request)


class CartMergeView(APIView):
    """
    POST /api/v1/cart/merge/
    Merge guest cart items into authenticated user's cart on login.
    Strictly isolated: Cannot merge another user's cart.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MergeGuestCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cart = CartService.merge_guest_cart(
                user=request.user,
                guest_session_id=serializer.validated_data['guest_session_id']
            )
            cart.refresh_from_db()
            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
