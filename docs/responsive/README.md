# Vee Power Electricals — Responsive Validation Documentation (Step 16)

This document records the dedicated responsive validation and hardening pass
performed across the entire frontend. The phase validated the existing design
across desktop, tablet, mobile and intermediate viewports — no redesign, no new
component libraries, no removed functionality.

- Comprehensive suite: `frontend/tests/e2e/responsive-comprehensive.spec.ts` (62 tests)
- Overflow audit: `frontend/tests/overflow-audit.mjs` (172 checks)
- Visual capture: `frontend/tests/visual-capture.mjs` (18 baselines)

---

## 1. Viewport Matrix

All sizes were exercised via the runtime overflow audit; representative sizes
additionally via interactive Playwright suites.

| Class       | Sizes                                                        |
|-------------|--------------------------------------------------------------|
| Desktop     | 1920×1080, 1440×900, 1280×800                                |
| Intermediate| 1366×768, 1200×800, 900×800                                  |
| Tablet      | 1024×1366, 820×1180, 768×1024                                |
| Mobile      | 430×932, 414×896, 390×844, 375×812                           |
| Zoom sim    | 640×900 (≈200% zoom on a 1280px display)                     |

## 2. Responsive Strategy

- **Fluid containers** — `.site-container` / `.hero-container` use
  `width: min(calc(100% - 2 * gutter), max-width)` with `clamp()` gutters
  (`--page-gutter: clamp(16px, 2.5vw, 48px)`), so spacing scales continuously.
- **Breakpoints** — Tailwind defaults. `lg` (1024px) is the primary switch:
  desktop header nav and admin sidebar are `lg:`-gated; below `lg` the header
  shows the hamburger drawer and admin uses the fixed overlay sidebar.
- **Grids** — product grids are `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`;
  cards never exceed viewport width on mobile.
- **CSS-first** — all responsive behavior is pure CSS media queries. The only
  JS viewport awareness is the header lavalamp indicator's single resize
  listener (cleaned up on unmount). No `setInterval` polling, no `matchMedia`
  logic, no layout thrashing was added.

## 3. Breakpoint Behavior

| Range          | Header                     | Shop grid | Admin                 |
|----------------|----------------------------|-----------|-----------------------|
| < 768px        | Hamburger drawer           | 2 cols    | Overlay sidebar       |
| 768–1023px     | Hamburger drawer           | 2 cols    | Overlay sidebar       |
| 1024–1279px    | Inline nav + search        | 3 cols    | Static sidebar (w-64) |
| ≥ 1280px       | Inline nav + search        | 3–4 cols  | Static sidebar        |

## 4. Table Strategy

Every data table (13 admin tables + product detail specs) uses **controlled
horizontal scrolling**: the table carries a `min-w-[...]` and is wrapped in an
`overflow-x-auto` container. The table container may scroll; the document
never does. This is asserted per-page in the comprehensive suite and globally
by the overflow audit. Financial and status columns are never hidden.

## 5. Mobile Navigation

- Customer header: hamburger (`lg:hidden`) toggles the `mobile-nav` drawer
  (`bg-[#0B3A63]`), with account/cart controls always visible.
- Admin: `Open sidebar` banner button slides the fixed `w-64` sidebar over a
  `bg-black/50` backdrop; `Close sidebar` / backdrop tap dismisses.
- Shop filters: below `lg`, the filter panel moves into a right-side drawer
  with an `Apply Filters (n)` action; the document never overflows.

## 6. Modal Behavior

- All modals are `fixed inset-0` overlays with a centered card using
  `w-full max-w-*` and `p-4` outer padding.
- Height containment: cards use `max-h-[90vh] overflow-y-auto` (four admin
  component modals and print modals). During this phase the **Expenses** and
  **Inventory** modals lacked `max-h` and could exceed short viewports; both
  were fixed to the same `max-h-[90vh] overflow-y-auto` pattern (regression
  tests added).
- Close buttons are always rendered; backdrop click closes drawer-type
  overlays; keyboard Escape/focus behavior is preserved by the native
  elements.

## 7. Accessibility Considerations

- Global `:focus-visible` outline (`2px solid #1769AA`, offset 2) — asserted.
- Login form is fully keyboard operable (Tab reaches fields/buttons) — asserted.
- 200%-zoom simulation (640px viewport) keeps the page overflow-free and the
  mobile menu reachable — asserted.
- Touch targets: quantity controls, nav toggles and action buttons meet
  ≥24px height / ≥40px width in mobile assertions.
- Tap flows validated with `hasTouch: true` (product → add-to-cart; admin
  sidebar open/close).

## 8. Overflow Policy

The reusable audit (`node tests/overflow-audit.mjs`) compares
`document.documentElement.scrollWidth` against `window.innerWidth` (+2px
tolerance) across 27 routes × 13 viewports (172 checks). **Intentional
exception:** table scroll containers may scroll internally; the document must
not. Any offender element classes are reported for diagnosis.

## 9. Tested Pages

Customer: `/` `/shop` `/product/:id` `/cart` `/checkout` `/account`
`/account/orders` `/order-success` `/login` `/register` `/about` `/contact`.

Admin: `/admin` `/admin/products` `/admin/products/add` `/admin/inventory`
`/admin/orders` `/admin/orders/transactions` `/admin/orders/shipping`
`/admin/analytics/products` `/admin/analytics/traffic`
`/admin/finance/summary` `/admin/finance/invoices`
`/admin/finance/quotations` `/admin/finance/clients`
`/admin/finance/expenses` `/admin/categories` `/admin/import`
`/admin/customers` `/admin/settings`.

## 10. Known Limitations

1. **`/admin/customers` and `/admin/settings` are placeholder routes**
   ("Coming soon") — validated for containment only, no interactive content.
2. **Admin tables scroll horizontally on phones** rather than transforming
   into cards — an intentional, documented trade-off (controlled scroll, no
   information hidden).
3. **Homepage marquee/animations** are GPU-accelerated CSS loops; under
   `prefers-reduced-motion` they are disabled by existing global CSS.
4. **Very long single words** (e.g. pathological URLs) rely on normal CSS
   wrapping; no `break-all` is forced, matching the established typography.

## 11. Test Commands

```bash
# Comprehensive responsive suite (62 tests)
npx playwright test tests/e2e/responsive-comprehensive.spec.ts

# Runtime overflow audit (172 checks across the matrix)
node tests/overflow-audit.mjs

# Visual regression baselines (18 captures)
node tests/visual-capture.mjs

# Original responsive spec + full Playwright regression
npx playwright test tests/e2e/responsive.spec.ts
npx playwright test
```
