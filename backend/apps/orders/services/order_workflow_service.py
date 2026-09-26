from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from apps.orders.models import Order, OrderStatus, OrderStatusHistory
from apps.inventory.services.inventory_service import InventoryService


class OrderWorkflowService:
    """
    Domain service enforcing the canonical 10-state finite state machine (FSM)
    and fulfillment lifecycle for Vee Power Electricals orders.
    """

    # Canonical 10-state transition rules per backend/docs/order-state-machine.md
    VALID_TRANSITIONS = {
        OrderStatus.PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        OrderStatus.CONFIRMED: [OrderStatus.PACKED, OrderStatus.CANCELLED],
        OrderStatus.PACKED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        OrderStatus.SHIPPED: [OrderStatus.DELIVERED],
        OrderStatus.DELIVERED: [OrderStatus.RETURN_REQUESTED],
        OrderStatus.RETURN_REQUESTED: [OrderStatus.RETURN_APPROVED, OrderStatus.RETURN_REJECTED],
        OrderStatus.RETURN_APPROVED: [OrderStatus.RETURN_COMPLETED],
        OrderStatus.CANCELLED: [],
        OrderStatus.RETURN_REJECTED: [],
        OrderStatus.RETURN_COMPLETED: [],
    }

    @classmethod
    @transaction.atomic
    def transition_order_status(
        cls,
        order_id: int,
        target_status: str,
        changed_by=None,
        reason: str = '',
        tracking_number: str = None
    ) -> Order:
        """
        Transition an order to target_status, applying physical inventory effects,
        validating business constraints, and recording an immutable audit log.
        """
        order = Order.objects.select_for_update().get(pk=order_id)
        current_status = order.status

        # If identical status, treat as idempotent no-op or tracking update
        if current_status == target_status:
            if tracking_number:
                order.tracking_number = tracking_number
                order.save(update_fields=['tracking_number'])
            return order

        allowed_next = cls.VALID_TRANSITIONS.get(current_status, [])
        if target_status not in allowed_next:
            raise ValidationError(
                f"Invalid status transition from '{current_status}' to '{target_status}'. "
                f"Allowed transitions: {[s.value for s in allowed_next]}."
            )

        # Transition-specific validations
        if target_status == OrderStatus.SHIPPED:
            if tracking_number:
                order.tracking_number = tracking_number
            elif not order.tracking_number:
                # Carrier dispatch requires tracking number if not previously set
                order.tracking_number = f"AWB-{order.order_number}"

        # Apply inventory business effects
        # 1. CANCELLED: restore stock if stock was previously decremented and not yet restored
        if target_status == OrderStatus.CANCELLED:
            InventoryService.restore_order_stock(
                order=order,
                performed_by=changed_by,
                reason=f"Order #{order.order_number} cancelled: {reason or 'Order cancelled'}"
            )

        # 2. RETURN_COMPLETED: items physically received and inspected in warehouse -> restore stock
        elif target_status == OrderStatus.RETURN_COMPLETED:
            InventoryService.restore_order_stock(
                order=order,
                performed_by=changed_by,
                reason=f"Order #{order.order_number} return completed: {reason or 'Goods inspected and restocked'}"
            )

        # Update order status
        order.status = target_status
        order.save()

        # Create immutable audit log
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=current_status,
            new_status=target_status,
            changed_by=changed_by,
            reason=reason or f"Order transitioned from {current_status} to {target_status}"
        )

        # Authoritative customer communication dispatch
        from apps.core.services.communication_service import CommunicationService
        if target_status == OrderStatus.CONFIRMED:
            CommunicationService.send_order_confirmation(order=order)
        elif target_status in (
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
            OrderStatus.RETURN_REQUESTED,
            OrderStatus.RETURN_APPROVED,
            OrderStatus.RETURN_REJECTED,
            OrderStatus.RETURN_COMPLETED,
        ):
            CommunicationService.send_order_status_update(
                order=order,
                new_status=target_status,
                reason=reason or ''
            )

        return order


    @classmethod
    @transaction.atomic
    def cancel_order(cls, order_id: int, requested_by=None, reason: str = '') -> Order:
        """
        Convenience workflow to cancel an order from eligible states (PENDING, CONFIRMED, PACKED).
        """
        return cls.transition_order_status(
            order_id=order_id,
            target_status=OrderStatus.CANCELLED,
            changed_by=requested_by,
            reason=reason or "Order cancelled by customer/admin"
        )
