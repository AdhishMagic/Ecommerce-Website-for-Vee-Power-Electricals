import datetime
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.finance.models import (
    Client,
    Expense,
    ExpenseCategory,
    Invoice,
    InvoiceStatus,
    PaymentGateway,
    PaymentTransaction,
    PaymentTxStatus,
)
from apps.finance.views import resolve_summary_date_range
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.users.models import UserRole

User = get_user_model()

SUMMARY_URL = '/api/v1/finance/summary/'
ADMIN_ORDERS_URL = '/api/v1/orders/'


class DashboardMetricsTestBase(TestCase):
    """Shared fixtures for authoritative Admin dashboard metric tests."""

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email='dashboard_admin@veepower.in',
            first_name='Dash',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.customer = User.objects.create_user(
            email='dashboard_customer@example.com',
            first_name='Dash',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.token_admin = str(AccessToken.for_user(self.admin))
        self.token_customer = str(AccessToken.for_user(self.customer))

        self.b2b_client = Client.objects.create(
            client_code='CLI-DASH-001',
            company_name='Dashboard Builders Pvt Ltd',
            contact_person='Ravi',
            gstin='33ABCDE1234F1Z5',
            email='accounts@dashboardbuilders.in',
            phone='+919876511111',
            credit_limit=Decimal('500000.00'),
        )

    def authenticate_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

    def create_order(self, status_value, number, created_at=None, total='1000.00'):
        order = Order.objects.create(
            order_number=number,
            user=self.customer,
            customer_name='Dashboard Buyer',
            customer_email='buyer@example.com',
            customer_phone='+919876522222',
            shipping_address={'city': 'Coimbatore'},
            subtotal=Decimal(total),
            taxable_amount=Decimal(total),
            tax_amount=Decimal('0.00'),
            total_amount=Decimal(total),
            status=status_value,
            payment_status=PaymentStatus.PENDING,
        )
        if created_at is not None:
            # created_at is auto_now_add; force the business timestamp for date filtering.
            Order.objects.filter(pk=order.pk).update(created_at=created_at)
            order.refresh_from_db()
        return order

    def create_invoice(self, number, invoice_date, total='1000.00', status_value=InvoiceStatus.UNPAID):
        return Invoice.objects.create(
            invoice_number=number,
            invoice_date=invoice_date,
            due_date=invoice_date + datetime.timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal(total),
            taxable_amount=Decimal(total),
            total_amount=Decimal(total),
            status=status_value,
        )

    def create_payment(self, amount, created_at, status_value=PaymentTxStatus.SUCCESS, invoice=None, order=None):
        # Domain rule chk_pay_reference: every transaction references an order OR an invoice.
        if invoice is None and order is None:
            order = self.create_order(OrderStatus.DELIVERED, f'ORD-DASH-PAY-{uuid.uuid4().hex[:8].upper()}')
        txn = PaymentTransaction.objects.create(
            invoice=invoice,
            order=order,
            gateway=PaymentGateway.MANUAL,
            payment_method='NEFT_RTGS',
            amount=Decimal(amount),
            status=status_value,
        )
        PaymentTransaction.objects.filter(pk=txn.pk).update(created_at=created_at)
        txn.refresh_from_db()
        return txn

    def get_summary(self, filter_type=None, **extra):
        params = {}
        if filter_type:
            params['filter_type'] = filter_type
        params.update(extra)
        return self.client.get(SUMMARY_URL, params)


class OrderMetricCountTests(DashboardMetricsTestBase):
    """Order/return KPIs must be complete-database aggregates (never page-derived)."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()

    def test_order_counts_are_complete_database_aggregates(self):
        for i in range(20):
            self.create_order(OrderStatus.PENDING, f'ORD-DASH-P-{i:03d}')
        for i in range(7):
            self.create_order(OrderStatus.CONFIRMED, f'ORD-DASH-C-{i:03d}')
        for i in range(3):
            self.create_order(OrderStatus.PACKED, f'ORD-DASH-K-{i:03d}')
        for i in range(2):
            self.create_order(OrderStatus.SHIPPED, f'ORD-DASH-S-{i:03d}')
        for i in range(4):
            self.create_order(OrderStatus.DELIVERED, f'ORD-DASH-D-{i:03d}')
        self.create_order(OrderStatus.CANCELLED, 'ORD-DASH-X-001')
        self.create_order(OrderStatus.RETURN_REQUESTED, 'ORD-DASH-R-001')
        self.create_order(OrderStatus.RETURN_APPROVED, 'ORD-DASH-R-002')
        self.create_order(OrderStatus.RETURN_COMPLETED, 'ORD-DASH-R-003')
        self.create_order(OrderStatus.RETURN_REJECTED, 'ORD-DASH-R-004')

        res = self.get_summary('all_time')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['total_orders_count'], 41)
        self.assertEqual(data['order_metrics']['total_orders_count'], 41)
        # Open Orders = PENDING + CONFIRMED + PACKED (business definition)
        self.assertEqual(data['open_orders_count'], 30)
        self.assertEqual(data['confirmed_orders_count'], 7)
        # Out for delivery follows the canonical SHIPPED FSM state
        self.assertEqual(data['out_for_delivery_count'], 2)
        self.assertEqual(data['order_metrics']['shipped_orders_count'], 2)
        # Returns exclude rejected returns
        self.assertEqual(data['returns_count'], 3)
        self.assertEqual(data['order_metrics']['returns_by_status']['RETURN_REJECTED'], 1)
        self.assertEqual(data['order_metrics']['pending_orders_count'], 20)
        self.assertEqual(data['order_metrics']['delivered_orders_count'], 4)

    def test_pagination_does_not_affect_dashboard_totals(self):
        """
        REGRESSION GUARD: the dashboard used to derive KPI counts from the first
        page of orders (page_size=10). With 15 orders, the paginated page reports 10
        while the summary must report the complete database counts.
        """
        for i in range(11):
            self.create_order(OrderStatus.PENDING, f'ORD-PAGE-P-{i:03d}')
        for i in range(4):
            self.create_order(OrderStatus.CONFIRMED, f'ORD-PAGE-C-{i:03d}')

        orders_res = self.client.get(ADMIN_ORDERS_URL, {'page_size': 10})
        self.assertEqual(orders_res.status_code, status.HTTP_200_OK)
        self.assertEqual(orders_res.data['count'], 15)
        self.assertEqual(len(orders_res.data['results']), 10)

        summary_res = self.get_summary('all_time')
        self.assertEqual(summary_res.data['total_orders_count'], 15)
        self.assertEqual(summary_res.data['open_orders_count'], 15)
        self.assertEqual(summary_res.data['confirmed_orders_count'], 4)

        # The authoritative total is exactly the pagination metadata, not len(results).
        self.assertEqual(summary_res.data['total_orders_count'], orders_res.data['count'])
        self.assertNotEqual(summary_res.data['total_orders_count'], len(orders_res.data['results']))

    def test_order_metrics_query_count_is_constant(self):
        """Order metrics must come from a single aggregate query, not per-order queries."""
        self.authenticate_admin()
        for i in range(5):
            self.create_order(OrderStatus.PENDING, f'ORD-Q-FEW-{i:03d}')
        with CaptureQueriesContext(connection) as few_queries:
            self.get_summary('all_time')

        for i in range(60):
            self.create_order(OrderStatus.PENDING, f'ORD-Q-MANY-{i:03d}')
        with CaptureQueriesContext(connection) as many_queries:
            self.get_summary('all_time')

        self.assertEqual(
            len(few_queries.captured_queries),
            len(many_queries.captured_queries),
            'Dashboard summary query count must not grow with the number of orders.',
        )


class FinancialMetricTests(DashboardMetricsTestBase):
    """Sales / invoiced / outstanding metrics stay authoritative and filter-scoped."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()
        self.today = timezone.localdate()

    def test_total_sales_only_counts_successful_payments(self):
        invoice = self.create_invoice('INV-DASH-SALES', self.today)
        now = timezone.now()
        self.create_payment('1000.00', now, PaymentTxStatus.SUCCESS, invoice=invoice)
        self.create_payment('500.00', now, PaymentTxStatus.FAILED, invoice=invoice)
        self.create_payment('250.00', now, PaymentTxStatus.INITIATED, invoice=invoice)
        self.create_payment('150.00', now, PaymentTxStatus.REFUNDED, invoice=invoice)

        res = self.get_summary('today')
        self.assertEqual(Decimal(res.data['total_sales']), Decimal('1000.00'))
        self.assertEqual(Decimal(res.data['kpis']['total_paid']), Decimal('1000.00'))

    def test_total_invoiced_excludes_cancelled_invoices(self):
        self.create_invoice('INV-DASH-ACTIVE', self.today, total='11800.00')
        self.create_invoice('INV-DASH-CANCELLED', self.today, total='424800.00', status_value=InvoiceStatus.CANCELLED)

        res = self.get_summary('current_month')
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('11800.00'))

    def test_total_outstanding_and_b2b_outstanding_use_full_ledger(self):
        self.create_invoice('INV-DASH-OUT-1', self.today, total='100000.00')
        self.create_invoice('INV-DASH-OUT-2', self.today, total='15050.00')
        # Fully settled invoice carries zero outstanding balance.
        paid_invoice = self.create_invoice('INV-DASH-OUT-3', self.today, total='500.00')
        self.create_payment('500.00', timezone.now(), PaymentTxStatus.SUCCESS, invoice=paid_invoice)

        res = self.get_summary('today')
        self.assertEqual(Decimal(res.data['total_outstanding']), Decimal('115050.00'))
        self.assertEqual(Decimal(res.data['b2b_outstanding']), Decimal('115050.00'))
        # Outstanding is a full-ledger balance snapshot: filter independent.
        for filter_type in ('current_month', 'previous_month', '30_days', 'all_time'):
            other = self.get_summary(filter_type)
            self.assertEqual(Decimal(other.data['total_outstanding']), Decimal('115050.00'))
            self.assertEqual(Decimal(other.data['b2b_outstanding']), Decimal('115050.00'))

    def test_outstanding_is_computed_for_retail_invoices(self):
        """Invoices without a B2B client contribute to total but not B2B outstanding."""
        Invoice.objects.create(
            invoice_number='INV-DASH-RETAIL',
            invoice_date=self.today,
            due_date=self.today + datetime.timedelta(days=15),
            client=None,
            subtotal=Decimal('200.00'),
            taxable_amount=Decimal('200.00'),
            total_amount=Decimal('200.00'),
            status=InvoiceStatus.OVERDUE,
        )
        res = self.get_summary('all_time')
        self.assertEqual(Decimal(res.data['total_outstanding']), Decimal('200.00'))
        self.assertEqual(Decimal(res.data['b2b_outstanding']), Decimal('0.00'))


