from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.services.communication_service import CommunicationService
from apps.users.models import IdentityEventType
from apps.users.services.google_identity import (
    _audit,
    build_google_auth_url,
    exchange_code_for_tokens,
    generate_oauth_state,
    generate_pkce_pair,
    sign_in_with_google,
    verify_google_id_token,
)

from .serializers import (
    GoogleAuthSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    UserRegistrationSerializer,
    UserLoginSerializer,
)

User = get_user_model()


class RegisterView(APIView):
    """
    POST /api/v1/auth/register/
    Customer account registration with automated role assignment and JWT generation.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Dispatch customer registration welcome communication
        CommunicationService.send_registration_welcome(user)

        # Create initial email verification token in database
        try:
            from apps.users.services.verification_service import VerificationService
            VerificationService.create_verification_token(user)
        except Exception as e:
            logger.error("Failed to generate email verification token: %s", e)

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        return Response(
            {
                'message': 'User registered successfully.',
                'user': UserProfileSerializer(user).data,
                'access': access_token,
                'refresh': refresh_token,
                'tokens': {
                    'access': access_token,
                    'refresh': refresh_token,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    POST /api/v1/auth/login/
    Customer/Staff authentication returning access & refresh JWT tokens.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        # SIMPLE_JWT['UPDATE_LAST_LOGIN'] only applies to SimpleJWT's own token
        # serializer, which this project replaces, so the timestamp that the
        # admin Security section and Customers list report is written explicitly.
        update_last_login(None, user)

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        return Response(
            {
                'message': 'Login successful.',
                'user': UserProfileSerializer(user).data,
                'access': access_token,
                'refresh': refresh_token,
                'tokens': {
                    'access': access_token,
                    'refresh': refresh_token,
                },
            },
            status=status.HTTP_200_OK,
        )


class GoogleLoginView(APIView):
    """
    POST /api/v1/auth/google/
    Verifies a Google ID token server-side and returns the application's
    existing JWT pair. Existing local accounts with the same verified canonical
    email are linked (not duplicated); other emails remain separate accounts.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        claims = verify_google_id_token(serializer.validated_data['token'])
        result = sign_in_with_google(claims, request=request)
        user = result['user']

        update_last_login(None, user)

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        if result['created']:
            message = 'Account created and signed in with Google.'
        elif result['linked']:
            message = 'Existing account linked and signed in with Google.'
        else:
            message = 'Login successful.'

        return Response(
            {
                'message': message,
                'user': UserProfileSerializer(user).data,
                'access': access_token,
                'refresh': refresh_token,
                'tokens': {
                    'access': access_token,
                    'refresh': refresh_token,
                },
                'provider': 'google',
                'is_new_user': result['created'],
                'linked_existing_account': result['linked'],
            },
            status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
        )


