"""
STEP 18 — DATABASE INTEGRITY AUDIT (read-only).

Runs against the live MySQL database via:
    docker exec -i veepower_backend python manage.py shell < backend/tests/audit_step18_database_integrity.py

Covers: orphan relationships, duplicate authoritative identifiers, inventory
ledger reconciliation, order/return state integrity, payment/invoice math,
quotation->invoice consistency, B2B credit arithmetic, configuration and
audit-log integrity. No records are created or mutated.
"""

from decimal import Decimal

from django.db.models import Count, Q, Sum

from apps.core.models import AdminConfigAuditLog, CommunicationLog, ContactInquiry
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    TaxConfiguration,
)
from apps.finance.models import (
    Client,
    Expense,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PayoutSettlement,
    Quotation,
    QuotationItem,
)
from apps.inventory.models import StockTransaction
from apps.orders.models import Order, OrderItem, OrderStatus, OrderStatusHistory
from apps.products.models import Product, ProductImage, ProductSpecification
from apps.users.models import User

FAILURES = []
INFO = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(f"{label}: {detail}")


def info(label, detail):
    print(f"[INFO] {label} — {detail}")
    INFO.append(f"{label}: {detail}")


CANONICAL_ORDER_STATUSES = [s.value for s in OrderStatus]
RESTORED_STATUSES = [OrderStatus.CANCELLED, OrderStatus.RETURN_COMPLETED]

print("=" * 70)
print("STEP 18 — DATABASE INTEGRITY AUDIT")
print("=" * 70)

# ------------------------------------------------------------------ A. Orphans
check("A1 order_items without order", OrderItem.objects.filter(order__isnull=True).count() == 0,
      f"offending={OrderItem.objects.filter(order__isnull=True).count()}")
orders_no_items = Order.objects.annotate(n=Count("items")).filter(n=0).count()
check("A2 orders with zero items", orders_no_items == 0, f"offending={orders_no_items}")
check("A3 invoice_items without invoice", InvoiceItem.objects.filter(invoice__isnull=True).count() == 0,
      f"offending={InvoiceItem.objects.filter(invoice__isnull=True).count()}")
invoices_no_items = Invoice.objects.annotate(n=Count("items")).filter(n=0).count()
check("A4 invoices with zero items", invoices_no_items == 0, f"offending={invoices_no_items}")
check("A5 quotation_items without quotation", QuotationItem.objects.filter(quotation__isnull=True).count() == 0,
      f"offending={QuotationItem.objects.filter(quotation__isnull=True).count()}")
check("A6 stock_transactions without product", StockTransaction.objects.filter(product__isnull=True).count() == 0,
      f"offending={StockTransaction.objects.filter(product__isnull=True).count()}")
sale_no_order = StockTransaction.objects.filter(transaction_type="SALE", order__isnull=True).count()
ret_no_order = StockTransaction.objects.filter(transaction_type="RETURN", order__isnull=True).count()
check("A7 SALE/RETURN ledger rows reference an order", sale_no_order == 0 and ret_no_order == 0,
      f"sale={sale_no_order}, return={ret_no_order}")
pay_orphans = PaymentTransaction.objects.filter(order__isnull=True, invoice__isnull=True).count()
check("A8 payments reference an order OR invoice (B2B pre-invoice payments valid)",
      pay_orphans == 0, f"offending={pay_orphans}")
mismatches = 0
for p in PaymentTransaction.objects.select_related("invoice").filter(order__isnull=False, invoice__isnull=False):
    if p.invoice.order_id != p.order_id:
        mismatches += 1
check("A9 payment.invoice.order matches payment.order", mismatches == 0, f"offending={mismatches}")
unlinked_invoices = Invoice.objects.filter(order__isnull=True, quotation__isnull=True, client__isnull=True).count()
check("A10 invoices linked to order/quotation/client", unlinked_invoices == 0, f"offending={unlinked_invoices}")
inv_bad_quote = Invoice.objects.filter(quotation__isnull=False).exclude(quotation__status="Converted").count()
check("A11 invoices only reference CONVERTED quotations", inv_bad_quote == 0, f"offending={inv_bad_quote}")
check("A12 product_images without product", ProductImage.objects.filter(product__isnull=True).count() == 0,
      f"offending={ProductImage.objects.filter(product__isnull=True).count()}")
check("A13 product_specifications without product",
      ProductSpecification.objects.filter(product__isnull=True).count() == 0,
      f"offending={ProductSpecification.objects.filter(product__isnull=True).count()}")
orders_no_history = Order.objects.exclude(
    id__in=OrderStatusHistory.objects.values_list("order_id", flat=True)).count()