class DashboardFilterSemanticsTests(DashboardMetricsTestBase):
    """Every filter must map to a precise, backend-owned date window."""

    def setUp(self):
        super().setUp()
        self.authenticate_admin()
        self.today = timezone.localdate()

    def _day_dt(self, day):
        tz = timezone.get_current_timezone()
        return datetime.datetime.combine(day, datetime.time(hour=12)).replace(tzinfo=tz)

    def test_30_days_is_a_rolling_window_not_the_current_month(self):
        # Placed 20 days ago: inside the rolling 30-day window, outside the current month.
        in_window = self.today - datetime.timedelta(days=20)
        # Placed 40 days ago: outside the rolling 30-day window.
        out_of_window = self.today - datetime.timedelta(days=40)

        self.create_invoice('INV-DASH-30D-IN', in_window, total='1000.00')
        self.create_invoice('INV-DASH-30D-OUT', out_of_window, total='7000.00')

        res = self.get_summary('30_days')
        self.assertEqual(res.data['date_range']['filter_type'], '30_days')
        self.assertEqual(res.data['date_range']['start_date'], (self.today - datetime.timedelta(days=30)).isoformat())
        self.assertEqual(res.data['date_range']['end_date'], self.today.isoformat())
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('1000.00'))

    def test_30_days_includes_payments_made_in_the_previous_calendar_month(self):
        """A settled payment from last month must be inside the rolling 30-day total."""
        window_start = self.today - datetime.timedelta(days=30)
        payment_day = max(window_start, self.today - datetime.timedelta(days=10))
        self.create_payment('9201.64', self._day_dt(payment_day), PaymentTxStatus.SUCCESS, invoice=None)

        res = self.get_summary('30_days')
        self.assertEqual(Decimal(res.data['total_sales']), Decimal('9201.64'))

        # The same payment is outside a today-only window, proving the range matters.
        today_res = self.get_summary('today')
        if payment_day != self.today:
            self.assertEqual(Decimal(today_res.data['total_sales']), Decimal('0.00'))

    def test_today_filter_excludes_other_days(self):
        self.create_invoice('INV-DASH-TODAY', self.today, total='500.00')
        self.create_invoice('INV-DASH-YESTERDAY', self.today - datetime.timedelta(days=1), total='900.00')

        res = self.get_summary('today')
        self.assertEqual(res.data['date_range']['start_date'], self.today.isoformat())
        self.assertEqual(res.data['date_range']['end_date'], self.today.isoformat())
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('500.00'))

    def test_current_month_starts_on_first_of_month(self):
        first_of_month = self.today.replace(day=1)
        self.create_invoice('INV-DASH-CM-IN', first_of_month, total='800.00')
        self.create_invoice('INV-DASH-CM-OUT', first_of_month - datetime.timedelta(days=1), total='900.00')

        res = self.get_summary('current_month')
        self.assertEqual(res.data['date_range']['start_date'], first_of_month.isoformat())
        self.assertEqual(res.data['date_range']['end_date'], self.today.isoformat())
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('800.00'))

    def test_previous_month_covers_the_complete_previous_calendar_month(self):
        first_this_month = self.today.replace(day=1)
        prev_month_end = first_this_month - datetime.timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)

        self.create_invoice('INV-DASH-PM-IN', prev_month_start, total='2500.00')
        self.create_invoice('INV-DASH-PM-END', prev_month_end, total='500.00')
        self.create_invoice('INV-DASH-PM-OUT', first_this_month, total='9000.00')

        res = self.get_summary('previous_month')
        self.assertEqual(res.data['date_range']['start_date'], prev_month_start.isoformat())
        self.assertEqual(res.data['date_range']['end_date'], prev_month_end.isoformat())
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('3000.00'))

    def test_all_time_has_no_date_restriction(self):
        self.create_invoice('INV-DASH-AT-OLD', self.today - datetime.timedelta(days=400), total='1200.00')
        self.create_invoice('INV-DASH-AT-NEW', self.today, total='800.00')

        res = self.get_summary('all_time')
        self.assertIsNone(res.data['date_range']['start_date'])
        self.assertIsNone(res.data['date_range']['end_date'])
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('2000.00'))

        # All-time must never be silently downgraded to the current month.
        current_month = self.get_summary('current_month')
        self.assertLess(Decimal(current_month.data['total_invoiced']), Decimal('2000.00'))

    def test_all_time_includes_all_payments(self):
        self.create_payment('300.00', self._day_dt(self.today - datetime.timedelta(days=400)), PaymentTxStatus.SUCCESS)
        self.create_payment('200.00', self._day_dt(self.today), PaymentTxStatus.SUCCESS)

        res = self.get_summary('all_time')
        self.assertEqual(Decimal(res.data['total_sales']), Decimal('500.00'))
        # Invoiced is a separate authoritative ledger: no invoices exist in this test.
        self.assertEqual(Decimal(res.data['total_invoiced']), Decimal('0.00'))

    def test_every_supported_filter_returns_consistent_scope_labels(self):
        for filter_type in ('today', 'current_month', 'previous_month', '30_days', 'all_time'):
            res = self.get_summary(filter_type)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['date_range']['filter_type'], filter_type)

    def test_unsupported_filter_is_rejected_instead_of_silently_defaulting(self):
        res = self.get_summary('last_quarter')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Unsupported filter_type', res.data['detail'])

    def test_date_range_resolver_is_single_source_of_truth(self):
        today = datetime.date(2026, 10, 5)
        self.assertEqual(resolve_summary_date_range('today', today=today), (today, today))
        self.assertEqual(
            resolve_summary_date_range('current_month', today=today),
            (datetime.date(2026, 10, 1), today),
        )
        self.assertEqual(
            resolve_summary_date_range('previous_month', today=today),
            (datetime.date(2026, 9, 1), datetime.date(2026, 9, 30)),
        )
        self.assertEqual(
            resolve_summary_date_range('30_days', today=today),
            (datetime.date(2026, 9, 5), today),
        )
        self.assertEqual(resolve_summary_date_range('all_time', today=today), (None, None))
        with self.assertRaises(ValueError):
            resolve_summary_date_range('bogus', today=today)


