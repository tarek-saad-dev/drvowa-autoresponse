# DRVOWA V1 — Operations Runbook

Operational baseline for public V1 at `https://app.drvotech.com`.
Vendor monitoring (Sentry/etc.) is deferred. Use health endpoints, systemd, and structured logs.

## Services

| Unit | Role | Public bind |
|------|------|-------------|
| `drvowa.service` | Next.js app | `127.0.0.1:3100` (nginx → 80/443) |
| `drvowa-ai-worker.service` | AI reply worker | none |
| `nginx.service` | TLS reverse proxy | `0.0.0.0:80`, `:443` |
| WhatsApp runtime | separate host process | must not be internet-exposed |

Do **not** restart the WhatsApp runtime for a normal app deploy.

## Health

```bash
# Process alive
curl -sS https://app.drvotech.com/api/health

# DB readiness
curl -sS 'https://app.drvotech.com/api/health?ready=1'

# Local (on VPS)
curl -sS http://127.0.0.1:3100/api/health
curl -sS 'http://127.0.0.1:3100/api/health?ready=1'
```

Expect JSON with `"status":"ok"`. Ready must include `"database":"up"`.

## Systemd status

```bash
systemctl status drvowa.service --no-pager
systemctl status drvowa-ai-worker.service --no-pager
systemctl is-active drvowa.service drvowa-ai-worker.service nginx.service
```

## Journals (no secrets)

```bash
journalctl -u drvowa.service -n 100 --no-pager
journalctl -u drvowa-ai-worker.service -n 100 --no-pager
journalctl -u drvowa.service -f
```

Structured app logs strip sensitive keys (`password`, `token`, `authorization`, `cookie`, `apikey`, `secret`, …). Never paste raw reset tokens or API keys into tickets.

## AI worker queue

On the app host (as the `drvowa` user / app cwd):

```bash
npm run ai:worker:status
```

Check: pending / processing / expired leases / outbound-unknown spike / restart loops.
See also `docs/AI_WORKER_RECOVERY_RUNBOOK.md`.

## Billing — pending review

Platform admin UI: `https://app.drvotech.com/admin/payments`

Look for `PENDING` manual InstaPay requests. Do **not** approve disposable/test payments in production unless intentionally validating a real transfer.

Audit trail: admin payment actions are recorded as billing audit events (approve/reject). Prefer the admin UI over ad-hoc SQL unless investigating an incident.

## Backup check

See `docs/BACKUP_RESTORE.md`.

Minimum V1 check:

1. Confirm latest SQL full backup exists for `DRVOWA` (or production DB name).
2. Record backup timestamp and current app deploy SHA.
3. Confirm secrets are stored outside git.

Exact backup path is host/ops-specific (Hostinger / SQL Agent / scripts under `/home/drvowa/…`). Verify with the operator; do not invent a path in tickets.

## Deploy / restart app only

```bash
# After code is on disk at the release SHA:
sudo systemctl restart drvowa.service
# Prefer leave WhatsApp runtime untouched:
# do NOT restart whatsapp/runtime unless required
systemctl is-active drvowa.service
curl -sS 'http://127.0.0.1:3100/api/health?ready=1'
```

Restart `drvowa-ai-worker.service` only when the worker binary/env changed or it is unhealthy.

## Rollback to a known SHA

1. Note current SHA: `git -C /home/drvowa/app rev-parse HEAD` (or deploy path in use).
2. Redeploy previous known-good SHA (fast-forward/checkout + build per `docs/DEPLOYMENT_RUNBOOK.md`).
3. `systemctl restart drvowa.service` (and worker only if needed).
4. Verify `/api/health?ready=1` and login smoke.
5. Prefer forward hotfix over reversing SQL migrations. See `docs/ROLLBACK_RUNBOOK.md`.

## Critical incident (V1 definition)

Treat as critical and page the operator when any of:

- `https://app.drvotech.com` TLS/HTTP failure for sustained period
- `/api/health?ready=1` fails (DB down)
- `drvowa.service` crash loop
- `drvowa-ai-worker.service` crash loop or expired PROCESSING backlog growing without reclaim
- Confirmed public exposure of SQL (`1433`) or customer data breach
- Billing approval path broken for all tenants (admin cannot load `/admin/payments`)

Non-critical / deferred: transactional email delivery (`DEFERRED_EXTERNAL_ENHANCEMENT`), vendor APM/Sentry.

## Deferred external enhancements

| Item | Status |
|------|--------|
| Transactional email (Resend) | `DEFERRED_EXTERNAL_ENHANCEMENT` — not a V1 launch blocker |
| Sentry / paid monitoring | deferred — use journals + health |
| Card payment gateway | not in V1 — manual InstaPay only |

## Related docs

- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/ROLLBACK_RUNBOOK.md`
- `docs/BACKUP_RESTORE.md`
- `docs/AI_WORKER_RECOVERY_RUNBOOK.md`
- `docs/HOST_SECURITY_PORT_AUDIT.md`
- `docs/OBSERVABILITY.md`
- `docs/INCIDENT_RUNBOOK.md`
