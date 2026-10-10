"""
Tests for Google Sign-In (OIDC) identity linking.

Covers:
  * Google ID-token verification (audience / issuer / verified email / errors)
  * canonical email normalisation
  * Google-first registration, existing-account linking, separate identities
  * duplicate-identity prevention via the database unique constraint
  * inactive-account rejection, canonical error envelope, audit logging
  * preservation of the existing JWT / RBAC behavior
"""
import json
import urllib.error
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import (
    IdentityAuditLog,
    IdentityEventType,
    SocialAccount,
    SocialProvider,
)
from apps.users.services import google_identity
from apps.users.services.google_identity import (
    GoogleAccountInactiveError,
    GoogleEmailUnverifiedError,
    GoogleProviderUnavailableError,
    GoogleSignInNotConfiguredError,
    InvalidGoogleTokenError,
    build_google_auth_url,
    exchange_code_for_tokens,
    generate_oauth_state,
    generate_pkce_pair,
    normalize_email,
    sign_in_with_google,
    verify_google_id_token,
)

User = get_user_model()

GOOGLE_URL = '/api/v1/auth/google/'
CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

BASE_PAYLOAD = {
    'aud': CLIENT_ID,
    'iss': 'https://accounts.google.com',
    'exp': '9999999999',
    'sub': 'google-subject-123',
    'email': 'Customer@Example.com',
    'email_verified': 'true',
    'given_name': 'Custo',
    'family_name': 'Mer',
    'name': 'Custo Mer',
}


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode('utf-8')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _claims(**overrides):
    claims = {
        'sub': BASE_PAYLOAD['sub'],
        'email': 'customer@example.com',
        'email_verified': True,
        'given_name': 'Custo',
        'family_name': 'Mer',
        'name': 'Custo Mer',
    }
    claims.update(overrides)
    return claims


# ==============================================================================
# 1. CANONICAL EMAIL NORMALISATION
# ==============================================================================

class EmailNormalizationTests(TestCase):
    def test_trims_whitespace_and_lowercases(self):
        self.assertEqual(normalize_email('  Customer@Example.COM '), 'customer@example.com')

    def test_preserves_gmail_dots_and_plus_tags(self):
        # Deliberately does NOT apply provider-specific Gmail transformations.
        self.assertEqual(normalize_email('First.Last+tag@gmail.com'), 'first.last+tag@gmail.com')

    def test_handles_empty_and_none(self):
        self.assertEqual(normalize_email(''), '')
        self.assertEqual(normalize_email(None), '')


# ==============================================================================
# 2. GOOGLE ID TOKEN VERIFICATION
# ==============================================================================

