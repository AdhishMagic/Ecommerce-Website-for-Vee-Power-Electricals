# Vee Power Electricals — Performance Optimization Documentation (Step 17)

This document records the disciplined, evidence-backed production performance
pass over the existing Vee Power Electricals application. The phase **measured
first**, optimized only issues that the measurements actually demonstrated, and
verified every change with the existing regression suites.

- No UI or visual redesign
- No business-rule, API-contract or database-semantics changes
- No new dependencies
- No polling, timers or viewport JavaScript added
- CSS-driven responsive behavior preserved (Step 16 untouched)

---

## 1. Objective

1. Measure before modifying.
2. Identify actual bottlenecks.
3. Optimize only evidence-backed issues.
4. Preserve all existing functionality, UI/UX and responsive behaviour.
5. Verify every optimization with regression testing.
6. Document before/after evidence.

**Baseline commit:** `40cbd307820e95bb305f70835ae583e8f9efab5d`
**Final commit:** see the commit `feat: optimize application performance`

---

## 2. Tooling Added

| Artifact | Purpose |
|---|---|
| `backend/tests/profile_step17_endpoints.py` | Read-only endpoint profiler: median SQL query count + latency per endpoint against the live dev database |
| `frontend/tests/network-profile.mjs` | Real-browser network profiler: API requests and duplicate request signatures per route |
| `frontend/tests/e2e/performance-comprehensive.spec.ts` | 13 structural performance regression tests |
| `backend/tests/test_phase7_performance.py` (extended) | Query-count regression guards for the optimized endpoints |

Run the profilers:

```bash
docker exec -i veepower_backend python manage.py shell < backend/tests/profile_step17_endpoints.py
node frontend/tests/network-profile.mjs          # against the dev server (:5173)
```

---

## 3. Baseline Measurements

### 3.1 Frontend bundle (production build, before)

| Asset | Raw | Gzip |
|---|---:|---:|
| `index-*.js` (application entry) | 45.07 kB | 12.78 kB |
| `vendor-react-*.js` (react/react-dom/react-router) | 253.08 kB | 81.44 kB |
| `CartesianChart-*.js` (recharts library chunk) | 336.24 kB | 98.31 kB |
| `Home-*.js` | 37.21 kB | 7.53 kB |
| `Clients-*.js` | 30.05 kB | 6.05 kB |
| `Account-*.js` | 25.41 kB | 5.92 kB |
| `index-*.css` | 106.40 kB | 19.71 kB |
| **Total JS** | **1087.92 kB** | — |
| **Total CSS** | **103.91 kB** | — |

### 3.2 Backend endpoint profile (before, median of 5 runs)

| Endpoint | Queries | Time |
|---|---:|---:|
| `finance/clients/<id>/invoices/` | **36** | 142.4 ms |
| `finance/summary/` (dashboard) | **25** | 77.5 ms |
| `config/audit-logs/` | **500 error** | — |
| `finance/invoices/` (admin ledger) | 6 | 43.0 ms |
| `finance/clients/` (B2B list) | 6 | 30.3 ms |
| `finance/quotations/` | 5 | 30.2 ms |
| `catalog/products/` | 4 | 41.6 ms |
| `orders/` · `inventory/` · `expenses/` · `orders/my-orders/` | 3 | — |
| `catalog/categories/hero/` | 1 | 8.0 ms |

Metric used for comparison is **query count**, which is deterministic; wall-clock
latency on a shared developer machine is noisy and is reported for context only.

### 3.3 Runtime network profile (before, production build)

| Route | API requests | Notes |
|---|---:|---|
| `/` | 5 | includes a redundant unfiltered `catalog/products/` |
| `/shop` | 4 | `catalog/products/` requested **twice** |
| `/about` | 1 | the only request was an unnecessary product fetch |
| `/contact` | 1 | the only request was an unnecessary product fetch |
| `/account` | 3 | |
| `/cart` | 2 | |
| `/admin` | 4 | |
| `/admin/products` | 2 | |
| `/admin/finance/summary` | 4 | |
| `/admin/inventory` | 2 | |
| **Total** | **27** | **1 duplicate signature** |

