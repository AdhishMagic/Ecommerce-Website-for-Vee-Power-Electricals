# Frontend Integration Hardening & Architecture Guide

## Overview
This document specifies the authoritative integration architecture between the React + TypeScript frontend and the Django / Django REST Framework (DRF) backend for the **Vee Power Electricals Ecommerce Platform** (Step 14 Hardening).

---

## 1. Canonical API Client Architecture
The frontend utilizes a single canonical API client located at `src/api/client.ts`. Competing HTTP clients or ad-hoc `fetch` wrappers are strictly forbidden.

### Core Features:
- **Base URL Resolution:** Centrally driven by `VITE_API_URL` environment variable, defaulting to `http://localhost:8000/api/v1`.
- **Request Identification (`X-Request-ID`):** Generates a unique UUIDv4 per request (`crypto.randomUUID()`) forwarded to DRF logging and audit middleware.
- **Unified Authentication:** Automatically injects `Authorization: Bearer <access_token>` from `localStorage` (`auth_access_token` / `auth_token`) or `sessionStorage` (`vp_token`).
- **Timeout Management:** Enforces a default 30-second request timeout via native `AbortSignal.timeout()`, aborting stalled network requests with a canonical `TIMEOUT_ERROR`.
- **Response Handling:** Checks `response.ok`; decodes JSON payloads safely, normalizing Django REST Framework error shapes (`detail`, `message`, `error`, field-specific validation dictionaries).

---

## 2. Error Normalization & Status Code Mapping
All backend errors are transformed via `normalizeApiError()` into a typed `ApiError` structure:

| HTTP Status | Normalized Code | Description & Frontend Handling |
|---|---|---|
| `400` | `BAD_REQUEST` / `VALIDATION_ERROR` | Malformed inputs, field-level validation errors displayed on forms. |
| `401` | `UNAUTHORIZED` | Expired or invalid credentials; dispatches `auth:expired` event and redirects to login. |
| `403` | `FORBIDDEN` | RBAC failure; displays permission denied notifications. |
| `404` | `NOT_FOUND` | Resource does not exist; triggers empty/not-found screen states. |
| `409` | `CONFLICT` | Optimistic lock/state collision (e.g., concurrent stock depletion, duplicate payment). |
| `422` | `UNPROCESSABLE_ENTITY` | Semantic business rule violation. |
| `429` | `RATE_LIMITED` | Throttling limits hit; prompts user to pause before retrying. |
| `500` / `502` / `503` | `SERVER_ERROR` / `SERVICE_UNAVAILABLE` | Gateway/backend outage; shows retry prompts without breaking UI. |

---

## 3. Authentication & Session Integration
- **Token Management:** Access tokens are stored in secure browser storage. Tokens are never exposed in URL parameters or logged.
- **Session Expiration:** When any API request returns `401 Unauthorized`, the client triggers an `auth:expired` custom event.
- **Logout Flow:** Initiates via `authApi.logout()`, invalidating backend session/blacklist tokens, followed by local clearance of tokens, user profiles, and active cart sessions, redirecting cleanly to `/login`.
- **Protected Routing:** Guarded routes (`AdminRoute`, `CustomerRoute`, `AuthGuard`) inspect server-validated authentication state.

---

## 4. Role-Based Access Control (RBAC) Integration
Frontend navigation and button states reflect user roles (`customer`, `staff`, `admin`, `superadmin`, `finance`, `b2b`).
- **Defense in Depth:** Frontend role checks only enhance UX (hiding/disabling unauthorized administrative actions).
- **Backend Authority:** All critical actions (approving quotes, adjusting credit limits, updating order statuses, exporting financial ledgers) are enforced by backend DRF permission classes (`IsAdminUser`, `IsB2BClient`, `HasRole`).
- **Handling 403 Forbidden:** The frontend traps 403 responses gracefully, rendering explanatory messages instead of crashing or showing blank pages.

---

## 5. API Response Contracts & Type Fidelity
- Frontend models in `src/types/api/index.ts` strictly match backend Django serializers.
- **No Unsafe Fallbacks:** Dead mock catalogs and hardcoded arrays (`products.ts`) have been completely removed.
- **Nullability & Formatting:** Decimals (prices, taxes, discount rates) are passed as string/number unions and parsed consistently with `Intl.NumberFormat` in Indian Rupees (`INR`).
- **Paging Contracts:** Standardized DRF pagination payload (`count`, `next`, `previous`, `results`).

---

