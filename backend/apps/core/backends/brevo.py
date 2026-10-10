import logging
from typing import List
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail import EmailMultiAlternatives
from apps.core.services.brevo_service import BrevoEmailService

logger = logging.getLogger(__name__)


class BrevoEmailBackend(BaseEmailBackend):
    """
    Standard Django Email Backend implementation backed by Brevo Transactional Email API.
    Can be configured in settings via:
    EMAIL_BACKEND = 'apps.core.backends.brevo.BrevoEmailBackend'
    """

    def send_messages(self, email_messages: List[EmailMultiAlternatives]) -> int:
        if not email_messages:
            return 0

        sent_count = 0
        for message in email_messages:
            recipients = message.to or []
            subject = message.subject
            text_content = message.body or ""
            html_content = ""

            # Extract alternative HTML parts if present
            if hasattr(message, 'alternatives') and message.alternatives:
                for content, mimetype in message.alternatives:
                    if mimetype == "text/html":
                        html_content = content
                        break

            if not html_content:
                html_content = f"<pre>{text_content}</pre>"

            for recipient in recipients:
                result = BrevoEmailService.send_transactional_email(
                    recipient=recipient,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                )
                if result.get("success"):
                    sent_count += 1
                elif not self.fail_silently and not result.get("status") == "suppressed":
                    err = result.get("error", "Unknown Brevo delivery failure")
                    logger.error("Failed to deliver message via Brevo to %s: %s", recipient, err)

        return sent_count