---

## 4. Bottlenecks Identified

### 4.1 `GET /api/v1/finance/clients/<id>/invoices/` — 36 queries (N+1)

`ClientViewSet.client_invoices` built its queryset with
`select_related('order', 'quotation')` only. `InvoiceSerializer` additionally
needs `client.company_name` (one query per invoice) and calls the
`paid_amount` / `outstanding_amount` model properties, which each hit
`invoice.payments` when `payments` is not prefetched (one query per invoice).
Query count therefore grew linearly with invoice count.

### 4.2 `GET /api/v1/finance/summary/` — 25 queries

The authoritative outstanding-balance block iterated an unpaid-invoice queryset
for the total and then applied `.filter(client__isnull=False)` to the *same
queryset*, re-issuing the invoice scan and its `payments` prefetch.

### 4.3 `GET /api/v1/config/audit-logs/` — HTTP 500

`AdminConfigAuditLogSerializer` declared `read_only_fields = '__all__'`. DRF
requires a list/tuple and raised `TypeError: The read_only_fields option must be
a list or tuple` while building serializer fields, so the endpoint always
returned 500. (Correctness defect uncovered while profiling — not a performance
issue, but it blocked measurement and is a broken contract.)

### 4.4 A redundant catalog request on every route

`ShopProvider` was mounted at the application root and eagerly called
`productService.getProducts()` on mount. Its state is consumed **only** by
`/admin/products`, `/admin/inventory` and `/admin/products/add|edit/:id`.
Consequently every customer route — including content-only pages `/about` and
`/contact` — issued an unnecessary `GET /api/v1/catalog/products/`, and `/shop`
issued that same request twice (once from `ShopProvider`, once from the page).

### 4.5 Admin layout in the customer entry bundle

`AdminLayout` was statically imported by `App.tsx`, so the admin sidebar markup,
navigation model and the 15 `lucide-react` icons it imports were part of the
initial application chunk downloaded by every customer.

---

## 5. Optimizations Performed

All changes are minimal and behaviour-preserving.

| # | Change | File |
|---|---|---|
| 1 | `client_invoices`: added `select_related('client')` and `prefetch_related('payments')` so the client name and payment-derived balances resolve from cache | `backend/apps/finance/views.py` |
| 2 | `client_payments`: added `select_related('invoice__client')`, required by `customer_email` / `customer_name` | `backend/apps/finance/views.py` |
| 3 | Finance summary: materialise the unpaid-invoice list once and derive both the total and the B2B sub-total from it | `backend/apps/finance/views.py` |
| 4 | `AdminConfigAuditLogViewSet`: `select_related('admin_user')` for `admin_email` | `backend/apps/commercial_config/views.py` |
| 5 | `AdminConfigAuditLogSerializer`: `read_only_fields = fields` (fixes the 500) | `backend/apps/commercial_config/serializers.py` |
| 6 | `ShopProvider` scoped to the `/admin` subtree instead of the application root | `frontend/src/App.tsx` |
| 7 | `AdminLayout` lazy-loaded as a separate chunk | `frontend/src/App.tsx` |

---

## 6. Optimizations Deliberately NOT Performed

