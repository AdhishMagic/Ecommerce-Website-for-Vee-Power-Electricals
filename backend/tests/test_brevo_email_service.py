import unittest
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from apps.core.services.brevo_service import BrevoEmailService


class BrevoEmailServiceTestCase(TestCase):
    """
    Unit tests for BrevoEmailService covering API interaction, test mode enforcement,
    error classification, rate limiting, and timeout handling.
    """

    def setUp(self):
        self.authorized_1 = "balaadhish.cbe@gmail.com"
        self.authorized_2 = "balaadhish333@gmail.com"
        self.unauthorized = "stranger@externaldomain.com"

    @override_settings(
        EMAIL_TEST_MODE=True,
        EMAIL_TEST_ALLOWLIST=["balaadhish.cbe@gmail.com", "balaadhish333@gmail.com"]
    )
    def test_01_test_mode_allowlist_enforcement(self):
        """In test mode, non-allowlisted recipients are suppressed without calling Brevo."""
        with patch('requests.post') as mock_post:
            result = BrevoEmailService.send_transactional_email(
                recipient=self.unauthorized,
                subject="Test Subject",
                html_content="<p>Test</p>",
                text_content="Test",
            )
            # Must be suppressed
            self.assertFalse(result["success"])
            self.assertEqual(result["status"], "suppressed")
            self.assertIn("not in authorized allowlist", result["error"])
            # Requests must NOT have been called
            mock_post.assert_not_called()

    @override_settings(
        EMAIL_TEST_MODE=True,
        EMAIL_TEST_ALLOWLIST=["balaadhish.cbe@gmail.com", "balaadhish333@gmail.com"],
        BREVO_API_KEY="test_brevo_key_12345",
        BREVO_SENDER_EMAIL="veepower.cbe@gmail.com",
        BREVO_SENDER_NAME="Vee Power Electricals"
    )
    def test_02_allowlisted_recipient_proceeds_to_api(self):
        """Allowlisted recipients are transmitted to Brevo API and messageId is captured."""
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"messageId": "<20261010.testmsg123@smtp-relay.brevo.com>"}

        with patch('requests.post', return_value=mock_response) as mock_post:
            result = BrevoEmailService.send_transactional_email(
                recipient=self.authorized_1,
                subject="Test Subject",
                html_content="<p>Test</p>",
                text_content="Test",
            )
            self.assertTrue(result["success"])
            self.assertEqual(result["status"], "accepted")
            self.assertEqual(result["message_id"], "<20261010.testmsg123@smtp-relay.brevo.com>")
            mock_post.assert_called_once()
            called_kwargs = mock_post.call_args[1]
            self.assertEqual(called_kwargs['headers']['api-key'], "test_brevo_key_12345")
            self.assertEqual(called_kwargs['json']['to'][0]['email'], self.authorized_1)

    @override_settings(
        EMAIL_TEST_MODE=True,
        EMAIL_TEST_ALLOWLIST=["balaadhish.cbe@gmail.com", "balaadhish333@gmail.com"]
    )
    def test_03_invalid_recipient_syntax_rejected(self):
        """Syntactically invalid email addresses are rejected immediately."""
        result = BrevoEmailService.send_transactional_email(
            recipient="not-an-email",
            subject="Test",
            html_content="<p>Test</p>",
            text_content="Test",
        )
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["status_code"], 400)
        self.assertIn("Invalid recipient email syntax", result["error"])

    @override_settings(
        EMAIL_TEST_MODE=False,
        BREVO_API_KEY="test_brevo_key_12345",
        BREVO_SENDER_EMAIL="veepower.cbe@gmail.com"
    )
    def test_04_permanent_error_not_retried(self):
        """Permanent HTTP 400 / 401 errors are rejected without retrying."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = '{"code":"invalid_parameter","message":"bad request"}'

        with patch('requests.post', return_value=mock_response) as mock_post:
            result = BrevoEmailService.send_transactional_email(
                recipient="test@example.com",
                subject="Test",
                html_content="<p>Test</p>",
                text_content="Test",
            )
            self.assertFalse(result["success"])
            self.assertEqual(result["status_code"], 400)
            self.assertFalse(result["transient"])
            # Permanent errors must only attempt once
            self.assertEqual(mock_post.call_count, 1)

    @override_settings(
        EMAIL_TEST_MODE=False,
        BREVO_API_KEY="test_brevo_key_12345",
        BREVO_SENDER_EMAIL="veepower.cbe@gmail.com"
    )
    def test_05_rate_limit_429_transient_retry(self):
        """Rate limiting HTTP 429 is treated as transient and retried."""
        mock_429 = MagicMock()
        mock_429.status_code = 429
        mock_429.text = '{"code":"too_many_requests"}'

        mock_201 = MagicMock()
        mock_201.status_code = 201
        mock_201.json.return_value = {"messageId": "<retry.success.msg@brevo.com>"}

        with patch('requests.post', side_effect=[mock_429, mock_201]) as mock_post, \
             patch('time.sleep') as mock_sleep:
            result = BrevoEmailService.send_transactional_email(
                recipient="test@example.com",
                subject="Test",
                html_content="<p>Test</p>",
                text_content="Test",
            )
            self.assertTrue(result["success"])
            self.assertEqual(result["message_id"], "<retry.success.msg@brevo.com>")
            self.assertEqual(mock_post.call_count, 2)
            mock_sleep.assert_called_once()
