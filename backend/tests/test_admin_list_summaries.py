"""
Regression tests for admin list KPI aggregates.

Root cause these guard against: the admin list endpoints are paginated at 20 rows,
and the KPI cards used to sum only the records held on the current page. Once a
table exceeded one page every total silently under-reported (e.g. "Total Invoiced"
showed one third of the real value). The ``/summary/`` endpoints below compute the
totals in the database over the complete table.

These tests assert:
  * the summary totals equal an independent database aggregate,
  * the totals are independent of pagination (more rows => same, larger totals),
  * every record is reachable through the paginated list,
  * RBAC is enforced on the new endpoints,
  * the summary endpoints do not degrade into N+1 queries as data grows.
"""
import datetime
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.finance.models import (
    Client,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    Invoice,
    InvoiceStatus,
    PaymentTransaction,
    PaymentTxStatus,
    Quotation,
    QuotationStatus,
)
from apps.users.models import UserRole

User = get_user_model()

CLIENTS_SUMMARY_URL = '/api/v1/finance/clients/summary/'
QUOTATIONS_SUMMARY_URL = '/api/v1/finance/quotations/summary/'
INVOICES_SUMMARY_URL = '/api/v1/finance/invoices/summary/'
EXPENSES_SUMMARY_URL = '/api/v1/expenses/summary/'
PAYMENTS_SUMMARY_URL = '/api/v1/finance/payments/summary/'

CLIENTS_LIST_URL = '/api/v1/finance/clients/'
QUOTATIONS_LIST_URL = '/api/v1/finance/quotations/'
INVOICES_LIST_URL = '/api/v1/finance/invoices/'

# The globally configured default page size (apps.common.pagination).
PAGE_SIZE = 20


