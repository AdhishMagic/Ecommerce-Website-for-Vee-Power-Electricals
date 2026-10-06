"""
Admin Settings module test matrix.

Covers the five administrative settings concerns exposed at ``/api/v1/settings/``
plus the reused profile endpoint at ``/api/v1/auth/me/``:

1. Access control — 401 unauthenticated, 403 non-administrator, 200 administrator.
2. Administrator profile — read/update of permitted fields, privilege-escalation denial.
3. Notification policy — persistence, actor attribution, audit trail, dispatch enforcement.
4. Password change — verification, Django password validators, hashing, session revocation.
5. Security overview + session revocation — real SimpleJWT blacklist-backed session state.
6. System information — complete, and provably free of secrets.

Every test asserts against the canonical error envelope produced by
``apps.common.exceptions.custom_exception_handler``.
"""
import json
import uuid

from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.admin_settings.models import NotificationSettings
from apps.admin_settings.services import (
    SESSION_DISPLAY_LIMIT,
    active_sessions,
    build_system_information,
    database_diagnostics,
    environment_name,
    last_applied_migration,
    revoke_all_sessions,
)
from apps.core.models import AdminConfigAuditLog, CommunicationLog, CommunicationStatus
from apps.core.services.communication_service import CommunicationService
from apps.users.models import UserRole

User = get_user_model()

NOTIFICATIONS_URL = '/api/v1/settings/notifications/'
CHANGE_PASSWORD_URL = '/api/v1/settings/change-password/'
SECURITY_URL = '/api/v1/settings/security/'
REVOKE_SESSIONS_URL = '/api/v1/settings/security/revoke-sessions/'
SYSTEM_URL = '/api/v1/settings/system/'
PROFILE_URL = '/api/v1/auth/me/'

#: Every endpoint this module introduces, for uniform access-control assertions.
ADMIN_ONLY_ENDPOINTS = (
    NOTIFICATIONS_URL,
    SECURITY_URL,
    SYSTEM_URL,
)

ADMIN_STRONG_PASSWORD = 'VeePower#Admin2026!'
NEW_ADMIN_PASSWORD = 'Rotated#Admin2027!'


