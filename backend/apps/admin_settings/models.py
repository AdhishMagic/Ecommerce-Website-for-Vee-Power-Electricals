"""
Administrative settings persistence, session governance, and system diagnostics.

Storage policy
--------------
This app deliberately owns **only** concepts that had no authoritative home in
the existing architecture:

* :class:`NotificationSettings` — the outbound customer-communication policy.

Everything else the Admin Settings module exposes keeps its existing home and is
read/written through the existing serializers rather than being duplicated here:

* Company / store / currency configuration -> ``commercial_config.CompanyStoreConfiguration``
  (``GET|PUT|PATCH /api/v1/config/store/``).
* Administrator profile -> ``users.User`` (``GET|PATCH /api/v1/auth/me/``).
* Configuration audit trail -> ``core.AdminConfigAuditLog``.

No secret (database password, JWT signing key, API key, environment value) is
ever stored in or returned by this app.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import TimeStampedModel


class NotificationSettings(TimeStampedModel):
    """
    System-wide outbound notification policy (single-row singleton).

    Each boolean gates a real category of email dispatched by
    ``apps.core.services.CommunicationService``. The policy is enforced at the
    dispatch layer — a disabled category is recorded in ``CommunicationLog``
    with status ``SKIPPED`` and is never transmitted. This is therefore a real
    behavioural setting, not a persisted-but-ignored toggle.

    Security-critical transactional email (password reset) is deliberately **not**
    configurable and is always delivered; see :attr:`ALWAYS_DELIVERED_EVENTS`.
    """
    email_notifications_enabled = models.BooleanField(
        default=True,
        help_text='Master switch for configurable outbound customer email.',
    )
    order_notifications = models.BooleanField(
        default=True,
        help_text='Order confirmation and fulfilment lifecycle notifications.',
    )
    payment_notifications = models.BooleanField(
        default=True,
        help_text='Payment confirmation and payment failure notifications.',
    )
    invoice_notifications = models.BooleanField(
        default=True,
        help_text='Statutory GST tax invoice issuance notifications.',
    )
    quotation_notifications = models.BooleanField(
        default=True,
        help_text='Commercial quotation create/approve/reject notifications.',
    )
    customer_notifications = models.BooleanField(
        default=True,
        help_text='Account registration welcome and inquiry acknowledgement notifications.',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text='Administrator who last changed this policy.',
    )

    #: Configurable categories, in display order.
    CATEGORY_FIELDS = (
        'order_notifications',
        'payment_notifications',
        'invoice_notifications',
        'quotation_notifications',
        'customer_notifications',
    )

    #: ``CommunicationService`` event-type prefix -> gating category.
    EVENT_PREFIX_CATEGORY = (
        ('ORDER_', 'order_notifications'),
        ('PAYMENT_', 'payment_notifications'),
        ('INVOICE_', 'invoice_notifications'),
        ('QUOTATION_', 'quotation_notifications'),
        ('CUSTOMER_', 'customer_notifications'),
        ('INQUIRY_', 'customer_notifications'),
        ('EMAIL_', 'customer_notifications'),
        ('GOOGLE_', 'customer_notifications'),
    )

    #: Events that must never be suppressed (account-security critical).
    ALWAYS_DELIVERED_EVENTS = frozenset({
        'PASSWORD_RESET',
        'EMAIL_VERIFICATION',
        'PASSWORD_RESET_SUCCESS',
        'ACCOUNT_SECURITY_ALERT',
        'GOOGLE_LINKED',
    })

    class Meta:
        db_table = 'notification_settings'
        verbose_name = 'Notification Settings'
        verbose_name_plural = 'Notification Settings'

    def __str__(self):
        state = 'enabled' if self.email_notifications_enabled else 'disabled'
        return f'Notification policy (email {state})'

    # ------------------------------------------------------------------
    # Singleton access
    # ------------------------------------------------------------------
    @classmethod
    def get_solo(cls) -> 'NotificationSettings':
        """
        Return the single policy row, creating it with schema defaults on first
        use. Defaults are all-enabled, so enabling this feature never silently
        changes existing dispatch behaviour.
        """
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    @classmethod
    def current(cls) -> 'NotificationSettings | None':
        """
        Read-only accessor used by the dispatch layer. Returns ``None`` when no
        policy row exists yet, so untampered deployments keep dispatching exactly
        as before and no row is created inside unrelated business transactions.
        """
        return cls.objects.first()

    @classmethod
    def resolve_category(cls, event_type: str) -> str | None:
        """
        Map a communication event type onto its gating category.
        Returns ``None`` for events that are not policy-controlled.
        """
        if not event_type:
            return None
        normalized = str(event_type).upper()
        if normalized in cls.ALWAYS_DELIVERED_EVENTS:
            return None
        for prefix, category in cls.EVENT_PREFIX_CATEGORY:
            if normalized.startswith(prefix):
                return category
        return None

    @classmethod
    def is_event_enabled(cls, event_type: str) -> bool:
        """
        Authoritative dispatch decision for an event type.

        An unknown/unmapped event type is always allowed: the policy can only ever
        suppress categories it explicitly knows about.
        """
        category = cls.resolve_category(event_type)
        if category is None:
            return True

        policy = cls.current()
        if policy is None:
            return True
        if not policy.email_notifications_enabled:
            return False
        return bool(getattr(policy, category, True))

    # ------------------------------------------------------------------
    # Integrity
    # ------------------------------------------------------------------
    def clean(self):
        super().clean()
        if not self.pk and NotificationSettings.objects.exists():
            raise ValidationError('Only one NotificationSettings row is permitted.')

    def save(self, *args, **kwargs):
        if not self.pk and NotificationSettings.objects.exists():
            raise ValidationError('Only one NotificationSettings row is permitted.')
        super().save(*args, **kwargs)

    def disabled_categories(self) -> list[str]:
        """Field names of every category currently switched off."""
        if not self.email_notifications_enabled:
            return list(self.CATEGORY_FIELDS)
        return [field for field in self.CATEGORY_FIELDS if not getattr(self, field)]