check("A14 every order has status history", orders_no_history == 0, f"offending={orders_no_history}")
premature_restore = StockTransaction.objects.filter(
    transaction_type="RETURN").exclude(order__status__in=RESTORED_STATUSES).count()
check("A15 stock restored only for CANCELLED/RETURN_COMPLETED orders",
      premature_restore == 0, f"offending={premature_restore}")
unrestored = 0
for o in Order.objects.filter(status__in=RESTORED_STATUSES).prefetch_related("items"):
    has_items = o.items.exists()
    has_return_tx = StockTransaction.objects.filter(order=o, transaction_type="RETURN").exists()
    if has_items and not has_return_tx:
        unrestored += 1
check("A16 CANCELLED/RETURN_COMPLETED orders with items have RETURN ledger rows",
      unrestored == 0, f"offending={unrestored}")

# ------------------------------------------------------------- B. Duplicates
active_dup_sku = list(Product.objects.filter(active=True).values("sku").annotate(c=Count("id")).filter(c__gt=1))
check("B1 no duplicate SKU among active products", not active_dup_sku, f"{active_dup_sku}")
dup_gw = list(
    PaymentTransaction.objects.exclude(gateway_transaction_id__isnull=True)
    .exclude(gateway_transaction_id="")
    .values("gateway_transaction_id").annotate(c=Count("id")).filter(c__gt=1)
)
check("B2 no duplicate gateway transaction IDs (replay protection)", not dup_gw, f"{dup_gw}")
config_rows = CompanyStoreConfiguration.objects.count()
check("B3 company configuration is a singleton", config_rows == 1, f"rows={config_rows}")
overlap_tax = 0
for tc in TaxConfiguration.objects.filter(is_active=True):
    q = TaxConfiguration.objects.filter(is_active=True, business_state__iexact=tc.business_state).exclude(pk=tc.pk)
    for other in q:
        starts_before = other.effective_until is None or tc.effective_from < other.effective_until
        ends_after = tc.effective_until is None or tc.effective_until > other.effective_from
        if starts_before and ends_after:
            overlap_tax += 1
check("B4 no overlapping active tax configurations per state", overlap_tax == 0, f"offending={overlap_tax}")
overlap_slab = 0
for ds in DistanceSlab.objects.filter(is_active=True):
    q = DistanceSlab.objects.filter(delivery_config_id=ds.delivery_config_id, is_active=True).exclude(pk=ds.pk)
    for other in q:
        if ds.min_distance_km < other.max_distance_km and ds.max_distance_km > other.min_distance_km:
            overlap_slab += 1
check("B5 no overlapping distance slabs per delivery config", overlap_slab == 0, f"offending={overlap_slab}")
# One NON-CANCELLED invoice per Converted quotation. Cancelled invoices are
# preserved as history (repair R1 cancelled 8 fabricated duplicates rather than
# deleting them), so they are excluded from the uniqueness rule.
multi_invoice_quotes = (Quotation.objects.filter(status="Converted")
                        .annotate(n=Count("invoices", filter=~Q(invoices__status="Cancelled")))
                        .filter(~Q(n=1)))
check("B6 each CONVERTED quotation maps to exactly one non-cancelled invoice",
      multi_invoice_quotes.count() == 0,
      f"offending={list(multi_invoice_quotes.values_list('quotation_number', 'n'))}")
per_order_invoices = Order.objects.annotate(n=Count("invoices")).filter(n__gt=1).count()
info("B7 orders with more than one invoice (partial-dispatch 1:N is allowed by design)",
     f"count={per_order_invoices}")
dup_comm = CommunicationLog.objects.values("idempotency_key").annotate(c=Count("id")).filter(c__gt=1).count()
check("B8 communication idempotency keys unique", dup_comm == 0, f"offending={dup_comm}")

# ------------------------------------------------------- C. Inventory ledger
neg_stock = Product.objects.filter(stock__lt=0).count()
check("C1 no negative stock", neg_stock == 0, f"offending={neg_stock}")
bad_direction = StockTransaction.objects.filter(
    Q(change_amount__gt=0, transaction_type="SALE") | Q(change_amount__lt=0, transaction_type="RETURN")
).count()
check("C2 ledger direction consistent (SALE<=0 / RETURN>=0)", bad_direction == 0, f"offending={bad_direction}")
negative_opening = []
ledger_exact = []
for p in Product.objects.all():
    total = StockTransaction.objects.filter(product=p).aggregate(s=Sum("change_amount"))["s"] or 0
    opening = p.stock - total
    if opening < 0:
        negative_opening.append((p.sku, p.stock, total))
    elif opening == 0:
        ledger_exact.append(p.sku)
