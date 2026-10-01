"""
STEP 17 — ENDPOINT PERFORMANCE PROFILER (read-only).

Run inside the backend container:

    docker exec -i veepower_backend python manage.py shell < backend/tests/profile_step17_endpoints.py

Issues authenticated GET requests through the real Django middleware stack
against the live development database and reports, per endpoint:

  * number of SQL queries executed
  * median wall-clock latency (ms) over repeated warm runs

No records are created, mutated or deleted.
"""

import statistics
import time
from decimal import Decimal

from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from rest_framework_simplejwt.tokens import AccessToken
from apps.users.models import User
from apps.finance.models import Client as B2BClient
from apps.products.models import Product

RUNS = 5

admin = User.objects.filter(is_staff=True).first() or User.objects.filter(role="admin").first()
customer = User.objects.filter(role="customer").first()

admin_token = str(AccessToken.for_user(admin)) if admin else None
customer_token = str(AccessToken.for_user(customer)) if customer else None

product = Product.objects.order_by("id").first()
b2b_client = B2BClient.objects.order_by("id").first()

client = Client()


def profile(label, path, token=None):
    headers = {}
    if token:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"

    payload = {}
    if path.endswith("/"):
        payload["HTTP_ACCEPT"] = "application/json"

    # Warm-up (fills any per-request caches / connection warm state)
    try:
        client.get(path, **headers, **payload)
    except Exception as exc:  # noqa: BLE001
        print(f"  [{label}] ERROR {exc}")
        return None

    query_counts = []
    timings = []
    status = None
    for _ in range(RUNS):
        with CaptureQueriesContext(connection) as ctx:
            t0 = time.perf_counter()
            resp = client.get(path, **headers, **payload)
            timings.append((time.perf_counter() - t0) * 1000.0)
        query_counts.append(len(ctx.captured_queries))
        status = resp.status_code

    med_q = int(statistics.median(query_counts))
    med_t = round(statistics.median(timings), 1)
    print(f"  {label:<52} status={status}  queries={med_q:<4} time={med_t:>7.1f} ms")
    return {"label": label, "path": path, "status": status, "queries": med_q, "ms": med_t}


results = []

print("=" * 92)
print("STEP 17 — ENDPOINT PERFORMANCE PROFILE (read-only, median of %d runs)" % RUNS)
print("=" * 92)
print(f"admin={admin.email if admin else None}  customer={customer.email if customer else None}")
print(f"sample product_id={product.id if product else None}  sample client_id={b2b_client.id if b2b_client else None}")
print("-" * 92)

print("\n[PUBLIC / CUSTOMER]")
results.append(profile("catalog/products/ (list page)", "/api/v1/catalog/products/"))
results.append(profile("catalog/products/?featured=true", "/api/v1/catalog/products/?featured=true"))
results.append(profile("catalog/products/?q=cable", "/api/v1/catalog/products/?q=cable"))
if product:
    results.append(profile("catalog/products/<id>/ (detail)", f"/api/v1/catalog/products/{product.id}/"))
results.append(profile("catalog/categories/", "/api/v1/catalog/categories/"))
results.append(profile("catalog/categories/?show_in_hero=true", "/api/v1/catalog/categories/?show_in_hero=true"))
results.append(profile("catalog/subcategories/", "/api/v1/catalog/subcategories/"))
results.append(profile("catalog/brands/", "/api/v1/catalog/brands/"))
if customer_token:
    results.append(profile("orders/my-orders/ (customer)", "/api/v1/orders/my-orders/", customer_token))

print("\n[ADMIN]")
if admin_token:
    results.append(profile("orders/ (admin list)", "/api/v1/orders/", admin_token))
    results.append(profile("inventory/ (overview)", "/api/v1/inventory/", admin_token))
    results.append(profile("inventory/transactions/", "/api/v1/inventory/transactions/", admin_token))
    results.append(profile("finance/clients/ (B2B list)", "/api/v1/finance/clients/", admin_token))
    results.append(profile("finance/quotations/", "/api/v1/finance/quotations/", admin_token))
    results.append(profile("finance/invoices/", "/api/v1/finance/invoices/", admin_token))
    results.append(profile("finance/payments/", "/api/v1/finance/payments/", admin_token))
    results.append(profile("finance/settlements/", "/api/v1/finance/settlements/", admin_token))
    results.append(profile("expenses/ (expenses list)", "/api/v1/expenses/", admin_token))
    results.append(profile("finance/summary/ (dashboard)", "/api/v1/finance/summary/", admin_token))
    results.append(profile("config/tax/", "/api/v1/config/tax/", admin_token))
    results.append(profile("config/delivery/", "/api/v1/config/delivery/", admin_token))
    results.append(profile("config/audit-logs/", "/api/v1/config/audit-logs/", admin_token))
    if b2b_client:
        results.append(profile("finance/clients/<id>/payments/", f"/api/v1/finance/clients/{b2b_client.id}/payments/", admin_token))
        results.append(profile("finance/clients/<id>/invoices/", f"/api/v1/finance/clients/{b2b_client.id}/invoices/", admin_token))
        results.append(profile("finance/clients/<id>/ (detail)", f"/api/v1/finance/clients/{b2b_client.id}/", admin_token))

print("\n" + "=" * 92)
print("TOP OFFENDERS (by query count)")
print("=" * 92)
for r in sorted([r for r in results if r], key=lambda x: -x["queries"])[:10]:
    print(f"  {r['queries']:>4} queries  {r['ms']:>7.1f} ms  {r['label']}")
