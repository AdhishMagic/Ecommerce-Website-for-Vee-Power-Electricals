# Customer Communication Architecture & Implementation Guide
**Project:** Vee Power Electricals E-Commerce Platform  
**Phase / Milestone:** Step 4 — Customer Communication  
**Delivery Mode:** **SYNC** (Synchronous Delivery with Fail-Safe Isolation)  

---

## 1. Architectural Overview

The customer communication system provides secure, reliable, and auditable event-driven notifications across the Vee Power Electricals e-commerce application.

### Key Principles
1. **Server-Side Authoritative Source of Truth:** Communication is dispatched solely from server-side business services upon verified state transitions. The frontend is never an authoritative trigger for financial, fulfillment, or quotation notifications.
2. **Fail-Safe Transaction Isolation:** Email transmission failure is completely isolated and caught; failure to send an email **never** rolls back or aborts underlying business transactions (such as order confirmation, stock deduction, payment capture, user registration, or quotation conversion).
3. **Strict Event-Level Idempotency:** Every communication event computes a deterministic `idempotency_key` stored in the `communication_logs` table. Re-triggering the same webhook, status transition, or invoice generation will skip duplicate email delivery.
4. **Synchronous Execution Model (SYNC):** In accordance with the application's infrastructure (no Celery/Redis queue in baseline), delivery is executed synchronously via Django's configured `EMAIL_BACKEND` (`locmem` in testing, `console` in local development, and standard SMTP in production).
5. **Cross-Customer Data Isolation:** Recipients are resolved strictly from the authoritative database models (`order.customer_email`, `user.email`, `client.email`). Arbitrary frontend-supplied email addresses are never trusted for transactional communication.
6. **Zero-Secret Leakage:** Cryptographic reset tokens, passwords, payment secrets, and internal stack traces are strictly excluded from persistent audit logs (`context_snapshot`) and template output.

---

## 2. Supported Customer Communication Events Matrix

| Event Name | Source Service / View | Business Condition | Recipient Source | Template Base | Delivery Mode | Failure Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Registration** | `RegisterView` | User successfully registered | `user.email` | `welcome` | SYNC | Logged as `FAILED`; user registration succeeds |
| **Password Reset** | `PasswordResetView` | Active user account found | `user.email` | `password_reset` | SYNC | Handled cleanly; generic API response returned |
| **Order Confirmation** | `OrderWorkflowService` | Order status transitions to `CONFIRMED` | `order.customer_email` | `order_confirmation` | SYNC | Logged as `FAILED`; order remains confirmed |
| **Payment Confirmation** | `PaymentGatewayService` | Signature verified & status set to `PAID` | `order.customer_email` | `payment_confirmation` | SYNC | Logged as `FAILED`; payment remains successful |
| **Payment Failure** | `PaymentGatewayService` | Signature verification fails or gateway webhook `payment.failed` | `order.customer_email` | `payment_failure` | SYNC | Logged as `FAILED`; failure state recorded |
| **Order Shipped** | `OrderWorkflowService` | Order status transitions to `SHIPPED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; order remains shipped |
| **Order Delivered** | `OrderWorkflowService` | Order status transitions to `DELIVERED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; order remains delivered |
| **Order Cancelled** | `OrderWorkflowService` | Order status transitions to `CANCELLED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; cancellation & stock restoration preserved |
| **Return Requested** | `OrderWorkflowService` | Order status transitions to `RETURN_REQUESTED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; return state preserved |
| **Return Approved** | `OrderWorkflowService` | Order status transitions to `RETURN_APPROVED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; return state preserved |
| **Return Rejected** | `OrderWorkflowService` | Order status transitions to `RETURN_REJECTED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; return state preserved |
| **Return Completed** | `OrderWorkflowService` | Order status transitions to `RETURN_COMPLETED` | `order.customer_email` | `order_status_update` | SYNC | Logged as `FAILED`; return and restocking preserved |
| **Tax Invoice Generated** | `InvoiceService` | Statutory invoice created for order or quotation | `order.customer_email` or `client.email` | `invoice_notification` | SYNC | Logged as `FAILED`; invoice creation preserved |
| **Quotation Update** | `QuotationViewSet` | Quotation updated to `Sent`, `Approved`, or `Rejected` | `quotation.client.email` | `quotation_notification` | SYNC | Logged as `FAILED`; quotation update preserved |
| **Inquiry Acknowledgement** | `ContactInquiryViewSet` | Public inquiry/lead submitted with email | `inquiry.email` | `inquiry_acknowledgement` | SYNC | Logged as `FAILED`; inquiry record preserved |

---

## 3. Communication Service Architecture

Located at: `backend/apps/core/services/communication_service.py`

### Low-Level Dispatcher
`CommunicationService.send_email(event_type, recipient, subject, template_base, context, idempotency_key)`
- **Validation:** Validates email syntax via Django's `validate_email`. Malformed or missing emails log a warning and mark the log as `FAILED` without crashing.
- **Idempotency Register:** Checks `CommunicationLog` for existing records matching `idempotency_key` with status `SENT`. If found, skips duplicate delivery.
- **Context Sanitization:** Calls `sanitize_context_for_snapshot()` to redact any sensitive credentials (`token`, `password`, `key`, `secret`, `signature`) before saving into `context_snapshot`.
- **Multipart Rendering:** Renders both plain text (`.txt`) and responsive HTML (`.html`) templates with automatic HTML escaping.
- **Fail-Safe Dispatch:** Wraps `EmailMultiAlternatives.send()` inside a comprehensive `try...except` block. Upon transmission failure, the error is recorded in `CommunicationLog(status=FAILED)` and logged safely; the exception is **never** re-raised.

