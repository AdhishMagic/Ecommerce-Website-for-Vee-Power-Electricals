from django.db import models
from django.conf import settings
from apps.common.models import TimeStampedModel


class AuditActionType(models.TextChoices):
    CREATE = 'CREATE', 'Create'
    UPDATE = 'UPDATE', 'Update'
    DEACTIVATE = 'DEACTIVATE', 'Deactivate'
    DELETE = 'DELETE', 'Delete'


class InquiryStatus(models.TextChoices):
    NEW = 'New', 'New Ticket'
    IN_PROGRESS = 'In Progress', 'In Progress'
    RESOLVED = 'Resolved', 'Resolved'
    CLOSED = 'Closed', 'Closed'


class AdminConfigAuditLog(models.Model):
    """
    Append-only audit trail recording every administrative modification to commercial rules.
    Strictly insert-only. No updated_at column.
    """
    admin_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    domain = models.CharField(max_length=50)
    record_id = models.BigIntegerField()
    action_type = models.CharField(
        max_length=20,
        choices=AuditActionType.choices
    )
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(default=dict)
    change_reason = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'admin_config_audit_logs'
        verbose_name = 'Admin Config Audit Log'
        verbose_name_plural = 'Admin Config Audit Logs'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(action_type__in=['CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE']),
                name='chk_audit_action'
            ),
        ]
        indexes = [
            models.Index(fields=['domain', 'record_id', 'created_at'], name='idx_audit_domain_rec'),
        ]

    def __str__(self):
        admin = self.admin_user.email if self.admin_user else "System"
        return f"[{self.action_type}] {self.domain} #{self.record_id} by {admin}"


class ContactInquiry(TimeStampedModel):
    """
    Lead generation, bulk procurement inquiry requests, and customer support tickets.
    """
    name = models.CharField(max_length=150)
    email = models.EmailField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=20)
    subject = models.CharField(max_length=150)
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=InquiryStatus.choices,
        default=InquiryStatus.NEW
    )
    admin_notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'contact_inquiries'
        verbose_name = 'Contact Inquiry'
        verbose_name_plural = 'Contact Inquiries'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(status__in=['New', 'In Progress', 'Resolved', 'Closed']),
                name='chk_inquiry_status'
            ),
        ]
        indexes = [
            models.Index(fields=['status', 'created_at'], name='idx_inq_status_date'),
        ]

    def __str__(self):
        return f"{self.subject} - {self.name} ({self.status})"


class CommunicationChannel(models.TextChoices):
    EMAIL = 'EMAIL', 'Email'
    SMS = 'SMS', 'SMS'


class CommunicationStatus(models.TextChoices):
    SENT = 'SENT', 'Sent'
    FAILED = 'FAILED', 'Failed'
    SKIPPED = 'SKIPPED', 'Skipped'


class CommunicationLog(TimeStampedModel):
    """
    Authoritative audit ledger and idempotency register for customer communications.
    Guarantees cross-channel traceability, delivery tracking, and duplicate prevention.
    """
    event_type = models.CharField(max_length=60)
    channel = models.CharField(
        max_length=20,
        choices=CommunicationChannel.choices,
        default=CommunicationChannel.EMAIL
    )
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    idempotency_key = models.CharField(max_length=150, unique=True)
    status = models.CharField(
        max_length=20,
        choices=CommunicationStatus.choices,
        default=CommunicationStatus.SENT
    )
    error_message = models.TextField(null=True, blank=True)
    template_name = models.CharField(max_length=100, blank=True, default='')
    context_snapshot = models.JSONField(default=dict, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'communication_logs'
        verbose_name = 'Communication Log'
        verbose_name_plural = 'Communication Logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event_type', 'created_at'], name='idx_comm_event_created'),
            models.Index(fields=['recipient', 'created_at'], name='idx_comm_recipient_date'),
            models.Index(fields=['status'], name='idx_comm_status'),
            models.Index(fields=['idempotency_key'], name='idx_comm_idempotency'),
        ]

    def __str__(self):
        return f"[{self.status}] {self.event_type} -> {self.recipient} ({self.created_at})"

