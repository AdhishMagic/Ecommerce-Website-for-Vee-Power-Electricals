"""
Google Sign-In identity service.

Google is used strictly as an external OIDC identity provider. This module:

1. Normalises email addresses using the single canonical policy already applied
   by the application (``trim`` surrounding whitespace + lower-case). No
   provider-specific Gmail transformations (dot-stripping, plus-tag removal) are
   ever applied.
2. Verifies a Google ID token server-side against Google's tokeninfo endpoint
   and validates audience, issuer, expiry, and verified-email claims. The
   frontend is never trusted for ``email``, ``name``, or ``picture``.
3. Resolves the identity to exactly one authoritative local ``User`` following
   the safe account-linking policy.

The application's customer account and all business data remain in
Django + MySQL. No Google data store is used and no Firebase is involved.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from apps.common.exceptions import BusinessLogicError
from apps.users.models import (
    IdentityAuditLog,
    IdentityEventType,
    SocialAccount,
    SocialProvider,
    UserRole,
)

logger = logging.getLogger('apps.users.google_identity')

User = get_user_model()

PROVIDER = SocialProvider.GOOGLE
_TOKENINFO_TIMEOUT_SECONDS = 5


# ==============================================================================
# CANONICAL ERRORS (feed the existing canonical DRF error envelope)
# ==============================================================================

class GoogleSignInError(BusinessLogicError):
    status_code = 401
    default_code = 'GOOGLE_SIGNIN_FAILED'
    default_detail = 'Google sign-in could not be completed.'


class InvalidGoogleTokenError(GoogleSignInError):
    default_code = 'INVALID_GOOGLE_TOKEN'
    default_detail = 'The Google credential is invalid or expired.'


class GoogleEmailUnverifiedError(GoogleSignInError):
    default_code = 'GOOGLE_EMAIL_UNVERIFIED'
    default_detail = 'Your Google email address is not verified.'


class GoogleSignInNotConfiguredError(GoogleSignInError):
    status_code = 503
    default_code = 'GOOGLE_SIGNIN_NOT_CONFIGURED'
    default_detail = 'Google sign-in is not configured on this server.'


class GoogleProviderUnavailableError(GoogleSignInError):
    status_code = 503
    default_code = 'GOOGLE_PROVIDER_UNAVAILABLE'
    default_detail = 'Google sign-in is temporarily unavailable. Please try again.'


class GoogleAccountInactiveError(GoogleSignInError):
    status_code = 403
    default_code = 'ACCOUNT_INACTIVE'
    default_detail = 'Account is disabled or inactive.'


class GoogleAccountLinkConflictError(GoogleSignInError):
    status_code = 409
    default_code = 'ACCOUNT_LINK_CONFLICT'
    default_detail = 'This Google identity is already linked to another account.'


class DuplicateGoogleIdentityError(GoogleSignInError):
    status_code = 409
    default_code = 'DUPLICATE_GOOGLE_IDENTITY'
    default_detail = 'This Google identity is already registered.'


# ==============================================================================
# EMAIL CANONICALISATION (single policy shared with email/password auth)
# ==============================================================================

def normalize_email(email) -> str:
    """
    Canonical email normalisation: trim surrounding whitespace and lower-case.

    Mirrors ``User.objects.create_user`` and the existing registration/login
    serializers. Intentionally does not strip Gmail dots or plus-tags.
    """
    return (email or '').strip().lower()


# ==============================================================================
# GOOGLE ID TOKEN VERIFICATION
# ==============================================================================

def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('true', '1', 'yes')


def verify_google_id_token(id_token: str) -> dict:
    """
    Verify a Google ID token server-side and return validated identity claims.

    Uses Google's official tokeninfo endpoint which validates the token
    signature, issuer, and expiry, then re-validates audience/issuer/expiry and
    the verified-email claim locally. Raises a canonical GoogleSignInError on
    any failure. Never returns or stores access tokens.
    """
    if not id_token or not isinstance(id_token, str):
        raise InvalidGoogleTokenError('A Google credential is required.')

    client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '') or ''
    if not client_id:
        raise GoogleSignInNotConfiguredError()

    tokeninfo_url = getattr(
        settings,
        'GOOGLE_TOKENINFO_URL',
        'https://oauth2.googleapis.com/tokeninfo',
    )
    url = f"{tokeninfo_url}?{urllib.parse.urlencode({'id_token': id_token.strip()})}"

    try:
        with urllib.request.urlopen(url, timeout=_TOKENINFO_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        # Google returns HTTP 400 for an expired/malformed/invalid token.
        raise InvalidGoogleTokenError('The Google credential is invalid or expired.') from exc
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        logger.warning("Google tokeninfo request failed: %s", type(exc).__name__)
        raise GoogleProviderUnavailableError() from exc

    if not isinstance(payload, dict):
        raise InvalidGoogleTokenError('The Google credential is invalid or expired.')

    if payload.get('aud') != client_id:
        raise InvalidGoogleTokenError('The Google credential was issued for a different application.')

    issuers = getattr(settings, 'GOOGLE_ISSUERS', ('accounts.google.com', 'https://accounts.google.com'))
    if payload.get('iss') not in issuers:
        raise InvalidGoogleTokenError('The Google credential issuer is not trusted.')

    subject = payload.get('sub')
    if not subject or not isinstance(subject, str):
        raise InvalidGoogleTokenError('The Google credential is missing a stable subject identifier.')

    email = normalize_email(payload.get('email'))
    email_verified = _truthy(payload.get('email_verified'))
    if not email or not email_verified:
        raise GoogleEmailUnverifiedError()

    return {
        'sub': str(subject),
        'email': email,
        'email_verified': True,
        'given_name': (payload.get('given_name') or '').strip(),
        'family_name': (payload.get('family_name') or '').strip(),
        'name': (payload.get('name') or '').strip(),
    }


# ==============================================================================
# AUDIT (append-only; never logs tokens, codes, secrets, or passwords)
# ==============================================================================

def _resolve_ip(request) -> str | None:
    if request is None:
        return None
    meta = getattr(request, 'META', {}) or {}
    ip = meta.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or meta.get('REMOTE_ADDR')
    return ip or None


def _audit(event_type, *, user=None, subject='', email='', detail='', request=None) -> None:
    try:
        IdentityAuditLog.objects.create(
            user=user,
            provider=PROVIDER,
            event_type=event_type,
            provider_subject=subject or '',
            email=email or '',
            detail=detail[:255],
            ip_address=_resolve_ip(request),
        )
    except Exception:  # pragma: no cover - auditing must never break auth
        logger.exception("Failed to write identity audit log for %s", event_type)


# ==============================================================================
# SAFE ACCOUNT LINKING POLICY
# ==============================================================================

def _split_name(claims: dict) -> tuple[str, str]:
    first = claims.get('given_name') or ''
    last = claims.get('family_name') or ''
    if not first and not last and claims.get('name'):
        parts = claims['name'].split()
        first = parts[0] if parts else ''
        last = ' '.join(parts[1:]) if len(parts) > 1 else ''
    return first[:150], last[:150]


def _link_existing(user, claims: dict, request=None) -> dict:
    """
    Link a verified Google identity to an existing local account.

    Preconditions (all enforced before this call): the Google email is verified
    and its canonical form matches the local account's email exactly. No other
    account is merged and no business record is ever moved or overwritten.
    """
    if not user.is_active:
        _audit(
            IdentityEventType.LINK_REJECTED,
            user=user,
            subject=claims['sub'],
            email=claims['email'],
            detail='inactive_account',
            request=request,
        )
        raise GoogleAccountInactiveError()

    try:
        account = SocialAccount.objects.create(
            user=user,
            provider=PROVIDER,
            provider_subject=claims['sub'],
            email=claims['email'],
            email_verified=True,
        )
    except IntegrityError:
        # The subject was linked concurrently; resolve to the winner.
        existing = (
            SocialAccount.objects.select_related('user')
            .filter(provider=PROVIDER, provider_subject=claims['sub'])
            .first()
        )
        _audit(
            IdentityEventType.DUPLICATE_IDENTITY,
            user=user,
            subject=claims['sub'],
            email=claims['email'],
            detail='duplicate_subject_on_link',
            request=request,
        )
        if existing is None or existing.user_id != user.id:
            raise GoogleAccountLinkConflictError()
        _audit(
            IdentityEventType.GOOGLE_LOGIN,
            user=existing.user,
            subject=claims['sub'],
            email=claims['email'],
            detail='existing_link',
            request=request,
        )
        return {'user': existing.user, 'created': False, 'linked': False}

    _audit(
        IdentityEventType.GOOGLE_LINK,
        user=user,
        subject=claims['sub'],
        email=claims['email'],
        detail='linked_existing_account',
        request=request,
    )
    return {'user': user, 'created': False, 'linked': True}


def sign_in_with_google(claims: dict, request=None) -> dict:
    """
    Resolve verified Google claims to exactly one authoritative local user.

    Policy:
      * Existing ``(provider, provider_subject)`` -> authenticate that user.
      * No link, but canonical verified email matches a local account ->
        link the Google identity to that account (no duplicate is created).
      * Otherwise -> create a new local customer ``User`` + ``SocialAccount``.
      * A Google identity is never linked to a different email's account.
    """
    subject = claims['sub']
    email = normalize_email(claims['email'])

    with transaction.atomic():
        existing = (
            SocialAccount.objects.select_related('user')
            .filter(provider=PROVIDER, provider_subject=subject)
            .first()
        )
        if existing:
            user = existing.user
            if not user.is_active:
                _audit(
                    IdentityEventType.LINK_REJECTED,
                    user=user,
                    subject=subject,
                    email=email,
                    detail='inactive_account',
                    request=request,
                )
                raise GoogleAccountInactiveError()
            _audit(
                IdentityEventType.GOOGLE_LOGIN,
                user=user,
                subject=subject,
                email=email,
                detail='existing_link',
                request=request,
            )
            return {'user': user, 'created': False, 'linked': False}

        user = User.objects.filter(email__iexact=email).first()
        if user:
            return _link_existing(user, claims, request=request)

        # Google-first registration: create the authoritative local account.
        first_name, last_name = _split_name(claims)
        user = User.objects.create_user(
            email=email,
            password=None,
            username=email,
            first_name=first_name,
            last_name=last_name,
            role=UserRole.CUSTOMER,
            is_staff=False,
            is_superuser=False,
            is_active=True,
        )
        try:
            SocialAccount.objects.create(
                user=user,
                provider=PROVIDER,
                provider_subject=subject,
                email=email,
                email_verified=True,
            )
        except IntegrityError:
            _audit(
                IdentityEventType.DUPLICATE_IDENTITY,
                user=user,
                subject=subject,
                email=email,
                detail='duplicate_subject_on_register',
                request=request,
            )
            raise DuplicateGoogleIdentityError()

        _audit(
            IdentityEventType.GOOGLE_REGISTER,
            user=user,
            subject=subject,
            email=email,
            detail='google_first_registration',
            request=request,
        )
        return {'user': user, 'created': True, 'linked': False}
