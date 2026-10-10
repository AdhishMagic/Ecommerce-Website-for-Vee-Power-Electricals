import time
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from apps.core.models import CommunicationLog, CommunicationStatus
from apps.core.services.communication_service import CommunicationService

logger = logging.getLogger('apps.core.email_worker')


class Command(BaseCommand):
    help = "Durable background outbox worker for processing queued email notifications."

    def add_arguments(self, parser):
        parser.add_argument(
            '--once',
            action='store_true',
            help='Process pending queue once and exit immediately.',
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=5,
            help='Polling interval in seconds when running continuously (default: 5).',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=20,
            help='Number of queued emails to process per iteration (default: 20).',
        )
        parser.add_argument(
            '--stats',
            action='store_true',
            help='Output current queue statistics and exit.',
        )

    def handle(self, *args, **options):
        if options['stats']:
            self.print_stats()
            return

        run_once = options['once']
        interval = options['interval']
        batch_size = options['batch_size']

        self.stdout.write(self.style.SUCCESS(
            f"Starting Vee Power Electricals email outbox worker (interval: {interval}s, batch: {batch_size})..."
        ))

        while True:
            try:
                # 1. Recover stale locked jobs (e.g. worker died while SENDING)
                self.recover_stale_jobs()

                # 2. Process pending QUEUED jobs
                processed = self.process_batch(batch_size)

                if run_once:
                    self.stdout.write(self.style.SUCCESS(f"Finished one-pass queue run. Processed {processed} jobs."))
                    break

                time.sleep(interval)

            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING("Email outbox worker stopped by user."))
                break
            except Exception as e:
                logger.error("Error in email outbox worker loop: %s", e)
                if run_once:
                    raise
                time.sleep(interval)

    def recover_stale_jobs(self, stale_threshold_minutes: int = 5) -> int:
        """
        Recover jobs stuck in SENDING status due to a crashed worker process.
        """
        stale_cutoff = timezone.now() - timedelta(minutes=stale_threshold_minutes)
        with transaction.atomic():
            stale_qs = CommunicationLog.objects.filter(
                status=CommunicationStatus.SENDING,
                locked_at__lt=stale_cutoff,
            )
            count = stale_qs.update(
                status=CommunicationStatus.QUEUED,
                locked_at=None,
                locked_by='',
                error_message="Recovered from stale lock state.",
            )
            if count > 0:
                self.stdout.write(self.style.WARNING(f"Recovered {count} stale email jobs back to QUEUED."))
            return count

    def process_batch(self, batch_size: int) -> int:
        """
        Safely fetch and deliver a batch of queued jobs using row-level locking.
        """
        now = timezone.now()
        # Find jobs that are QUEUED and ready for transmission (or retry delay elapsed)
        candidate_ids = list(
            CommunicationLog.objects.filter(
                status=CommunicationStatus.QUEUED
            ).filter(
                Q(next_retry_at__isnull=True) | Q(next_retry_at__lte=now)
            ).order_by('created_at')[:batch_size].values_list('id', flat=True)
        )

        if not candidate_ids:
            return 0

        processed = 0
        for log_id in candidate_ids:
            try:
                log_record = CommunicationService.deliver_log_record_by_id(log_id)
                if log_record:
                    processed += 1
                    status_style = (
                        self.style.SUCCESS if log_record.status == CommunicationStatus.SENT
                        else self.style.WARNING if log_record.status == CommunicationStatus.SUPPRESSED
                        else self.style.ERROR
                    )
                    self.stdout.write(status_style(
                        f"[{log_record.status}] Event '{log_record.event_type}' -> {log_record.recipient} "
                        f"(provider msgId: {log_record.provider_message_id or 'none'})"
                    ))
            except Exception as e:
                logger.error("Worker failed processing log %s: %s", log_id, e)

        return processed

    def print_stats(self):
        total = CommunicationLog.objects.count()
        queued = CommunicationLog.objects.filter(status=CommunicationStatus.QUEUED).count()
        sending = CommunicationLog.objects.filter(status=CommunicationStatus.SENDING).count()
        sent = CommunicationLog.objects.filter(status=CommunicationStatus.SENT).count()
        failed = CommunicationLog.objects.filter(status=CommunicationStatus.FAILED).count()
        suppressed = CommunicationLog.objects.filter(status=CommunicationStatus.SUPPRESSED).count()
        skipped = CommunicationLog.objects.filter(status=CommunicationStatus.SKIPPED).count()

        self.stdout.write(self.style.MIGRATE_HEADING("=== Vee Power Email Outbox Statistics ==="))
        self.stdout.write(f"Total Communications Logged : {total}")
        self.stdout.write(f"Queued (Pending Delivery)   : {queued}")
        self.stdout.write(f"Sending (In Flight)         : {sending}")
        self.stdout.write(f"Sent (Provider Accepted)    : {sent}")
        self.stdout.write(f"Failed Delivery             : {failed}")
        self.stdout.write(f"Suppressed (Test Mode)      : {suppressed}")
        self.stdout.write(f"Skipped (Policy Disabled)   : {skipped}")