class ExpenseFilterTests(DashboardMetricsTestBase):
    def setUp(self):
        super().setUp()
        self.authenticate_admin()
        self.today = timezone.localdate()

    def test_expenses_respect_filter_window(self):
        Expense.objects.create(
            expense_date=self.today,
            category=ExpenseCategory.LOGISTICS,
            description='Courier charges',
            vendor='BlueDart',
            amount=Decimal('500.00'),
            status='Paid',
        )
        Expense.objects.create(
            expense_date=self.today - datetime.timedelta(days=120),
            category=ExpenseCategory.MARKETING,
            description='Ad spend last quarter',
            vendor='Google Ads',
            amount=Decimal('3000.00'),
            status='Paid',
        )

        current_month = self.get_summary('current_month')
        self.assertEqual(Decimal(current_month.data['kpis']['total_expenses']), Decimal('500.00'))

        all_time = self.get_summary('all_time')
        self.assertEqual(Decimal(all_time.data['kpis']['total_expenses']), Decimal('3500.00'))


class DashboardPermissionsTests(DashboardMetricsTestBase):
    def test_anonymous_access_is_rejected(self):
        res = self.client.get(SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_access_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')
        res = self.client.get(SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_access_is_allowed(self):
        self.authenticate_admin()
        res = self.client.get(SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_dashboard_alias_endpoint_shares_the_same_authoritative_metrics(self):
        self.authenticate_admin()
        for i in range(12):
            self.create_order(OrderStatus.PENDING, f'ORD-ALIAS-{i:03d}')

        summary = self.client.get(SUMMARY_URL, {'filter_type': 'all_time'})
        alias = self.client.get('/api/v1/finance/dashboard/', {'filter_type': 'all_time'})

        self.assertEqual(alias.status_code, status.HTTP_200_OK)
        self.assertEqual(alias.data['total_orders_count'], summary.data['total_orders_count'])
        self.assertEqual(alias.data['open_orders_count'], summary.data['open_orders_count'])
        self.assertEqual(alias.data['total_invoiced'], summary.data['total_invoiced'])
        self.assertEqual(alias.data['total_outstanding'], summary.data['total_outstanding'])
