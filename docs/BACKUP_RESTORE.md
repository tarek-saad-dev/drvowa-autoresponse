# Backup & Restore

## What to back up

1. **SQL Server database** (full + log as appropriate for RPO).
2. **App secrets** (vault / env store) — not in git.
3. **WhatsApp runtime session data** — owned by the runtime service; coordinate separately. Do not copy session files into this repo.

## Before risky changes

- Full DB backup
- Record current migration version (`TblSchemaMigration`)
- Record app deploy SHA

## Restore outline

1. Stop app + AI worker.
2. Restore DB to chosen point-in-time / full backup.
3. Confirm migration version matches the app SHA you will run (or migrate forward).
4. Start app + worker.
5. Validate health and a known business login.

## Notes

- Restoring DB without matching WhatsApp runtime state can leave connections `DISCONNECTED` / needing QR — expected.
- Usage counters and reservations must stay consistent with restored audit events; do not hand-edit counters after restore unless directed by an incident lead.
