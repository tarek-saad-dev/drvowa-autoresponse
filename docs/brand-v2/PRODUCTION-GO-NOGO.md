# Brand V2 — Production go/no-go

## State
The rollout PR is [#121](https://github.com/tarek-saad-dev/drvowa-autoresponse/pull/121), targeting `main`. Merging `main` deploys directly to the production VPS, runs SQL migrations, and restarts app + AI worker. The current brand integration branch may introduce `db/migrations/104_brand_asset_gallery.sql`.

## Automatic read-only preflight
Workflow `.github/workflows/brand-v2-production-preflight.yml` targets only PR #121's known branch and same-repository PRs. Over existing GitHub Action SSH credentials, it checks:
- VPS app deploy SHA equals the commit currently on `main` (no mystery/partial deployment).
- `drvowa.service`, `drvowa-ai-worker.service` and `nginx.service` are active.
- `http://127.0.0.1:3100/api/health?ready=1` returns `status=ok`, `database=up`.
- SQL Server `msdb.dbo.backupset` records a full database backup no older than **24 hours**, with positive size and no damaged flag; no customer data, SQL credentials or backup filesystem paths are printed.

The workflow performs no modifications to the remote database, app or services. If SQL backup history is invisible to the app account, or backup is too old, this is a **release blocker** — do not override it based on CI build success. A full backup-history record is evidence of a backup operation, not proof that restore works.

## Additional mandatory operational checks (manual)
- Verify actual restorable SQL backup and most recent successful restore/VERIFYONLY (record operator confirmation with date, without attaching customer data).
- Check WhatsApp session backup with the runtime operator (keep session tokens off GitHub).
- Record deployed app SHA and durable external storage/secret backup; make sure previous known-good SHA can be redeployed safely.
- Inspect release's existing env changes: `DRVO_PRICING_V1_*` and `DRVO_LABEL_CAMPAIGNS_SEND_ENABLED` are set `true` by current deploy workflow. Confirm these are the intended production settings or adjust deploy separately before the main merge.
- Take screenshots/check the release approved primary green logo/font files; when using admin upload after release, the old bundled blue logo is the fallback until variants are published.
- Prior to merge, confirm all checks at final release SHA, including billing SQL, WhatsApp source, Typecheck, production build, Vitest, anonymous and authenticated Chromium.
- Owner/admin smoke post-merge: health ready, login, admin asset upload, WhatsApp owner handover, plan page/manual transfer status, no unauthorized send, billing active and admin permissions.
- Do not roll back a migration by deleting tables. Prefer app code rollback to previous SHA and coordinate data restore with operator if needed.

## Go/no-go
- **GO** only when read-only preflight passes *and* backup restorable evidence and operational verification are recorded.
- **NO GO** when backup cannot be verified, VPS differs from main, service health is degraded, CI is red, or unknown settings/side effects are present.
- Keep final PR #121 Draft while release gates are incomplete.
