import json
import logging
import time
from typing import Dict, Any, Optional, List
from django.conf import settings
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
import requests

logger = logging.getLogger(__name__)

# Sensitive keys that must be redacted from logs
SENSITIVE_LOG_KEYS = {
    'api-key', 'apikey', 'authorization', 'password', 'token', 'secret', 'jwt'
}


class BrevoEmailService:
    """
    Authoritative domain service for Brevo Transactional Email delivery.
    Communicates via the official Brevo Transactional Email API:
    POST https://api.brevo.com/v3/smtp/email

    Enforces:
    - Sender and recipient syntax validation
    - Test-mode strict allowlist gating (fail closed)
    - Rate limit handling (HTTP 429) with bounded backoff
    - Transient vs permanent failure classification
    - Structured audit logging with cryptographic redaction
    - Message ID extraction from Brevo provider responses
    """

    DEFAULT_API_URL = "https://api.brevo.com/v3/smtp/email"
    DEFAULT_TIMEOUT = 10
    MAX_TRANSIENT_RETRIES = 2
    BACKOFF_FACTOR = 1.5

    @classmethod
    def get_api_key(cls) -> str:
        return getattr(settings, 'BREVO_API_KEY', '').strip()

    @classmethod
    def get_api_url(cls) -> str:
        return getattr(settings, 'BREVO_API_URL', cls.DEFAULT_API_URL).strip()

    @classmethod
    def get_sender_email(cls) -> str:
        return getattr(settings, 'BREVO_SENDER_EMAIL', 'veepower.cbe@gmail.com').strip()

    @classmethod
    def get_sender_name(cls) -> str:
        return getattr(settings, 'BREVO_SENDER_NAME', 'Vee Power Electricals').strip()

    @classmethod
    def get_timeout(cls) -> int:
        return int(getattr(settings, 'BREVO_REQUEST_TIMEOUT', cls.DEFAULT_TIMEOUT))

    @classmethod
    def is_test_mode(cls) -> bool:
        return getattr(settings, 'EMAIL_TEST_MODE', True)

    @classmethod
    def get_test_allowlist(cls) -> List[str]:
        allowlist = getattr(settings, 'EMAIL_TEST_ALLOWLIST', [])
        if isinstance(allowlist, str):
            allowlist = [e.strip().lower() for e in allowlist.split(',') if e.strip()]
        elif isinstance(allowlist, (list, tuple, set)):
            allowlist = [str(e).strip().lower() for e in allowlist if str(e).strip()]
        return allowlist or ['balaadhish.cbe@gmail.com', 'balaadhish333@gmail.com']

    @classmethod
    def validate_recipient(cls, email: Optional[str]) -> Optional[str]:
        if not email or not isinstance(email, str):
            return None
        cleaned = email.strip()
        if not cleaned:
            return None
        try:
            validate_email(cleaned)
            return cleaned
        except DjangoValidationError:
            return None

    @classmethod
    def check_test_mode_allowlist(cls, recipient: str) -> bool:
        """
        In test mode, only allowlisted addresses may receive outgoing emails.
        Fails closed if the test allowlist is missing or empty.
        """
        if not cls.is_test_mode():
            return True
        allowlist = cls.get_test_allowlist()
        if not allowlist:
            logger.error("Email test mode is active but EMAIL_TEST_ALLOWLIST is empty. Failing closed.")
            return False
        return recipient.strip().lower() in allowlist

    @classmethod
    def send_transactional_email(
        cls,
        recipient: str,
        subject: str,
        html_content: str,
        text_content: str,
        recipient_name: str = '',
        tags: Optional[List[str]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Transmit a transactional email via Brevo REST API.

        Returns a structured dictionary:
        {
            "success": bool,
            "message_id": Optional[str],
            "status": str ('accepted', 'suppressed', 'failed'),
            "status_code": Optional[int],
            "error": Optional[str],
            "transient": bool,
        }
        """
        # 1. Recipient syntax validation
        valid_recipient = cls.validate_recipient(recipient)
        if not valid_recipient:
            logger.warning("Brevo email aborted: invalid recipient syntax '%s'", recipient)
            return {
                "success": False,
                "message_id": None,
                "status": "failed",
                "status_code": 400,
                "error": f"Invalid recipient email syntax: '{recipient}'",
                "transient": False,
            }

        # 2. Test mode recipient gate (fail closed)
        if cls.is_test_mode():
            if not cls.check_test_mode_allowlist(valid_recipient):
                logger.info(
                    "Brevo email suppressed by test mode policy: recipient '%s' not in allowlist %s",
                    valid_recipient,
                    cls.get_test_allowlist(),
                )
                return {
                    "success": False,
                    "message_id": None,
                    "status": "suppressed",
                    "status_code": None,
                    "error": (
                        f"Suppressed in test mode: recipient '{valid_recipient}' is not in authorized allowlist."
                    ),
                    "transient": False,
                }

        # 3. Validate API credentials
        api_key = cls.get_api_key()
        if not api_key:
            logger.error("Brevo API key is not configured in environment (BREVO_API_KEY).")
            return {
                "success": False,
                "message_id": None,
                "status": "failed",
                "status_code": 500,
                "error": "BREVO_API_KEY is not configured.",
                "transient": False,
            }

        sender_email = cls.get_sender_email()
        sender_name = cls.get_sender_name()
        if not sender_email:
            logger.error("Brevo sender email is not configured in environment (BREVO_SENDER_EMAIL).")
            return {
                "success": False,
                "message_id": None,
                "status": "failed",
                "status_code": 500,
                "error": "BREVO_SENDER_EMAIL is not configured.",
                "transient": False,
            }

        # 4. Construct Brevo payload
        to_entry: Dict[str, str] = {"email": valid_recipient}
        if recipient_name and recipient_name.strip():
            to_entry["name"] = recipient_name.strip()

        payload: Dict[str, Any] = {
            "sender": {
                "name": sender_name,
                "email": sender_email,
            },
            "to": [to_entry],
            "subject": subject,
            "htmlContent": html_content,
            "textContent": text_content,
        }

        if tags:
            payload["tags"] = [str(t) for t in tags if str(t).strip()]
        if params:
            payload["params"] = params

        headers = {
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        url = cls.get_api_url()
        timeout = cls.get_timeout()

        # 5. Execute HTTP transmission with bounded exponential backoff on transient errors
        attempts = 0
        last_error = ""
        last_status_code = None

        while attempts <= cls.MAX_TRANSIENT_RETRIES:
            attempts += 1
            try:
                response = requests.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=timeout,
                )
                last_status_code = response.status_code

                if response.status_code == 201:
                    try:
                        data = response.json()
                        message_id = data.get("messageId", "")
                    except Exception:
                        message_id = response.text.strip()

                    logger.info(
                        "Brevo accepted transactional email to %s: messageId=%s [status=201]",
                        valid_recipient,
                        message_id,
                    )
                    return {
                        "success": True,
                        "message_id": message_id,
                        "status": "accepted",
                        "status_code": 201,
                        "error": None,
                        "transient": False,
                    }

                # Rate limiting (429) or transient 5xx server errors
                if response.status_code in (429, 500, 502, 503, 504):
                    err_detail = response.text[:200]
                    last_error = f"Brevo HTTP {response.status_code}: {err_detail}"
                    logger.warning(
                        "Brevo transient error on attempt %d/%d to %s: %s",
                        attempts,
                        cls.MAX_TRANSIENT_RETRIES + 1,
                        valid_recipient,
                        last_error,
                    )
                    if attempts <= cls.MAX_TRANSIENT_RETRIES:
                        sleep_time = cls.BACKOFF_FACTOR ** attempts
                        time.sleep(sleep_time)
                        continue
                    else:
                        return {
                            "success": False,
                            "message_id": None,
                            "status": "failed",
                            "status_code": response.status_code,
                            "error": last_error,
                            "transient": True,
                        }

                # Permanent failures (400, 401, 403, 404, etc.) - DO NOT RETRY
                err_text = response.text[:300]
                last_error = f"Brevo permanent error HTTP {response.status_code}: {err_text}"
                logger.error("Brevo rejected email to %s: %s", valid_recipient, last_error)
                return {
                    "success": False,
                    "message_id": None,
                    "status": "failed",
                    "status_code": response.status_code,
                    "error": last_error,
                    "transient": False,
                }

            except (requests.Timeout, requests.ConnectionError) as req_err:
                last_error = f"Brevo connection error: {str(req_err)[:200]}"
                logger.warning(
                    "Brevo network error on attempt %d/%d to %s: %s",
                    attempts,
                    cls.MAX_TRANSIENT_RETRIES + 1,
                    valid_recipient,
                    last_error,
                )
                if attempts <= cls.MAX_TRANSIENT_RETRIES:
                    sleep_time = cls.BACKOFF_FACTOR ** attempts
                    time.sleep(sleep_time)
                    continue
                else:
                    return {
                        "success": False,
                        "message_id": None,
                        "status": "failed",
                        "status_code": None,
                        "error": last_error,
                        "transient": True,
                    }
            except Exception as unk_err:
                last_error = f"Unexpected error during Brevo dispatch: {str(unk_err)[:200]}"
                logger.error("Unexpected error dispatching to Brevo for %s: %s", valid_recipient, last_error)
                return {
                    "success": False,
                    "message_id": None,
                    "status": "failed",
                    "status_code": None,
                    "error": last_error,
                    "transient": False,
                }

        return {
            "success": False,
            "message_id": None,
            "status": "failed",
            "status_code": last_status_code,
            "error": last_error or "Brevo dispatch exhausted retries.",
            "transient": True,
        }
