from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.management import call_command
import io

from apps.core.models import CommunicationLog, CommunicationStatus
from apps.core.services.communication_service import CommunicationService


class BrevoOutboxWorkerTestCase(TestCase):
    """
    Test suite for durable database-backed outbox pattern, stale recovery,
    concurrency locking, and management command execution.
    """

    def setUp(self):
        CommunicationLog.objects.all().delete()

    def test_01_outbox_queuing_and_delivery(self):
        """Messages in QUEUED state are picked up and marked SENT."""
        log = CommunicationLog.objects.create(
            event_type="TEST_OUTBOX",
            recipient="test.worker@example.com",
            subject="Outbox Test",
            idempotency_key="TEST_OUTBOX_1",
            status=CommunicationStatus.QUEUED,
            text_body="Test outbox text",
            html_body="<p>Test outbox html</p>",
        )

        out = io.StringIO()
        call_command('process_email_queue', once=True, stdout=out)

        log.refresh_from_db()
        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertIsNotNone(log.sent_at)

    def test_02_stale_job_recovery(self):
        """Worker crash recovery: jobs stuck in SENDING > 5m are reset to QUEUED."""
        stale_time = timezone.now() - timedelta(minutes=10)
        log = CommunicationLog.objects.create(
            event_type="TEST_STALE",
            recipient="test.stale@example.com",
            subject="Stale Test",
            idempotency_key="TEST_STALE_1",
            status=CommunicationStatus.SENDING,
            locked_at=stale_time,
            text_body="Stale text",
            html_body="<p>Stale html</p>",
        )

        out = io.StringIO()
        call_command('process_email_queue', once=True, stdout=out)

        log.refresh_from_db()
        # Should have recovered to QUEUED and then processed to SENT
        self.assertEqual(log.status, CommunicationStatus.SENT)

    def test_03_retry_exponential_backoff_on_transient_failure(self):
        """Transient errors trigger exponential retry backoff."""
        log = CommunicationLog.objects.create(
            event_type="TEST_RETRY",
            recipient="balaadhish.cbe@gmail.com",
            subject="Retry Test",
            idempotency_key="TEST_RETRY_1",
            status=CommunicationStatus.QUEUED,
            text_body="Retry text",
            html_body="<p>Retry html</p>",
            retry_count=0,
            max_retries=3,
        )

        with override_settings(
            FORCE_BREVO_DELIVERY=True,
            BREVO_API_KEY="test_key",
            EMAIL_TEST_MODE=False,
        ), patch('apps.core.services.brevo_service.BrevoEmailService.send_transactional_email') as mock_send:
            mock_send.return_value = {
                "success": False,
                "message_id": None,
                "status": "failed",
                "status_code": 503,
                "error": "Brevo HTTP 503: Service Unavailable",
                "transient": True,
            }

            CommunicationService.deliver_log_record(log)

            log.refresh_from_db()
            self.assertEqual(log.status, CommunicationStatus.QUEUED)
            self.assertEqual(log.retry_count, 1)
            self.assertIsNotNone(log.next_retry_at)
            self.assertGreater(log.next_retry_at, timezone.now())

    def test_04_stats_command_output(self):
        """process_email_queue --stats outputs summary table."""
        CommunicationLog.objects.create(
            event_type="TEST_STAT",
            recipient="test@example.com",
            subject="Stat",
            idempotency_key="TEST_STAT_1",
            status=CommunicationStatus.SENT,
        )
        out = io.StringIO()
        call_command('process_email_queue', stats=True, stdout=out)
        output = out.getvalue()
        self.assertIn("Vee Power Email Outbox Statistics", output)
        self.assertIn("Sent (Provider Accepted)", output)
