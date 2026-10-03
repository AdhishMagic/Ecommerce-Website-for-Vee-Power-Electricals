# Production Release Record — v1.0.0

**STATUS: BLOCKED — NO PRODUCTION DEPLOYMENT PERFORMED.**

This is the release record for the controlled deployment attempt of the frozen
v1.0.0 application. Per the deployment decision gate, the deployment is blocked
at the infrastructure boundary: no production environment (server, DNS, TLS,
production database, Redis, SMTP, live payment credentials) has been provisioned
or provided. **Nothing below is claimed as verified against production.** The
application is untouched and remains frozen; this phase produced deployment
preparation only — see
[PRODUCTION_DEPLOYMENT_CHECKLIST.md](PRODUCTION_DEPLOYMENT_CHECKLIST.md).

| Field | Value |
|---|---|
| Frozen tag | `v1.0.0-frozen` (annotated; not moved) |
| Freeze commit | `ed4009126f4c90d64cd0552d55e5ceb1814cff92` — `chore: freeze application v1.0` |
| Frozen application commit | `f340514` — `docs: finalize application audit` |
| Deployment attempt timestamp | 2026-10-03 |
| Environment | **None provisioned** (blocked; only the local development Docker stack exists) |
| Application version | 1.0.0 (frozen) |
| Database version | Production: **N/A — not provisioned** (dev stack: MySQL 8.0.46, not production) |
| Migration state | **Not applied — no production DB.** Verification procedure ready: `showmigrations`, `makemigrations --check`, `migrate --plan`; `finance/0002_add_payment_reference_check` expected unapplied in a fresh production DB and reviewed before applying. Dev-stack reference: all applied. |
| Backup reference | **None** — no production database exists to back up (procedure defined in checklist §14–16) |
| Deployment operator | **Unassigned** — requires an authorized deployment owner |
| Smoke-test results | **NOT VERIFIED** — plan defined (checklist §17–27), no environment to execute against |
| Integrity audit result | **NOT VERIFIED against production** — 44-check read-only audit script ready and production-safe; the 34-test suite is intentionally not run against production (scratch test-DB provisioning; limitation documented per checklist §14–16) |
| Known limitations | Preserved unchanged: [docs/limitations.md](../limitations.md); incl. manual Razorpay outbound refunds, INR-only, console email without SMTP config, per-worker rate limiting without Redis |
| Unresolved issues (blockers) | 1. No production server/host access · 2. No DNS/domain/TLS · 3. No reverse proxy/TLS termination in topology · 4. No production MySQL · 5. **No Redis support in the frozen codebase** — wiring Redis requires a formal post-freeze change (dependency + `CACHES` settings); deployment alone cannot add it · 6. No production SMTP credentials · 7. No live Razorpay credentials/webhook endpoint · 8. Static/media serving strategy under `DEBUG=False` must be defined as deployment configuration (proxy serving backend `staticfiles/` + `media/` volumes, or object storage) · 9. No monitoring/alerting · 10. No designated deployment operator |
| Rollback reference | Procedure in checklist §17 (application rollback and database rollback are separate operations); no previous production release exists — first release rolls back to a re-deploy of `v1.0.0-frozen` |

## Application integrity during this phase

No application code, schema, dependency, or test file changed. This phase added
only documentation under `docs/deployment/`. The frozen tag `v1.0.0-frozen`
remains on `ed40091` and was not moved, amended, or pushed.

## Path to unblock

1. Designate a deployment owner and provision the production host, DNS, TLS, and reverse proxy (including static/media serving).
2. Provision production MySQL; execute the checklist §14–16 sequence (verify → snapshot → migrate → 44-check audit).
3. Supply production secrets via the environment/secret manager (matrix in checklist §4) — never in Git.
4. Resolve Redis via a formal post-freeze change request (it cannot be added by deployment configuration alone).
5. Execute the smoke-test and security gates (checklist §17–27, §16) with production-safe test data.
6. Update this record with real timestamps, backup references, and verified results — and only then change STATUS from BLOCKED.
