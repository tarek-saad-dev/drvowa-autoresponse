# CRM Phase 1 — Production pilot execution gate

## State of evidence (2026-11-14)

- AutoRespond PR [#150](https://github.com/tarek-saad-dev/drvowa-autoresponse/pull/150): isolated SQL + real Next HTTP test against a synthetic Cashier emulator passed; **live paired ERP production was not tested**.
- Cashier PR [#247](https://github.com/tarek-saad-dev/casher/pull/247): staging read-only SQL contract passed on `last132_agent`; staging authenticated HTTP remains BLOCKED because the dedicated staging bearer was unavailable.
- Public production GET-only canary [run 43546125840](https://github.com/tarek-saad-dev/drvowa-autoresponse/actions/runs/43546125840): AutoRespond health / SQL readiness = 200; Cashier readiness = 200; unauthed connector manifest = 401; AutoRespond CRM sync = 404 because new CRM source was not deployed.
- **Neither PR was merged or deployed by the assistant.** Treat 404 as NOT_DEPLOYED rather than a passed CRM feature.

## Human-only release authorization

Repository rules require an **actual human** to approve and merge both PRs. Both merges to `main` automatically trigger production deployment, so they are NOT administrative-only actions. No agent or CI script should merge these PRs or trigger a production deploy in lieu of human review. This document is preparation, **not authorization**.

**Before merging either PR:**
1. Confirm off-peak change window and responsible operator, and record both current deployed SHAs.
2. Prove recent **full backups and a restore/VERIFYONLY check** for both application databases, and document a rollback owner and recovery procedure. A read-only backup-metadata check alone does not establish restorability.
3. Review complete pending change lists and migration 104 on AutoRespond. Stop if migration is non-additive or has unexpected production effects.
4. Review active WhatsApp delivery queues/workers, pending approved campaigns, and the actual value of `DRVO_LABEL_CAMPAIGNS_SEND_ENABLED`. **Warning:** `.github/workflows/deploy-production.yml` currently sets it to `true` during a normal backend deploy. Decide a no-send operational control for the pilot; do not assume draft-only API makes existing queued campaigns harmless.
5. Use only owner-authorized accounts and production connector credentials via private secrets/connection UI. Do not expose credentials in GitHub comments/chat.

## Stage 1 — Cashier first

- Human merges [Cashier PR #247](https://github.com/tarek-saad-dev/casher/pull/247), explicitly acknowledging the auto-deploy impact on the active Cut Salon POS.
- Verify **Deploy Casher to VPS** run and current deployed SHA equal to merged main.
- Check `/login`, `/api/health/live`, `/api/health/ready` (200).
- Operator smoke-tests a permitted low-impact POS function; verify invoices and end-of-shift availability. Do not modify real financial records merely for synthetic testing.
- Use authorized bearer read-only for `GET /api/integrations/drvowa/v1/manifest`, then the three read-only tools. A 401 **without bearer is expected**, not proof of connector readiness.

**Stop and rollback** on POS outage, tenant leakage, invalid auth, unexpected mutation, or degraded invoicing/shift close.

## Stage 2 — AutoRespond

- Human merges [AutoRespond PR #150](https://github.com/tarek-saad-dev/drvowa-autoresponse/pull/150) only after Cashier passes.
- Normal deploy runs CI gates and a backup metadata gate, installs dependencies, typechecks/builds, runs all pending migrations including `104_crm_phase1_foundation.sql`, and restarts app/AI worker. It also modifies campaign flag as described above.
- Verify `Deploy DRVOWA Production` conclusion `success` and exact commit SHA. Explicitly verify the migration applied via `npm run db:status` with operator access, and `/api/health?ready=1` reporting `database=up`.
- `GET /api/crm/erp/sync` without a signed-in session should return a protected response (401/403); **404 now means no CRM route**. Do not call `POST /api/crm/erp/sync` anonymously.
- Ensure no approved message queue is released as a side effect. Keep the pilot **draft-only**, without campaign launch, sending, or automatic WhatsApp outbound to real customers.

**If deploy fails:** stop immediately, inspect migration state separately from code. Code rollback does NOT reverse schema migrations. Avoid dropping additive CRM tables or deleting mirror records.

## Stage 3 — One-business pilot (human-operated)

1. From `/dashboard/integrations`, securely pair the approved Cashier instance with one owned AutoRespond pilot business. Verify `/dashboard/crm/erp` shows `connected` and customers/invoices/catalog tools.
2. Run a **bounded manual sync**, monitor `IDLE/RUNNING/PARTIAL/SUCCESS/ERROR`, and repeat only when safe until append cursors reach `SUCCESS`. `PARTIAL` is not a completed sync.
3. Reconcile **current production source counts** against AutoRespond mirror counts (customers, sale headers, cancelled, lines, catalog/deleted). Historical staging counts are not a production baseline. Confirm invoice composite keys, service ProIDs, cancelled invoices and one owner's permitted Customer 360 record.
4. Test a read-only Arabic AI audience query then spend refinement; compare with an independently verified production source query. Avoid exposing phones/names in evidence.
5. Verify explicit channel-scoped consent, opt-out, no-consent and wrong-channel. Freeze/revalidate; create **one synthetic/owner-consenting test DRAFT** on the selected WhatsApp channel only; confirm stored draft and `sendingEnabled=false`. **Do not call launch/send**.
6. Recheck Cashier invoicing/shift close and AutoRespond Inbox/QR/billing. Record exact SHAs, errors and source/mirror metrics in both PRs.

## Decision gates

- **GO limited pilot:** production backups/restorability verified, both deployments healthy, actual connector authenticated, real source-mirror parity, Customer 360/AI query correct, permission isolated, draft-only confirmed, no pending unapproved sends.
- **NO GO:** unresolved migration/backup issue, 401 with correct secret, sync stuck/partial, data mismatch, channel consent leakage, any unexpected outbound message, POS disruption, or unexplained production health regression.
- **Wider launch:** separate explicit decision after limited pilot. Do not treat passing public GETs or an ephemeral emulator as full paired production E2E.
