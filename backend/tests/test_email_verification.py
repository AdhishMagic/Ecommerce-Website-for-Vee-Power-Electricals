from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import EmailVerificationToken, VerificationTokenType
from apps.users.services.verification_service import VerificationService
from apps.core.models import CommunicationLog, CommunicationStatus

User = get_user_model()


class EmailVerificationTestCase(TestCase):
    """
    Test matrix for email verification token lifecycle, OTP verification,
    rate-limited resends, replay prevention, and attempt bounding.
    """

    def setUp(self):
        CommunicationLog.objects.all().delete()
        EmailVerificationToken.objects.all().delete()

        self.user = User.objects.create_user(
            username="verify_user_test",
            email="verify.test@example.com",
            first_name="Test",
            last_name="User",
            password="StrongPassword123!",
            is_email_verified=False,
        )

    def test_01_create_token_in_database(self):
        """Verification token is stored securely in MySQL with 15-minute expiry."""
        token_obj = VerificationService.create_verification_token(self.user)
        self.assertIsNotNone(token_obj)
        self.assertEqual(len(token_obj.otp), 6)
        self.assertTrue(token_obj.otp.isdigit())
        self.assertFalse(token_obj.is_used)
        self.assertEqual(token_obj.attempts, 0)
        self.assertFalse(token_obj.is_expired())

    def test_02_successful_otp_verification(self):
        """Submitting valid OTP marks user email verified and sends success email."""
        token_obj = VerificationService.create_and_send_verification(self.user)

        success, verified_user, msg = VerificationService.verify_otp_or_token(
            email=self.user.email,
            code=token_obj.otp,
        )
        self.assertTrue(success)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

        # Token must now be marked used
        token_obj.refresh_from_db()
        self.assertTrue(token_obj.is_used)

        # Success email logged
        log = CommunicationLog.objects.filter(
            event_type="EMAIL_VERIFIED_SUCCESS",
            recipient=self.user.email
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    def test_03_expired_otp_rejected(self):
        """Expired OTP is rejected and marked used."""
        token_obj = VerificationService.create_verification_token(self.user)
        # Manually expire token
        token_obj.expires_at = timezone.now() - timedelta(minutes=5)
        token_obj.save()

        success, _, msg = VerificationService.verify_otp_or_token(
            email=self.user.email,
            code=token_obj.otp,
        )
        self.assertFalse(success)
        self.assertIn("expired", msg.lower())

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_email_verified)

    def test_04_reused_otp_rejected(self):
        """Used OTP cannot be reused (replay prevention)."""
        token_obj = VerificationService.create_verification_token(self.user)
        # Use token
        success1, _, _ = VerificationService.verify_otp_or_token(self.user.email, token_obj.otp)
        self.assertTrue(success1)

        # Try to use again
        success2, _, msg = VerificationService.verify_otp_or_token(self.user.email, token_obj.otp)
        self.assertFalse(success2)
        self.assertIn("invalid or expired", msg.lower())

    def test_05_max_attempts_lockout(self):
        """Exceeding 5 failed attempts locks out the OTP."""
        token_obj = VerificationService.create_verification_token(self.user)

        # 5 wrong attempts
        for _ in range(5):
            success, _, _ = VerificationService.verify_otp_or_token(self.user.email, "000000")
            self.assertFalse(success)

        # 6th attempt with correct OTP must fail due to lockout
        success, _, msg = VerificationService.verify_otp_or_token(self.user.email, token_obj.otp)
        self.assertFalse(success)
        self.assertIn("maximum verification attempts exceeded", msg.lower())

    def test_06_resend_rate_limiting_cooldown(self):
        """Resending verification code within 60s is rate-limited."""
        VerificationService.create_and_send_verification(self.user)

        # Immediate resend attempt
        success, msg = VerificationService.resend_verification(self.user.email)
        self.assertFalse(success)
        self.assertIn("wait", msg.lower())

    def test_07_api_endpoint_confirm_verification(self):
        """API endpoint POST /api/v1/auth/verify-email/confirm/ validates OTP."""
        token_obj = VerificationService.create_verification_token(self.user)

        client = APIClient()
        res = client.post(
            "/api/v1/auth/verify-email/confirm/",
            {"email": self.user.email, "otp": token_obj.otp},
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("email_verified"))

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
