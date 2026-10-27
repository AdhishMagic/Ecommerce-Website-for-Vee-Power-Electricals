import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from django.db import transaction
from django.core.exceptions import ValidationError

from apps.products.models import Product
from apps.orders.models import Cart, CartItem

logger = logging.getLogger('apps.orders.cart')


class CartService:
    """
    Authoritative domain service managing persistent shopping cart lifecycle,
    strict user isolation, stock checks, and concurrency-safe mutations.
    """

    @classmethod
    @transaction.atomic
    def get_or_create_cart(cls, user=None, session_key: Optional[str] = None) -> Cart:
        """
        Retrieve or atomically instantiate an active Cart.
        Strictly scopes to request.user when authenticated, or session_key for guests.
        """
        if user and getattr(user, 'is_authenticated', False):
            cart, _ = Cart.objects.select_for_update().get_or_create(
                user=user,
                is_active=True,
                defaults={'session_key': None}
            )
            return cart

        if session_key and session_key.strip():
            cart, _ = Cart.objects.select_for_update().get_or_create(
                session_key=session_key.strip(),
                is_active=True,
                defaults={'user': None}
            )
            return cart

        raise ValidationError("Either authenticated user identity or guest session key is required.")

    @classmethod
    def get_cart(cls, user=None, session_key: Optional[str] = None) -> Optional[Cart]:
        """
        Retrieve existing active Cart without auto-creating.
        """
        if user and getattr(user, 'is_authenticated', False):
            return Cart.objects.filter(user=user, is_active=True).first()
        if session_key and session_key.strip():
            return Cart.objects.filter(session_key=session_key.strip(), is_active=True).first()
        return None

    @classmethod
    @transaction.atomic
    def add_item(cls, cart: Cart, product_id: int, quantity: int = 1) -> CartItem:
        """
        Atomically add a product to the user's cart or increment quantity.
        Validates product state, active flag, and available stock.
        """
        if quantity < 1:
            raise ValidationError("Quantity must be at least 1.")

        product = Product.objects.select_for_update().filter(id=product_id).first()
        if not product:
            raise ValidationError(f"Product with ID {product_id} was not found.")
        if not product.active:
            raise ValidationError(f"Product '{product.name}' is currently unavailable.")
        if product.stock < 1:
            raise ValidationError(f"Product '{product.name}' is currently out of stock.")

        item = CartItem.objects.select_for_update().filter(cart=cart, product=product).first()
        if item:
            new_qty = item.quantity + quantity
            if new_qty > product.stock:
                raise ValidationError(
                    f"Cannot add {quantity} more. Total in cart ({new_qty}) would exceed available stock ({product.stock})."
                )
            item.quantity = new_qty
            item.save(update_fields=['quantity', 'updated_at'])
        else:
            if quantity > product.stock:
                raise ValidationError(
                    f"Requested quantity ({quantity}) exceeds available stock ({product.stock})."
                )
            item = CartItem.objects.create(
                cart=cart,
                product=product,
                quantity=quantity
            )

        cart.save(update_fields=['updated_at'])
        return item

    @classmethod
    @transaction.atomic
    def update_item_quantity(
        cls,
        cart: Cart,
        identifier: int,
        quantity: int,
        by_product: bool = False
    ) -> Optional[CartItem]:
        """
        Update the quantity of a line item in the cart.
        Validates ownership: only items belonging to the target cart can be updated.
        If quantity <= 0, the item is removed.
        """
        qs = CartItem.objects.select_for_update().filter(cart=cart)
        if by_product:
            item = qs.filter(product_id=identifier).select_related('product').first()
        else:
            item = qs.filter(id=identifier).select_related('product').first()

        if not item:
            raise ValidationError("Item not found in your cart.")

        if quantity <= 0:
            item.delete()
            cart.save(update_fields=['updated_at'])
            return None

        product = item.product
        if quantity > product.stock:
            raise ValidationError(
                f"Requested quantity ({quantity}) exceeds available stock ({product.stock}) for '{product.name}'."
            )

        item.quantity = quantity
        item.save(update_fields=['quantity', 'updated_at'])
        cart.save(update_fields=['updated_at'])
        return item

    @classmethod
    @transaction.atomic
    def remove_item(cls, cart: Cart, identifier: int, by_product: bool = False) -> bool:
        """
        Remove a line item from the cart.
        Validates ownership: only items belonging to the target cart can be removed.
        """
        qs = CartItem.objects.select_for_update().filter(cart=cart)
        if by_product:
            item = qs.filter(product_id=identifier).first()
        else:
            item = qs.filter(id=identifier).first()

        if not item:
            raise ValidationError("Item not found in your cart.")

        item.delete()
        cart.save(update_fields=['updated_at'])
        return True

    @classmethod
    @transaction.atomic
    def clear_cart(cls, cart: Cart) -> int:
        """
        Remove all line items from the user's cart.
        """
        deleted_count, _ = CartItem.objects.filter(cart=cart).delete()
        cart.save(update_fields=['updated_at'])
        return deleted_count

    @classmethod
    @transaction.atomic
    def merge_guest_cart(cls, user, guest_session_id: str) -> Cart:
        """
        Safely merge items from an anonymous guest cart into the authenticated user's cart.
        Prevents merging cross-user authenticated carts.
        Deactivates and empties the guest cart upon completion.
        """
        if not user or not getattr(user, 'is_authenticated', False):
            raise ValidationError("Authentication required to merge guest cart into user account.")

        user_cart = cls.get_or_create_cart(user=user)

        if not guest_session_id or not guest_session_id.strip():
            return user_cart

        guest_cart = Cart.objects.select_for_update().filter(
            session_key=guest_session_id.strip(),
            is_active=True
        ).first()

        if not guest_cart:
            return user_cart

        # Strict security constraint: guest cart must NOT belong to an authenticated user
        if guest_cart.user_id and guest_cart.user_id != user.id:
            raise ValidationError("Cannot merge cart belonging to another authenticated account.")

        guest_items = list(guest_cart.items.select_related('product').all())
        for g_item in guest_items:
            product = g_item.product
            if not product.active or product.stock < 1:
                continue

            existing_item = CartItem.objects.select_for_update().filter(
                cart=user_cart,
                product=product
            ).first()

            if existing_item:
                merged_qty = min(existing_item.quantity + g_item.quantity, product.stock)
                existing_item.quantity = merged_qty
                existing_item.save(update_fields=['quantity', 'updated_at'])
            else:
                transfer_qty = min(g_item.quantity, product.stock)
                CartItem.objects.create(
                    cart=user_cart,
                    product=product,
                    quantity=transfer_qty
                )

        # Deactivate guest cart
        guest_cart.items.all().delete()
        guest_cart.is_active = False
        guest_cart.save(update_fields=['is_active', 'updated_at'])
        user_cart.save(update_fields=['updated_at'])
        return user_cart