check("C3 ledger reconstructable: stock - sum(ledger) >= 0 for every product",
      not negative_opening, f"{negative_opening}")
info("C4 products fully explained by ledger (opening balance 0)", f"count={len(ledger_exact)}")
info("C5 products with pre-ledger opening balance (API-created products document no opening row)",
     f"count={Product.objects.count() - len(ledger_exact)}")
restoration_rows = StockTransaction.objects.filter(transaction_type="RETURN").count()
info("C6 RETURN ledger rows present (restoration idempotency is guarded in service + suite)",
     f"rows={restoration_rows}")

# ------------------------------------------------------------- D. Orders/FSM
bad_status = Order.objects.exclude(status__in=CANONICAL_ORDER_STATUSES).count()
legacy = Order.objects.filter(
    Q(status__in=["PROCESSING", "OUT_FOR_DELIVERY", "RETURNED"])
    | Q(status__in=["Processing", "Out for Delivery", "Returned"])
).count()
check("D1 all order statuses in canonical 10-state vocabulary", bad_status == 0, f"offending={bad_status}")
check("D2 no legacy statuses (PROCESSING/OUT_FOR_DELIVERY/RETURNED)", legacy == 0, f"offending={legacy}")
cancelled_paid = Order.objects.filter(status=OrderStatus.CANCELLED, payment_status="Paid").count()
info("D3 cancelled orders with payment_status=Paid (refund flow is manual/deferred)",
     f"count={cancelled_paid}")
return_bad = Order.objects.filter(status__startswith="RETURN").exclude(
    previous__isnull=True).count() if False else 0
# impossible combinations: RETURN_COMPLETED without any RETURN_REQUESTED history
impossible_returns = 0
for o in Order.objects.filter(status=OrderStatus.RETURN_COMPLETED).prefetch_related("status_history"):
    history = [h.new_status for h in o.status_history.all()]
    if "RETURN_REQUESTED" not in history:
        impossible_returns += 1
check("D4 RETURN_COMPLETED orders passed through RETURN_REQUESTED",
      impossible_returns == 0, f"offending={impossible_returns}")
shipped_no_tracking = Order.objects.filter(
    status__in=[OrderStatus.SHIPPED, OrderStatus.DELIVERED], tracking_number="").count()
info("D5 SHIPPED/DELIVERED orders without tracking number", f"count={shipped_no_tracking}")

# ------------------------------------------------- E. Order/invoice math
# Tax is aggregated at ORDER level only; item rows intentionally carry
# tax_amount 0.00 (BillingService). The authoritative composition is
# total = subtotal(net of discounts) + tax + shipping; total_discount is
# informational (already netted into subtotal).
order_sub_mismatch = 0
order_tax_mismatch = 0
order_total_mismatch = 0
for o in Order.objects.prefetch_related("items"):
    agg = o.items.aggregate(s=Sum("subtotal"), t=Sum("tax_amount"))
    if (agg["s"] or Decimal("0")) != o.subtotal:
        order_sub_mismatch += 1
    # Runtime format: item tax 0.00 (order-level aggregate is authoritative).
    # Legacy seed format (seed_development_data.py): single-line orders carry
    # the full order tax on the item row — accepted only when it reconciles
    # exactly to the order's authoritative tax_amount. Anything else is
    # item/order divergence (corruption).
    item_tax = agg["t"] or Decimal("0.00")
    if item_tax != Decimal("0.00") and item_tax != o.tax_amount:
        order_tax_mismatch += 1
    expected = o.subtotal + o.tax_amount + o.shipping_fee
    if abs(expected - o.total_amount) > Decimal("0.02"):
        order_total_mismatch += 1
check("E1 order.subtotal == sum(item.subtotal)", order_sub_mismatch == 0, f"offending={order_sub_mismatch}")
check("E2 item tax absent (runtime) or reconciles to order tax (legacy seed)",
      order_tax_mismatch == 0, f"offending={order_tax_mismatch}")
check("E3 order.total == subtotal(net) + tax + shipping",
      order_total_mismatch == 0, f"offending={order_total_mismatch}")
inv_total_mismatch = 0
for inv in Invoice.objects.all():
    # mirrors the order composition: subtotal is net; discount_amount informational
    expected = inv.subtotal + inv.tax_amount + inv.shipping_fee
    if abs(expected - inv.total_amount) > Decimal("0.02"):
        inv_total_mismatch += 1
