import secrets
import string
import logging
from datetime import timedelta
from typing import Tuple, Optional
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.users.models import EmailVerificationToken, VerificationTokenType
from apps.core.services.communication_service import CommunicationService

logger = logging.getLogger(__name__)
User = get_user_model()

EXPIRY_MINUTES = 15
MAX_VERIFICATION_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


class VerificationService:
    """
    Domain service orchestrating email verification tokens, OTP generation,
    rate-limited resends, and replay-resistant validation.
    """

    @classmethod
    def generate_otp(cls, length: int = 6) -> str:
        """Generate a cryptographically secure numeric OTP."""
        return ''.join(secrets.choice(string.digits) for _ in range(length))

    @classmethod
    def generate_token(cls) -> str:
        """Generate a cryptographically secure URL-safe verification token."""
        return secrets.token_urlsafe(32)

    @classmethod
    def create_verification_token(
        cls,
        user,
        email: Optional[str] = None,
        token_type: str = VerificationTokenType.EMAIL_VERIFY,
    ) -> EmailVerificationToken:
        """
        Invalidates existing active tokens of this type and generates a new token/OTP in MySQL.
        """
        target_email = (email or getattr(user, 'email', '')).strip().lower()

        with transaction.atomic():
            EmailVerificationToken.objects.filter(
                user=user,
                email=target_email,
                token_type=token_type,
                is_used=False,
            ).update(is_used=True)

            otp = cls.generate_otp()
            token = cls.generate_token()
            expires_at = timezone.now() + timedelta(minutes=EXPIRY_MINUTES)

            return EmailVerificationToken.objects.create(
                user=user,
                email=target_email,
                token=token,
                otp=otp,
                token_type=token_type,
                is_used=False,
                attempts=0,
                expires_at=expires_at,
            )

    @classmethod
    def create_and_send_verification(
        cls,
        user,
        email: Optional[str] = None,
        token_type: str = VerificationTokenType.EMAIL_VERIFY,
    ) -> EmailVerificationToken:
        """
        Generates a new token/OTP and dispatches the verification email.
        """
        token_obj = cls.create_verification_token(user, email=email, token_type=token_type)

        CommunicationService.send_email_verification(
            user=user,
            otp=token_obj.otp,
            token=token_obj.token,
            expires_minutes=EXPIRY_MINUTES,
        )

        return token_obj

    @classmethod
    def resend_verification(cls, email: str) -> Tuple[bool, str]:
        """
        Resend verification OTP with rate limiting cooldown.
        """
        cleaned_email = email.strip().lower()
        user = User.objects.filter(email__iexact=cleaned_email).first()
        if not user:
            # Prevent user existence enumeration: return success message
            return True, "If an account with this email exists, a new verification code has been sent."

        if getattr(user, 'is_email_verified', False):
            return True, "This email address is already verified. You can log in."

        # Check rate-limiting cooldown
        recent_token = EmailVerificationToken.objects.filter(
            user=user,
            email=cleaned_email,
            token_type=VerificationTokenType.EMAIL_VERIFY,
        ).order_by('-created_at').first()

        if recent_token:
            elapsed = (timezone.now() - recent_token.created_at).total_seconds()
            if elapsed < RESEND_COOLDOWN_SECONDS:
                remaining = int(RESEND_COOLDOWN_SECONDS - elapsed)
                return False, f"Please wait {remaining} seconds before requesting a new verification code."

        cls.create_and_send_verification(user, email=cleaned_email)
        return True, "A new verification code has been sent to your email."

    @classmethod
    def verify_otp_or_token(cls, email: str, code: str) -> Tuple[bool, Optional[User], str]:
        """
        Validate an OTP or token for an email address.
        Enforces:
        - Exact code matching
        - Expiration verification
        - Replay prevention (one-time use)
        - Max attempt lockout
        """
        cleaned_email = email.strip().lower()
        cleaned_code = code.strip()

        token_obj = EmailVerificationToken.objects.filter(
            email=cleaned_email,
            token_type=VerificationTokenType.EMAIL_VERIFY,
        ).order_by('-created_at').select_related('user').first()

        if not token_obj:
            return False, None, "Invalid or expired verification code."

        # Check maximum verification attempts
        if token_obj.attempts >= MAX_VERIFICATION_ATTEMPTS:
            return False, None, "Maximum verification attempts exceeded. Please request a new code."

        if token_obj.is_used:
            return False, None, "Invalid or expired verification code."

        # Check expiration
        if token_obj.is_expired():
            token_obj.is_used = True
            token_obj.save(update_fields=['is_used'])
            return False, None, "Verification code has expired. Please request a new code."

        # Increment attempt count
        token_obj.attempts += 1
        token_obj.save(update_fields=['attempts'])

        # Verify matching
        if cleaned_code != token_obj.otp and cleaned_code != token_obj.token:
            if token_obj.attempts >= MAX_VERIFICATION_ATTEMPTS:
                return False, None, "Maximum verification attempts exceeded. Please request a new code."
            return False, None, "Invalid verification code."

        # Success: mark token used and update User email verification state
        with transaction.atomic():
            token_obj.is_used = True
            token_obj.save(update_fields=['is_used'])

            user = token_obj.user
            user.is_email_verified = True
            user.save(update_fields=['is_email_verified', 'updated_at'])

        # Dispatch verification confirmation email
        CommunicationService.send_email_verified_success(user)

        return True, user, "Email address has been successfully verified."
