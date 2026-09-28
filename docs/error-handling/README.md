# Error Handling Architecture & Specification

## 1. Overview

The **Error Handling Domain** unifies diagnostic tracking, resilience, and API error formatting across the Vee Power Electricals platform. It guarantees that all API error responses conform to a strict, standardized contract while safeguarding server internals, databases, credentials, and sensitive customer data against information leakage.

---

## 2. Canonical Error Response Contract

All non-2xx responses produced by the Django/DRF backend adhere to the canonical payload structure:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_ERROR_CODE",
    "message": "Safe human-readable message",
    "details": {},
    "request_id": "req_0192837465abcde"
  },
  "detail": "Safe human-readable message",
  "errors": {}
}
```

### Contract Rules & Invariants:
1. **`success`**: Strictly boolean `false` on any non-2xx response.
2. **`error.code`**: Stable, uppercase, machine-readable string identifier (e.g., `VALIDATION_ERROR`, `NOT_AUTHENTICATED`, `INSUFFICIENT_STOCK`).
3. **`error.message`**: Sanitized human-readable message safe for presentation to end users.
4. **`error.details`**: Field-level validation dictionary or structured contextual details.
5. **`error.request_id`**: End-to-end request correlation ID matching the `X-Request-ID` HTTP header and server logs.
6. **Backward Compatibility**: `detail` and `errors` (plus direct field error keys when present) are preserved at the top level to guarantee zero disruption to legacy tests and API clients.
7. **Zero Leakage**: Stack traces, SQL statements, filesystem paths (`/app/...`, `C:\...`), passwords, tokens, and database credentials are NEVER returned in API responses.

---

## 3. HTTP Status Codes & Error Codes Mapping

| HTTP Status | Category | Canonical Error Code (`error.code`) | Typical Scenarios |
|---|---|---|---|
| **400 Bad Request** | Validation / Input | `VALIDATION_ERROR` | Missing or invalid serializer fields, malformed JSON |
| **400 Bad Request** | Inventory | `INSUFFICIENT_STOCK` | Requested quantity exceeds available physical inventory |
| **400 Bad Request** | B2B Finance | `INSUFFICIENT_CREDIT` | Order exceeds client approved credit limit or overdue grace period |
| **400 Bad Request** | Payment | `PAYMENT_AMOUNT_MISMATCH` | Submitted payment amount does not equal authoritative order total |
| **400 Bad Request** | Discounts | `INVALID_COUPON` / `COUPON_EXPIRED` | Non-existent, inactive, or expired coupon code |
| **400 Bad Request** | Delivery | `DELIVERY_UNAVAILABLE` | Delivery not supported for specified destination state |
| **400 Bad Request** | Logistics / Orders | `RETURN_NOT_ALLOWED` | Order return requested outside allowable window or for non-delivered order |
| **401 Unauthorized** | Authentication | `NOT_AUTHENTICATED` | Missing `Authorization` Bearer token on protected endpoints |
| **401 Unauthorized** | Authentication | `AUTHENTICATION_FAILED` | Forged, expired, or invalid JWT access token |
| **403 Forbidden** | Authorization | `PERMISSION_DENIED` | Authenticated retail customer accessing staff/admin routes |
| **404 Not Found** | Resource | `RESOURCE_NOT_FOUND` | Missing product, order, invoice, or category ID |
| **409 Conflict** | FSM Transition | `INVALID_ORDER_TRANSITION` | Attempting forbidden status transition (e.g. DELIVERED → PENDING) |
| **409 Conflict** | Database / Idempotency | `RESOURCE_CONFLICT` | Unique constraint violation, duplicate resource, concurrent update conflict |
| **409 Conflict** | Payments / Invoices | `PAYMENT_ALREADY_PROCESSED` | Attempting to pay or credit an already settled order/invoice |
| **409 Conflict** | Configuration | `CONFIGURATION_CONFLICT` | Attempting to register overlapping active tax dates or duplicate active store profile |
| **422 Unprocessable** | Semantics | `UNPROCESSABLE_ENTITY` | Semantically invalid business payload |
| **429 Too Many Req** | Throttling | `TOO_MANY_REQUESTS` | API rate limit exceeded |
| **500 Internal Error** | Unhandled | `INTERNAL_SERVER_ERROR` | Unexpected runtime error (stack trace logged server-side, sanitized generic message returned) |
| **503 Unavailable** | Dependency | `SERVICE_UNAVAILABLE` | External dependency or gateway temporarily unreachable |

---

## 4. Request Correlation & Tracing Architecture

### Request ID Lifecycle:
1. **Header Ingestion**: Incoming requests are inspected for `X-Request-ID` by `apps.common.middleware.RequestIdMiddleware`.
2. **Sanitization**: Safe alphanumeric/hyphen IDs (8–64 characters) are accepted. Malformed, suspicious, or missing IDs are replaced with a secure random UUID (`req_<hex16>`).
3. **Thread-Local Storage**: The request ID is stored in thread-local storage (`apps.common.middleware.set_current_request_id`) making it available to loggers, service layers, and exception handlers.
4. **Response Header**: All HTTP responses echo the request ID in the `X-Request-ID` header.
5. **Error Envelope**: All error payloads embed `error.request_id` for user support and incident correlation.
6. **Structured Logging**: `apps.common.middleware.RequestIdFilter` injects `[req:<id>]` into standard Django logging records.

---

## 5. Backend Exception Handling Architecture

- **Global Exception Handler**: `apps.common.exceptions.custom_exception_handler` intercepts all DRF and unhandled Django exceptions.
- **Database Resilience**: `IntegrityError` is intercepted, logged with request ID, and converted into HTTP 409 `RESOURCE_CONFLICT` without disclosing table or constraint names.
- **Uncaught Failures**: Any unhandled `Exception` is logged server-side with full traceback, and converted into HTTP 500 `INTERNAL_SERVER_ERROR` with a safe human-readable message.
- **Message Sanitizer**: `sanitize_error_string()` strips SQL keywords (`SELECT`, `INSERT`, `WHERE`), traceback snippets, and internal filesystem paths from user-visible strings.

---

## 6. Frontend Normalization & Error Boundary

### API Client Normalization (`frontend/src/api/client.ts`):
- `ApiError`: Extended with `code`, `requestId`, `fieldErrors`, and `data`.
- Network Failures: Fetch network and offline errors are intercepted and wrapped into `ApiError(0, { detail: 'Network connection failed...' })`.
- `normalizeApiError()`: Utility function returning uniform `{ message, code, status, fieldErrors, requestId }` across all UI views and forms.

### React Error Boundary (`frontend/src/components/common/ErrorBoundary.tsx`):
- Wraps the entire application tree in `frontend/src/App.tsx`.
- Prevents white-screen crashes from unexpected React rendering errors.
- Displays a branded fallback screen with "Reload Page" and "Back to Home" actions.
- Automatically suppresses technical component stack traces in production builds.

---

## 7. Security & Sanitization Rules

1. **User Enumeration Defense**: Authentication failures always return generic messages ("Invalid email or password.") rather than indicating whether an email exists.
2. **SQL Injection Defense**: Database syntax or constraint errors never return SQL fragments or column schemas.
3. **Secret Redaction**: Passwords, API tokens, authorization headers, and cryptographic keys are strictly excluded from error payloads and filtered during audit logging.

---

## 8. Verification & Test Commands

```bash
# 1. System checks
docker exec veepower_backend python manage.py check
docker exec veepower_backend python manage.py makemigrations --check --dry-run

