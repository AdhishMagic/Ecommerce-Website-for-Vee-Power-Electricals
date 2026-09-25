from decimal import Decimal
from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole
from apps.finance.models import Expense, ExpenseCategory, ExpenseStatus

User = get_user_model()


class ExpenseAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer = User.objects.create_user(
            email='customer@example.com',
            first_name='Karthik',
            last_name='Rajan',
            role=UserRole.CUSTOMER,
        )
        self.staff_admin = User.objects.create_user(
            email='staff@veepower.in',
            first_name='Vee',
            last_name='Staff',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.super_admin = User.objects.create_user(
            email='superadmin@veepower.in',
            first_name='Super',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_customer = str(AccessToken.for_user(self.customer))
        self.token_staff = str(AccessToken.for_user(self.staff_admin))
        self.token_super = str(AccessToken.for_user(self.super_admin))

        # Sample Initial Expense
        self.expense1 = Expense.objects.create(
            expense_date=date(2026, 9, 15),
            category=ExpenseCategory.LOGISTICS,
            description='Delhivery Courier Dispatch',
            vendor='Delhivery India',
            amount=Decimal('15400.50'),
            status=ExpenseStatus.PAID,
            payment_mode='NEFT',
            created_by=self.staff_admin,
        )
        self.expense2 = Expense.objects.create(
            expense_date=date(2026, 9, 20),
            category=ExpenseCategory.UTILITIES,
            description='Warehouse Electricity TNEB',
            vendor='TNEB Coimbatore',
            amount=Decimal('8200.00'),
            status=ExpenseStatus.PENDING,
            payment_mode='Direct Debit',
            created_by=self.super_admin,
        )

    # -------------------------------------------------------------------------
    # 1. AUTHENTICATION & RBAC CONTROLS
    # -------------------------------------------------------------------------
    def test_unauthenticated_request_rejected(self):
        """Unauthenticated requests must be rejected with 401."""
        res_list = self.client.get('/api/v1/expenses/')
        self.assertEqual(res_list.status_code, status.HTTP_401_UNAUTHORIZED)

        res_create = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'Marketing',
            'description': 'Social Media Ads',
            'vendor': 'Meta Ads',
            'amount': '5000.00',
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_forbidden_from_expenses(self):
        """Customers must not be allowed to list, retrieve, create, or delete expenses."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        # List
        res_list = self.client.get('/api/v1/expenses/')
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        # Retrieve
        res_detail = self.client.get(f'/api/v1/expenses/{self.expense1.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_403_FORBIDDEN)

        # Create
        res_create = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'Operations',
            'description': 'Unauthorized expense',
            'vendor': 'Unknown',
            'amount': '100.00',
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # Delete
        res_del = self.client.delete(f'/api/v1/expenses/{self.expense1.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 2. AUTHORIZED ADMIN ACCESS & CRUD
    # -------------------------------------------------------------------------
    def test_admin_list_and_retrieve_expenses(self):
        """Admin staff can view the list and retrieve specific expense details."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        # List
        res_list = self.client.get('/api/v1/expenses/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        results = res_list.data['results'] if 'results' in res_list.data else res_list.data
        self.assertEqual(len(results), 2)

        # Retrieve
        res_detail = self.client.get(f'/api/v1/expenses/{self.expense1.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data['description'], 'Delhivery Courier Dispatch')
        self.assertEqual(res_detail.data['category'], 'Logistics')
        self.assertEqual(Decimal(str(res_detail.data['amount'])), Decimal('15400.50'))
        self.assertEqual(res_detail.data['created_by_email'], self.staff_admin.email)

    def test_admin_create_valid_expense(self):
        """Admin can create an expense, which assigns created_by automatically."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        payload = {
            'expense_date': '2026-09-24',
            'category': 'Software',
            'description': 'AWS Cloud Hosting Monthly Subscription',
            'vendor': 'Amazon Web Services',
            'amount': '12499.75',
            'status': 'Paid',
            'payment_mode': 'Corporate Credit Card',
            'receipt_url': 'https://s3.amazonaws.com/receipts/aws-sep26.pdf',
        }
        res = self.client.post('/api/v1/expenses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['category'], 'Software')
        self.assertEqual(Decimal(str(res.data['amount'])), Decimal('12499.75'))
        self.assertEqual(res.data['created_by'], self.staff_admin.id)
        self.assertEqual(res.data['created_by_email'], self.staff_admin.email)

        # Verify in database
        exp = Expense.objects.get(id=res.data['id'])
        self.assertEqual(exp.vendor, 'Amazon Web Services')
        self.assertEqual(exp.created_by, self.staff_admin)

    def test_created_by_cannot_be_overridden(self):
        """Audit attribution is always set from the authenticated administrator."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-24',
            'category': 'Software',
            'description': 'Authenticated attribution test',
            'vendor': 'Vendor',
            'amount': '100.00',
            'created_by': self.super_admin.id,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['created_by'], self.staff_admin.id)

    def test_create_expense_with_date_alias(self):
        """Frontend sending 'date' instead of 'expense_date' is seamlessly mapped."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        payload = {
            'date': '2026-09-23',
            'category': 'Marketing',
            'description': 'Google Ads PPC Campaign',
            'vendor': 'Google India',
            'amount': '5000.00',
            'status': 'Paid',
        }
        res = self.client.post('/api/v1/expenses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['expense_date'], '2026-09-23')
        self.assertEqual(res.data['date'], '2026-09-23')

    def test_admin_update_and_partial_update(self):
        """Admin can update and partially update expense records."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        # Partial update (PATCH)
        res_patch = self.client.patch(
            f'/api/v1/expenses/{self.expense2.id}/',
            {'status': 'Paid', 'payment_mode': 'Bank Transfer'},
            format='json'
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data['status'], 'Paid')
        self.assertEqual(res_patch.data['payment_mode'], 'Bank Transfer')

        # Full update (PUT)
        payload = {
            'expense_date': '2026-09-20',
            'category': 'Utilities',
            'description': 'TNEB Electricity Hub Final Settlement',
            'vendor': 'TNEB Coimbatore',
            'amount': '8500.00',
            'status': 'Paid',
            'payment_mode': 'RTGS',
        }
        res_put = self.client.put(f'/api/v1/expenses/{self.expense2.id}/', payload, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.assertEqual(res_put.data['description'], 'TNEB Electricity Hub Final Settlement')
        self.assertEqual(Decimal(str(res_put.data['amount'])), Decimal('8500.00'))

    def test_admin_delete_expense(self):
        """Admin can safely delete an expense."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res_del = self.client.delete(f'/api/v1/expenses/{self.expense1.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Expense.objects.filter(id=self.expense1.id).exists())

    # -------------------------------------------------------------------------
    # 3. FINANCIAL VALIDATION & CONSTRAINTS
    # -------------------------------------------------------------------------
    def test_validation_rejects_non_positive_amount(self):
        """Amount must be strictly greater than zero."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        # Zero amount
        res_zero = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'Marketing',
            'description': 'Test',
            'vendor': 'Vendor',
            'amount': '0.00',
        }, format='json')
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # Negative amount
        res_neg = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'Marketing',
            'description': 'Test',
            'vendor': 'Vendor',
            'amount': '-100.00',
        }, format='json')
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validation_rejects_invalid_category(self):
        """Category must be in valid enum choices."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'InvalidCategoryXYZ',
            'description': 'Test',
            'vendor': 'Vendor',
            'amount': '500.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validation_rejects_invalid_status(self):
        """Status must be 'Paid' or 'Pending'."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-22',
            'category': 'Operations',
            'description': 'Test',
            'vendor': 'Vendor',
            'amount': '500.00',
            'status': 'Completed',  # Invalid enum value
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nonexistent_id_returns_404(self):
        """Querying an unknown expense ID returns 404."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')
        res = self.client.get('/api/v1/expenses/999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------------------
    # 4. FILTERING & SEARCH
    # -------------------------------------------------------------------------
    def test_filter_by_category(self):
        """Filter expenses by category query parameter."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.get('/api/v1/expenses/?category=Logistics')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data['results'] if 'results' in res.data else res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['category'], 'Logistics')

    def test_filter_by_status(self):
        """Filter expenses by status query parameter."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.get('/api/v1/expenses/?status=Pending')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data['results'] if 'results' in res.data else res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['status'], 'Pending')

    def test_search_expenses(self):
        """Search expenses across description, vendor, and category."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.get('/api/v1/expenses/?search=TNEB')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data['results'] if 'results' in res.data else res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['vendor'], 'TNEB Coimbatore')

    # -------------------------------------------------------------------------
    # 5. CANONICAL /api/v1/expenses/ ROUTE
    # -------------------------------------------------------------------------
    def test_expenses_route(self):
        """The canonical top-level expense route is registered."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')

        res = self.client.get('/api/v1/expenses/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data['results'] if 'results' in res.data else res.data
        self.assertGreaterEqual(len(results), 2)
