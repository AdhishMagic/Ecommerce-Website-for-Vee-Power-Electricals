"""
Serializers for the Administrative Settings module.

The notification and password-change serializers use allow-list field sets so the
API can never mass-assign identity, privilege, or audit columns.
"""
import logging

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import NotificationSettings

logger = logging.getLogger(__name__)


class NotificationSettingsSerializer(serializers.ModelSerializer):
    """
    Administrative read/write contract for the outbound notification policy.

    ``updated_by`` is intentionally absent from ``fields``: the API records the
    acting administrator server-side from the authenticated session, so a client
    can never spoof who changed the policy.
    """
    updated_by_email = serializers.EmailField(source='updated_by.email', read_only=True, default=None)

    class Meta:
        model = NotificationSettings
        fields = [
            'email_notifications_enabled',
            *NotificationSettings.CATEGORY_FIELDS,
            'updated_at',
            'updated_by_email',
        ]
        read_only_fields = ['updated_at', 'updated_by_email']


class PasswordChangeSerializer(serializers.Serializer):
    """
    Self-service password change for the authenticated administrator.

    Enforces: current-password verification, confirmation match, non-reuse of the
    current password, and the project's configured Django password validators.
    Passwords are write-only and are never echoed back in any response.
    """
    current_password = serializers.CharField(
        write_only=True, required=True, allow_blank=False, trim_whitespace=False,
        style={'input_type': 'password'},
    )
    new_password = serializers.CharField(
        write_only=True, required=True, allow_blank=False, trim_whitespace=False,
        style={'input_type': 'password'},
    )
    confirm_password = serializers.CharField(
        write_only=True, required=True, allow_blank=False, trim_whitespace=False,
        style={'input_type': 'password'},
    )

    @property
    def _user(self):
        request = self.context.get('request')
        return getattr(request, 'user', None)

    def validate_current_password(self, value):
        user = self._user
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError('Authentication is required.')
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs):
        user = self._user
        new_password = attrs.get('new_password', '')
        confirm_password = attrs.get('confirm_password', '')

        if new_password != confirm_password:
            raise serializers.ValidationError({
                'confirm_password': 'New password and confirmation do not match.',
            })

        if new_password == attrs.get('current_password'):
            raise serializers.ValidationError({
                'new_password': 'New password must be different from the current password.',
            })

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as err:
            raise serializers.ValidationError({'new_password': list(err.messages)})

        return attrs

    def save(self, **kwargs):
        """Hash and persist the new password. Never returns or logs the value."""
        user = self._user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])
        return user


class SessionSerializer(serializers.Serializer):
    """A single usable refresh-token session."""
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField(allow_null=True)
    expires_at = serializers.DateTimeField()


class SecurityOverviewSerializer(serializers.Serializer):
    """
    Read-only security posture of the authenticated administrator.

    Only facts that the backend can substantiate are reported: username, role,
    account status, last login (null when the platform has not recorded one),
    active sessions from the token blacklist tables, and this administrator's own
    configuration-change history.
    """
    email = serializers.EmailField()
    role = serializers.CharField()
    role_display = serializers.CharField()
    is_active = serializers.BooleanField()
    account_status = serializers.CharField()
    last_login = serializers.DateTimeField(allow_null=True)
    account_created_at = serializers.DateTimeField(allow_null=True)
    active_sessions_count = serializers.IntegerField()
    recent_sessions = SessionSerializer(many=True)
    configuration_changes_count = serializers.IntegerField()
    last_configuration_change_at = serializers.DateTimeField(allow_null=True)


class LastMigrationSerializer(serializers.Serializer):
    app = serializers.CharField()
    name = serializers.CharField()
    applied_at = serializers.DateTimeField()


class SystemInformationSerializer(serializers.Serializer):
    """
    Read-only system/environment information.

    Contains no secret of any kind — no signing keys, database credentials, host
    names, or environment variable values.
    """
    app_version = serializers.CharField()
    api_version = serializers.CharField()
    environment = serializers.CharField()
    debug = serializers.BooleanField()
    django_version = serializers.CharField()
    drf_version = serializers.CharField()
    python_version = serializers.CharField()
    api_status = serializers.CharField()
    database_status = serializers.CharField()
    database_engine = serializers.CharField()
    database_latency_ms = serializers.FloatField()
    time_zone = serializers.CharField()
    server_time = serializers.DateTimeField()
    last_migration = LastMigrationSerializer(allow_null=True)