| Candidate | Decision & reason |
|---|---|
| **Removing / deferring the `CartesianChart` chunk** | Not needed. `recharts` is imported by exactly five **admin-only, already lazy-loaded** pages (`Dashboard`, `FinanceSummary`, `ProductsAnalytics`, `TrafficAnalytics`, `Transactions`). Because every page route is wrapped in `React.lazy`, the 336 kB chart chunk is **never requested on a customer route** — verified by the network profiler (no `recharts` request on `/` or `/shop`) and asserted by `PERF-splitting`. The chunk is large but its load is already correctly isolated; a dynamic `import()` inside the chart components would reduce the *admin* analytics chunk without changing customer initial load, so it was rejected as unearned complexity. |
| Preloading the chart chunk on analytics navigation | Its route is already lazy; adding a manual preload would guess at user intent. |
| Splitting `vendor-react` (253 kB) | It is `react` + `react-dom` + `react-router-dom`, all required on first paint. |
| Reducing the 12 monthly-trend aggregate queries in `finance/summary/` | An admin-only dashboard endpoint; folding them into grouped monthly aggregates changes query shape for a small, admin-side gain and carries a real risk of subtly altering reported figures. Deferred. |
| Adding database indexes | The schema already indexes every measured access path (`orders`: user+created_at, status+created_at, payment_status, created_at; `products`: category+brand+active, featured+active, price, created_at; `invoices`: client+status, invoice_date+status; `quotations`: client+status; `expenses`: expense_date+category; `payouts`: settlement_date+status; `payments`: gateway_transaction_id; `categories`: show_in_hero+is_active+hero_order). No profiled query showed an unbounded scan, and **no migration was created**. |
| Lazy-loading the Home category-carousel images | They live inside an animated marquee; `loading="lazy"` can defeat the animation by leaving off-screen track items blank. Product-grid images — the high-volume case — are already lazy. |
| Adding Redis / response caching | No read path showed a caching-worthy bottleneck, and the rule against caching inventory, payment, order, credit and authentication state is absolute. No caching layer was introduced. |
| Memoising components | No component produced a measured re-render cost; the profilers found no render-time bottleneck. Adding `useMemo`/`useCallback` would have been speculative. |

---

## 7. Before / After Metrics

### 7.1 Backend query counts

| Endpoint | Before | After |
|---|---:|---:|
| `finance/clients/<id>/invoices/` | 36 | **10** |
| `finance/summary/` | 25 | **23** |
| `config/audit-logs/` | 500 (crash) | **200 OK, 23** |
| `finance/invoices/` | 6 | 6 |
| `finance/clients/` | 6 | 6 |
| `finance/quotations/` | 5 | 5 |
| `catalog/products/` | 4 | 4 |
| all other profiled endpoints | 1–3 | unchanged |

The `finance/clients/<id>/invoices/` count is now **constant** in the number of
invoices; the regression test `test_client_invoices_query_count_is_constant_as_rows_grow`
doubles the invoice count and asserts the query count does not grow.

### 7.2 Frontend bundle

| Metric | Before | After |
|---|---:|---:|
| Application entry chunk | 45.07 kB (gzip 12.78) | **38.16 kB (gzip 11.01)** |
| `vendor-react` chunk | 253.08 kB | 253.08 kB |
| `CartesianChart` chunk (admin-only) | 336.24 kB | 336.24 kB |
| `AdminLayout` chunk (admin-only) | *(bundled into entry)* | **7.22 kB (gzip 2.19)** |
| Total JS across all chunks | 1087.92 kB | 1088.22 kB |
| Total CSS | 103.91 kB | 103.91 kB |

The entry chunk shrinks by 6.91 kB (gzip 1.77 kB); admin code is now fetched
only when an admin route is visited. Total JS is unchanged to within 0.3 kB —
this is isolation, not elimination.

### 7.3 Runtime network (production build)

| Route | Before | After |
|---|---:|---:|
| `/` | 5 | **4** |
| `/shop` | 4 | **3** |
| `/about` | 1 | **0** |
| `/contact` | 1 | **0** |
| `/account` | 3 | **2** |
| `/cart` | 2 | **1** |
| `/admin` | 4 | 4 |
| `/admin/products` | 2 | 2 |
| `/admin/finance/summary` | 4 | 4 |
| `/admin/inventory` | 2 | 2 |
| **Total** | **27** | **22** |
| **Duplicate request signatures** | **1** | **0** |

Admin routes are unchanged by design — the catalog fetch they need is still
performed once per admin session.

### 7.4 Not reliably measurable in the current test environment