class GoogleOAuthInitView(APIView):
    """
    GET /auth/google/login/ or /api/v1/auth/google/login/
    Starts Google OAuth 2.0 Authorization Code flow with PKCE (RFC 7636) and state validation.
    Redirects user to Google's consent screen (or returns authorization_url if JSON requested).
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def get(self, request):
        state = generate_oauth_state()
        code_verifier, code_challenge = generate_pkce_pair()

        # Persist state and code_verifier in user session
        if hasattr(request, 'session'):
            request.session['google_oauth_state'] = state
            request.session['google_oauth_code_verifier'] = code_verifier
            request.session.modified = True

        auth_url = build_google_auth_url(state=state, code_challenge=code_challenge)

        # Allow SPA / API callers to receive auth_url via JSON
        if request.GET.get('format') == 'json' or 'application/json' in request.headers.get('Accept', ''):
            return Response({'authorization_url': auth_url, 'state': state}, status=status.HTTP_200_OK)

        response = HttpResponseRedirect(auth_url)
        # Also set secure HttpOnly signed cookies as a resilient fallback
        response.set_signed_cookie('google_oauth_state', state, max_age=600, httponly=True, samesite='Lax')
        response.set_signed_cookie('google_oauth_code_verifier', code_verifier, max_age=600, httponly=True, samesite='Lax')
        return response


class GoogleOAuthCallbackView(APIView):
    """
    GET /auth/google/callback or /api/v1/auth/google/callback/
    Completes Google OAuth 2.0 authorization code flow.
    Exchanges code for tokens, validates identity server-side, resolves user in MySQL,
    and returns JWT tokens or redirects to the React frontend.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def _extract_param(self, request, key, default=''):
        val = request.GET.get(key)
        if not val and hasattr(request, 'data') and isinstance(request.data, dict):
            val = request.data.get(key)
        return (val or default).strip() if isinstance(val, str) else default

    def _wants_json(self, request):
        return (
            request.method == 'POST'
            or request.GET.get('format') == 'json'
            or 'application/json' in request.headers.get('Accept', '')
        )

    def _handle_flow(self, request):
        error = self._extract_param(request, 'error')
        if error:
            _audit(
                IdentityEventType.LINK_REJECTED,
                detail=f'oauth_cancelled_or_error:{error[:50]}',
                request=request,
            )
            if self._wants_json(request):
                return Response(
                    {'error': 'cancelled', 'detail': 'Google sign-in was cancelled or encountered an error.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            redirect_target = f"{settings.FRONTEND_URL}/login?cancelled=1"
            return HttpResponseRedirect(redirect_target)

        code = self._extract_param(request, 'code')
        state = self._extract_param(request, 'state')

        if not code:
            if self._wants_json(request):
                return Response(
                    {'error': 'missing_code', 'detail': 'Authorization code is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login?error=missing_code")

        # Validate state token against session or cookie
        expected_state = ''
        if hasattr(request, 'session'):
            expected_state = request.session.get('google_oauth_state', '')
        if not expected_state:
            expected_state = request.get_signed_cookie('google_oauth_state', default='')

        if expected_state and state and state != expected_state:
            _audit(
                IdentityEventType.LINK_REJECTED,
                detail='invalid_oauth_state',
                request=request,
            )
            if self._wants_json(request):
                return Response(
                    {'error': 'invalid_state', 'detail': 'OAuth state verification failed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login?error=invalid_state")

        # Retrieve PKCE code_verifier
        code_verifier = ''
        if hasattr(request, 'session'):
            code_verifier = request.session.get('google_oauth_code_verifier', '')
        if not code_verifier:
            code_verifier = request.get_signed_cookie('google_oauth_code_verifier', default='')
        if not code_verifier:
            code_verifier = self._extract_param(request, 'code_verifier')

        # Exchange authorization code for tokens
        token_payload = exchange_code_for_tokens(
            code=code,
            code_verifier=code_verifier or None,
        )

        id_token = token_payload.get('id_token')
        if not id_token:
            if self._wants_json(request):
                return Response(
                    {'error': 'missing_id_token', 'detail': 'Google response did not include an ID token.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login?error=missing_id_token")

        claims = verify_google_id_token(id_token)
        result = sign_in_with_google(claims, request=request)
        user = result['user']

        update_last_login(None, user)

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # Clear session / cookies
        if hasattr(request, 'session'):
            request.session.pop('google_oauth_state', None)
            request.session.pop('google_oauth_code_verifier', None)

        if self._wants_json(request):
            if result['created']:
                message = 'Account created and signed in with Google.'
            elif result['linked']:
                message = 'Existing account linked and signed in with Google.'
            else:
                message = 'Login successful.'
            return Response(
                {
                    'message': message,
                    'user': UserProfileSerializer(user).data,
                    'access': access_token,
                    'refresh': refresh_token,
                    'tokens': {
                        'access': access_token,
                        'refresh': refresh_token,
                    },
                    'provider': 'google',
                    'is_new_user': result['created'],
                    'linked_existing_account': result['linked'],
                },
                status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
            )

        redirect_target = f"{settings.FRONTEND_URL}/login?token={access_token}&refresh={refresh_token}"
        if result['created']:
            redirect_target += "&is_new=1"
        elif result['linked']:
            redirect_target += "&linked=1"

        response = HttpResponseRedirect(redirect_target)
        response.delete_cookie('google_oauth_state')
        response.delete_cookie('google_oauth_code_verifier')
        return response

    def get(self, request):
        return self._handle_flow(request)

    def post(self, request):
        return self._handle_flow(request)


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/
    Blacklists the provided refresh token to invalidate future refreshes.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'detail': 'Refresh token is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refresh_token = serializer.validated_data['refresh']
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Successfully logged out. Token has been invalidated.'},
                status=status.HTTP_200_OK,
            )
        except TokenError as exc:
            return Response(
                {'detail': str(exc) or 'Token is invalid or expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CurrentUserView(APIView):
    """
    GET /api/v1/auth/me/
    PUT /api/v1/auth/me/
    PATCH /api/v1/auth/me/
    Authenticated customer profile retrieval and secure self-service editing.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=False,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            UserProfileSerializer(request.user).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        try:
            CommunicationService.send_account_security_alert(request.user, "Your profile details were updated.")
        except Exception:
            pass
        return Response(
            UserProfileSerializer(request.user).data,
            status=status.HTTP_200_OK,
        )


class PasswordResetView(APIView):
    """
    POST /api/v1/auth/password-reset/
    Generates and dispatches secure password reset tokens via email without leaking user existence.
    Also supports unified reset confirmation if token and new_password are provided.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        # Support unified endpoint if confirmation payload is provided
        if 'token' in request.data and 'new_password' in request.data:
            confirm_serializer = PasswordResetConfirmSerializer(data=request.data)
            confirm_serializer.is_valid(raise_exception=True)
            user = confirm_serializer.save()
            try:
                CommunicationService.send_password_reset_success(user)
            except Exception:
                pass
            return Response(
                {'message': 'Password has been successfully reset. You can now login with your new password.'},
                status=status.HTTP_200_OK,
            )

        # Standard request reset flow
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        user = User.objects.filter(email__iexact=email).first()
        if user and user.is_active:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            CommunicationService.send_password_reset(user, uidb64, token)

        return Response(
            {'message': 'If an account with this email exists, password reset instructions have been sent.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST /api/v1/auth/password-reset/confirm/
    Cryptographically validates reset token, checks password policy, and updates password.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        try:
            CommunicationService.send_password_reset_success(user)
        except Exception:
            pass
        return Response(
            {'message': 'Password has been successfully reset. You can now login with your new password.'},
            status=status.HTTP_200_OK,
        )


class RequestEmailVerificationView(APIView):
    """
    POST /api/v1/auth/verify-email/request/
    Request or resend an email verification OTP / link with rate-limiting.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        email = request.data.get('email', '').strip()
        if not email:
            return Response(
                {'detail': 'Email address is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.users.services.verification_service import VerificationService
        success, message = VerificationService.resend_verification(email)
        status_code = status.HTTP_200_OK if success else status.HTTP_429_TOO_MANY_REQUESTS
        return Response({'message': message}, status=status_code)


class ConfirmEmailVerificationView(APIView):
    """
    POST /api/v1/auth/verify-email/confirm/
    Validates email verification OTP or token and activates verified email state.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        email = request.data.get('email', '').strip()
        code = (request.data.get('otp') or request.data.get('token') or request.data.get('code') or '').strip()

        if not email or not code:
            return Response(
                {'detail': 'Both email and verification code (otp or token) are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.users.services.verification_service import VerificationService
        success, user, message = VerificationService.verify_otp_or_token(email, code)

        if not success:
            return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': message,
                'email_verified': True,
                'user': UserProfileSerializer(user).data if user else None,
            },
            status=status.HTTP_200_OK,
        )
