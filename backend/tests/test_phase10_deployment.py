from unittest.mock import patch
from django.core.management import call_command
from django.db import OperationalError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from apps.products.models import Category


class Phase10DeploymentReadinessTestCase(TestCase):
    """
    Phase 10 Operations & Release Readiness Validation:
    - Health Checks (Readiness & Liveness probes)
    - Database Failure Handling
    - Seed Data Idempotency
    - Production Hardening Integrity
    """

    def setUp(self):
        self.client = APIClient()

    def test_health_readiness_probe_success(self):
        """Readiness probe verifies application process and database connectivity."""
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data.get('status'), 'healthy')
        self.assertEqual(data.get('probe'), 'readiness')
        self.assertEqual(data.get('services', {}).get('application'), 'up')
        self.assertEqual(data.get('services', {}).get('database'), 'connected')
        self.assertIn('timestamp', data)

    def test_api_v1_health_alias(self):
        """API v1 health path functions identically to root health."""
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data.get('status'), 'healthy')
        self.assertEqual(data.get('services', {}).get('database'), 'connected')

    def test_health_liveness_probe(self):
        """Liveness probe confirms application process is running without querying database."""
        response = self.client.get('/health/?probe=liveness')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data.get('status'), 'healthy')
        self.assertEqual(data.get('probe'), 'liveness')
        self.assertEqual(data.get('services', {}).get('application'), 'up')
        self.assertNotIn('database', data.get('services', {}))

    @patch('django.db.connection.cursor')
    def test_health_readiness_database_failure(self, mock_cursor):
        """Simulated database failure returns 503 and sanitizes error details."""
        mock_cursor.side_effect = OperationalError("Can't connect to MySQL server")

        response = self.client.get('/health/')
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        data = response.json()
        self.assertEqual(data.get('status'), 'unhealthy')
        self.assertEqual(data.get('services', {}).get('application'), 'up')
        self.assertEqual(data.get('services', {}).get('database'), 'disconnected')

        # Verify no credentials or internal SQL errors are leaked in response
        content_str = response.content.decode('utf-8')
        self.assertNotIn("Can't connect to MySQL", content_str)
        self.assertNotIn("password", content_str.lower())
        self.assertNotIn("root", content_str.lower())

    def test_seed_data_idempotent_execution(self):
        """Repeated executions of seed_data must be idempotent without raising IntegrityError."""
        # Initial run
        call_command('seed_data')
        initial_cat_count = Category.objects.count()
        self.assertGreater(initial_cat_count, 0)

        # Repeated run (simulating second startup)
        call_command('seed_data')
        subsequent_cat_count = Category.objects.count()
        self.assertEqual(initial_cat_count, subsequent_cat_count)

    def test_production_settings_attributes(self):
        """Verify production settings module enforces essential security flags."""
        from config.settings import production as prod_settings

        self.assertFalse(prod_settings.DEBUG, "DEBUG must be False in production.")
        self.assertFalse(prod_settings.CORS_ALLOW_ALL_ORIGINS, "CORS_ALLOW_ALL_ORIGINS must be False in production.")
        self.assertIsInstance(prod_settings.ALLOWED_HOSTS, list)
        self.assertIsInstance(prod_settings.CORS_ALLOWED_ORIGINS, list)
        self.assertIsInstance(prod_settings.CSRF_TRUSTED_ORIGINS, list)
        self.assertEqual(prod_settings.SECURE_PROXY_SSL_HEADER, ('HTTP_X_FORWARDED_PROTO', 'https'))
