# Payment Transactions & Payout Settlements

## 1. Overview
The platform separates customer payment receipts (`PaymentTransaction`) from merchant bank payouts (`PayoutSettlement`), preventing conflation between consumer-facing transaction status and internal banking settlements.

---

## 2. Model Separation & Ledger Roles

```
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│       PaymentTransaction        │        │         PayoutSettlement         │
├─────────────────────────────────┤        ├──────────────────────────────────┤
│ - order_id / invoice_id         │        │ - settlement_id (Unique batch ID)│
│ - gateway (RAZORPAY, COD, etc.) │        │ - settlement_date                │
│ - amount, currency (INR)        │        │ - gross_amount                   │
│ - status (INITIATED, SUCCESS...)│        │ - gateway_fee & tax_on_fee       │
│ - gateway_transaction_id        │        │ - net_amount                     │
│ - payment_method (UPI, CARD)    │        │ - status (SETTLED, PROCESSING)   │
└─────────────────────────────────┘        └──────────────────────────────────┘
```

### Distinction:
1. **`PaymentTransaction`**:
   - Represents a discrete attempt or capture by a retail customer or corporate client.
   - Tied directly to an `Order` or an `Invoice`.
   - Immutable audit log of transaction events.
2. **`PayoutSettlement`**:
   - Represents periodic batch settlement credits transferred from payment aggregators to Vee Power Electricals' bank account.
   - Tracks gateway processing charges, GST deductions on gateway fees, and net realized liquidity.

---

## 3. Scope Boundary
- Live integration with external gateway SDKs (Razorpay Webhooks / PayU APIs) is intentionally deferred to subsequent integration phases.
- Internal transaction states, idempotency guards, and payment association to orders/invoices are fully enforced by the internal domain model.
