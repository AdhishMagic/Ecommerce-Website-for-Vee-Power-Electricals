# Known Limitations & Deferred Features

Accurate, current state of boundaries and consciously deferred work (verified
at commit `d0a62a3`). Nothing here is hidden debt presented as implemented —
items are either scope decisions or documented gaps with pointers.

## 1. Payments & Refunds

- **Automated Razorpay outbound refunds remain deferred/manual.** Return
  approval/completion and cancellations restore stock and adjust invoice
  state; the actual money movement is executed manually in the Razorpay
  dashboard and reconciled in-app via credit notes/invoice adjustments.
- **Razorpay test-mode limitations:** development uses mock/test keys with
  locally computed HMAC signatures (fallbacks in `base.py` are dev-only);
  webhook validation requires a publicly reachable endpoint, which local
  development does not have.
- No payment retry/recovery dunning flows for failed recurring charges
  (no recurring billing exists).

## 2. Integrations (consciously deferred)

- **External GST filing/API integration — deferred.** GST is computed and
  stored (CGST/SGST/IGST) but no external filing integration exists.
- **External credit bureau integration — deferred.** B2B credit limits are
  admin-managed; no bureau feeds.
- No SMS/WhatsApp notification channel — communication is email + in-app logs.

## 3. Currency & Localization

- **INR-only** pricing and formatting (₹).
- UI copy is English-only; no i18n framework is wired.

## 4. Email / SMTP

- **Development uses the console email backend** (emails are logged, not sent).
- **Production SMTP requires environment configuration** (`EMAIL_*` vars);
  communication logs are always written, but real delivery depends on SMTP
  credentials being present.

## 5. Rate Limiting

- **Development rate limiting uses Django's in-memory (LocMem) cache.**
- **Multi-worker production should configure Redis** as the cache backend —
  otherwise throttle counters are per-process and effectively multiplied by
  worker count.

## 6. Frontend

- **Offline support is limited:** the SPA requires connectivity; no service
  worker/PWA offline mode.
- **Cart is client-side until checkout:** the cart lives in browser storage;
  there is no server-side cart model (backend validates authoritatively at
  checkout).
- `/admin/customers` and `/admin/settings` are **"Coming soon" placeholders**.

## 7. Delivery Estimation

- **Delivery distance uses pincode slabs, not GIS:** distance is derived from
  the configured distance-slab table, not live mapping/routing APIs.

## 8. Development-Database Artifacts (not production data)

- **Legacy seed-format row:** order `ORD-2026-0001` (seeded) stores order-level
  tax on its item row (runtime orders carry item tax 0.00 and aggregate at
  order level). It reconciles exactly; seed files are outside app scope.
- **Development audit fixtures:** 25 inactive products with backdated
  `created_at` exist to keep catalog queries stable; the comprehensive audit
  creates one `Concurrency Test Switchgear` fixture per run, neutralized by
  the documented hygiene procedure (`docs/operations/README.md` §8).
- Live DB intentionally retains audit history (e.g. cancelled fabricated
  invoices from the Step 18 repair) instead of destructive deletion.

## 9. Visual Validation

- Screenshot comparison is **capture/inspect** (15 baselines); no automated
  pixel-diff thresholds are configured.

## 10. Not-Yet-Validated-in-Production Items

- No production deployment exists yet; `production.py` settings, HTTPS proxy
  assumptions and header enforcement are validated in CI but not against live
  infrastructure.
- Production-snapshot run of `audit_step18_database_integrity.py` is pending a
  real production database.