# 2. Step 12 test suite (30 tests)
docker exec veepower_backend python manage.py test tests.test_step12_error_handling

# 3. Full backend regression (443 tests)
docker exec veepower_backend python manage.py test tests

# 4. Frontend validation
npm run typecheck
npm run build
npm run test:integration
npx playwright test
node frontend/tests/comprehensive_audit.mjs
```

---

## 9. Implementation Status

### IMPLEMENTED
- [x] Canonical error response contract (`success`, `error.code`, `error.message`, `error.details`, `error.request_id`).
- [x] Correlation Request ID middleware (`X-Request-ID`) and structured logging filter (`RequestIdFilter`).
- [x] Domain business exceptions hierarchy (`BusinessLogicError`, `InsufficientStockError`, `InvalidOrderTransitionError`, etc.).
- [x] Centralized DRF exception handler (`custom_exception_handler`) catching `IntegrityError`, `ObjectDoesNotExist`, `ValidationError`, and unexpected exceptions.
- [x] Backward-compatible response formatting preserving top-level `detail`, `errors`, and field error mappings.
- [x] Message sanitization preventing raw SQL, filesystem paths, and secrets from leaking to clients.
- [x] Frontend API client error normalization (`ApiError`, `normalizeApiError`).
- [x] React `ErrorBoundary` with fallback UI and stack trace protection.
- [x] Step 12 test suite with 30 passing tests (`tests/test_step12_error_handling.py`).
- [x] Full backend regression passing (443/443 tests).
- [x] Full frontend builds, integration tests (17/17), Playwright E2E tests, and comprehensive audit (32/32).

### DEFERRED
- Distributed OpenTelemetry tracing spans (correlation `X-Request-ID` currently provides full end-to-end tracing).

### KNOWN LIMITATIONS
- Client network errors have HTTP status code 0 since no HTTP response was received from the server.