- **Largest Contentful Paint / First Contentful Paint / long tasks.** The
  application is served by a Vite dev server inside Docker on a shared desktop;
  timings vary by an order of magnitude between runs, so no LCP/CLS/TBT figure
  is claimed. Bundle sizes, request counts and SQL query counts are used as the
  reproducible proxies.
- **Production HTTP caching / compression behaviour.** Not exercised here;
  see the production recommendations.

---

## 8. Frontend Bundle Analysis

- **Code splitting is already comprehensive.** Every page in `App.tsx` —
  customer, admin and auth — is wrapped in `React.lazy`, so each route emits its
  own chunk.
- **`CartesianChart` (336.24 kB / 98.31 kB gzip)** is the `recharts` library
  chunk. It is imported only by five admin pages, and the entry chunk's
  `__vite__mapDeps` manifest references it as a *dynamic* dependency. Profiling
  confirms zero `recharts` requests on `/`, `/shop`, `/about` and `/contact`.
  No action was required; this was the single most important finding to verify,
  and it verifies clean.
- **Admin-only leakage found and removed:** `AdminLayout` was statically
  imported, putting 7.22 kB of admin shell code (plus its icon imports) in the
  entry chunk. It is now a dynamic chunk.
- **No duplicate dependencies** were found: `react` is bundled once into
  `vendor-react`; no second copy of any library appears in the manifest.
- **No barrel-import problem** was found.

---

## 9. Route-Level Code Splitting

`App.tsx` already lazy-loaded all pages. The only split change made was moving
`AdminLayout` from a static import to `React.lazy(() => import(...))`.

Verified to remain intact after the change: direct URL navigation, browser
refresh on a lazy route, client-side SPA navigation, loading states (the
existing `VeeElectricalsLoader` `Suspense` fallback), error boundaries,
`ProtectedRoute` RBAC and the admin sidebar. `ShopProvider` now wraps the
`/admin` element, so it mounts once per admin session and never for customer
routes.

---

## 10. React Rendering Findings

No measured rendering bottleneck was found.

- No unstable object/array props or expensive per-render derivations were
  implicated by measurement.
- `ShopProvider`, `AuthProvider` and `CartProvider` context values were left
  unchanged; the one structural issue found was the *scope* of `ShopProvider`
  (a network problem, addressed above), not its render behaviour.
- No `memo`/`useMemo`/`useCallback` was added, because nothing demonstrated a
  re-render cost worth paying complexity for.
- Note: `useEffect`-driven fetches appear to run twice in the Vite **dev**
  server because of React `StrictMode`. This is development-only and does not
  occur in the production build — every "duplicate request" figure in this
  document was measured against a production build for that reason.

---

## 11. Network Findings

- **Unnecessary request on every route** — the global `ShopProvider` catalog
  fetch. Removed for customer routes (see §4.4/§5.6).
- **Genuine duplicate** — `/shop` fetched `catalog/products/` twice. Removed.
- **Sequential calls that should be parallel** — already parallel. `Home` uses
  `Promise.all([getProducts({featured}), getCategories(), getBrands()])` and
  `Shop` likewise; `Checkout` already parallelises `getAddresses()` and
  `getDeliveryConfig()`.
- **Admin-only requests on customer pages** — the `ShopProvider` fetch was the
  only one; now eliminated.
- **Oversized API responses** — list endpoints are paginated by DRF defaults;
  no unbounded list was observed.

---

## 12. Image / Static Asset Findings

- Product-grid images (`ProductCard`) — the high-volume, below-the-fold case —
  already use `loading="lazy"`, `decoding="async"` and explicit `width`/`height`.
- Hero-card images in `HeroSection` already use `loading="lazy"` +
  `decoding="async"`.
- The above-the-fold product-detail image is correctly eager.
- Google Fonts are loaded with `preconnect` + `dns-prefetch` hints and
  `display=swap`.
