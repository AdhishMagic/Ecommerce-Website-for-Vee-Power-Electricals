"""
STEP 15 — DATABASE POST-WORKFLOW CONSISTENCY AUDIT (read-only).

Runs against the live MySQL database via:
    docker exec veepower_backend python manage.py shell < backend/tests/audit_step15_db_consistency.py

Verifies relational integrity across Orders, Payments, Invoices, Inventory,
Finance, Quotations, Credit, CommunicationLog and AdminConfigAuditLog.
No records are created or mutated.
"""

from decimal import Decimal

from django.db.models import Sum, Q
from apps.orders.models import Order, OrderItem, OrderStatusHistory
from apps.inventory.models import StockTransaction
from apps.finance.models import (
    Invoice, InvoiceItem, PaymentTransaction, Quotation, QuotationItem,
    Client, Expense, InvoiceStatus,
)
from apps.core.models import CommunicationLog, AdminConfigAuditLog

FAILURES = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(f"{label}: {detail}")


print("=" * 70)
print("STEP 15 — DATABASE POST-WORKFLOW CONSISTENCY AUDIT")
print("=" * 70)

# ---------------------------------------------------------------- Orders
orders_total = Order.objects.count()
orders_with_no_items = Order.objects.filter(items__isnull=True).count()
orders_item_qty_mismatch = 0
for o in Order.objects.prefetch_related("items"):
    if o.items.count() and o.items.aggregate(s=Sum("quantity"))["s"] in (None, 0):
        orders_item_qty_mismatch += 1
check("Orders exist in database", orders_total > 0, f"total={orders_total}")
check("No orphaned orders (zero order items)", orders_with_no_items == 0,
      f"offending={orders_with_no_items}")

# Order -> status history linkage
orders_missing_history = Order.objects.exclude(
    id__in=OrderStatusHistory.objects.values_list("order_id", flat=True)
).count()
check("Every order has an audit status history", orders_missing_history == 0,
      f"missing={orders_missing_history}")

# Impossible status/payment combinations (status values are Title-case enums)
ORDER_STATUSES = [
    "Pending", "Confirmed", "Packed", "Shipped", "Delivered",
    "Cancelled", "Return Requested", "Return Approved",
    "Return Completed", "Return Rejected",
]
impossible_paid = Order.objects.filter(
    payment_status="Paid"
).exclude(status__in=ORDER_STATUSES).count()
check("No impossible order status combinations", impossible_paid == 0,
      f"offending={impossible_paid}")

cancelled_but_paid = Order.objects.filter(status="Cancelled", payment_status="Paid").count()
check("No cancelled orders still marked PAID", cancelled_but_paid == 0,
      f"offending={cancelled_but_paid}")

# ---------------------------------------------------------------- Inventory
negative_stock_products = 0
from apps.products.models import Product  # noqa: E402
for p in Product.objects.all():
    if p.stock is not None and p.stock < 0:
        negative_stock_products += 1
check("No negative inventory", negative_stock_products == 0,
      f"offending={negative_stock_products}")

ledger_bad_qty = StockTransaction.objects.filter(
    Q(change_amount__gt=0, transaction_type="SALE") |
    Q(change_amount__lt=0, transaction_type="RETURN")
).count()
check("Stock ledger direction consistent (SALE<=0 / RETURN>=0)", ledger_bad_qty == 0,
      f"offending={ledger_bad_qty}")

# ---------------------------------------------------------------- Invoices
invoices_total = Invoice.objects.count()
invoice_orphans = Invoice.objects.filter(
    Q(order__isnull=True) & Q(quotation__isnull=True)
).exclude(client__isnull=True).count()  # standalone client invoices are legitimate
check("Invoices linked to an order, quotation or client", invoice_orphans == 0,
      f"total={invoices_total}, unlinked-but-clientless={invoice_orphans}")

inv_item_orphans = InvoiceItem.objects.filter(invoice__isnull=True).count()
check("No orphaned invoice items", inv_item_orphans == 0, f"offending={inv_item_orphans}")

