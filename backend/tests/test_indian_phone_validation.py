from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.validators import (
    INDIAN_MOBILE_REGEX,
    INDIAN_PHONE_ERROR_MESSAGE,
    normalize_indian_phone,
    is_valid_indian_phone,
    validate_indian_phone,
)
from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.users.serializers_address import CustomerAddressSerializer
from apps.users.serializers import UserRegistrationSerializer, UserProfileUpdateSerializer
from apps.users.serializers_customer import CustomerCreateSerializer, CustomerUpdateSerializer
from apps.core.serializers import ContactInquiryPublicSerializer
from apps.finance.serializers import ClientSerializer
from apps.orders.services.checkout_service import CheckoutService
from apps.products.models import Product, Category, Brand

User = get_user_model()


class IndianPhoneValidatorUnitTests(TestCase):
    """
    Test individual phone validation unit functions against Section 7 specification matrix.
    """

    def test_section_7_matrix_valid_numbers(self):
        valid_inputs = [
            ("9876543210", "+919876543210"),
            ("8765432109", "+918765432109"),
            ("7654321098", "+917654321098"),
            ("6123456789", "+916123456789"),
            ("+919876543210", "+919876543210"),
            ("+91 98765 43210", "+919876543210"),
            ("09876543210", "+919876543210"),
            ("919876543210", "+919876543210"),
            ("+91-98765-43210", "+919876543210"),
        ]
        for val, expected in valid_inputs:
            with self.subTest(val=val):
                self.assertTrue(is_valid_indian_phone(val))
                normalized = normalize_indian_phone(val, required=True)
                self.assertEqual(normalized, expected)

    def test_section_7_matrix_invalid_numbers(self):
        invalid_inputs = [
            "5123456789",    # Starts with 5
            "0123456789",    # 10 digits starting with 0
            "1234567890",    # Starts with 1
            "0000000000",    # All zeros
            "987654321",     # 9 digits (incomplete)
            "98765432101",   # 11 digits without valid prefix
            "ABCD123456",    # Contains alphabets
            "Abcd",          # Only alphabets
            "98765ABCDE",    # Mixed digits and alphabets
            "98765 4321",    # 9 digits with space
            "++919876543210",# Double plus
            "98765@43210",   # Special characters
        ]
        for val in invalid_inputs:
            with self.subTest(val=val):
                self.assertFalse(is_valid_indian_phone(val))
                from rest_framework.exceptions import ValidationError
                with self.assertRaises(ValidationError) as cm:
                    normalize_indian_phone(val, required=True)
                self.assertIn(INDIAN_PHONE_ERROR_MESSAGE, str(cm.exception))

    def test_optional_empty_values(self):
        self.assertEqual(normalize_indian_phone("", required=False), "")
        self.assertEqual(normalize_indian_phone(None, required=False), "")
        self.assertEqual(normalize_indian_phone("   ", required=False), "")

        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            normalize_indian_phone("", required=True)
        with self.assertRaises(ValidationError):
            normalize_indian_phone(None, required=True)