- **No changes were required or made.** The remaining non-lazy images (the Home
  category-carousel track and small admin thumbnails) were left as-is: the
  carousel images are duplicated from the same cached URL and sit inside an
  animated marquee where lazy loading risks blank track items.

---

## 13. Backend Query Findings

Measured before/after across 25 endpoints (§7.1). Beyond the four fixes:

- Product, order, inventory, payment, settlement, quotation, expense and
  category list endpoints were already correctly using
  `select_related`/`prefetch_related` and annotated counts. `orders/my-orders/`
  and the admin order list already annotate `items_count`, avoiding an N+1.
- `finance/clients/` already prefetches the unpaid-invoice/payment graph into
  `_unpaid_invoices_with_payments` and annotates `annotated_total_invoiced`, so
  the per-client credit serializers resolve from cache.
- Authorization checks were not touched. No permission or validation logic was
  relaxed anywhere.

## 14. Database Findings

Reviewed foreign keys, unique constraints, ordering, status and timestamp
fields, and the existing index set. Every profiled query is covered by an
existing index and none exhibited an unbounded scan at the current data volume.
**No index was added and no migration was generated**
(`makemigrations --check` reports "No changes detected").

## 15. Caching Decision

**No caching layer was introduced.**

- No read path demonstrated a caching-worthy bottleneck after the N+1 fixes.
- Inventory authority, payment state, order state, financial balances, credit
  exposure and authentication state must remain authoritative and are explicitly
  out of scope for caching.
- Introducing Redis for the remaining read-mostly endpoints would add
  operational surface and a consistency risk for no measured gain.

---

## 16. Performance Tests

`frontend/tests/e2e/performance-comprehensive.spec.ts` — **13 tests, all
passing.** Deliberately structural; no wall-clock thresholds:

1. homepage does not request the unfiltered catalog list
2. content-only pages (`/about`, `/contact`) issue no catalog product request
3. `/shop` requests exactly the three endpoints it needs
4. homepage and shop render their primary content
5. chart library and `AdminLayout` are absent from customer routes
6. analytics route loads the chart library and admin layout on demand
7. admin product management still loads the catalog (behaviour preserved)
8. SPA navigation across split routes works without a page reload
9. direct deep-link to a lazy admin route renders and survives refresh
10. product-grid images are lazily loaded and asynchronously decoded
11. dense admin list pages render fully and stay within the viewport
12. customer shell renders while catalog data is delayed
13. admin dashboard renders KPIs and trend chart

`backend/tests/test_phase7_performance.py` — extended with
`Step17PerformanceOptimizationTestCase` (**4 new tests**):

- `client_invoices` query count is bounded
- `client_invoices` query count is constant as rows grow (N+1 guard)
- `config/audit-logs/` endpoint is available (500 regression guard)
- `finance/summary/` is available and bounded

---

## 17. Regression Results

| Gate | Result |
|---|---|
| Backend full regression | **561 / 561 PASS** (557 baseline + 4 new) |
| Django `check` | PASS |
| `makemigrations --check` | PASS — no changes detected |
| Frontend TypeScript (`tsc --noEmit`) | PASS |
| Frontend production build | PASS |
| Frontend integration suite | **17 / 17 PASS** |
| Step 17 performance suite | **13 / 13 PASS** |
| Full Playwright suite | **171 / 171 PASS** (158 baseline + 13 new) |
| Step 16 responsive-comprehensive | PASS (62) |
| Horizontal overflow audit | PASS (172 checks) |
| Comprehensive audit | PASS (32) |
| DB integrity audit (Step 15 script) | PASS (20 checks) |
| Secret scan | PASS |
| Docker health | 3 / 3 healthy |

No existing test was modified, weakened or removed. The four additions to
`test_phase7_performance.py` only add coverage.

---

## 18. Known Limitations

- The performance figures were captured on the Dockerised development stack
  against a modest development dataset. They demonstrate *algorithmic*
  improvements (constant instead of linear query counts; removed redundant
  requests) rather than absolute production throughput.