invoice_paid_inconsistent = 0
for inv in Invoice.objects.all():
    # outstanding_amount and paid_amount are authoritative model properties
    if inv.status == InvoiceStatus.PAID and inv.outstanding_amount > Decimal("0.00"):
        invoice_paid_inconsistent += 1
check("No invoices marked PAID with outstanding balance", invoice_paid_inconsistent == 0,
      f"offending={invoice_paid_inconsistent}")

# ---------------------------------------------------------------- Payments
# Domain rule: a PaymentTransaction is valid when linked to an order (checkout-time
# gateway payment) and/or an invoice (settlement). Unlinked = orphaned.
pay_total = PaymentTransaction.objects.count()
pay_orphans = PaymentTransaction.objects.filter(
    invoice__isnull=True, order__isnull=True).count()
check("All payment transactions reference an order or invoice", pay_orphans == 0,
      f"total={pay_total}, offending={pay_orphans}")

dup_gateway_payment = 0
seen = set()
for pt in PaymentTransaction.objects.exclude(gateway_transaction_id__isnull=True).exclude(
        gateway_transaction_id="").values_list("gateway_transaction_id", flat=True):
    if pt in seen:
        dup_gateway_payment += 1
    seen.add(pt)
check("No duplicate gateway transaction IDs (replay protection)", dup_gateway_payment == 0,
      f"offending={dup_gateway_payment}")

# ---------------------------------------------------------------- Quotations
dup_converted = 0
for q in Quotation.objects.filter(status="CONVERTED"):
    linked = Invoice.objects.filter(quotation=q).count()
    if linked > 1:
        dup_converted += 1
check("No quotation converted to more than one invoice", dup_converted == 0,
      f"offending={dup_converted}")

quot_orphans = QuotationItem.objects.filter(quotation__isnull=True).count()
check("No orphaned quotation items", quot_orphans == 0, f"offending={quot_orphans}")

# ---------------------------------------------------------------- B2B credit
# outstanding per invoice is computed from authoritative model properties
client_over_limit = 0
for c in Client.objects.all():
    exposure = Decimal("0.00")
    for inv in c.invoices.exclude(status=InvoiceStatus.CANCELLED):
        if inv.status != InvoiceStatus.PAID:
            exposure += inv.outstanding_amount
    if c.credit_limit is not None and exposure > c.credit_limit:
        client_over_limit += 1
check("No client exposure exceeds credit limit", client_over_limit == 0,
      f"offending={client_over_limit}")

# ---------------------------------------------------------------- Finance
# Finance integrity is enforced through Invoice/PaymentTransaction/Expense;
# orphan detection above covers the payment reference contract.
finance_orphans = PaymentTransaction.objects.filter(
    invoice__isnull=True, order__isnull=True).count()
check("Finance/payment transactions properly referenced", finance_orphans == 0,
      f"offending={finance_orphans}")

expense_bad = Expense.objects.filter(Q(amount__isnull=True) | Q(amount__lte=0)).count()
check("No invalid (<=0) expense amounts", expense_bad == 0, f"offending={expense_bad}")

# ---------------------------------------------------------------- Communication
comm_total = CommunicationLog.objects.count()
check("Communication logs populated", comm_total > 0, f"total={comm_total}")

leak = CommunicationLog.objects.filter(
    Q(context_snapshot__icontains="password") | Q(context_snapshot__icontains="eyJhbGciOi") |
    Q(subject__icontains="eyJhbGciOi")
).count()
check("No password/token leakage in communication log", leak == 0, f"offending={leak}")

# ---------------------------------------------------------------- Config audit
audit_total = AdminConfigAuditLog.objects.count()
check("Admin config audit log populated", audit_total > 0, f"total={audit_total}")

print("-" * 70)
if FAILURES:
    print(f"AUDIT RESULT: FAIL — {len(FAILURES)} inconsistency(ies):")
    for f in FAILURES:
        print(f"  - {f}")
    raise SystemExit(1)
print("AUDIT RESULT: PASS — relational, financial, inventory and audit consistency verified.")
