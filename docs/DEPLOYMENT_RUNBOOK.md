# Deployment Runbook — DRVOWA AutoResponse

## Scope

Pre-launch / production deploy of the Next.js app + AI worker + SQL migrations.
Does **not** cover WhatsApp runtime (`whatsapp-bot`) deploy unless noted.

## Preconditions

- [ ] Secrets available (DB, `DRVOWA_RUNTIME_TOKEN`, Gemini, session secrets)
- [ ] Target SQL Server reachable from app host
- [ ] WhatsApp runtime healthy (if enabling WA)
- [ ] Backup taken (see `BACKUP_RESTORE.md`)

## Sequence

1. Put app in drain mode if supported (stop accepting new non-critical traffic).
2. Stop AI worker gracefully (`SIGINT` / process drain) — wait for in-flight leases to finish or expire.
3. Apply migrations: `npm run db:migrate` against target DB.
4. Verify: `npm run db:status`.
5. Deploy new app build (`npm run build` artifact / container image).
6. Start app process.
7. Start AI worker: `npm run ai:worker`.
8. Health checks:
   - `GET /api/health` → process alive
   - `GET /api/health?ready=1` → DB up
9. Smoke: login, dashboard, WhatsApp status (if runtime up).

## Rollback

See `ROLLBACK_RUNBOOK.md`. Prefer app rollback over reverse-migrating data when possible.

## Notes

- Never reset WhatsApp auth as part of a normal deploy.
- Migration 011 inserts missing usage counters only — safe to re-run.
- Migration 012 adds password-reset tokens table.