- End-to-end paint timings (LCP/CLS/TBT) are not reliably measurable in this
  environment and are not claimed (§7.4).
- The `finance/summary/` monthly-trend loop still issues two aggregate queries
  per month (12 of the endpoint's 23 queries); this is bounded and admin-only.

### 18.1 Environmental findings (not Step 17 regressions)

Two test-data issues surfaced during the final regression run. Both were
reproduced against the unmodified baseline code before any Step 17 change and
are therefore environmental, not regressions of this phase:

- **Fixture products poisoned admin-session `/shop` ordering.** The
  `frontend/tests/comprehensive_audit.mjs` concurrency section creates live
  `Concurrency Test Switchgear` products and never cleans them up. Because
  `Product.Meta.ordering` is `['-created_at']` and `ProductViewSet` filters
  `active=True` only for non-admin users (pre-existing, authoritative
  behaviour that was deliberately not changed), admin sessions saw the newest
  inactive zero-stock fixture first on `/shop`, which broke add-to-cart flows
  that click the first product card. **Remediation:** all 25 accumulated
  fixture rows were deactivated and their `created_at` backdated to
  2026-09-24 (before every seeded product) so they sort last. Deletion was not
  possible: `StockTransaction.product` is `on_delete=PROTECT` and every fixture
  carries ledger rows, so records were preserved rather than destroyed.
  Re-running the comprehensive audit re-creates one fixture; it must be
  neutralised the same way before any admin-session Playwright run.
- **Test-data stock erosion.** Repeated end-to-end checkout runs had drained
  seeded product id 20 to 0 units. It was restored to 50 units via
  `InventoryService.restock_product` (a ledger-consistent RESTOCK entry) — no
  direct database write.
- **Sequential gate execution is mandatory.** The comprehensive audit mutates
  live database state (creates fixtures, drains stock via concurrent
  checkouts), so running it concurrently with the Playwright suite corrupts
  results. All final gates in this phase were executed strictly sequentially:
  audit → fixture cleanup → overflow audit → full Playwright suite.

These are recorded so future phases re-check fixture state before trusting a
failing admin-session add-to-cart flow.

## 19. Deferred Optimizations

1. Fold the finance-summary 6-month trend into grouped monthly aggregates
   (admin-only; requires verifying identical figures).
2. Dynamically import `recharts` inside the five chart pages, so the admin
   dashboard does not pull the whole chart library (does not affect customer
   initial load).
3. Serve the chart chunk with a route-level prefetch hint on hover of the
   analytics sidebar items.
4. Precompress static assets (Brotli/gzip) and set long-lived immutable cache
   headers at the edge (deployment concern, not application code).
5. Consider `fetchpriority="high"` on the above-the-fold product-detail image.

## 20. Production Recommendations

- Serve the built `dist/` through a CDN with `Cache-Control: immutable` on
  hashed assets; the entry chunk and `vendor-react` are content-hashed.
- Enable Brotli at the reverse proxy. The largest admin chunk (98 kB gzip) and
  the vendor chunk (81 kB gzip) benefit the most.
- Enable HTTP/2 or HTTP/3 so the parallel initial requests in `Promise.all`
  multiplex over one connection.
- Keep `DEBUG=False` and the existing strict CORS allowlist in production.
- Monitor database query counts per endpoint; the profiler in
  `backend/tests/profile_step17_endpoints.py` is a reusable baseline.

## 21. Guardrails Preserved

- Authenticated routes, RBAC and `ProtectedRoute` behaviour unchanged.
- Payment, inventory, finance and B2B credit authority untouched — no
  authorization or validation was weakened to reduce latency.
- API contracts unchanged, except that `GET /api/v1/config/audit-logs/` now
  returns `200` with its documented payload instead of `500`.
- Database semantics unchanged; no migration added.
- Responsive behaviour, accessibility and visual identity unchanged (Step 16
  suites re-run green).
- No polling, timers or viewport JavaScript added. The single pre-existing
  `AdminLayout` clock interval is unchanged.