---

## 4. Communication Auditability & Data Model

Located at: `backend/apps/core/models.py`  
Table: `communication_logs`

```python
class CommunicationLog(TimeStampedModel):
    event_type = models.CharField(max_length=60)
    channel = models.CharField(max_length=20, choices=CommunicationChannel.choices, default='EMAIL')
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    idempotency_key = models.CharField(max_length=150, unique=True)
    status = models.CharField(max_length=20, choices=CommunicationStatus.choices, default='SENT')
    error_message = models.TextField(null=True, blank=True)
    template_name = models.CharField(max_length=100, blank=True, default='')
    context_snapshot = models.JSONField(default=dict, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
```

Indexes:
- `idx_comm_event_created` (`event_type`, `created_at`)
- `idx_comm_recipient_date` (`recipient`, `created_at`)
- `idx_comm_status` (`status`)
- `idx_comm_idempotency` (`idempotency_key`)

---

## 5. Security & Isolation Controls

1. **No Password/Token Leakage:** Password reset emails send a cryptographic reset link with token parameters (`/reset-password?uid={uidb64}&token={token}`) valid for 24 hours. The token is never stored in persistent audit logs.
2. **Authoritative Email Addresses:** Order, payment, and invoice communications derive the recipient from `Order.customer_email` or `Client.email`. Client request bodies cannot redirect order confirmations to foreign emails.
3. **Escaped Template Rendering:** All customer names, order notes, and product names are rendered through Django's auto-escaping template engine, mitigating HTML injection and cross-site scripting (XSS) in email clients.
4. **Environment Isolation:** Links in emails use `settings.FRONTEND_URL` (configurable per environment), preventing development URLs from leaking into production notifications.

---

## 6. Environment Configuration

The following environment variables configure the communication gateway in `backend/config/settings/base.py`:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` | Mail backend (`locmem` for tests, `smtp` for production) |
| `EMAIL_HOST` | `localhost` | SMTP relay server hostname |
| `EMAIL_PORT` | `587` | SMTP port (typically 587 for TLS, 465 for SSL) |
| `EMAIL_HOST_USER` | `""` | SMTP authentication user |
| `EMAIL_HOST_PASSWORD`| `""` | SMTP authentication password |
| `EMAIL_USE_TLS` | `True` | Enable TLS encryption |
| `EMAIL_USE_SSL` | `False` | Enable SSL encryption |
| `EMAIL_TIMEOUT` | `10` | Socket timeout in seconds |
| `DEFAULT_FROM_EMAIL` | `Vee Power Electricals <noreply@veepower.in>` | Outbound sender envelope address |
| `FRONTEND_URL` | `http://localhost:5173` | Base frontend URL for links in emails |

---

## 7. Testing Strategy & Verification Matrix

Automated test suite: `backend/tests/test_communication_service.py`  
Total tests: **17 passed**

1. `test_01_registration_welcome_email`: Welcome email sent to newly registered user.
2. `test_02_password_reset_email`: Password reset instructions with UID/token; token redacted from log.
3. `test_03_order_confirmation_communication`: Order confirmation with items, total, and address.
4. `test_04_payment_confirmation_communication`: Payment verified receipt with gateway transaction ID.
5. `test_05_failed_payment_communication`: Payment failure notice with error message.
6. `test_06_invoice_communication`: Statutory GST tax invoice notice with GST split.
7. `test_07_quotation_communication`: Commercial quotation update sent to B2B client.
8. `test_08_cancellation_communication`: Order cancellation notice with reason.
9. `test_09_shipping_communication`: Dispatch notice with carrier AWB tracking number.
10. `test_10_delivery_communication`: Order delivery confirmation notice.
11. `test_11_return_communication_lifecycle`: Comprehensive return status updates (requested, approved, completed).
12. `test_12_wrong_recipient_blocked`: Invalid/empty recipient addresses blocked safely.
13. `test_13_duplicate_event_does_not_duplicate_communication`: Idempotency prevents duplicate emails.
14. `test_14_email_failure_does_not_rollback_business_transaction`: SMTP errors do not rollback DB transactions.
15. `test_15_sensitive_data_not_exposed`: Passwords, tokens, and secrets redacted in snapshots.
16. `test_16_cross_customer_isolation`: Customer A's order emails never sent to Customer B.
17. `test_17_contact_inquiry_acknowledgement`: Public inquiry generates acknowledgement to user's email.

---

## 8. Known Limitations

1. **Direct Gateway Refund Processing Deferred:** Automated Razorpay refund processing is deferred per project roadmap; refund communications will be integrated alongside automated gateway refunds.
2. **Production SMTP Credentials Required for External Delivery:** External email transmission requires configuring active SMTP provider credentials (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`) in the production deployment environment.
3. **Audit Data Accumulation in Comprehensive Audit:** Step 6.4 of `comprehensive_audit.mjs` utilizes hardcoded Quotation 1 and accumulated credit exposure for client L&T Construction; this is an established, unrelated audit data artifact.
