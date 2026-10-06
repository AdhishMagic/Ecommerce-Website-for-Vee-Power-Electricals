"""
Service layer for Administrative Settings: session governance and system diagnostics.

This module performs no schema ownership of its own beyond
:class:`apps.admin_settings.models.NotificationSettings`; it reads authoritative
state from the existing user table, the existing SimpleJWT token blacklist
tables, and the live database connection.
"""
from __future__ import annotations

import os
import platform
import time
from typing import Any, Optional

import django
import rest_framework
from django.conf import settings as django_settings
from django.db import connection
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

#: How many individual session records the API returns alongside the true count.
SESSION_DISPLAY_LIMIT = 5


# ---------------------------------------------------------------------------
# Session governance (backed by the existing SimpleJWT blacklist tables)
# ---------------------------------------------------------------------------
def _blacklisted_token_ids(user) -> set[int]:
    return set(
        BlacklistedToken.objects.filter(token__user=user).values_list('token_id', flat=True)
    )


def active_sessions(user) -> list[dict[str, Any]]:
    """
    Every refresh token issued to ``user`` that is still usable: not blacklisted
    and not expired. Backed by the real ``token_blacklist`` tables.
    """
    now = timezone.now()
    blacklisted = _blacklisted_token_ids(user)
    records = list(
        OutstandingToken.objects.filter(user=user, expires_at__gt=now).order_by('-created_at')
    )
    return [
        {
            'id': record.id,
            'created_at': record.created_at,
            'expires_at': record.expires_at,
        }
        for record in records
        if record.id not in blacklisted
    ]


def session_overview(user) -> dict[str, Any]:
    """Authoritative active-session count plus a bounded preview of recent sessions."""
    sessions = active_sessions(user)
    return {
        'count': len(sessions),
        'recent': sessions[:SESSION_DISPLAY_LIMIT],
    }


def revoke_all_sessions(user) -> int:
    """
    Blacklist every usable refresh token for ``user`` and return how many were
    revoked. Access tokens remain valid until their own (30 minute) expiry, which
    is the documented behaviour of stateless JWT; the refresh path — and therefore
    the ability to stay signed in — is invalidated immediately.
    """
    now = timezone.now()
    blacklisted = _blacklisted_token_ids(user)
    outstanding = list(OutstandingToken.objects.filter(user=user, expires_at__gt=now))

    revoked = 0
    for token in outstanding:
        if token.id in blacklisted:
            continue
        BlacklistedToken.objects.get_or_create(token=token)
        revoked += 1
    return revoked


def issue_token_pair(user) -> tuple[str, str]:
    """
    Mint a new token pair using the project's existing SimpleJWT configuration.
    No new token system is introduced; this is the same machinery the login view
    and the refresh endpoint already use.
    """
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


# ---------------------------------------------------------------------------
# System diagnostics (read-only, secret-free)
# ---------------------------------------------------------------------------
def database_diagnostics() -> dict[str, Any]:
    """
    Live database connectivity probe. Only the vendor name and latency are
    reported — never host, port, user, password, or database name.
    """
    started = time.perf_counter()
    status_value = 'disconnected'
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            row = cursor.fetchone()
        if row and row[0] == 1:
            status_value = 'connected'
    except Exception:  # pragma: no cover - depends on infrastructure state
        status_value = 'disconnected'

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        'status': status_value,
        'engine': connection.vendor,
        'latency_ms': latency_ms,
    }


def last_applied_migration() -> Optional[dict[str, Any]]:
    """Most recently applied migration — the honest source for 'last system update'."""
    from django.db.migrations.recorder import MigrationRecorder

    record = MigrationRecorder(connection).migration_qs.order_by('-applied').first()
    if record is None:
        return None
    return {
        'app': record.app,
        'name': record.name,
        'applied_at': record.applied,
    }


def environment_name() -> str:
    """
    Deployment environment identifier derived from the active settings module
    (``base``/``development``/``production``). An infrastructure-level
    ``ENVIRONMENT`` setting overrides it when provided.
    """
    explicit = getattr(django_settings, 'ENVIRONMENT', None)
    if explicit:
        return str(explicit)
    module = os.environ.get('DJANGO_SETTINGS_MODULE', '')
    if not module:
        return 'unknown'
    return module.rsplit('.', 1)[-1] or 'unknown'


def build_system_information() -> dict[str, Any]:
    """
    Assemble the read-only System payload.

    Deliberately excludes every secret and private infrastructure detail: no
    ``SECRET_KEY``, no ``JWT_SECRET_KEY``, no database credentials or host, no
    ``.env`` values, no email credentials.
    """
    db = database_diagnostics()
    return {
        'app_version': str(getattr(django_settings, 'APP_VERSION', '0.0.0')),
        'api_version': 'v1',
        'environment': environment_name(),
        'debug': bool(django_settings.DEBUG),
        'django_version': django.get_version(),
        'drf_version': str(getattr(rest_framework, 'VERSION', 'unknown')),
        'python_version': platform.python_version(),
        'api_status': 'operational' if db['status'] == 'connected' else 'degraded',
        'database_status': db['status'],
        'database_engine': db['engine'],
        'database_latency_ms': db['latency_ms'],
        'time_zone': str(django_settings.TIME_ZONE),
        'server_time': timezone.now(),
        'last_migration': last_applied_migration(),
    }
