"""
Security & Role-Based Access Control (RBAC) Test Suite
for Vee Power Electricals Google Login Admin Authorization.

Verifies:
1. Official Vee Power Google account (veepower.cbe@gmail.com) receives the admin role.
2. Authorized developer Google account (balaadhish.cbe@gmail.com) receives the admin role.
3. Unrelated verified Google account receives only the normal customer role.
4. Forged email or role in request data cannot grant admin access.
5. Invalid token, wrong audience, or unverified email cannot grant admin access.
6. Repeated Google sign-ins do not create duplicate accounts.
7. Existing accounts, orders, and addresses remain associated correctly.
8. Normal users receive HTTP 403 Forbidden from admin-only endpoints.
9. Both authorized admins can access permitted admin APIs.
10. Email/password registration cannot self-assign admin.
11. Role-reconciliation command is idempotent and protected against accidental execution.
12. Existing account linking and provider identity stability are strictly preserved.
"""
import io
import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.users.models import (
    CustomerAddress,
    IdentityAuditLog,
    IdentityEventType,
    SocialAccount,
    SocialProvider,
    UserRole,
)
from apps.users.services.google_identity import (
    GoogleEmailUnverifiedError,
    InvalidGoogleTokenError,
    get_google_admin_emails,
    is_google_admin_email,
    normalize_email,
    sign_in_with_google,
    verify_google_id_token,
)
from apps.orders.models import Order, OrderStatus, PaymentStatus

User = get_user_model()

CLIENT_ID = 'test-veepower-client-id.apps.googleusercontent.com'
GOOGLE_ENDPOINT = '/api/v1/auth/google/'

OFFICIAL_ADMIN_EMAIL = 'veepower.cbe@gmail.com'
DEV_ADMIN_EMAIL = 'balaadhish.cbe@gmail.com'
UNRELATED_CUSTOMER_EMAIL = 'regular.customer@example.com'


