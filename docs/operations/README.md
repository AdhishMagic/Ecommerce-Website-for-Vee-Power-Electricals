# Operations & Maintenance Runbook

Day-to-day operational reference, verified at commit `d0a62a3`. For initial
deployment see `docs/deployment/README.md`; for the regression record see
`docs/testing/README.md`.

## 1. Startup / Shutdown

```bash
docker compose up -d --build       # start full stack (dev)
docker compose down                # stop (data persists in the mysql volume)
docker compose restart backend     # restart a single service
```

Backend migrations + demo seed run automatically on first `docker compose up`
(compose entrypoint). Subsequent starts are incremental.

## 2. Health Checks

| Check | Command / URL | Healthy when |
|---|---|---|
| Containers | `docker ps --filter "name=veepower"` | all 3 `healthy`/`Up` |
| API readiness | `GET http://localhost:8000/api/v1/health/` | `application: up`, `database: connected` |
| Frontend | `GET http://localhost:5173/` | HTTP 200 |
| Migration state | `python manage.py showmigrations` | no `[ ]` entries |

## 3. Logs

```bash
docker logs veepower_backend --tail 200 -f   # API logs (structured, request_id-tagged)
docker logs veepower_frontend --tail 100     # Vite dev server
docker logs veepower_mysql --tail 100        # MySQL
```

Backend log level via `DJANGO_LOG_LEVEL` (default INFO). Errors are logged with
`request_id` — correlate client-reported `request_id` values against these logs.

## 4. Migrations

```bash
docker exec veepower_backend python manage.py migrate --plan      # preview
docker exec veepower_backend python manage.py migrate             # apply
docker exec veepower_backend python manage.py makemigrations --check --dry-run
```

Rules: preview with `--plan` first; never edit an applied migration; verify
`makemigrations --check` stays clean after model changes.

## 5. Backups & Restore

Full procedures: `docs/deployment/backup-restore.md`. Quick reference:

```bash
docker exec veepower_mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" veepower_db' > backup.sql
```

Restore: stop backend writes, drop/recreate schema, re-import, run
`migrate` + `showmigrations` to confirm state, then re-run the integrity audit
(§6) before resuming traffic.

## 6. Database Integrity Audit (44 checks, read-only)

```bash
docker exec -i veepower_backend python manage.py shell \
  < backend/tests/audit_step18_database_integrity.py
```

Expect `AUDIT RESULT: PASS`. Run after incidents, restores, or before releases.
⚠️ **Sequential-execution rule (Step 18/19 lesson):** never run this audit, the
comprehensive audit (`comprehensive_audit.mjs`), Playwright, or the integration
script concurrently — suites that mutate shared database state must run strictly
one at a time or results corrupt.

## 7. Test Execution

All suites and counts: `docs/testing/README.md`. Backend suite inside the
container; browser suites from `frontend/` against a running stack:

```bash
docker exec veepower_backend python manage.py test tests --noinput
cd frontend && node tests/integration.test.mjs
npx playwright test
```

## 8. Fixture Hygiene (comprehensive audit)

`node tests/comprehensive_audit.mjs` creates one live fixture per run — a
product named `Concurrency Test Switchgear <n>` (e.g. id 44,
`Concurrency Test Switchgear 857215`). After the audit, neutralize it (do NOT
delete — preserve ledger references):

```sql
UPDATE products SET active=0, created_at='2026-09-24 06:00:00'
WHERE name LIKE 'Concurrency Test Switchgear%' AND created_at > '<audit-date>';
```

Then re-run the integrity audit (§6) to confirm `AUDIT RESULT: PASS`.

## 9. Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| Backend unhealthy | `docker logs veepower_backend` | DB unreachable → check `mysql` health + `DATABASE_*` env; migrate pending → run `migrate` |
| `Access denied` in mysql | wrong credentials | env `DATABASE_USER/PASSWORD` mismatch; container `MYSQL_PASSWORD` not exported to exec shells — use the container's own env |
| 429 responses | throttle exceeded | raise `THROTTLE_RATE_*` or fix abusive caller; configure Redis in multi-worker prod |
| Checkout 400 "credit limit" | B2B exposure ≥ limit | settle invoices or raise client limit (audited change) |
| Orders stuck PENDING | payment not verified | check payment status endpoint; webhooks require reachable endpoint + correct `RAZORPAY_WEBHOOK_SECRET` |
| Frontend blank page | API URL wrong | `VITE_API_URL` mismatch; check browser console + `client.ts` |
| Integrity audit FAIL | real divergence | stop writes, capture offending rows from the audit output, follow `docs/database/README.md` §6 repair guidance |

## 10. Rollback

See `docs/deployment/rollback-runbook.md` (previous image tag, migration
awareness, maintenance mode). Data-bearing rollbacks require a restore (§5) —
migrations are not auto-reversed.

## 11. Fixture / Dev-Data Notes

- Dev database contains historical audit fixtures (25 backdated inactive
  products) and legacy seed rows — documented in `docs/limitations.md`; do not
  "clean" them destructively.
- Test users are dev fixtures; production must create real users with
  environment-configured SMTP and live Razorpay keys.
