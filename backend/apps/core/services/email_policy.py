"""
Centralized Email Notification Policy for Vee Power Electricals.

Enforces the minimal customer email policy:
- ESSENTIAL: Immediate delivery for customer-critical milestones.
- CONDITIONAL: Delivered only if new, actionable customer information is present.
- SUPPRESSED: Routine internal operational states (e.g. warehouse packing) and redundant duplicate confirmations are blocked.
"""
import logging
from enum import Enum
from typing import Tuple, Optional, Dict, Any

logger = logging.getLogger('apps.core.email_policy')


class EmailPolicyClassification(str, Enum):
    ESSENTIAL = 'ESSENTIAL'
    CONDITIONAL = 'CONDITIONAL'
    SUPPRESSED = 'SUPPRESSED'


class EmailNotificationPolicy:
    """
    Authoritative decision engine for customer transactional email delivery.
    Enforced in Django backend across all APIs, workflows, and management commands.
    """

    CLASSIFICATIONS: Dict[str, EmailPolicyClassification] = {
        # -------------------------------------------------------------
        # Essential Order Lifecycle (Always delivered to customer)
        # -------------------------------------------------------------
        'ORDER_PLACED': EmailPolicyClassification.ESSENTIAL,
        'ORDER_SHIPPED': EmailPolicyClassification.ESSENTIAL,
        'ORDER_DELIVERED': EmailPolicyClassification.ESSENTIAL,
        'ORDER_CANCELLED': EmailPolicyClassification.ESSENTIAL,
        'ORDER_RETURN_REQUESTED': EmailPolicyClassification.ESSENTIAL,
        'ORDER_RETURN_COMPLETED': EmailPolicyClassification.ESSENTIAL,

        # -------------------------------------------------------------
        # Conditional Order Notifications
        # -------------------------------------------------------------
        'ORDER_CONFIRMED': EmailPolicyClassification.CONDITIONAL,
        'ORDER_RETURN_APPROVED': EmailPolicyClassification.CONDITIONAL,
        'ORDER_RETURN_REJECTED': EmailPolicyClassification.CONDITIONAL,

        # -------------------------------------------------------------
        # Suppressed Routine Operational States (Never sent to customer)
        # -------------------------------------------------------------
        'ORDER_PACKED': EmailPolicyClassification.SUPPRESSED,

        # -------------------------------------------------------------
        # Preserved Statutory & Payment Notifications
        # -------------------------------------------------------------
        'PAYMENT_CONFIRMED': EmailPolicyClassification.ESSENTIAL,
        'PAYMENT_FAILED': EmailPolicyClassification.ESSENTIAL,
        'INVOICE_GENERATED': EmailPolicyClassification.ESSENTIAL,

        # -------------------------------------------------------------
        # Preserved Identity, Authentication & Security
        # -------------------------------------------------------------
        'CUSTOMER_REGISTRATION': EmailPolicyClassification.ESSENTIAL,
        'EMAIL_VERIFICATION': EmailPolicyClassification.ESSENTIAL,
        'EMAIL_VERIFIED_SUCCESS': EmailPolicyClassification.ESSENTIAL,
        'PASSWORD_RESET': EmailPolicyClassification.ESSENTIAL,
        'PASSWORD_RESET_SUCCESS': EmailPolicyClassification.ESSENTIAL,
        'GOOGLE_LINKED': EmailPolicyClassification.ESSENTIAL,
        'ACCOUNT_SECURITY_ALERT': EmailPolicyClassification.ESSENTIAL,

        # -------------------------------------------------------------
        # Preserved Commercial Quotations & Customer Support
        # -------------------------------------------------------------
        'QUOTATION_UPDATE': EmailPolicyClassification.ESSENTIAL,
        'INQUIRY_ACKNOWLEDGED': EmailPolicyClassification.ESSENTIAL,
    }

    @classmethod
    def get_classification(cls, event_type: str) -> EmailPolicyClassification:
        return cls.CLASSIFICATIONS.get(event_type, EmailPolicyClassification.ESSENTIAL)

    @classmethod
    def evaluate(
        cls,
        event_type: str,
        context: Optional[Dict[str, Any]] = None,
        order: Optional[Any] = None,
    ) -> Tuple[bool, str, str]:
        """
        Evaluate whether an email should be sent under the minimal customer email policy.
        Returns: (should_send: bool, classification: str, reason: str)
        """
        context = context or {}
        classification = cls.get_classification(event_type)

        # 1. Check unchanged status guard
        prev_status = context.get('previous_status')
        new_status = context.get('new_status')
        if prev_status and new_status and prev_status == new_status:
            return False, EmailPolicyClassification.SUPPRESSED.value, (
                f"Order status is unchanged ('{new_status}'); redundant email suppressed."
            )

        # 2. Hard Suppressed Events (Internal warehouse states)
        if classification == EmailPolicyClassification.SUPPRESSED:
            return False, classification.value, (
                f"Event '{event_type}' is suppressed by customer email policy. "
                "Routine operational status remains visible on order tracking portal."
            )

        # 3. Conditional Evaluations
        if classification == EmailPolicyClassification.CONDITIONAL:
            if event_type == 'ORDER_CONFIRMED':
                return cls._evaluate_order_confirmed(order=order, context=context)

            # Other conditionals pass if criteria met
            return True, classification.value, f"Conditional criteria for '{event_type}' satisfied."

        # 4. Essential Events
        return True, classification.value, f"Essential milestone '{event_type}' permitted for immediate delivery."

    @classmethod
    def _evaluate_order_confirmed(
        cls,
        order: Optional[Any] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str, str]:
        """
        Conditionally evaluate ORDER_CONFIRMED:
        - If ORDER_PLACED was already sent for this order: SUPPRESS (duplicate confirmation).
        - If ORDER_PLACED was not sent (e.g. manual/draft order creation): ALLOW.
        """
        context = context or {}
        order_id = getattr(order, 'id', None) or context.get('order_id')
        order_number = getattr(order, 'order_number', None) or context.get('order_number')

        if not order_id and order_number:
            try:
                from apps.orders.models import Order
                ord_obj = Order.objects.filter(order_number=order_number).first()
                if ord_obj:
                    order_id = ord_obj.id
            except Exception:
                pass

        if order_id:
            from apps.core.models import CommunicationLog, CommunicationStatus
            # Check if ORDER_PLACED was already recorded as queued, sending, or sent
            has_placed = CommunicationLog.objects.filter(
                event_type='ORDER_PLACED',
                idempotency_key=f"ORDER_PLACED:{order_id}",
                status__in=[
                    CommunicationStatus.SENT,
                    CommunicationStatus.SENDING,
                    CommunicationStatus.QUEUED,
                ]
            ).exists()

            if has_placed:
                return False, EmailPolicyClassification.CONDITIONAL.value, (
                    f"Order #{order_number or order_id} already received initial order placed notification. "
                    "Redundant ORDER_CONFIRMED email suppressed."
                )

        return True, EmailPolicyClassification.CONDITIONAL.value, (
            f"Initial confirmation permitted for Order #{order_number or order_id} "
            "(ORDER_PLACED was not previously dispatched)."
        )