## 6. Loading, Success, Empty, and Error States
All API-driven screens adhere to strict multi-state UX:
1. **Loading:** Skeleton screens or dedicated spinners during pending asynchronous requests.
2. **Success with Data:** Rendered data tables, cards, and summaries.
3. **Success Empty:** Contextual empty states with clear calls to action (e.g., "Your Cart is Empty", "No Orders Found", "No Invoices Recorded").
4. **Error:** Contextual banner/card showing human-readable error messages with "Retry" triggers.

---

## 7. Catalog & Inventory Integration
- **Live Search & Filtering:** Category filters, search terms, and stock statuses query the backend dynamically.
- **Stock Depletion Handling:** Frontend never assumes stock availability. If a concurrent checkout depletes stock, backend raises 400/409, which the UI reports with stock discrepancy details.

---

## 8. Cart & Checkout Calculation Authority
- **Zero Frontend Calculation Authority:** Subtotals, GST breakdown, distance/slab delivery charges, and promotional coupon discounts are computed exclusively by backend calculation services.
- **Presentation Previews:** Any immediate client calculations are strictly treated as presentation previews and reconciled with the backend order quotation before payment.

---

## 9. Payment Integration & Webhook Reconciliation
- **Flow:**
  1. Order created with `PENDING` payment status.
  2. Frontend requests Razorpay order token from `/api/v1/payments/initiate/`.
  3. Razorpay modal processes customer transaction.
  4. Razorpay handler calls `/api/v1/payments/verify/` with signature.
- **Backend Authority:** Payment success is **never** declared on client callback alone; it requires verified HMAC signature validation on the backend.
- **Duplicate Prevention:** Submit buttons are disabled upon click (`isSubmitting = true`). Re-submitting existing transactions triggers conflict alerts.
- **Refund Policy:** Deferred manual gateway refund limitation is preserved per system architecture.

---

## 10. Orders & Returns State Lifecycle
- **Canonical States:** `PENDING` -> `CONFIRMED` -> `PACKED` -> `SHIPPED` -> `DELIVERED` -> `CANCELLED` -> `RETURN_REQUESTED` -> `RETURN_APPROVED` -> `RETURN_REJECTED` -> `RETURN_COMPLETED`.
- State transitions are strictly validated by backend state machines.

---

## 11. B2B & Credit Integration
- **Credit Limit & Exposure:** Available credit, credit limit, and current exposure are provided directly by `b2bApi.getClients()`.
- **Zero Local Exposure Calculations:** The frontend never computes `creditLimit - totalInvoices`; it renders authoritative `available_credit` from the server.
- **Frozen / Inactive Customers:** Blocked from checkout and quotation conversions via backend validation.

---

## 12. Finance & Ledger Integration
- **Authoritative Totals:** Revenue, expenses, P&L, and outstanding B2B balances are fetched from `financeApi.getFinanceSummary()`.
- **Date Filters:** Query parameters are formatted as ISO date strings and passed to backend aggregation endpoints.

---

## 13. Configuration Integration
- Store settings, tax slabs, distance shipping rules, and discounts are loaded from backend `/api/v1/config/`.
- Dynamic configuration changes take immediate effect without hardcoded frontend overrides.

---

## 14. Responsive & Accessibility Integration
- Responsive behavior verified across Mobile (375x667), Tablet (768x1024), and Desktop (1280x800).
- Tables collapse to card views or horizontal scroll containers on mobile viewports.
- Keyboard navigation (`Tab`, `Enter`, `Escape`), ARIA roles, and form labels are preserved.

---

## 15. Testing Strategy
- **Playwright Test Suite (`frontend/tests/integration-hardening.spec.ts`):** Minimum 35 end-to-end integration hardening tests covering:
  - API Client error mapping & timeouts
  - Auth login, logout, and token expiration
  - RBAC route protection
  - Catalog live search, sorting, and pagination
  - Cart, checkout, and backend-authoritative calculation reconciliation
  - Payment initiation and signature verification
  - Order state machine transitions & returns
  - B2B credit exposure and client management
  - Finance summary reporting
  - Form validation and duplicate submit prevention
  - Responsive layouts and accessibility compliance
- **Backend Regression Suite:** 488 passing unit and integration tests.
- **Frontend Typecheck & Build:** `tsc --noEmit` and Vite production build clean.

---

## 16. Known Limitations
1. **Deferred Automated Gateway Refunds:** Automated gateway refunds via Razorpay API remain deferred for manual financial review per administrative business requirements.
2. **Offline Mode:** The frontend requires an active internet connection; service worker offline caching is limited to static assets.
