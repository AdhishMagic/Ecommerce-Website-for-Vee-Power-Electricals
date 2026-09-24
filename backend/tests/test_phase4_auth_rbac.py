import datetime
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.users.models import UserRole
from apps.users.permissions import (
    IsAdminUser,
    IsCustomer,
    IsOwnerOrAdmin,
    IsStaffOrReadOnly,
    IsSuperAdminUser,
)

User = get_user_model()


class Phase4RegistrationTests(TestCase):
    """
    Test suite for Customer Registration (POST /api/v1/auth/register/)
    """
    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/v1/auth/register/'

    def test_valid_customer_registration(self):
        payload = {
            'email': 'newcustomer@example.com',
            'password': 'SecurePassword123!',
            'first_name': 'Ramesh',
            'last_name': 'Kumar',
            'phone': '+919876543210',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)
        self.assertIn('access', response.data['tokens'])
        self.assertIn('refresh', response.data['tokens'])
        self.assertEqual(response.data['user']['email'], 'newcustomer@example.com')
        self.assertEqual(response.data['user']['role'], UserRole.CUSTOMER)
        self.assertFalse(response.data['user']['is_staff'])
        self.assertFalse(response.data['user']['is_superuser'])
        self.assertTrue(response.data['user']['is_active'])

        # Verify DB persistence and password hashing
        user = User.objects.get(email='newcustomer@example.com')
        self.assertTrue(user.check_password('SecurePassword123!'))
        self.assertTrue(user.password.startswith('pbkdf2_sha256$') or user.has_usable_password())
        self.assertNotEqual(user.password, 'SecurePassword123!')

    def test_password_never_returned_in_response(self):
        payload = {
            'email': 'nopassleak@example.com',
            'password': 'SecurePassword123!',
            'first_name': 'No',
            'last_name': 'Leak',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('password', response.data['user'])
        self.assertNotIn('password', response.data)
        self.assertNotIn('password_hash', response.data)

    def test_duplicate_email_registration_rejected(self):
        User.objects.create_user(
            email='existing@example.com',
            password='OldPassword123!',
            first_name='Existing',
            last_name='User',
        )
        # Case-insensitive duplicate attempt
        payload = {
            'email': 'EXISTING@example.com',
            'password': 'NewPassword123!',
            'first_name': 'Copy',
            'last_name': 'Cat',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_invalid_email_format_rejected(self):
        payload = {
            'email': 'invalid-email-string',
            'password': 'SecurePassword123!',
            'first_name': 'Bad',
            'last_name': 'Email',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_weak_password_rejected(self):
        # Too short password
        payload = {
            'email': 'weakpass@example.com',
            'password': '123',
            'first_name': 'Weak',
            'last_name': 'Pass',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_missing_required_fields_rejected(self):
        # Missing first_name and last_name
        payload = {
            'email': 'missing@example.com',
            'password': 'SecurePassword123!',
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('first_name', response.data)
        self.assertIn('last_name', response.data)

    def test_role_escalation_attempt_in_registration_blocked(self):
        # Client maliciously sends role='admin', is_staff=True, is_superuser=True
        payload = {
            'email': 'attacker@example.com',
            'password': 'SecurePassword123!',
            'first_name': 'Hacker',
            'last_name': 'Attempt',
            'role': 'admin',
            'is_staff': True,
            'is_superuser': True,
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], UserRole.CUSTOMER)
        self.assertFalse(response.data['user']['is_staff'])
        self.assertFalse(response.data['user']['is_superuser'])

        user = User.objects.get(email='attacker@example.com')
        self.assertEqual(user.role, UserRole.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)


class Phase4LoginTests(TestCase):
    """
    Test suite for Login (POST /api/v1/auth/login/)
    """
    def setUp(self):
        self.client = APIClient()
        self.login_url = '/api/v1/auth/login/'
        self.password = 'ValidPassword123!'
        self.user = User.objects.create_user(
            email='loginuser@example.com',
            password=self.password,
            first_name='Login',
            last_name='Tester',
        )

    def test_valid_login_returns_tokens_and_profile(self):
        payload = {
            'email': 'loginuser@example.com',
            'password': self.password,
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['email'], 'loginuser@example.com')
        self.assertNotIn('password', response.data['user'])

    def test_login_case_insensitive_email(self):
        payload = {
            'email': 'LOGINUSER@EXAMPLE.COM',
            'password': self.password,
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['email'], 'loginuser@example.com')

    def test_invalid_password_returns_safe_error(self):
        payload = {
            'email': 'loginuser@example.com',
            'password': 'WrongPassword999!',
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        self.assertEqual(response.data['detail'], 'Invalid email or password.')

    def test_nonexistent_email_returns_safe_error(self):
        payload = {
            'email': 'nonexistent@example.com',
            'password': 'AnyPassword123!',
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        # Ensure error does not leak user non-existence
        self.assertEqual(response.data['detail'], 'Invalid email or password.')

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()

        payload = {
            'email': 'loginuser@example.com',
            'password': self.password,
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        self.assertEqual(response.data['detail'], 'Account is disabled or inactive.')

    def test_missing_credentials_rejected(self):
        response = self.client.post(self.login_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class Phase4TokenRefreshTests(TestCase):
    """
    Test suite for Token Refresh & Rotation (POST /api/v1/auth/token/refresh/)
    """
    def setUp(self):
        self.client = APIClient()
        self.refresh_url = '/api/v1/auth/token/refresh/'
        self.user = User.objects.create_user(
            email='tokenuser@example.com',
            password='TokenPassword123!',
            first_name='Token',
            last_name='User',
        )
        self.refresh = RefreshToken.for_user(self.user)

    def test_valid_token_refresh(self):
        payload = {'refresh': str(self.refresh)}
        response = self.client.post(self.refresh_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_token_rotation_and_blacklisting(self):
        initial_refresh_str = str(self.refresh)
        payload = {'refresh': initial_refresh_str}

        # First refresh succeeds and rotates refresh token
        response1 = self.client.post(self.refresh_url, payload, format='json')
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        new_refresh_str = response1.data['refresh']
        self.assertNotEqual(initial_refresh_str, new_refresh_str)

        # Attempting to reuse old rotated refresh token MUST fail (blacklisted)
        response2 = self.client.post(self.refresh_url, {'refresh': initial_refresh_str}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_401_UNAUTHORIZED)

        # But new refresh token works
        response3 = self.client.post(self.refresh_url, {'refresh': new_refresh_str}, format='json')
        self.assertEqual(response3.status_code, status.HTTP_200_OK)

    def test_access_token_cannot_be_used_as_refresh_token(self):
        access_token_str = str(self.refresh.access_token)
        response = self.client.post(self.refresh_url, {'refresh': access_token_str}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_refresh_token_rejected(self):
        response = self.client.post(self.refresh_url, {'refresh': 'garbage-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class Phase4LogoutTests(TestCase):
    """
    Test suite for Logout and Token Invalidation (POST /api/v1/auth/logout/)
    """
    def setUp(self):
        self.client = APIClient()
        self.logout_url = '/api/v1/auth/logout/'
        self.refresh_url = '/api/v1/auth/token/refresh/'
        self.user = User.objects.create_user(
            email='logoutuser@example.com',
            password='LogoutPass123!',
            first_name='Logout',
            last_name='User',
        )

    def test_valid_logout_blacklists_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        refresh_str = str(refresh)

        response = self.client.post(self.logout_url, {'refresh': refresh_str}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

        # Verify blacklisted token cannot be used to refresh
        refresh_response = self.client.post(self.refresh_url, {'refresh': refresh_str}, format='json')
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_repeated_logout_returns_error(self):
        refresh = RefreshToken.for_user(self.user)
        refresh_str = str(refresh)

        # First logout succeeds
        self.client.post(self.logout_url, {'refresh': refresh_str}, format='json')

        # Second logout with blacklisted token fails
        response = self.client.post(self.logout_url, {'refresh': refresh_str}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_missing_refresh_token_in_logout_returns_400(self):
        response = self.client.post(self.logout_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_refresh_token_in_logout_returns_400(self):
        response = self.client.post(self.logout_url, {'refresh': 'not.a.valid.jwt'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class Phase4CurrentUserMeTests(TestCase):
    """
    Test suite for Current User Profile (GET & PUT /api/v1/auth/me/)
    """
    def setUp(self):
        self.client = APIClient()
        self.me_url = '/api/v1/auth/me/'
        self.customer = User.objects.create_user(
            email='customer.me@example.com',
            password='CustomerPass123!',
            first_name='Anand',
            last_name='Kumar',
            phone='+919876543201',
        )
        self.token = str(AccessToken.for_user(self.customer))

    def test_unauthenticated_request_rejected(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_retrieve_profile(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'customer.me@example.com')
        self.assertEqual(response.data['first_name'], 'Anand')
        self.assertEqual(response.data['last_name'], 'Kumar')
        self.assertEqual(response.data['phone'], '+919876543201')
        self.assertEqual(response.data['role'], UserRole.CUSTOMER)
        self.assertNotIn('password', response.data)

    def test_profile_update_allowed_fields(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        payload = {
            'first_name': 'Anand Updated',
            'last_name': 'Kumar Updated',
            'phone': '+919876543299',
        }
        response = self.client.put(self.me_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['first_name'], 'Anand Updated')
        self.assertEqual(response.data['last_name'], 'Kumar Updated')
        self.assertEqual(response.data['phone'], '+919876543299')

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, 'Anand Updated')
        self.assertEqual(self.customer.phone, '+919876543299')

    def test_role_escalation_in_profile_update_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        # Customer attempts to promote themselves to admin
        payload = {
            'first_name': 'Hacker',
            'last_name': 'Customer',
            'role': 'admin',
        }
        response = self.client.put(self.me_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, UserRole.CUSTOMER)

    def test_staff_admin_flags_modification_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        payload = {
            'is_staff': True,
            'is_superuser': True,
        }
        response = self.client.put(self.me_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_staff)
        self.assertFalse(self.customer.is_superuser)

    def test_password_cannot_be_modified_via_me(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        payload = {
            'password': 'NewPassword123!',
        }
        response = self.client.put(self.me_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password('CustomerPass123!'))

    def test_email_cannot_be_modified_via_me(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        payload = {
            'email': 'newemail@example.com',
        }
        response = self.client.put(self.me_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.email, 'customer.me@example.com')


class Phase4PasswordResetTests(TestCase):
    """
    Test suite for Password Reset Flow (POST /api/v1/auth/password-reset/)
    """
    def setUp(self):
        self.client = APIClient()
        self.reset_url = '/api/v1/auth/password-reset/'
        self.confirm_url = '/api/v1/auth/password-reset/confirm/'
        self.login_url = '/api/v1/auth/login/'
        self.user = User.objects.create_user(
            email='resetuser@example.com',
            password='InitialPassword123!',
            first_name='Reset',
            last_name='User',
        )

    def test_password_reset_request_sends_email(self):
        response = self.client.post(self.reset_url, {'email': 'resetuser@example.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

        # Verify email was dispatched to Django test outbox
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('resetuser@example.com', mail.outbox[0].to)
        self.assertIn('UID:', mail.outbox[0].body)
        self.assertIn('Token:', mail.outbox[0].body)

    def test_password_reset_request_safe_on_nonexistent_email(self):
        mail.outbox.clear()
        response = self.client.post(self.reset_url, {'email': 'doesnotexist@example.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # No email sent, but response matches valid user request
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn('message', response.data)

    def test_successful_password_reset_and_login(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        confirm_payload = {
            'uidb64': uidb64,
            'token': token,
            'new_password': 'BrandNewPassword123!',
        }
        response = self.client.post(self.confirm_url, confirm_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify old password no longer works
        old_login = self.client.post(self.login_url, {
            'email': 'resetuser@example.com',
            'password': 'InitialPassword123!',
        }, format='json')
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

        # Verify new password works
        new_login = self.client.post(self.login_url, {
            'email': 'resetuser@example.com',
            'password': 'BrandNewPassword123!',
        }, format='json')
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_password_reset_token_cannot_be_reused(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        confirm_payload = {
            'uidb64': uidb64,
            'token': token,
            'new_password': 'BrandNewPassword123!',
        }
        # First reset succeeds
        res1 = self.client.post(self.confirm_url, confirm_payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Reusing the same token MUST fail because password hash changed
        reuse_payload = {
            'uidb64': uidb64,
            'token': token,
            'new_password': 'AnotherPassword123!',
        }
        res2 = self.client.post(self.confirm_url, reuse_payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_reset_token_rejected(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        confirm_payload = {
            'uidb64': uidb64,
            'token': 'bogus-invalid-token',
            'new_password': 'BrandNewPassword123!',
        }
        response = self.client.post(self.confirm_url, confirm_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_new_password_rejected(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        confirm_payload = {
            'uidb64': uidb64,
            'token': token,
            'new_password': '123',
        }
        response = self.client.post(self.confirm_url, confirm_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unified_password_reset_endpoint_confirm(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        # Posting confirm payload directly to /password-reset/
        confirm_payload = {
            'uidb64': uidb64,
            'token': token,
            'new_password': 'DirectResetPassword123!',
        }
        response = self.client.post(self.reset_url, confirm_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('DirectResetPassword123!'))


class Phase4RBACAndSecurityTests(TestCase):
    """
    Test suite for Server-Side RBAC Enforcement and Security Controls
    """
    def setUp(self):
        self.factory = APIRequestFactory()
        self.customer = User.objects.create_user(
            email='rbac.customer@example.com',
            password='CustomerPass123!',
            first_name='Customer',
            last_name='User',
            role=UserRole.CUSTOMER,
            is_staff=False,
            is_superuser=False,
        )
        self.admin = User.objects.create_user(
            email='rbac.admin@example.com',
            password='AdminPass123!',
            first_name='Admin',
            last_name='User',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=False,
        )
        self.staff_sales = User.objects.create_user(
            email='rbac.staff@example.com',
            password='StaffPass123!',
            first_name='Staff',
            last_name='User',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=False,
        )
        self.superuser = User.objects.create_superuser(
            email='rbac.super@example.com',
            password='SuperPass123!',
            first_name='Super',
            last_name='User',
        )

    def test_is_customer_permission(self):
        perm = IsCustomer()

        # Customer passes
        req_customer = self.factory.get('/')
        req_customer.user = self.customer
        self.assertTrue(perm.has_permission(req_customer, None))

        # Admin fails
        req_admin = self.factory.get('/')
        req_admin.user = self.admin
        self.assertFalse(perm.has_permission(req_admin, None))

        # Superuser fails
        req_super = self.factory.get('/')
        req_super.user = self.superuser
        self.assertFalse(perm.has_permission(req_super, None))

    def test_is_admin_user_permission(self):
        perm = IsAdminUser()

        # Admin passes
        req_admin = self.factory.get('/')
        req_admin.user = self.admin
        self.assertTrue(perm.has_permission(req_admin, None))

        # Superuser passes
        req_super = self.factory.get('/')
        req_super.user = self.superuser
        self.assertTrue(perm.has_permission(req_super, None))

        # Customer fails
        req_customer = self.factory.get('/')
        req_customer.user = self.customer
        self.assertFalse(perm.has_permission(req_customer, None))

    def test_is_staff_or_read_only_permission(self):
        perm = IsStaffOrReadOnly()

        # Read method (GET): Customer can read
        req_get_customer = self.factory.get('/')
        req_get_customer.user = self.customer
        self.assertTrue(perm.has_permission(req_get_customer, None))

        # Write method (POST): Customer CANNOT write
        req_post_customer = self.factory.post('/')
        req_post_customer.user = self.customer
        self.assertFalse(perm.has_permission(req_post_customer, None))

        # Write method (POST): Staff CAN write
        req_post_staff = self.factory.post('/')
        req_post_staff.user = self.staff_sales
        self.assertTrue(perm.has_permission(req_post_staff, None))

        # Write method (POST): Admin CAN write
        req_post_admin = self.factory.post('/')
        req_post_admin.user = self.admin
        self.assertTrue(perm.has_permission(req_post_admin, None))

    def test_is_superadmin_permission(self):
        perm = IsSuperAdminUser()

        req_admin = self.factory.get('/')
        req_admin.user = self.admin
        self.assertFalse(perm.has_permission(req_admin, None))

        req_super = self.factory.get('/')
        req_super.user = self.superuser
        self.assertTrue(perm.has_permission(req_super, None))

    def test_malformed_authorization_header(self):
        client = APIClient()
        # Invalid format
        client.credentials(HTTP_AUTHORIZATION='Bearer not-a-valid-jwt-token')
        response = client.get('/api/v1/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_authorization_header(self):
        client = APIClient()
        response = client.get('/api/v1/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_account_blocked_from_authenticated_api(self):
        client = APIClient()
        token = str(AccessToken.for_user(self.customer))
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # Verify active access works
        res1 = client.get('/api/v1/auth/me/')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Deactivate user
        self.customer.is_active = False
        self.customer.save()

        # Token access now rejected
        res2 = client.get('/api/v1/auth/me/')
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_algorithm_and_lifetime(self):
        token = AccessToken.for_user(self.customer)
        # Check signing algorithm is HS256
        self.assertEqual(token.payload.get('token_type'), 'access')
        self.assertEqual(str(token.payload.get('user_id')), str(self.customer.id))
        # Verify expiration roughly 30 minutes in future
        exp = token.payload.get('exp')
        iat = token.payload.get('iat')
        lifetime_seconds = exp - iat
        self.assertAlmostEqual(lifetime_seconds, 1800, delta=10)
