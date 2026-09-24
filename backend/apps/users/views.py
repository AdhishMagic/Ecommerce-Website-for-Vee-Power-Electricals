from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
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

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

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

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

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

    def post(self, request):
        # Support unified endpoint if confirmation payload is provided
        if 'token' in request.data and 'new_password' in request.data:
            confirm_serializer = PasswordResetConfirmSerializer(data=request.data)
            confirm_serializer.is_valid(raise_exception=True)
            confirm_serializer.save()
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

            subject = "Password Reset Request - Vee Power Electricals"
            body = (
                f"Hello {user.first_name or user.username},\n\n"
                f"You requested a password reset for your Vee Power Electricals account.\n\n"
                f"UID: {uidb64}\n"
                f"Token: {token}\n\n"
                f"If you did not make this request, please ignore this email.\n"
            )
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

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

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {'message': 'Password has been successfully reset. You can now login with your new password.'},
            status=status.HTTP_200_OK,
        )
