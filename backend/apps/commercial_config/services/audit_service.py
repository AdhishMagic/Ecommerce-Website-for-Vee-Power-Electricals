import json
import logging
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, Dict, Any

from apps.core.models import AdminConfigAuditLog, AuditActionType

logger = logging.getLogger(__name__)

SENSITIVE_KEYS = {
    'password', 'secret', 'token', 'jwt', 'api_key', 'key',
    'credentials', 'razorpay_key_secret', 'secret_key'
}


def sanitize_audit_payload(data: Any) -> Any:
    """
    Recursively remove confidential credentials, passwords, JWTs, and API secrets
    from configuration audit payloads. Quantizes Decimal and datetime objects to JSON-serializable primitives.
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                continue
            sanitized[k] = sanitize_audit_payload(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_audit_payload(item) for item in data]
    elif isinstance(data, Decimal):
        return str(data)
    elif isinstance(data, (datetime, date)):
        return data.isoformat()
    return data


def log_admin_config_change(
    domain: str,
    record_id: int,
    action_type: str,
    user: Optional[Any] = None,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None,
    change_reason: str = "Administrative configuration update",
    ip_address: Optional[str] = None
) -> Optional[AdminConfigAuditLog]:
    """
    Authoritative audit ledger recorder for administrative configuration mutations.
    Guarantees immutable historical audit records with credential sanitization.
    """
    try:
        sanitized_old = sanitize_audit_payload(old_value) if old_value else None
        sanitized_new = sanitize_audit_payload(new_value) if new_value else {}

        audit_entry = AdminConfigAuditLog.objects.create(
            admin_user=user if (user and getattr(user, 'is_authenticated', False)) else None,
            domain=domain,
            record_id=record_id,
            action_type=action_type,
            old_value=sanitized_old,
            new_value=sanitized_new,
            change_reason=change_reason or "Configuration modified",
            ip_address=ip_address,
        )
        return audit_entry
    except Exception as e:
        logger.error(f"Failed to record administrative configuration audit log: {e}", exc_info=True)
        return None