class AddressSerializerPhoneValidationTests(APITestCase):
    """
    Test Address creation, updating, and API validation.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email="phone.test@example.com",
            password="StrongPassword123!",
            first_name="Test",
            last_name="User",
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_address_creation_valid_phone(self):
        payload = {
            "recipient_name": "Test Recipient",
            "phone": "9876543210",
            "address_line1": "123 Test Street",
            "city": "Coimbatore",
            "state": "Tamil Nadu",
            "pincode": "641031",
            "address_type": "home",
        }
        res = self.client.post("/api/v1/addresses/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["phone"], "+919876543210")

    def test_address_creation_rejects_invalid_phones(self):
        invalid_cases = ["Abcd", "12345", "0000000000", "5123456789", "ABCD123456"]
        for bad_phone in invalid_cases:
            with self.subTest(bad_phone=bad_phone):
                payload = {
                    "recipient_name": "Test Recipient",
                    "phone": bad_phone,
                    "address_line1": "123 Test Street",
                    "city": "Coimbatore",
                    "state": "Tamil Nadu",
                    "pincode": "641031",
                    "address_type": "home",
                }
                res = self.client.post("/api/v1/addresses/", payload, format="json")
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("phone", res.data)
                self.assertIn(INDIAN_PHONE_ERROR_MESSAGE, str(res.data["phone"]))

    def test_address_update_rejects_invalid_phone(self):
        addr = CustomerAddress.objects.create(
            user=self.user,
            recipient_name="Initial Name",
            phone="+919876543210",
            address_line1="123 Alpha Road",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641001",
        )
        res = self.client.patch(
            f"/api/v1/addresses/{addr.id}/",
            {"phone": "ABCD123456"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", res.data)

        # Update with valid phone succeeds
        res_ok = self.client.patch(
            f"/api/v1/addresses/{addr.id}/",
            {"phone": "8765432109"},
            format="json",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data["phone"], "+918765432109")


class UserProfilePhoneValidationTests(APITestCase):
    """
    Test customer profile and registration phone validation.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email="profile.phone@example.com",
            password="StrongPassword123!",
            first_name="Profile",
            last_name="Tester",
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_profile_update_valid_phone(self):
        res = self.client.put(
            "/api/v1/auth/me/",
            {"first_name": "Profile", "last_name": "Tester", "phone": "7654321098"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["phone"], "+917654321098")

    def test_profile_update_invalid_phone(self):
        res = self.client.put(
            "/api/v1/auth/me/",
            {"first_name": "Profile", "last_name": "Tester", "phone": "0000000000"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", res.data)

    def test_user_registration_valid_phone(self):
        payload = {
            "email": "new.reg@example.com",
            "password": "StrongPassword123!",
            "first_name": "New",
            "last_name": "Customer",
            "phone": "+91 98765 43210",
        }
        res = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_user = User.objects.get(email="new.reg@example.com")
        self.assertEqual(new_user.phone, "+919876543210")

    def test_user_registration_invalid_phone(self):
        payload = {
            "email": "bad.reg@example.com",
            "password": "StrongPassword123!",
            "first_name": "Bad",
            "last_name": "Customer",
            "phone": "Abcd",
        }
        res = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", res.data)


class ContactInquiryPhoneValidationTests(APITestCase):
    """
    Test public Contact Inquiry submission phone validation.
    """

    def test_contact_inquiry_valid_phone(self):
        payload = {
            "name": "Inquiry User",
            "email": "inquiry@example.com",
            "phone": "6123456789",
            "subject": "Bulk order quotation",
            "message": "Looking for 50 modular switches.",
        }
        res = self.client.post("/api/v1/inquiries/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["phone"], "+916123456789")

    def test_contact_inquiry_invalid_phone(self):
        payload = {
            "name": "Inquiry User",
            "email": "inquiry@example.com",
            "phone": "5555555555",
            "subject": "Bulk order quotation",
            "message": "Looking for 50 modular switches.",
        }
        res = self.client.post("/api/v1/inquiries/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", res.data)


class CheckoutAddressValidationTests(TestCase):
    """
    Test CheckoutService rejects addresses with invalid phone numbers.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email="checkout.tester@example.com",
            password="StrongPassword123!",
            first_name="Checkout",
            last_name="Tester",
        )
        self.brand = Brand.objects.create(name="Anchor", slug="anchor-chk")
        self.category = Category.objects.create(name="Switches", slug="switches-chk")
        self.product = Product.objects.create(
            name="Modular Switch 6A",
            slug="mod-switch-6a",
            sku="SW-6A-001",
            price=Decimal("150.00"),
            mrp=Decimal("180.00"),
            stock=50,
            active=True,
            brand=self.brand,
            category=self.category,
        )

    def test_checkout_rejects_address_with_invalid_phone(self):
        # Create address with legacy invalid phone directly in DB (bypassing serializer)
        bad_address = CustomerAddress.objects.create(
            user=self.user,
            recipient_name="Legacy Customer",
            phone="Abcd",
            address_line1="123 Old St",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641001",
        )
        with self.assertRaises(DjangoValidationError) as cm:
            CheckoutService.process_checkout(
                user=self.user,
                shipping_address_id=bad_address.id,
                items_data=[{"product_id": self.product.id, "quantity": 2}],
            )
        self.assertIn("invalid phone number", str(cm.exception))

    def test_checkout_succeeds_with_valid_phone(self):
        valid_address = CustomerAddress.objects.create(
            user=self.user,
            recipient_name="Good Customer",
            phone="+919876543210",
            address_line1="456 Clean St",
            city="Coimbatore",
            state="Tamil Nadu",
            pincode="641001",
        )
        order = CheckoutService.process_checkout(
            user=self.user,
            shipping_address_id=valid_address.id,
            items_data=[{"product_id": self.product.id, "quantity": 1}],
        )
        self.assertIsNotNone(order)
        self.assertEqual(order.customer_phone, "+919876543210")
