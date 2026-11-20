"""
Unit and integration tests for company information in transactional email templates and CommunicationService.
Verifies that company name, GSTIN, support phone number, and support email match real business details:
- Legal / Brand Name: "Vee Power Electricals" (replaces "Vee Power Electricals Private Limited")
- GSTIN: "33CKXPK4525R1Z9" (replaces "33AAAAA0000A1Z5")
- Phone: "+91 8610359797" (replaces "+91 98765 43210")
- Email / Support: "support@veepowerelectricals.com" (replaces "support@veepower.in")
"""

import os
from pathlib import Path
from django.conf import settings
from django.template.loader import render_to_string
from django.test import TestCase

from apps.commercial_config.models import CompanyStoreConfiguration
from apps.core.services.communication_service import CommunicationService


class CompanyDetailsEmailTemplateTestCase(TestCase):
    """
    Validates company context resolution and rendered email templates.
    """

    def test_communication_service_default_company_context(self):
        """
        Verify CommunicationService.get_company_context() returns correct default business details.
        """
        context = CommunicationService.get_company_context()
        self.assertEqual(context["company_name"], "Vee Power Electricals")
        self.assertEqual(context["company_legal_name"], "Vee Power Electricals")
        self.assertEqual(context["company_gstin"], "33CKXPK4525R1Z9")
        self.assertEqual(context["company_phone"], "+91 8610359797")
        self.assertEqual(context["company_support_email"], "support@veepowerelectricals.com")

    def test_communication_service_db_override(self):
        """
        Verify that database configuration (CompanyStoreConfiguration) overrides default settings if updated.
        """
        config, _ = CompanyStoreConfiguration.objects.get_or_create(id=1)
        config.legal_company_name = "Vee Power Electricals"
        config.gstin = "33CKXPK4525R1Z9"
        config.pan = "CKXPK4525R"
        config.support_phone = "+91 8610359797"
        config.support_email = "support@veepowerelectricals.com"
        config.save()

        context = CommunicationService.get_company_context()
        self.assertEqual(context["company_name"], "Vee Power Electricals")
        self.assertEqual(context["company_gstin"], "33CKXPK4525R1Z9")
        self.assertEqual(context["company_phone"], "+91 8610359797")
        self.assertEqual(context["company_support_email"], "support@veepowerelectricals.com")

    def test_order_confirmation_html_rendering(self):
        """
        Verify emails/order_confirmation.html renders the updated company info and no old placeholders.
        """
        dummy_context = {
            "order_number": "ORD-TEST-1234",
            "customer_name": "Test Customer",
            "items": [],
            "subtotal": "1000.00",
            "tax_amount": "180.00",
            "delivery_charge": "50.00",
            "total_amount": "1230.00",
            "payment_method": "UPI",
            "shipping_address": "123 Test Street",
            **CommunicationService.get_company_context(),
        }
        rendered = render_to_string("emails/order_confirmation.html", dummy_context)

        # Assert new information is present
        self.assertIn("Vee Power Electricals", rendered)
        self.assertIn("33CKXPK4525R1Z9", rendered)
        self.assertIn("+91 8610359797", rendered)
        self.assertIn("support@veepowerelectricals.com", rendered)

        # Assert old placeholders are absent
        self.assertNotIn("Vee Power Electricals Private Limited", rendered)
        self.assertNotIn("33AAAAA0000A1Z5", rendered)
        self.assertNotIn("+91 98765 43210", rendered)
        self.assertNotIn("support@veepower.in", rendered)
        self.assertNotIn("support.veepower", rendered)

    def test_order_confirmation_txt_rendering(self):
        """
        Verify emails/order_confirmation.txt renders the updated company info and no old placeholders.
        """
        dummy_context = {
            "order_number": "ORD-TEST-1234",
            "customer_name": "Test Customer",
            "items": [],
            "subtotal": "1000.00",
            "tax_amount": "180.00",
            "delivery_charge": "50.00",
            "total_amount": "1230.00",
            "payment_method": "UPI",
            "shipping_address": "123 Test Street",
            **CommunicationService.get_company_context(),
        }
        rendered = render_to_string("emails/order_confirmation.txt", dummy_context)

        self.assertIn("Vee Power Electricals", rendered)
        self.assertIn("+91 8610359797", rendered)
        self.assertIn("support@veepowerelectricals.com", rendered)

        self.assertNotIn("Vee Power Electricals Private Limited", rendered)
        self.assertNotIn("33AAAAA0000A1Z5", rendered)
        self.assertNotIn("+91 98765 43210", rendered)
        self.assertNotIn("support@veepower.in", rendered)

    def test_invoice_notification_templates(self):
        """
        Verify invoice notification HTML and TXT templates have updated seller GSTIN and company details.
        """
        context = {
            "order_number": "ORD-INV-9999",
            "customer_name": "Invoice Customer",
            "invoice_number": "INV-2026-0001",
            "invoice_date": "2026-04-01",
            "subtotal": "2000.00",
            "tax_amount": "360.00",
            "delivery_charge": "0.00",
            "total_amount": "2360.00",
            "items": [],
            **CommunicationService.get_company_context(),
        }
        rendered_html = render_to_string("emails/invoice_notification.html", context)
        self.assertIn("Vee Power Electricals", rendered_html)
        self.assertIn("33CKXPK4525R1Z9", rendered_html)
        self.assertIn("+91 8610359797", rendered_html)
        self.assertIn("support@veepowerelectricals.com", rendered_html)
        self.assertNotIn("33AAAAA0000A1Z5", rendered_html)
        self.assertNotIn("+91 98765 43210", rendered_html)
        self.assertNotIn("Vee Power Electricals Private Limited", rendered_html)

        rendered_txt = render_to_string("emails/invoice_notification.txt", context)
        self.assertIn("Vee Power Electricals", rendered_txt)
        self.assertIn("33CKXPK4525R1Z9", rendered_txt)
        self.assertIn("+91 8610359797", rendered_txt)
        self.assertIn("support@veepowerelectricals.com", rendered_txt)
        self.assertNotIn("33AAAAA0000A1Z5", rendered_txt)
        self.assertNotIn("+91 98765 43210", rendered_txt)
        self.assertNotIn("Vee Power Electricals Private Limited", rendered_txt)

    def test_all_email_template_files_free_of_old_placeholders(self):
        """
        Scans all email template files on disk to guarantee none contain the stale placeholders.
        """
        email_templates_dir = Path(settings.BASE_DIR) / "templates" / "emails"
        template_files = list(email_templates_dir.glob("*.*"))
        self.assertTrue(len(template_files) > 0, "No email template files found to scan.")

        forbidden_strings = [
            "Vee Power Electricals Private Limited",
            "33AAAAA0000A1Z5",
            "+91 98765 43210",
            "support@veepower.in",
            "support.veepower.in",
            "support.veepower,in",
        ]

        for template_path in template_files:
            content = template_path.read_text(encoding="utf-8")
            for forbidden in forbidden_strings:
                self.assertNotIn(
                    forbidden,
                    content,
                    f"Forbidden placeholder '{forbidden}' found in template: {template_path.name}",
                )