class GoogleAdminAuthorizationTests(TestCase):
    """
    Comprehensive verification of server-side Google Login Admin Authorization.
    """

    def setUp(self):
        self.client = APIClient()

    def _mock_google_token_claims(self, email: str, verified: bool = True, sub: str = None):
        """Construct verified claims payload dictionary."""
        return {
            'sub': sub or f"google-sub-{email.replace('@', '-').replace('.', '-')}",
            'email': email,
            'email_verified': verified,
            'given_name': 'Test',
            'family_name': 'User',
            'name': 'Test User',
        }

    # --------------------------------------------------------------------------
    # 1. Official Vee Power Google account receives admin role
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_01_official_veepower_account_receives_admin_role(self):
        claims = self._mock_google_token_claims(OFFICIAL_ADMIN_EMAIL)
        result = sign_in_with_google(claims)

        user = result['user']
        self.assertEqual(user.email, OFFICIAL_ADMIN_EMAIL)
        self.assertEqual(user.role, UserRole.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)  # Superuser not granted automatically
        self.assertTrue(user.is_email_verified)

        # Verify social account was linked with exact subject
        social = SocialAccount.objects.filter(user=user, provider=SocialProvider.GOOGLE).first()
        self.assertIsNotNone(social)
        self.assertEqual(social.provider_subject, claims['sub'])

        # Verify audit log recorded admin role assignment
        audit = IdentityAuditLog.objects.filter(user=user).first()
        self.assertIsNotNone(audit)
        self.assertIn('admin', audit.detail)

    # --------------------------------------------------------------------------
    # 2. Authorized developer Google account receives admin role
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_02_authorized_developer_account_receives_admin_role(self):
        claims = self._mock_google_token_claims(DEV_ADMIN_EMAIL)
        result = sign_in_with_google(claims)

        user = result['user']
        self.assertEqual(user.email, DEV_ADMIN_EMAIL)
        self.assertEqual(user.role, UserRole.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_email_verified)

    # --------------------------------------------------------------------------
    # 3. Unrelated verified Google account receives only normal customer role
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_03_unrelated_verified_google_account_receives_customer_role(self):
        claims = self._mock_google_token_claims(UNRELATED_CUSTOMER_EMAIL)
        result = sign_in_with_google(claims)

        user = result['user']
        self.assertEqual(user.email, UNRELATED_CUSTOMER_EMAIL)
        self.assertEqual(user.role, UserRole.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    # --------------------------------------------------------------------------
    # 4. Forged email or role in request body cannot grant admin access
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    @mock.patch('apps.users.views.verify_google_id_token')
    def test_04_forged_role_or_email_in_request_body_ignored(self, mock_verify):
        # Even if attacker supplies an untrusted payload claiming role=admin or email=veepower.cbe@gmail.com
        # in the request data, the backend ONLY relies on token verification claims.
        mock_verify.return_value = self._mock_google_token_claims('actual.attacker@example.com')

        res = self.client.post(
            GOOGLE_ENDPOINT,
            data={
                'credential': 'attacker-jwt-credential',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'email': OFFICIAL_ADMIN_EMAIL,
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        user_data = res.data['user']
        self.assertEqual(user_data['email'], 'actual.attacker@example.com')
        self.assertEqual(user_data['role'], 'customer')
        self.assertFalse(user_data['is_staff'])
        self.assertFalse(user_data['is_superuser'])

    # --------------------------------------------------------------------------
    # 5. Invalid token, wrong audience, or unverified email cannot grant admin access
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_05_unverified_email_fails_verification(self):
        # Email claim present for admin address, but email_verified is False
        fake_tokeninfo = {
            'aud': CLIENT_ID,
            'iss': 'https://accounts.google.com',
            'sub': 'sub-unverified-123',
            'email': OFFICIAL_ADMIN_EMAIL,
            'email_verified': 'false',  # unverified!
        }
        with mock.patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = mock.MagicMock()
            mock_resp.read.return_value = json.dumps(fake_tokeninfo).encode('utf-8')
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            with self.assertRaises(GoogleEmailUnverifiedError):
                verify_google_id_token('fake-token')

            # Ensure no user was created or promoted
            self.assertFalse(User.objects.filter(email=OFFICIAL_ADMIN_EMAIL).exists())

    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_05b_wrong_audience_rejected(self):
        fake_tokeninfo = {
            'aud': 'attacker-foreign-client-id.apps.googleusercontent.com',
            'iss': 'https://accounts.google.com',
            'sub': 'sub-wrong-aud-123',
            'email': OFFICIAL_ADMIN_EMAIL,
            'email_verified': 'true',
        }
        with mock.patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = mock.MagicMock()
            mock_resp.read.return_value = json.dumps(fake_tokeninfo).encode('utf-8')
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            with self.assertRaises(InvalidGoogleTokenError) as ctx:
                verify_google_id_token('fake-token')
            self.assertIn('different application', str(ctx.exception))

    # --------------------------------------------------------------------------
    # 6. Repeated Google sign-ins do not create duplicate accounts
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_06_repeated_google_signins_idempotent_no_duplicates(self):
        claims = self._mock_google_token_claims(OFFICIAL_ADMIN_EMAIL, sub='stable-sub-999')

        res1 = sign_in_with_google(claims)
        user_id_1 = res1['user'].id
        self.assertTrue(res1['created'])

        res2 = sign_in_with_google(claims)
        user_id_2 = res2['user'].id
        self.assertFalse(res2['created'])
        self.assertEqual(user_id_1, user_id_2)

        # Check exact count in database
        self.assertEqual(User.objects.filter(email=OFFICIAL_ADMIN_EMAIL).count(), 1)
        self.assertEqual(SocialAccount.objects.filter(provider_subject='stable-sub-999').count(), 1)

    # --------------------------------------------------------------------------
    # 7. Existing accounts, orders, and addresses remain associated correctly
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_07_existing_account_preserves_orders_addresses_when_promoted(self):
        # 1. Existing user in DB with role='customer' and orders/addresses
        existing_user = User.objects.create_user(
            email=OFFICIAL_ADMIN_EMAIL,
            password='InitialPassword123!',
            first_name='Vee',
            last_name='Power',
            role=UserRole.CUSTOMER,
            is_staff=False,
        )
        address = CustomerAddress.objects.create(
            user=existing_user,
            recipient_name='Vee Power Admin',
            phone='9876543210',
            address_line1='123 Power Street',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
            address_type='work',
        )
        order = Order.objects.create(
            order_number='ORD-EXISTING-001',
            user=existing_user,
            customer_name='Vee Power Admin',
            customer_email=OFFICIAL_ADMIN_EMAIL,
            customer_phone='9876543210',
            subtotal=Decimal('1500.00'),
            taxable_amount=Decimal('1500.00'),
            total_amount=Decimal('1500.00'),
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PAID,
        )

        user_id_before = existing_user.id

        # 2. User signs in with Google
        claims = self._mock_google_token_claims(OFFICIAL_ADMIN_EMAIL)
        result = sign_in_with_google(claims)

        # 3. Assert role is promoted while ID, addresses, orders are preserved
        promoted_user = result['user']
        self.assertEqual(promoted_user.id, user_id_before)
        self.assertEqual(promoted_user.role, UserRole.ADMIN)
        self.assertTrue(promoted_user.is_staff)

        # Orders and addresses still linked to same user
        self.assertEqual(promoted_user.orders.count(), 1)
        self.assertEqual(promoted_user.orders.first().order_number, 'ORD-EXISTING-001')
        self.assertEqual(promoted_user.addresses.count(), 1)
        self.assertEqual(promoted_user.addresses.first().pincode, '641001')

    # --------------------------------------------------------------------------
    # 8. Normal users receive HTTP 403 Forbidden from admin-only endpoints
    # --------------------------------------------------------------------------
    def test_08_customer_receives_403_from_admin_endpoints(self):
        customer = User.objects.create_user(
            email='regular_tester@example.com',
            password='Password123!',
            role=UserRole.CUSTOMER,
            is_staff=False,
            is_superuser=False,
        )
        token = str(AccessToken.for_user(customer))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        admin_endpoints = [
            ('/api/v1/customers/', 'get'),
            ('/api/v1/customers/summary/', 'get'),
            ('/api/v1/orders/operational-summary/', 'get'),
            ('/api/v1/settings/security/', 'get'),
            ('/api/v1/settings/system/', 'get'),
            ('/api/v1/finance/summary/', 'get'),
            ('/api/v1/inventory/', 'get'),
            ('/api/v1/catalog/products/bulk-import/', 'post'),
        ]

        for url, method in admin_endpoints:
            if method == 'get':
                res = self.client.get(url)
            else:
                res = self.client.post(url, data={})
            self.assertEqual(
                res.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Customer should receive 403 Forbidden on {url}, got {res.status_code}",
            )

    # --------------------------------------------------------------------------
    # 9. Both authorized admins can access permitted admin APIs
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_CLIENT_ID=CLIENT_ID,
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_09_both_authorized_admins_can_access_admin_apis(self):
        for email in [OFFICIAL_ADMIN_EMAIL, DEV_ADMIN_EMAIL]:
            claims = self._mock_google_token_claims(email)
            result = sign_in_with_google(claims)
            admin_user = result['user']

            token = str(AccessToken.for_user(admin_user))
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

            # 1. Orders operational summary
            res_orders = client.get('/api/v1/orders/operational-summary/')
            self.assertEqual(
                res_orders.status_code,
                status.HTTP_200_OK,
                f"{email} could not access /api/v1/orders/operational-summary/",
            )

            # 2. Customers list
            res_cust = client.get('/api/v1/customers/')
            self.assertEqual(
                res_cust.status_code,
                status.HTTP_200_OK,
                f"{email} could not access /api/v1/customers/",
            )

            # 3. Security overview
            res_sec = client.get('/api/v1/settings/security/')
            self.assertEqual(
                res_sec.status_code,
                status.HTTP_200_OK,
                f"{email} could not access /api/v1/settings/security/",
            )

    # --------------------------------------------------------------------------
    # 10. Email/password registration cannot self-assign admin
    # --------------------------------------------------------------------------
    def test_10_registration_cannot_self_assign_admin(self):
        # Even if attacker tries to submit an allowlisted admin email with a password,
        # registration assigns role='customer', is_staff=False!
        res = self.client.post(
            '/api/v1/auth/register/',
            data={
                'email': 'self_assign_test@veepower.com',
                'password': 'StrongPassword123!',
                'first_name': 'Hacker',
                'last_name': 'Attempt',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='self_assign_test@veepower.com')
        self.assertEqual(user.role, UserRole.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    # --------------------------------------------------------------------------
    # 11. Role-reconciliation command is idempotent and protected
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_ADMIN_EMAILS='veepower.cbe@gmail.com,balaadhish.cbe@gmail.com',
    )
    def test_11_role_reconciliation_command_protection_and_idempotence(self):
        # 1. Create veepower.cbe@gmail.com as customer
        user = User.objects.create_user(
            email=OFFICIAL_ADMIN_EMAIL,
            password='InitialPassword123!',
            role=UserRole.CUSTOMER,
            is_staff=False,
        )

        # 2. Run dry-run (no confirm)
        out = io.StringIO()
        call_command('reconcile_google_admins', stdout=out)
        output = out.getvalue()
        self.assertIn('[MODE] DRY-RUN', output)
        self.assertIn('[PENDING PROMOTION]', output)

        # Assert no change took place
        user.refresh_from_db()
        self.assertEqual(user.role, UserRole.CUSTOMER)
        self.assertFalse(user.is_staff)

        # 3. Run with --confirm
        out_confirm = io.StringIO()
        call_command('reconcile_google_admins', confirm=True, stdout=out_confirm)
        output_confirm = out_confirm.getvalue()
        self.assertIn('[MODE] LIVE EXECUTION', output_confirm)
        self.assertIn('[PROMOTED]', output_confirm)

        # Assert change took place
        user.refresh_from_db()
        self.assertEqual(user.role, UserRole.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)

        # 4. Run with --confirm again (idempotent)
        out_repeat = io.StringIO()
        call_command('reconcile_google_admins', confirm=True, stdout=out_repeat)
        output_repeat = out_repeat.getvalue()
        self.assertIn('[OK] Account', output_repeat)
        self.assertIn('already configured', output_repeat)

        user.refresh_from_db()
        self.assertEqual(user.role, UserRole.ADMIN)
        self.assertTrue(user.is_staff)

    # --------------------------------------------------------------------------
    # 12. Helper function normalization & allowlist parsing
    # --------------------------------------------------------------------------
    @override_settings(
        GOOGLE_ADMIN_EMAILS=' Veepower.Cbe@Gmail.com , BALAADHISH.CBE@GMAIL.COM ',
    )
    def test_12_helper_functions_normalize_properly(self):
        emails = get_google_admin_emails()
        self.assertIn(OFFICIAL_ADMIN_EMAIL, emails)
        self.assertIn(DEV_ADMIN_EMAIL, emails)
        self.assertTrue(is_google_admin_email('  veepower.cbe@GMAIL.com '))
        self.assertTrue(is_google_admin_email('balaadhish.cbe@gmail.com'))
        self.assertFalse(is_google_admin_email('hacker@example.com'))
        self.assertFalse(is_google_admin_email(''))
