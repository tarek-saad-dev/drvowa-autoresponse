# Brand V2 — Production go/no-go

## State
## Owner scope decision — visual identity now, logo uploads later

- The owner explicitly accepted **temporary existing bundled logos** on dark/light surfaces for this release. The agreed identity colors and typography/UI style must ship; final logo/lettering variants are **not** a release blocker.
- Keep the current logos as safe fallbacks: `/brand/logo-on-dark.png` and `/brand/logo-on-light.png`. Do not invent new logos or silently publish draft assets.
- Once the release is live, the owner can upload PNG/JPG/WebP variants as `SUPER_ADMIN` at `/admin/brand-assets` (Admin → الهوية واللوجوهات), review each draft and explicitly **اعتماد ونشر**. This functionality requires migration 104 and is unavailable on production until the actual release deploy.
- **No intentional Pricing V1 or campaign-send flag changes in the Brand V2 deployment.** Preserve the VPS's existing flag values.
- This concession is **logos only**; the verified SQL backup / restore proof and final production readiness gates remain mandatory before merge.

The rollout PR is [#121](https://github.com/tarek-saad-dev/drvowa-autoresponse/pull/121), targeting `main`. Merging `main` deploys directly to the production VPS, runs SQL migrations, and restarts app + AI worker. The current brand integration branch may introduce `db/migrations/104_brand_asset_gallery.sql`.

## Automatic read-only preflight
Workflow `.github/workflows/brand-v2-production-preflight.yml` targets only PR #121's known branch and same-repository PRs. Over existing GitHub Action SSH credentials, it checks:
- VPS app deploy SHA equals the commit currently on `main` (no mystery/partial deployment).
- `drvowa.service`, `drvowa-ai-worker.service` and `nginx.service` are active.
- `http://127.0.0.1:3100/api/health?ready=1` returns `status=ok`, `database=up`.
- SQL Server `msdb.dbo.backupset` records a full database backup no older than **24 hours**, with positive size and no damaged flag; no customer data, SQL credentials or backup filesystem paths are printed.

The workflow performs no modifications to the remote database, app or services. If SQL backup history is invisible to the app account, or backup is too old, this is a **release blocker** — do not override it based on CI build success. A full backup-history record is evidence of a backup operation, not proof that restore works.

## Production deployment protection (defense-in-depth)

The production deployment also enforces a read-only SQL full-backup freshness check **before** git checkout, changes to Pricing/Campaign environment flags, database migrations or service restarts. It fails closed if recent (<=24h) non-damaged full-backup metadata is missing. This prevents release PR preflight from becoming stale between approval and the actual deploy. It does **not** prove a restore succeeded.

The operator runbook is [PRODUCTION-DB-BACKUP-OPERATOR.md](./PRODUCTION-DB-BACKUP-OPERATOR.md); the separate privileged SQL backup, VERIFYONLY / isolated restore, encrypted offsite retention, daily scheduling and release signoff remain mandatory.

## Additional mandatory operational checks (manual)
- Verify actual restorable SQL backup and most recent successful restore/VERIFYONLY (record operator confirmation with date, without attaching customer data).
- Check WhatsApp session backup with the runtime operator (keep session tokens off GitHub).
- Record deployed app SHA and durable external storage/secret backup; make sure previous known-good SHA can be redeployed safely.
- Verify `DRVO_PRICING_V1_*` and `DRVO_LABEL_CAMPAIGNS_SEND_ENABLED` retain their **current** values. The Brand V2 release must not toggle Pricing, add-ons or campaign sends.
- Verify the owner-approved temporary bundled logo fallback and full color/theme QA now; final wordmark/lettering can be uploaded separately after release from Super Admin.
- Prior to merge, confirm all checks at final release SHA, including billing SQL, WhatsApp source, Typecheck, production build, Vitest, anonymous and authenticated Chromium.
- Owner/admin smoke post-merge: health ready, login, admin asset upload, WhatsApp owner handover, plan page/manual transfer status, no unauthorized send, billing active and admin permissions.
- Do not roll back a migration by deleting tables. Prefer app code rollback to previous SHA and coordinate data restore with operator if needed.

## Go/no-go
- **GO** only when read-only preflight passes *and* backup restorable evidence and operational verification are recorded.
- **NO GO** when backup cannot be verified, VPS differs from main, service health is degraded, CI is red, or unknown settings/side effects are present.
- Keep final PR #121 Draft while release gates are incomplete.