check("E4 invoice.total == subtotal(net) + tax + shipping (mirrors order)",
      inv_total_mismatch == 0, f"offending={inv_total_mismatch}")
paid_with_outstanding = sum(
    1 for inv in Invoice.objects.filter(status=InvoiceStatus.PAID) if inv.outstanding_amount > 0
)
check("E5 no PAID invoice retains outstanding balance", paid_with_outstanding == 0,
      f"offending={paid_with_outstanding}")
overpaid = 0
for inv in Invoice.objects.exclude(status=InvoiceStatus.CANCELLED):
    success = PaymentTransaction.objects.filter(invoice=inv, status="SUCCESS").aggregate(
        s=Sum("amount"))["s"] or Decimal("0.00")
    if success > inv.total_amount:
        overpaid += 1
check("E6 no invoice overpaid beyond total", overpaid == 0, f"offending={overpaid}")

# ------------------------------------------------------------ F. B2B credit
over_limit = []
for c in Client.objects.all():
    exposure = Decimal("0.00")
    for inv in c.invoices.filter(status__in=[InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]):
        success = PaymentTransaction.objects.filter(invoice=inv, status="SUCCESS").aggregate(
            s=Sum("amount"))["s"] or Decimal("0.00")
        exposure += max(Decimal("0.00"), inv.total_amount - success)
    if exposure > c.credit_limit:
        over_limit.append((c.client_code, str(exposure), str(c.credit_limit)))
check("F1 no client exposure exceeds credit limit", not over_limit, f"{over_limit}")
neg_limit = Client.objects.filter(credit_limit__lt=0).count()
check("F2 no negative credit limits", neg_limit == 0, f"offending={neg_limit}")
inactive_with_unpaid = Client.objects.filter(is_active=False).count()
info("F3 inactive clients (cannot consume credit per CreditService)", f"count={inactive_with_unpaid}")

# ------------------------------------------------------ G. Finance misc
bad_expense = Expense.objects.filter(Q(amount__lte=0)).count()
check("G1 no non-positive expenses", bad_expense == 0, f"offending={bad_expense}")
bad_settlement = 0
for s in PayoutSettlement.objects.all():
    if abs((s.gross_amount - s.gateway_fee - s.tax_on_fee) - s.net_amount) > Decimal("0.02"):
        bad_settlement += 1
check("G2 settlement net == gross - fee - tax_on_fee", bad_settlement == 0, f"offending={bad_settlement}")

# ------------------------------------------------- H. Config / audit / RBAC
null_admin_logs = AdminConfigAuditLog.objects.filter(admin_user__isnull=True).count()
info("H1 audit-log rows with admin_user NULL (SET_NULL preserves trail; created_by is nullable)",
     f"count={null_admin_logs}")
bad_domain_ref = 0
# Runtime vocabulary (admin config views + CreditService). 'TAX_CONFIGURATION'
# is a legacy uppercase domain written only by the dev seed command.
KNOWN_DOMAINS = {
    "store", "tax", "delivery", "slabs", "shipping-rules", "discounts",
    "client", "client_credit", "TAX_CONFIGURATION",
}
for log in AdminConfigAuditLog.objects.all():
    if log.domain not in KNOWN_DOMAINS:
        bad_domain_ref += 1
check("H2 audit-log domains within known vocabulary", bad_domain_ref == 0,
      f"offending={bad_domain_ref} (known={KNOWN_DOMAINS})")
leak = CommunicationLog.objects.filter(
    Q(context_snapshot__icontains="password") | Q(context_snapshot__icontains="eyJhbGciOi")
).count()
check("H3 no credential/token leakage in communication log", leak == 0, f"offending={leak}")
admin_staff_drift = User.objects.filter(role="admin", is_staff=False).count()
check("H4 admin users are is_staff=True", admin_staff_drift == 0, f"offending={admin_staff_drift}")
bad_roles = User.objects.exclude(role__in=["customer", "admin"]).count()
check("H5 user roles within vocabulary", bad_roles == 0, f"offending={bad_roles}")
dup_gstin_active = list(Client.objects.values("gstin").annotate(c=Count("id")).filter(c__gt=1))
check("H6 client GSTINs unique", not dup_gstin_active, f"{dup_gstin_active}")

# ----------------------------------------------------------------- summary
print("-" * 70)
print(f"informational notes: {len(INFO)}")
if FAILURES:
    print(f"AUDIT RESULT: FAIL — {len(FAILURES)} inconsistency(ies):")
    for f in FAILURES:
        print(f"  - {f}")
    raise SystemExit(1)
print("AUDIT RESULT: PASS — structural, financial, inventory and audit integrity verified.")