class AdminSettingsTestBase(TestCase):
    """Shared fixtures: one administrator, one customer, real JWT credentials."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email='settings_admin@veepower.in',
            first_name='Settings',
            last_name='Administrator',
            phone='+919876500001',
            password=ADMIN_STRONG_PASSWORD,
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.other_admin = User.objects.create_user(
            email='other_admin@veepower.in',
            first_name='Other',
            last_name='Administrator',
            password=ADMIN_STRONG_PASSWORD,
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email='settings_customer@example.com',
            first_name='Settings',
            last_name='Customer',
            phone='+919876500002',
            password=ADMIN_STRONG_PASSWORD,
            role=UserRole.CUSTOMER,
        )

        self.token_admin = str(AccessToken.for_user(self.admin))
        self.token_customer = str(AccessToken.for_user(self.customer))

    # -- helpers ---------------------------------------------------------
    def authenticate_admin(self, token=None):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token or self.token_admin}')

    def authenticate_customer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

    def authenticate_anonymous(self):
        self.client.credentials()

    @staticmethod
    def envelope(response):
        return response.json()

    def assert_canonical_error(self, response, expected_status):
        self.assertEqual(response.status_code, expected_status)
        payload = response.json()
        self.assertFalse(payload.get('success'))
        self.assertIn('error', payload)
        self.assertIn('code', payload['error'])
        self.assertIn('request_id', payload['error'])
        return payload['error']


class AdminSettingsAccessControlTests(AdminSettingsTestBase):
    """RBAC is enforced server-side; frontend guards are never trusted."""

    def test_unauthenticated_read_endpoints_return_401(self):
        self.authenticate_anonymous()
        for url in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(url=url):
                error = self.assert_canonical_error(
                    self.client.get(url), status.HTTP_401_UNAUTHORIZED
                )
                self.assertEqual(error['code'], 'NOT_AUTHENTICATED')

    def test_unauthenticated_password_change_returns_401(self):
        self.authenticate_anonymous()
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                'current_password': ADMIN_STRONG_PASSWORD,
                'new_password': NEW_ADMIN_PASSWORD,
                'confirm_password': NEW_ADMIN_PASSWORD,
            },
            format='json',
        )
        self.assert_canonical_error(response, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_session_revocation_returns_401(self):
        self.authenticate_anonymous()
        self.assert_canonical_error(
            self.client.post(REVOKE_SESSIONS_URL), status.HTTP_401_UNAUTHORIZED
        )

    def test_customer_reads_are_forbidden(self):
        self.authenticate_customer()
        for url in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(url=url):
                error = self.assert_canonical_error(
                    self.client.get(url), status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(error['code'], 'PERMISSION_DENIED')
                self.assertIn('Administrative privileges', error['message'])

    def test_customer_writes_are_forbidden(self):
        self.authenticate_customer()

        patch_response = self.client.patch(
            NOTIFICATIONS_URL, {'order_notifications': False}, format='json'
        )
        self.assert_canonical_error(patch_response, status.HTTP_403_FORBIDDEN)

        password_response = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                'current_password': ADMIN_STRONG_PASSWORD,
                'new_password': NEW_ADMIN_PASSWORD,
                'confirm_password': NEW_ADMIN_PASSWORD,
            },
            format='json',
        )
        self.assert_canonical_error(password_response, status.HTTP_403_FORBIDDEN)

        revoke_response = self.client.post(REVOKE_SESSIONS_URL)
        self.assert_canonical_error(revoke_response, status.HTTP_403_FORBIDDEN)

    def test_customer_password_is_never_mutated_by_forbidden_request(self):
        self.authenticate_customer()
        self.client.post(
            CHANGE_PASSWORD_URL,
            {
                'current_password': ADMIN_STRONG_PASSWORD,
                'new_password': NEW_ADMIN_PASSWORD,
                'confirm_password': NEW_ADMIN_PASSWORD,
            },
            format='json',
        )
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password(ADMIN_STRONG_PASSWORD))

    def test_administrator_can_read_every_read_endpoint(self):
        self.authenticate_admin()
        for url in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)


class AdminProfileSectionTests(AdminSettingsTestBase):
    """Profile section reuses the existing /auth/me/ contract; no duplicate identity API."""

    def test_profile_returns_the_authenticated_administrator(self):
        self.authenticate_admin()
        response = self.client.get(PROFILE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payload = response.json()
        self.assertEqual(payload['email'], 'settings_admin@veepower.in')
        self.assertEqual(payload['first_name'], 'Settings')
        self.assertEqual(payload['last_name'], 'Administrator')
        self.assertEqual(payload['phone'], '+919876500001')
        self.assertEqual(payload['role'], UserRole.ADMIN)
        self.assertTrue(payload['is_active'])
        self.assertIn('created_at', payload)

    def test_profile_payload_contains_no_password_material(self):
        self.authenticate_admin()
        body = json.dumps(self.client.get(PROFILE_URL).json())
        self.assertNotIn('password', body.lower())
        self.assertNotIn(self.admin.password, body)

    def test_profile_update_persists_allowed_fields(self):
        self.authenticate_admin()
        response = self.client.patch(
            PROFILE_URL,
            {
                'first_name': 'Renamed',
                'last_name': 'Operator',
                'phone': '+919876500099',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['first_name'], 'Renamed')

        self.admin.refresh_from_db()
        self.assertEqual(self.admin.first_name, 'Renamed')
        self.assertEqual(self.admin.last_name, 'Operator')
        self.assertEqual(self.admin.phone, '+919876500099')

    def test_profile_update_is_database_authoritative_on_reload(self):
        self.authenticate_admin()
        self.client.patch(PROFILE_URL, {'first_name': 'Persisted'}, format='json')

        # A brand-new request/session must observe the same values.
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        self.assertEqual(fresh.get(PROFILE_URL).json()['first_name'], 'Persisted')

    def test_role_escalation_attempts_are_rejected(self):
        self.authenticate_admin()
        for field, value in (
            ('role', 'customer'),
            ('is_staff', False),
            ('is_superuser', False),
            ('is_active', False),
            ('email', 'attacker@example.com'),
            ('id', 999),
        ):
            with self.subTest(field=field):
                response = self.client.patch(PROFILE_URL, {field: value}, format='json')
                self.assert_canonical_error(response, status.HTTP_400_BAD_REQUEST)

                self.admin.refresh_from_db()
                self.assertEqual(self.admin.role, UserRole.ADMIN)
                self.assertTrue(self.admin.is_staff)
                self.assertTrue(self.admin.is_superuser)
                self.assertTrue(self.admin.is_active)
                self.assertEqual(self.admin.email, 'settings_admin@veepower.in')

    def test_customer_cannot_escalate_own_role(self):
        self.authenticate_customer()
        response = self.client.patch(PROFILE_URL, {'role': 'admin'}, format='json')
        self.assert_canonical_error(response, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, UserRole.CUSTOMER)
        self.assertFalse(self.customer.is_staff)

    def test_profile_endpoint_never_accepts_target_user_id(self):
        """No user-id parameter exists, so one admin can never read another's profile."""
        self.authenticate_admin()
        response = self.client.get(PROFILE_URL, {'user': self.other_admin.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['email'], 'settings_admin@veepower.in')
        self.assertNotEqual(response.json()['email'], self.other_admin.email)


class NotificationPolicyStorageTests(AdminSettingsTestBase):
    """Notification preferences are persisted MySQL rows, not React state."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    def test_defaults_are_all_enabled(self):
        payload = self.client.get(NOTIFICATIONS_URL).json()
        for field in NotificationSettings.CATEGORY_FIELDS:
            self.assertTrue(payload[field], f'{field} should default to enabled')
        self.assertTrue(payload['email_notifications_enabled'])

    def test_get_creates_exactly_one_singleton_row(self):
        self.client.get(NOTIFICATIONS_URL)
        self.client.get(NOTIFICATIONS_URL)
        self.assertEqual(NotificationSettings.objects.count(), 1)

    def test_patch_persists_to_database(self):
        response = self.client.patch(
            NOTIFICATIONS_URL,
            {'order_notifications': False, 'invoice_notifications': False},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        persisted = NotificationSettings.objects.get()
        self.assertFalse(persisted.order_notifications)
        self.assertFalse(persisted.invoice_notifications)
        self.assertTrue(persisted.payment_notifications)

    def test_changes_survive_a_fresh_session_and_reload(self):
        self.client.patch(NOTIFICATIONS_URL, {'payment_notifications': False}, format='json')

        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        self.assertFalse(fresh.get(NOTIFICATIONS_URL).json()['payment_notifications'])

    def test_response_reflects_persisted_row_not_request_payload(self):
        response = self.client.patch(
            NOTIFICATIONS_URL,
            {'order_notifications': False, 'quotation_notifications': False},
            format='json',
        )
        payload = response.json()
        persisted = NotificationSettings.objects.get()
        self.assertEqual(payload['order_notifications'], persisted.order_notifications)
        self.assertEqual(payload['quotation_notifications'], persisted.quotation_notifications)

        # The returned row must be the persisted database state, re-read after save.
        persisted.refresh_from_db()
        self.assertEqual(
            payload['order_notifications'],
            NotificationSettings.objects.get().order_notifications,
        )
        self.assertIsNotNone(payload['updated_at'])

    def test_actor_is_recorded_server_side_and_cannot_be_spoofed(self):
        response = self.client.patch(
            NOTIFICATIONS_URL,
            {'order_notifications': False, 'updated_by': self.other_admin.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        persisted = NotificationSettings.objects.get()
        self.assertEqual(persisted.updated_by_id, self.admin.id)
        self.assertEqual(response.json()['updated_by_email'], self.admin.email)

    def test_update_writes_audit_trail(self):
        self.client.patch(
            NOTIFICATIONS_URL,
            {'order_notifications': False, 'change_reason': 'Peak season policy'},
            format='json',
        )
        entry = AdminConfigAuditLog.objects.filter(domain='notifications').first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.admin_user_id, self.admin.id)
        self.assertEqual(entry.action_type, 'UPDATE')
        self.assertEqual(entry.change_reason, 'Peak season policy')
        self.assertFalse(entry.new_value['order_notifications'])
        self.assertTrue(entry.old_value['order_notifications'])

    def test_master_switch_can_be_turned_off(self):
        self.client.patch(
            NOTIFICATIONS_URL, {'email_notifications_enabled': False}, format='json'
        )
        self.assertFalse(NotificationSettings.objects.get().email_notifications_enabled)

    def test_unknown_fields_do_not_create_privileged_columns(self):
        response = self.client.patch(
            NOTIFICATIONS_URL,
            {'order_notifications': False, 'updated_by': self.other_admin.id, 'is_superuser': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('is_superuser', response.json())
        self.assertEqual(NotificationSettings.objects.get().updated_by_id, self.admin.id)

    def test_invalid_type_is_rejected_with_canonical_error(self):
        response = self.client.patch(
            NOTIFICATIONS_URL, {'order_notifications': 'not-a-boolean'}, format='json'
        )
        self.assert_canonical_error(response, status.HTTP_400_BAD_REQUEST)

    def test_singleton_guard_rejects_second_row(self):
        NotificationSettings.get_solo()
        with self.assertRaises(DjangoValidationError):
            NotificationSettings.objects.create()

    def test_get_solo_is_idempotent(self):
        first = NotificationSettings.get_solo()
        second = NotificationSettings.get_solo()
        self.assertEqual(first.pk, second.pk)


class NotificationPolicySemanticsTests(TestCase):
    """Unit-level proof that the policy maps event types onto real categories."""

    def test_event_prefixes_map_to_their_category(self):
        expectations = {
            'ORDER_CONFIRMED': 'order_notifications',
            'ORDER_SHIPPED': 'order_notifications',
            'PAYMENT_CONFIRMED': 'payment_notifications',
            'PAYMENT_FAILED': 'payment_notifications',
            'INVOICE_GENERATED': 'invoice_notifications',
            'QUOTATION_UPDATE': 'quotation_notifications',
            'CUSTOMER_REGISTRATION': 'customer_notifications',
            'INQUIRY_ACKNOWLEDGED': 'customer_notifications',
        }
        for event_type, category in expectations.items():
            with self.subTest(event_type=event_type):
                self.assertEqual(NotificationSettings.resolve_category(event_type), category)

    def test_unmapped_events_are_not_policy_controlled(self):
        self.assertIsNone(NotificationSettings.resolve_category('SOMETHING_ELSE'))
        self.assertIsNone(NotificationSettings.resolve_category(''))
        self.assertTrue(NotificationSettings.is_event_enabled('SOMETHING_ELSE'))

    def test_password_reset_is_never_suppressible(self):
        NotificationSettings.objects.create(
            email_notifications_enabled=False,
            order_notifications=False,
            payment_notifications=False,
            invoice_notifications=False,
            quotation_notifications=False,
            customer_notifications=False,
        )
        self.assertIsNone(NotificationSettings.resolve_category('PASSWORD_RESET'))
        self.assertTrue(NotificationSettings.is_event_enabled('PASSWORD_RESET'))

    def test_missing_policy_row_preserves_always_deliver_behaviour(self):
        self.assertIsNone(NotificationSettings.current())
        for event_type in ('ORDER_CONFIRMED', 'PAYMENT_FAILED', 'INVOICE_GENERATED'):
            with self.subTest(event_type=event_type):
                self.assertTrue(NotificationSettings.is_event_enabled(event_type))

    def test_master_switch_disables_every_category(self):
        policy = NotificationSettings.objects.create(email_notifications_enabled=False)
        self.assertEqual(set(policy.disabled_categories()), set(NotificationSettings.CATEGORY_FIELDS))
        self.assertFalse(NotificationSettings.is_event_enabled('ORDER_CONFIRMED'))

    def test_single_category_switch_is_isolated(self):
        NotificationSettings.objects.create(order_notifications=False)
        self.assertFalse(NotificationSettings.is_event_enabled('ORDER_CONFIRMED'))
        self.assertTrue(NotificationSettings.is_event_enabled('PAYMENT_CONFIRMED'))


class NotificationPolicyEnforcementTests(AdminSettingsTestBase):
    """A disabled category is recorded as SKIPPED and never transmitted."""

    def setUp(self):
        super().setUp()
        mail.outbox = []

    def send(self, event_type, template_base, key=None, recipient='buyer@example.com'):
        return CommunicationService.send_email(
            event_type=event_type,
            recipient=recipient,
            subject='Vee Power Electricals notification',
            template_base=template_base,
            context={'customer_name': 'Test Buyer'},
            idempotency_key=key or f'admin-settings-{uuid.uuid4().hex}',
        )

    def test_disabled_order_category_is_skipped_and_not_sent(self):
        NotificationSettings.objects.create(order_notifications=False)

        log = self.send('ORDER_CONFIRMED', 'order_confirmation')

        self.assertEqual(log.status, CommunicationStatus.SKIPPED)
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn('order_notifications', log.error_message)

    def test_enabled_category_is_delivered(self):
        NotificationSettings.objects.create(order_notifications=True)

        log = self.send('ORDER_CONFIRMED', 'order_confirmation')

        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(log.recipient, 'buyer@example.com')

    def test_master_switch_skips_order_payment_invoice_and_quotation(self):
        NotificationSettings.objects.create(email_notifications_enabled=False)

        for event_type, template in (
            ('ORDER_CONFIRMED', 'order_confirmation'),
            ('PAYMENT_CONFIRMED', 'payment_confirmation'),
            ('INVOICE_GENERATED', 'invoice_notification'),
            ('QUOTATION_UPDATE', 'quotation_notification'),
        ):
            with self.subTest(event_type=event_type):
                log = self.send(event_type, template)
                self.assertEqual(log.status, CommunicationStatus.SKIPPED)

        self.assertEqual(len(mail.outbox), 0)

    def test_password_reset_is_delivered_even_when_master_switch_is_off(self):
        NotificationSettings.objects.create(email_notifications_enabled=False)

        log = self.send('PASSWORD_RESET', 'password_reset')

        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(len(mail.outbox), 1)

    def test_unmapped_event_is_delivered_when_master_switch_is_off(self):
        NotificationSettings.objects.create(email_notifications_enabled=False)

        log = self.send('LEGACY_UNMAPPED_EVENT', 'welcome')

        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(len(mail.outbox), 1)

    def test_reenabling_restores_delivery(self):
        policy = NotificationSettings.objects.create(order_notifications=False)
        self.assertEqual(
            self.send('ORDER_CONFIRMED', 'order_confirmation').status,
            CommunicationStatus.SKIPPED,
        )

        policy.order_notifications = True
        policy.save()

        self.assertEqual(
            self.send('ORDER_CONFIRMED', 'order_confirmation').status,
            CommunicationStatus.SENT,
        )
        self.assertEqual(len(mail.outbox), 1)

    def test_suppressed_event_records_audit_log_entry(self):
        NotificationSettings.objects.create(payment_notifications=False)

        log = self.send('PAYMENT_FAILED', 'payment_failure')

        self.assertTrue(CommunicationLog.objects.filter(id=log.id).exists())
        self.assertEqual(log.event_type, 'PAYMENT_FAILED')
        self.assertIn('payment_notifications', log.error_message)

    def test_policy_change_flows_through_the_admin_api(self):
        """End-to-end: PATCH the API, then observe the dispatch layer honour it."""
        self.authenticate_admin()
        response = self.client.patch(
            NOTIFICATIONS_URL, {'order_notifications': False}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        log = self.send('ORDER_CONFIRMED', 'order_confirmation')
        self.assertEqual(log.status, CommunicationStatus.SKIPPED)
        self.assertEqual(len(mail.outbox), 0)

    def test_staff_login_does_not_bypass_policy(self):
        """Policy applies regardless of who triggered the business transaction."""
        NotificationSettings.objects.create(order_notifications=False)
        self.authenticate_admin()

        log = self.send('ORDER_STATUS_UPDATE', 'order_status_update')
        self.assertEqual(log.status, CommunicationStatus.SKIPPED)


class PasswordChangeTests(AdminSettingsTestBase):
    """Secure credential rotation using the existing Django/SimpleJWT machinery."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    def post(self, current=ADMIN_STRONG_PASSWORD, new=NEW_ADMIN_PASSWORD, confirm=None):
        return self.client.post(
            CHANGE_PASSWORD_URL,
            {
                'current_password': current,
                'new_password': new,
                'confirm_password': new if confirm is None else confirm,
            },
            format='json',
        )

    def test_correct_credentials_rotate_the_password(self):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(NEW_ADMIN_PASSWORD))
        self.assertFalse(self.admin.check_password(ADMIN_STRONG_PASSWORD))

    def test_wrong_current_password_is_rejected(self):
        error = self.assert_canonical_error(
            self.post(current='DefinitelyWrong#123'), status.HTTP_400_BAD_REQUEST
        )
        self.assertIn('current_password', error['details'])

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(ADMIN_STRONG_PASSWORD))

    def test_mismatched_confirmation_is_rejected(self):
        error = self.assert_canonical_error(
            self.post(confirm='Something#Else123'), status.HTTP_400_BAD_REQUEST
        )
        self.assertIn('confirm_password', error['details'])

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(ADMIN_STRONG_PASSWORD))

    def test_weak_passwords_are_rejected_by_django_validators(self):
        for weak in ('short1!', '12345678', 'password', 'password123'):
            with self.subTest(weak=weak):
                response = self.post(new=weak)
                self.assert_canonical_error(response, status.HTTP_400_BAD_REQUEST)
                self.assertIn('new_password', response.json()['error']['details'])

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(ADMIN_STRONG_PASSWORD))

    def test_missing_fields_are_rejected(self):
        response = self.client.post(CHANGE_PASSWORD_URL, {}, format='json')
        self.assert_canonical_error(response, status.HTTP_400_BAD_REQUEST)

    def test_password_is_hashed_not_stored_in_plaintext(self):
        self.post()
        self.admin.refresh_from_db()
        self.assertNotEqual(self.admin.password, NEW_ADMIN_PASSWORD)
        self.assertTrue(self.admin.password.startswith(('pbkdf2_', 'argon2$', 'scrypt$')))

    def test_response_never_contains_password_material(self):
        response = self.post()
        body = json.dumps(response.json())

        self.assertNotIn(NEW_ADMIN_PASSWORD, body)
        self.assertNotIn(ADMIN_STRONG_PASSWORD, body)
        self.admin.refresh_from_db()
        self.assertNotIn(self.admin.password, body)
        self.assertNotIn('"password"', body)

    def test_response_returns_a_usable_fresh_token_pair(self):
        response = self.post()
        payload = response.json()
        self.assertIn('access', payload)
        self.assertIn('refresh', payload)

        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {payload["access"]}')
        self.assertEqual(fresh.get(PROFILE_URL).status_code, status.HTTP_200_OK)

    def test_existing_sessions_are_revoked(self):
        stale_tokens = [RefreshToken.for_user(self.admin) for _ in range(2)]
        for token in stale_tokens:
            OutstandingToken.objects.get_or_create(
                jti=token['jti'],
                defaults={
                    'token': str(token),
                    'user': self.admin,
                    'created_at': timezone.now(),
                    'expires_at': timezone.now() + token.lifetime,
                },
            )

        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.json()['sessions_revoked'], 2)

        for token in stale_tokens:
            outstanding = OutstandingToken.objects.filter(jti=token['jti']).first()
            if outstanding:
                self.assertTrue(
                    BlacklistedToken.objects.filter(token=outstanding).exists(),
                    'Every previously issued refresh token must be blacklisted',
                )

    def test_password_change_is_audited_without_credentials(self):
        self.post()
        entry = AdminConfigAuditLog.objects.filter(domain='admin_account').first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.new_value.get('event'), 'PASSWORD_CHANGED')

        serialized = json.dumps(entry.new_value)
        self.assertNotIn(NEW_ADMIN_PASSWORD, serialized)
        self.assertNotIn(ADMIN_STRONG_PASSWORD, serialized)
        self.admin.refresh_from_db()
        self.assertNotIn(self.admin.password, serialized)

        # No audit field may be named like a credential.
        for key in entry.new_value:
            self.assertNotIn('password', key.lower().replace('password_changed', ''))
            self.assertNotIn('secret', key.lower())
            self.assertNotIn('token', key.lower())

    def test_new_password_actually_authenticates_via_login_endpoint(self):
        self.post()
        response = APIClient().post(
            '/api/v1/auth/login/',
            {'email': self.admin.email, 'password': NEW_ADMIN_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.json())

    def test_old_password_no_longer_authenticates(self):
        self.post()
        response = APIClient().post(
            '/api/v1/auth/login/',
            {'email': self.admin.email, 'password': ADMIN_STRONG_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SecurityOverviewTests(AdminSettingsTestBase):
    """Security section reports only substantiated facts."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    def test_overview_reports_the_authenticated_administrator(self):
        payload = self.client.get(SECURITY_URL).json()
        self.assertEqual(payload['email'], self.admin.email)
        self.assertEqual(payload['role'], UserRole.ADMIN)
        self.assertEqual(payload['role_display'], 'Administrator')
        self.assertTrue(payload['is_active'])
        self.assertEqual(payload['account_status'], 'Active')
        self.assertIsNotNone(payload['account_created_at'])

    def test_last_login_is_recorded_on_login_and_reported(self):
        """The custom LoginView writes last_login, so the Security section is truthful."""
        self.assertIsNone(User.objects.get(pk=self.admin.pk).last_login)

        login = APIClient().post(
            '/api/v1/auth/login/',
            {'email': self.admin.email, 'password': ADMIN_STRONG_PASSWORD},
            format='json',
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        self.admin.refresh_from_db()
        self.assertIsNotNone(self.admin.last_login)
        self.assertIsNotNone(self.client.get(SECURITY_URL).json()['last_login'])

    def test_active_session_count_matches_the_token_registry(self):
        for _ in range(3):
            RefreshToken.for_user(self.admin)

        payload = self.client.get(SECURITY_URL).json()
        self.assertEqual(payload['active_sessions_count'], len(active_sessions(self.admin)))
        self.assertLessEqual(len(payload['recent_sessions']), SESSION_DISPLAY_LIMIT)

    def test_recent_sessions_expose_no_token_material(self):
        RefreshToken.for_user(self.admin)
        payload = self.client.get(SECURITY_URL).json()

        for session in payload['recent_sessions']:
            self.assertEqual(set(session.keys()), {'id', 'created_at', 'expires_at'})

        self.assertNotIn('token', json.dumps(payload).lower())
        self.assertNotIn('jti', json.dumps(payload).lower())

    def test_overview_is_scoped_to_the_caller(self):
        payload = self.client.get(SECURITY_URL).json()
        self.assertNotEqual(payload['email'], self.other_admin.email)

        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.other_admin)}')
        self.assertEqual(fresh.get(SECURITY_URL).json()['email'], self.other_admin.email)

    def test_configuration_change_history_is_reported_for_the_caller_only(self):
        AdminConfigAuditLog.objects.create(
            admin_user=self.admin,
            domain='notifications',
            record_id=1,
            action_type='UPDATE',
            new_value={'order_notifications': False},
        )
        AdminConfigAuditLog.objects.create(
            admin_user=self.other_admin,
            domain='notifications',
            record_id=1,
            action_type='UPDATE',
            new_value={'payment_notifications': False},
        )

        payload = self.client.get(SECURITY_URL).json()
        self.assertEqual(payload['configuration_changes_count'], 1)
        self.assertIsNotNone(payload['last_configuration_change_at'])

    def test_mfa_is_not_advertised_because_it_is_not_implemented(self):
        """No fabricated MFA/2FA state: 2FA is absent from the API surface entirely."""
        payload = self.client.get(SECURITY_URL).json()
        for forbidden in ('mfa_enabled', 'two_factor_enabled', '2fa_enabled', 'totp_secret'):
            self.assertNotIn(forbidden, payload)


class SessionRevocationTests(AdminSettingsTestBase):
    """Session management is backed by the real SimpleJWT blacklist tables."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    def test_revocation_blacklists_outstanding_tokens(self):
        before = len(active_sessions(self.admin))
        response = self.client.post(REVOKE_SESSIONS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.json()['sessions_revoked'], before)

        self.assertEqual(len(active_sessions(self.admin)), 1)

    def test_current_session_continues_after_revocation(self):
        response = self.client.post(REVOKE_SESSIONS_URL)
        payload = response.json()

        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f'Bearer {payload["access"]}')
        self.assertEqual(fresh.get(PROFILE_URL).status_code, status.HTTP_200_OK)

    def test_revoked_refresh_token_can_no_longer_be_exchanged(self):
        stale = RefreshToken.for_user(self.admin)
        OutstandingToken.objects.get_or_create(
            jti=stale['jti'],
            defaults={
                'token': str(stale),
                'user': self.admin,
                'created_at': timezone.now(),
                'expires_at': timezone.now() + stale.lifetime,
            },
        )

        self.client.post(REVOKE_SESSIONS_URL)

        response = APIClient().post(
            '/api/v1/auth/token/refresh/', {'refresh': str(stale)}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_revocation_is_audited(self):
        self.client.post(REVOKE_SESSIONS_URL)
        entry = AdminConfigAuditLog.objects.filter(domain='admin_account').first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.new_value.get('event'), 'SESSIONS_REVOKED')

    def test_revocation_does_not_affect_another_administrator(self):
        RefreshToken.for_user(self.other_admin)
        other_sessions_before = len(active_sessions(self.other_admin))
        self.assertGreater(other_sessions_before, 0)

        self.client.post(REVOKE_SESSIONS_URL)

        self.assertEqual(len(active_sessions(self.other_admin)), other_sessions_before)

    def test_service_level_revocation_returns_a_count(self):
        RefreshToken.for_user(self.admin)
        self.assertGreaterEqual(revoke_all_sessions(self.admin), 1)


class SystemInformationTests(AdminSettingsTestBase):
    """System section is complete and provably secret-free."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    EXPECTED_KEYS = {
        'app_version',
        'api_version',
        'environment',
        'debug',
        'django_version',
        'drf_version',
        'python_version',
        'api_status',
        'database_status',
        'database_engine',
        'database_latency_ms',
        'time_zone',
        'server_time',
        'last_migration',
    }

    def test_payload_shape_is_exactly_the_documented_allow_list(self):
        payload = self.client.get(SYSTEM_URL).json()
        self.assertEqual(set(payload.keys()), self.EXPECTED_KEYS)

    def test_database_connectivity_is_reported_live(self):
        payload = self.client.get(SYSTEM_URL).json()
        self.assertEqual(payload['database_status'], 'connected')
        self.assertEqual(payload['database_engine'], 'mysql')
        self.assertEqual(payload['api_status'], 'operational')
        self.assertIsInstance(payload['database_latency_ms'], float)

    def test_last_migration_is_reported(self):
        payload = self.client.get(SYSTEM_URL).json()
        self.assertIsNotNone(payload['last_migration'])
        self.assertEqual(
            set(payload['last_migration'].keys()), {'app', 'name', 'applied_at'}
        )

    def test_response_contains_no_secret_material(self):
        payload = self.client.get(SYSTEM_URL).json()
        body = json.dumps(payload)

        signing_key = str(django_settings.SIMPLE_JWT.get('SIGNING_KEY', ''))
        db_config = django_settings.DATABASES['default']

        for sensitive in (
            str(django_settings.SECRET_KEY),
            signing_key if signing_key != str(django_settings.SECRET_KEY) else None,
            db_config.get('PASSWORD'),
            getattr(django_settings, 'EMAIL_HOST_PASSWORD', None),
            getattr(django_settings, 'RAZORPAY_KEY_SECRET', None),
        ):
            if sensitive:
                self.assertNotIn(str(sensitive), body)

    def test_no_infrastructure_keys_are_exposed(self):
        payload = self.client.get(SYSTEM_URL).json()
        top_level_keys = [key.lower() for key in payload]

        for forbidden in (
            'password', 'secret', 'signing_key', 'api_key', 'credential',
            'host', 'port', 'user', 'jti', 'token',
        ):
            with self.subTest(key=forbidden):
                self.assertFalse(
                    [key for key in top_level_keys if forbidden in key],
                    f'System payload must not expose a "{forbidden}" field',
                )

    def test_environment_is_reported_honestly(self):
        payload = self.client.get(SYSTEM_URL).json()
        self.assertIn(payload['environment'], {'base', 'development', 'production'})
        self.assertEqual(payload['environment'], environment_name())
        self.assertEqual(payload['time_zone'], django_settings.TIME_ZONE)

    def test_service_layer_matches_the_api_contract(self):
        self.assertEqual(set(build_system_information().keys()), self.EXPECTED_KEYS)

    def test_diagnostics_report_engine_without_connection_details(self):
        diagnostics = database_diagnostics()
        self.assertEqual(set(diagnostics.keys()), {'status', 'engine', 'latency_ms'})

    def test_last_applied_migration_is_read_from_the_migration_recorder(self):
        record = last_applied_migration()
        self.assertIsNotNone(record)
        self.assertIn('applied_at', record)

    def test_application_version_comes_from_settings_not_hardcoded_ui(self):
        payload = self.client.get(SYSTEM_URL).json()
        self.assertEqual(payload['app_version'], str(django_settings.APP_VERSION))
        self.assertEqual(payload['api_version'], 'v1')