class AdminListSummaryTestBase(TestCase):
    """Shared admin/customer RBAC fixtures."""

    def setUp(self):
        self.client = APIClient()
        self.tag = uuid.uuid4().hex[:8]
        # Monotonic counter so repeated make_*() calls in one test never reuse a
        # unique code/number (client_code, gstin, quotation_number, invoice_number).
        self._seq = 0

        self.admin = User.objects.create_user(
            email=f'summary_admin_{self.tag}@veepower.in',
            first_name='Summary',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.customer = User.objects.create_user(
            email=f'summary_customer_{self.tag}@example.com',
            first_name='Summary',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.token_admin = str(AccessToken.for_user(self.admin))
        self.token_customer = str(AccessToken.for_user(self.customer))

    def authenticate_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

    def authenticate_customer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

    # NOTE: These helpers use ``objects.create`` rather than ``bulk_create`` because
    # the MySQL backend cannot return generated primary keys from a bulk insert, so
    # bulk-created rows come back with ``pk=None`` and cannot be used as foreign keys.
    def _take_seq(self, count):
        start = self._seq
        self._seq += count
        return start

    def make_clients(self, count, credit_limit='100000.00'):
        clients = []
        start = self._take_seq(count)
        for offset in range(count):
            i = start + offset
            clients.append(Client.objects.create(
                client_code=f'CLI-{self.tag}-{i:04d}',
                company_name=f'Summary Client {self.tag} {i:04d}',
                contact_person=f'Contact {i}',
                gstin=f'33ABCDE{i:04d}F1Z5',
                email=f'client{i}_{self.tag}@example.com',
                phone='+919876500000',
                credit_limit=Decimal(credit_limit),
            ))
        return clients

    def make_quotations(self, clients, count, value='1000.00', status_value=QuotationStatus.DRAFT):
        today = datetime.date(2026, 1, 1)
        quotations = []
        start = self._take_seq(count)
        for offset in range(count):
            i = start + offset
            quotations.append(Quotation.objects.create(
                quotation_number=f'QTN-{self.tag}-{i:04d}',
                client=clients[i % len(clients)],
                quotation_date=today,
                expiry_date=today + datetime.timedelta(days=30),
                total_value=Decimal(value),
                status=status_value,
            ))
        return quotations

    def make_invoices(self, clients, count, amount='500.00', status_value=InvoiceStatus.UNPAID):
        today = datetime.date(2026, 1, 1)
        invoices = []
        start = self._take_seq(count)
        for offset in range(count):
            i = start + offset
            amount_dec = Decimal(amount)
            invoices.append(Invoice.objects.create(
                invoice_number=f'INV-{self.tag}-{i:04d}',
                invoice_date=today,
                due_date=today + datetime.timedelta(days=30),
                client=clients[i % len(clients)],
                subtotal=amount_dec,
                taxable_amount=amount_dec,
                total_amount=amount_dec,
                status=status_value,
            ))
        return invoices

    def make_expenses(self, count, amount='250.00', status_value=ExpenseStatus.PENDING):
        today = datetime.date(2026, 1, 1)
        expenses = []
        start = self._take_seq(count)
        for offset in range(count):
            i = start + offset
            expenses.append(Expense.objects.create(
                expense_date=today,
                category=ExpenseCategory.OPERATIONS,
                description=f'Summary expense {self.tag} {i:04d}',
                vendor='Test Vendor',
                amount=Decimal(amount),
                status=status_value,
            ))
        return expenses


class ClientSummaryAggregateTests(AdminListSummaryTestBase):
    """The Clients Directory KPI cards must describe the whole client book."""

    def test_client_summary_counts_all_rows_beyond_first_page(self):
        self.make_clients(PAGE_SIZE + 5)
        self.authenticate_admin()

        response = self.client.get(CLIENTS_SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['total_count'], PAGE_SIZE + 5)
        self.assertEqual(response.data['active_count'], PAGE_SIZE + 5)
        self.assertEqual(response.data['inactive_count'], 0)

        expected_credit = Decimal('100000.00') * (PAGE_SIZE + 5)
        self.assertEqual(Decimal(response.data['total_credit_limit']), expected_credit)

        # The list endpoint still paginates, but page 2 proves the extra rows exist.
        list_response = self.client.get(CLIENTS_LIST_URL)
        self.assertEqual(list_response.data['count'], PAGE_SIZE + 5)
        self.assertEqual(len(list_response.data['results']), PAGE_SIZE)
        page_two = self.client.get(CLIENTS_LIST_URL, {'page': 2})
        self.assertEqual(len(page_two.data['results']), 5)

    def test_client_summary_inactive_split(self):
        clients = self.make_clients(PAGE_SIZE + 5)
        Client.objects.filter(id__in=[c.id for c in clients[:3]]).update(is_active=False)

        self.authenticate_admin()
        response = self.client.get(CLIENTS_SUMMARY_URL)
        self.assertEqual(response.data['active_count'], PAGE_SIZE + 2)
        self.assertEqual(response.data['inactive_count'], 3)

    def test_client_summary_exposure_matches_unpaid_invoice_total(self):
        clients = self.make_clients(3, credit_limit='50000.00')
        self.make_invoices(clients, 25, amount='400.00')
        # A cancelled invoice must NOT contribute to exposure.
        self.make_invoices(clients, 5, amount='9999.00', status_value=InvoiceStatus.CANCELLED)

        self.authenticate_admin()
        response = self.client.get(CLIENTS_SUMMARY_URL)

        expected_exposure = (Decimal('400.00') * 25).quantize(Decimal('0.01'))
        self.assertEqual(Decimal(response.data['total_exposure']), expected_exposure)
        self.assertEqual(response.data['total_count'], 3)


class QuotationSummaryAggregateTests(AdminListSummaryTestBase):
    def test_quotation_summary_totals_are_database_wide(self):
        clients = self.make_clients(1)
        self.make_quotations(clients, 22, value='1500.00', status_value=QuotationStatus.CONVERTED)
        self.make_quotations(clients, 19, value='2500.00', status_value=QuotationStatus.DRAFT)

        self.authenticate_admin()
        response = self.client.get(QUOTATIONS_SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['total_count'], 41)
        self.assertEqual(response.data['pending_count'], 19)
        self.assertEqual(response.data['converted_count'], 22)

        expected_value = (Decimal('1500.00') * 22) + (Decimal('2500.00') * 19)
        self.assertEqual(Decimal(response.data['total_value']), expected_value)

        # Regression guard: the page-scoped figure is smaller than the real total.
        list_response = self.client.get(QUOTATIONS_LIST_URL)
        page_total = sum(Decimal(q['total_value']) for q in list_response.data['results'])
        self.assertLess(page_total, expected_value)


class InvoiceSummaryAggregateTests(AdminListSummaryTestBase):
    def test_invoice_summary_excludes_cancelled_and_reads_collected_from_payments(self):
        clients = self.make_clients(1)
        invoices = self.make_invoices(clients, 24, amount='1000.00', status_value=InvoiceStatus.UNPAID)
        self.make_invoices(clients, 6, amount='7000.00', status_value=InvoiceStatus.CANCELLED)

        # Only successful payments count as collected cash.
        PaymentTransaction.objects.create(
            invoice=invoices[0], gateway='MANUAL', amount=Decimal('300.00'),
            status=PaymentTxStatus.SUCCESS,
        )
        PaymentTransaction.objects.create(
            invoice=invoices[1], gateway='MANUAL', amount=Decimal('450.00'),
            status=PaymentTxStatus.FAILED,
        )

        self.authenticate_admin()
        response = self.client.get(INVOICES_SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['total_count'], 30)
        self.assertEqual(Decimal(response.data['total_invoiced']), Decimal('24000.00'))
        self.assertEqual(Decimal(response.data['total_collected']), Decimal('300.00'))
        # 24 unpaid invoices at 1000.00, one of which has 300.00 collected.
        self.assertEqual(Decimal(response.data['total_outstanding']), Decimal('23700.00'))
        self.assertEqual(response.data['by_status']['Cancelled']['count'], 6)


class ExpenseSummaryAggregateTests(AdminListSummaryTestBase):
    def test_expense_summary_totals_are_database_wide(self):
        self.make_expenses(23, amount='500.00', status_value=ExpenseStatus.PENDING)
        self.make_expenses(4, amount='1250.00', status_value=ExpenseStatus.PAID)

        self.authenticate_admin()
        response = self.client.get(EXPENSES_SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['total_count'], 27)
        self.assertEqual(response.data['pending_count'], 23)
        expected_total = (Decimal('500.00') * 23) + (Decimal('1250.00') * 4)
        self.assertEqual(Decimal(response.data['total_amount']), expected_total)
        self.assertEqual(response.data['by_category']['Operations']['count'], 27)


class PaymentSummaryAggregateTests(AdminListSummaryTestBase):
    def test_payment_summary_reads_successful_transactions_only(self):
        clients = self.make_clients(1)
        invoices = self.make_invoices(clients, 1, amount='10000.00')

        for amount, tx_status in [
            ('100.00', PaymentTxStatus.SUCCESS),
            ('200.00', PaymentTxStatus.SUCCESS),
            ('300.00', PaymentTxStatus.FAILED),
            ('400.00', PaymentTxStatus.INITIATED),
        ]:
            PaymentTransaction.objects.create(
                invoice=invoices[0], gateway='MANUAL',
                amount=Decimal(amount), status=tx_status,
            )

        self.authenticate_admin()
        response = self.client.get(PAYMENTS_SUMMARY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['total_count'], 4)
        self.assertEqual(Decimal(response.data['total_collected']), Decimal('300.00'))
        self.assertEqual(response.data['success_count'], 2)
        self.assertEqual(response.data['failed_count'], 1)
        self.assertEqual(response.data['initiated_count'], 1)


class SummaryRBACTests(AdminListSummaryTestBase):
    ENDPOINTS = [
        CLIENTS_SUMMARY_URL,
        QUOTATIONS_SUMMARY_URL,
        INVOICES_SUMMARY_URL,
        EXPENSES_SUMMARY_URL,
        PAYMENTS_SUMMARY_URL,
    ]

    def test_anonymous_requests_are_rejected(self):
        for url in self.ENDPOINTS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_requests_are_forbidden(self):
        self.authenticate_customer()
        for url in self.ENDPOINTS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SummaryQueryEfficiencyTests(AdminListSummaryTestBase):
    """A KPI aggregate must not scale its query count with the number of rows."""

    def _summary_query_count(self, url):
        self.authenticate_admin()
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        return len(ctx.captured_queries)

    def test_client_summary_query_count_is_stable_as_rows_grow(self):
        self.make_clients(5)
        small = self._summary_query_count(CLIENTS_SUMMARY_URL)

        self.make_clients(45)
        large = self._summary_query_count(CLIENTS_SUMMARY_URL)

        self.assertEqual(
            small,
            large,
            f'Client summary query count grew with row count (N+1): {small} -> {large}',
        )
        self.assertLessEqual(large, 8)

    def test_invoice_summary_query_count_is_stable_as_rows_grow(self):
        clients = self.make_clients(2)
        self.make_invoices(clients, 5)
        small = self._summary_query_count(INVOICES_SUMMARY_URL)

        self.make_invoices(clients, 45)
        large = self._summary_query_count(INVOICES_SUMMARY_URL)

        self.assertEqual(
            small,
            large,
            f'Invoice summary query count grew with row count (N+1): {small} -> {large}',
        )
        self.assertLessEqual(large, 10)
