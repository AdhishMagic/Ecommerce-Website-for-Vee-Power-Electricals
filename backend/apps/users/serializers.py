import re
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from apps.users.models import UserRole

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Public safe profile serializer. Excludes password, hashes, and internal secrets.
    """
    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'phone',
            'role',
            'is_active',
            'is_staff',
            'is_superuser',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class UserRegistrationSerializer(serializers.Serializer):
    """
    Customer registration serializer.
    Enforces strong password validation, unique email, and customer role assignment.
    """
    email = serializers.EmailField(required=True, max_length=255)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        trim_whitespace=False
    )
    first_name = serializers.CharField(required=True, max_length=150, allow_blank=False)
    last_name = serializers.CharField(required=True, max_length=150, allow_blank=False)
    phone = serializers.CharField(required=False, max_length=20, allow_blank=True, default='')

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return normalized

    def validate_first_name(self, value):
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("First name cannot be blank.")
        return stripped

    def validate_last_name(self, value):
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Last name cannot be blank.")
        return stripped

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as err:
            raise serializers.ValidationError(list(err.messages))
        return value

    def create(self, validated_data):
        # Explicitly enforce Customer role and security flags regardless of any input
        email = validated_data['email']
        password = validated_data['password']
        first_name = validated_data['first_name']
        last_name = validated_data['last_name']
        phone = validated_data.get('phone', '')

        user = User.objects.create_user(
            email=email,
            password=password,
            username=email,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role=UserRole.CUSTOMER,
            is_staff=False,
            is_superuser=False,
            is_active=True,
        )
        return user


class UserLoginSerializer(serializers.Serializer):
    """
    Email + password login serializer with timing-safe error messaging.
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        trim_whitespace=False
    )

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        password = attrs.get('password', '')

        if not email or not password:
            raise serializers.ValidationError("Both email and password are required.")

        user = User.objects.filter(email__iexact=email).first()

        if user is None or not user.check_password(password):
            # Safe authentication error that does not leak email existence
            raise AuthenticationFailed("Invalid email or password.")

        if not user.is_active:
            raise AuthenticationFailed("Account is disabled or inactive.")

        attrs['user'] = user
        return attrs


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Customer profile update serializer.
    Permits only safe personal fields (first_name, last_name, phone).
    Strictly forbids role escalation or administrative flag modification.
    """
    FORBIDDEN_FIELDS = {'role', 'is_staff', 'is_superuser', 'is_active', 'password', 'id', 'email'}

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone']

    def validate(self, attrs):
        # Inspect raw initial_data to detect and reject privilege escalation attempts
        initial = getattr(self, 'initial_data', {})
        attempted_forbidden = set(initial.keys()) & self.FORBIDDEN_FIELDS
        if attempted_forbidden:
            forbidden_list = ", ".join(sorted(attempted_forbidden))
            raise serializers.ValidationError(
                f"Modifying restricted security fields ({forbidden_list}) is not permitted."
            )
        return attrs

    def update(self, instance, validated_data):
        instance.first_name = validated_data.get('first_name', instance.first_name).strip()
        instance.last_name = validated_data.get('last_name', instance.last_name).strip()
        if 'phone' in validated_data:
            instance.phone = validated_data.get('phone', instance.phone).strip()
        instance.save()
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Password reset request serializer. Validates target email address.
    """
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Password reset confirmation serializer.
    Validates uidb64, cryptographically checks the reset token,
    validates new password strength, and updates user password.
    """
    uidb64 = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        trim_whitespace=False
    )

    def validate(self, attrs):
        uidb64 = attrs.get('uidb64')
        token = attrs.get('token')
        new_password = attrs.get('new_password')

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({"token": "Invalid or expired password reset token."})

        if not default_token_generator.check_token(user, token):
            raise serializers.ValidationError({"token": "Invalid or expired password reset token."})

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as err:
            raise serializers.ValidationError({"new_password": list(err.messages)})

        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        new_password = self.validated_data['new_password']
        user.set_password(new_password)
        user.save()
        return user


class LogoutSerializer(serializers.Serializer):
    """
    Token invalidation / logout serializer.
    """
    refresh = serializers.CharField(required=True, allow_blank=False)