@override_settings(GOOGLE_CLIENT_ID=CLIENT_ID)
class GoogleTokenVerificationTests(TestCase):
    @mock.patch('urllib.request.urlopen')
    def test_valid_token_returns_verified_claims(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(dict(BASE_PAYLOAD))
        claims = verify_google_id_token('opaque-id-token')
        self.assertEqual(claims['sub'], 'google-subject-123')
        self.assertEqual(claims['email'], 'customer@example.com')
        self.assertTrue(claims['email_verified'])
        self.assertEqual(claims['given_name'], 'Custo')

    @mock.patch('urllib.request.urlopen')
    def test_rejects_wrong_audience(self, mock_urlopen):
        payload = dict(BASE_PAYLOAD, aud='someone-else.apps.googleusercontent.com')
        mock_urlopen.return_value = _FakeResponse(payload)
        with self.assertRaises(InvalidGoogleTokenError):
            verify_google_id_token('opaque-id-token')

    @mock.patch('urllib.request.urlopen')
    def test_rejects_untrusted_issuer(self, mock_urlopen):
        payload = dict(BASE_PAYLOAD, iss='https://evil.example.com')
        mock_urlopen.return_value = _FakeResponse(payload)
        with self.assertRaises(InvalidGoogleTokenError):
            verify_google_id_token('opaque-id-token')

    @mock.patch('urllib.request.urlopen')
    def test_rejects_unverified_email(self, mock_urlopen):
        payload = dict(BASE_PAYLOAD, email_verified='false')
        mock_urlopen.return_value = _FakeResponse(payload)
        with self.assertRaises(GoogleEmailUnverifiedError):
            verify_google_id_token('opaque-id-token')

    @mock.patch('urllib.request.urlopen')
    def test_rejects_missing_subject(self, mock_urlopen):
        payload = dict(BASE_PAYLOAD)
        payload.pop('sub')
        mock_urlopen.return_value = _FakeResponse(payload)
        with self.assertRaises(InvalidGoogleTokenError):
            verify_google_id_token('opaque-id-token')

    @mock.patch('urllib.request.urlopen')
    def test_http_error_maps_to_invalid_token(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            'https://oauth2.googleapis.com/tokeninfo', 400, 'Bad Request', {}, None
        )
        with self.assertRaises(InvalidGoogleTokenError):
            verify_google_id_token('expired-token')

    @mock.patch('urllib.request.urlopen')
    def test_network_error_maps_to_provider_unavailable(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError('connection refused')
        with self.assertRaises(GoogleProviderUnavailableError):
            verify_google_id_token('opaque-id-token')

    def test_empty_token_rejected(self):
        with self.assertRaises(InvalidGoogleTokenError):
            verify_google_id_token('')

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_unconfigured_server_rejects(self):
        with self.assertRaises(GoogleSignInNotConfiguredError):
            verify_google_id_token('opaque-id-token')


# ==============================================================================
# 3. ACCOUNT LINKING POLICY (SERVICE)
# ==============================================================================

@override_settings(GOOGLE_CLIENT_ID=CLIENT_ID)
class GoogleAccountLinkingTests(TestCase):
    def test_google_first_creates_local_user_and_link(self):
        result = sign_in_with_google(_claims(email='newuser@example.com', sub='sub-new'))
        self.assertTrue(result['created'])
        self.assertFalse(result['linked'])
        user = result['user']
        self.assertEqual(user.email, 'newuser@example.com')
        self.assertEqual(user.role, 'customer')
        self.assertFalse(user.has_usable_password())
        self.assertTrue(
            SocialAccount.objects.filter(
                user=user, provider=SocialProvider.GOOGLE, provider_subject='sub-new'
            ).exists()
        )

    def test_matching_verified_email_links_existing_account(self):
        existing = User.objects.create_user(
            email='customer@example.com', password='SecurePass123!',
            first_name='Old', last_name='Account',
        )
        result = sign_in_with_google(_claims(email='Customer@Example.com', sub='sub-link'))
        self.assertFalse(result['created'])
        self.assertTrue(result['linked'])
        self.assertEqual(result['user'].id, existing.id)
        # No duplicate account with the same email.
        self.assertEqual(User.objects.filter(email='customer@example.com').count(), 1)
        # Existing password login is preserved (not overwritten).
        existing.refresh_from_db()
        self.assertTrue(existing.check_password('SecurePass123!'))

    def test_different_email_creates_separate_identity(self):
        existing = User.objects.create_user(
            email='customer@example.com', password='SecurePass123!',
            first_name='Old', last_name='Account',
        )
        result = sign_in_with_google(_claims(email='other@example.com', sub='sub-other'))
        self.assertTrue(result['created'])
        self.assertNotEqual(result['user'].id, existing.id)
        self.assertEqual(User.objects.count(), 2)

    def test_existing_link_authenticates_same_user(self):
        first = sign_in_with_google(_claims(email='repeat@example.com', sub='sub-repeat'))
        second = sign_in_with_google(_claims(email='repeat@example.com', sub='sub-repeat'))
        self.assertEqual(first['user'].id, second['user'].id)
        self.assertFalse(second['created'])
        self.assertFalse(second['linked'])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(SocialAccount.objects.count(), 1)

    def test_repeated_login_with_stale_email_uses_subject(self):
        # A provider email change must not create a second account: subject wins.
        first = sign_in_with_google(_claims(email='primary@example.com', sub='sub-stable'))
        second = sign_in_with_google(_claims(email='changed@example.com', sub='sub-stable'))
        self.assertEqual(first['user'].id, second['user'].id)
        self.assertEqual(User.objects.count(), 1)

    def test_inactive_account_rejected(self):
        user = User.objects.create_user(
            email='inactive@example.com', password='SecurePass123!',
            first_name='In', last_name='Active',
        )
        user.is_active = False
        user.save(update_fields=['is_active'])
        with self.assertRaises(GoogleAccountInactiveError):
            sign_in_with_google(_claims(email='inactive@example.com', sub='sub-inactive'))
        self.assertFalse(SocialAccount.objects.filter(user=user).exists())

    def test_audit_events_written_for_link_and_register(self):
        sign_in_with_google(_claims(email='new1@example.com', sub='sub-a'))
        sign_in_with_google(_claims(email='new2@example.com', sub='sub-b'))
        self.assertTrue(
            IdentityAuditLog.objects.filter(event_type=IdentityEventType.GOOGLE_REGISTER).exists()
        )
        User.objects.create_user(
            email='existing@example.com', password='SecurePass123!',
            first_name='Ex', last_name='Ist',
        )
        sign_in_with_google(_claims(email='existing@example.com', sub='sub-c'))
        self.assertTrue(
            IdentityAuditLog.objects.filter(event_type=IdentityEventType.GOOGLE_LINK).exists()
        )

    def test_audit_never_contains_secrets(self):
        sign_in_with_google(_claims(email='audit@example.com', sub='sub-audit'))
        entry = IdentityAuditLog.objects.filter(email='audit@example.com').first()
        self.assertIsNotNone(entry)
        blob = f"{entry.detail} {entry.provider_subject} {entry.email}".lower()
        for forbidden in ('secret', 'access_token', 'refresh_token', 'password', 'authorization_code'):
            self.assertNotIn(forbidden, blob)


# ==============================================================================
# 4. MODEL CONSTRAINTS
# ==============================================================================

class SocialAccountConstraintTests(TestCase):
    def test_unique_provider_subject(self):
        from django.db import IntegrityError, transaction

        user1 = User.objects.create_user(email='one@example.com', password='SecurePass123!')
        user2 = User.objects.create_user(email='two@example.com', password='SecurePass123!')
        SocialAccount.objects.create(
            user=user1, provider=SocialProvider.GOOGLE, provider_subject='dup-sub', email='one@example.com'
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SocialAccount.objects.create(
                    user=user2, provider=SocialProvider.GOOGLE,
                    provider_subject='dup-sub', email='two@example.com'
                )


# ==============================================================================
# 5. API ENDPOINT
# ==============================================================================

@override_settings(GOOGLE_CLIENT_ID=CLIENT_ID)
class GoogleLoginEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _post(self, credential='opaque-id-token'):
        return self.client.post(GOOGLE_URL, {'credential': credential}, format='json')

    def test_missing_credential_returns_canonical_error(self):
        response = self.client.post(GOOGLE_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertIn('error', response.data)

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_google_first_registration_returns_jwt(self, mock_verify):
        mock_verify.return_value = _claims(email='brandnew@example.com', sub='sub-api-new')
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_new_user'])
        self.assertFalse(response.data['linked_existing_account'])
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

        # Returned token authenticates against the existing endpoint + RBAC.
        token = AccessToken(response.data['access'])
        self.assertEqual(int(token['user_id']), response.data['user']['id'])
        me = self.client.get('/api/v1/auth/me/', HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['email'], 'brandnew@example.com')

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_links_existing_account_and_flags_it(self, mock_verify):
        User.objects.create_user(
            email='known@example.com', password='SecurePass123!',
            first_name='Known', last_name='User',
        )
        mock_verify.return_value = _claims(email='Known@Example.com', sub='sub-api-link')
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_new_user'])
        self.assertTrue(response.data['linked_existing_account'])
        self.assertEqual(User.objects.filter(email='known@example.com').count(), 1)

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_different_email_stays_separate(self, mock_verify):
        User.objects.create_user(
            email='known2@example.com', password='SecurePass123!',
            first_name='Known', last_name='User',
        )
        mock_verify.return_value = _claims(email='different@example.com', sub='sub-api-other')
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 2)

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_inactive_user_returns_403(self, mock_verify):
        user = User.objects.create_user(
            email='off@example.com', password='SecurePass123!', first_name='Off', last_name='User',
        )
        user.is_active = False
        user.save(update_fields=['is_active'])
        mock_verify.return_value = _claims(email='off@example.com', sub='sub-api-off')
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['error']['code'], 'ACCOUNT_INACTIVE')

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_invalid_token_returns_401_canonical_code(self, mock_verify):
        mock_verify.side_effect = InvalidGoogleTokenError()
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error']['code'], 'INVALID_GOOGLE_TOKEN')

    @mock.patch('apps.users.views.verify_google_id_token')
    def test_unverified_email_returns_canonical_code(self, mock_verify):
        mock_verify.side_effect = GoogleEmailUnverifiedError()
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error']['code'], 'GOOGLE_EMAIL_UNVERIFIED')

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_unconfigured_server_returns_503(self):
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['error']['code'], 'GOOGLE_SIGNIN_NOT_CONFIGURED')


# ==============================================================================
# 6. REGRESSION: EXISTING EMAIL/PASSWORD AUTH UNCHANGED
# ==============================================================================

class ExistingAuthRegressionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_email_password_registration_and_login_still_work(self):
        register = self.client.post('/api/v1/auth/register/', {
            'email': 'regression@example.com',
            'password': 'SecurePass123!',
            'first_name': 'Re',
            'last_name': 'Gression',
        }, format='json')
        self.assertEqual(register.status_code, status.HTTP_201_CREATED)

        login = self.client.post('/api/v1/auth/login/', {
            'email': 'regression@example.com',
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn('access', login.data)

    def test_google_login_requires_no_authentication(self):
        # Endpoint is public; unauthenticated request reaches validation (400), not 401.
        response = self.client.post(GOOGLE_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# 7. PKCE & OAUTH FLOW HELPERS
# ==============================================================================

@override_settings(
    GOOGLE_CLIENT_ID=CLIENT_ID,
    GOOGLE_CLIENT_SECRET='test-client-secret',
    GOOGLE_REDIRECT_URI='http://localhost:8000/auth/google/callback',
)
class PKCEAndOAuthHelperTests(TestCase):
    def test_generate_pkce_pair(self):
        verifier, challenge = generate_pkce_pair()
        self.assertGreaterEqual(len(verifier), 43)
        self.assertGreater(len(challenge), 20)
        self.assertNotIn('=', challenge)

    def test_generate_oauth_state(self):
        state1 = generate_oauth_state()
        state2 = generate_oauth_state()
        self.assertGreaterEqual(len(state1), 32)
        self.assertNotEqual(state1, state2)

    def test_build_google_auth_url(self):
        verifier, challenge = generate_pkce_pair()
        state = generate_oauth_state()
        url = build_google_auth_url(state=state, code_challenge=challenge)
        self.assertIn('https://accounts.google.com/o/oauth2/v2/auth', url)
        self.assertIn(f'client_id={CLIENT_ID}', url)
        self.assertIn('state=' + state, url)
        self.assertIn('code_challenge=' + challenge, url)
        self.assertIn('code_challenge_method=S256', url)
        self.assertIn('scope=openid+email+profile', url)

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_build_auth_url_unconfigured_raises(self):
        with self.assertRaises(GoogleSignInNotConfiguredError):
            build_google_auth_url(state='state123')


# ==============================================================================
# 8. OAUTH 2.0 ENDPOINTS (INIT & CALLBACK)
# ==============================================================================

@override_settings(
    GOOGLE_CLIENT_ID=CLIENT_ID,
    GOOGLE_CLIENT_SECRET='test-secret-value',
    GOOGLE_REDIRECT_URI='http://localhost:8000/auth/google/callback',
    FRONTEND_URL='http://localhost:5173',
)
class GoogleOAuthEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_oauth_init_redirects_and_stores_session(self):
        response = self.client.get('/auth/google/login/')
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn('accounts.google.com', response.url)
        self.assertIn('state=', response.url)
        # Check session contains state and PKCE verifier
        session = self.client.session
        self.assertIn('google_oauth_state', session)
        self.assertIn('google_oauth_code_verifier', session)

    def test_oauth_init_json_format_returns_url(self):
        response = self.client.get('/auth/google/login/?format=json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('authorization_url', response.data)
        self.assertIn('state', response.data)

    def test_callback_handles_user_cancellation(self):
        response = self.client.get('/auth/google/callback?error=access_denied')
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn('cancelled=1', response.url)
        self.assertTrue(
            IdentityAuditLog.objects.filter(event_type=IdentityEventType.LINK_REJECTED).exists()
        )

    def test_callback_rejects_invalid_state(self):
        session = self.client.session
        session['google_oauth_state'] = 'correct-state'
        session.save()

        response = self.client.get('/auth/google/callback?code=some-code&state=wrong-state')
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn('error=invalid_state', response.url)

    @mock.patch('apps.users.views.verify_google_id_token')
    @mock.patch('apps.users.views.exchange_code_for_tokens')
    def test_callback_successful_exchange_redirects_with_tokens(self, mock_exchange, mock_verify):
        session = self.client.session
        session['google_oauth_state'] = 'valid-state'
        session['google_oauth_code_verifier'] = 'pkce-verifier-123'
        session.save()

        mock_exchange.return_value = {
            'id_token': 'fake-id-token',
            'access_token': 'fake-access-token',
        }
        mock_verify.return_value = _claims(email='oauthuser@example.com', sub='oauth-sub-1')

        response = self.client.get('/auth/google/callback?code=auth-code-123&state=valid-state')
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn('token=', response.url)
        self.assertIn('refresh=', response.url)
        self.assertIn('is_new=1', response.url)

        # Verified MySQL user exists with customer role
        user = User.objects.filter(email='oauthuser@example.com').first()
        self.assertIsNotNone(user)
        self.assertEqual(user.role, 'customer')
        self.assertFalse(user.is_staff)
        self.assertTrue(SocialAccount.objects.filter(user=user, provider_subject='oauth-sub-1').exists())

    @mock.patch('apps.users.views.verify_google_id_token')
    @mock.patch('apps.users.views.exchange_code_for_tokens')
    def test_callback_links_existing_email_account(self, mock_exchange, mock_verify):
        existing = User.objects.create_user(
            email='existing_cb@example.com',
            password='Password123!',
            first_name='Existing',
            last_name='User',
        )
        session = self.client.session
        session['google_oauth_state'] = 'valid-state-2'
        session.save()

        mock_exchange.return_value = {'id_token': 'fake-id-token'}
        mock_verify.return_value = _claims(email='existing_cb@example.com', sub='oauth-sub-2')

        response = self.client.get('/auth/google/callback?code=auth-code-456&state=valid-state-2')
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn('linked=1', response.url)

        # Existing user password is preserved
        existing.refresh_from_db()
        self.assertTrue(existing.check_password('Password123!'))
        self.assertTrue(SocialAccount.objects.filter(user=existing, provider_subject='oauth-sub-2').exists())
