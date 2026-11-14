# CRM Phase 1 — Paired Staging E2E Gate (not yet executed)

**Release gate:** PR [AutoRespond #150](https://github.com/tarek-saad-dev/drvowa-autoresponse/pull/150) + PR [Cashier #247](https://github.com/tarek-saad-dev/casher/pull/247).

Do not merge or deploy either PR based only on unit/SQL-contract tests. Cashier's staging gate confirms read-only SQL contracts on `last132_agent`, **not** live Next.js HTTP connector calls or an AutoRespond runtime.

## Required isolated environments

1. Cashier staging Next.js runtime checked out at the **exact PR #247 head**, connected only to `last132_agent` as `drvo_agent`. Preserve the existing Cashier staging identity checks. Never use production `last132` or production credentials.
2. AutoRespond staging Next.js runtime checked out at the **exact PR #150 head**, with a fresh isolated SQL Server database migrated through `104_crm_phase1_foundation.sql`, a staging-only business/account, staging-only WhatsApp test channel (or no send-capable channel for read-only phases), and a staging-only DRVO ERP pairing targeting the Cashier staging origin.
3. A separate staging-only connector bearer matching Cashier's configured DRVOWA outbound-token hash, passed out-of-band through the approved secrets system. Do not commit, log or paste the token.
4. A staging test-account session cookie for the AutoRespond Owner/Admin. The application server (not the smoke script) needs its own Gemini configuration before AI test steps.
5. Do not point either runtime at `app.drvotech.com`, `ops.cutsaloon.com`, `last132`, or a production WhatsApp account.

If any prerequisite is missing, **BLOCKED** is the correct result. Do not auto-fallback to a production endpoint or secret.

## Live HTTP smoke (no outbound sends)

All origins must be explicitly listed in `CRM_STAGING_APPROVED_ORIGINS`, separated by commas. The safety guard requires staging/preview/test/sandbox/dev hostnames or loopback, enforces HTTPS for remote endpoints, and rejects user credentials, query strings and paths.

```bash
# Inject the following through a trusted staging-only secret environment.
export CRM_STAGING_APPROVED_ORIGINS="https://cashier-staging.example.test,https://crm-staging.example.test"
export CRM_STAGING_CASHIER_URL="https://cashier-staging.example.test"
export CRM_STAGING_CASHIER_BEARER="<staging-only bearer>"

# Phase A — prove real Cashier Next.js HTTP manifest + three tools.
node --import tsx scripts/crm-staging-http-smoke.ts --connector-only

export CRM_STAGING_APP_URL="https://crm-staging.example.test"
export CRM_STAGING_SESSION_COOKIE="<staging account session cookie>"

# Phase B — read-only CRM integration status + Customer 360 HTTP shape.
node --import tsx scripts/crm-staging-http-smoke.ts --paired

# Phase C — only after isolated DB and permission checks:
export CRM_STAGING_ENABLE_SYNC=YES_STAGING_ONLY
node --import tsx scripts/crm-staging-http-smoke.ts --paired

# Phase D — AI preview on staging only; server holds GEMINI_API_KEY.
export CRM_STAGING_ENABLE_AI=YES_STAGING_ONLY
# Required if multiple active test WhatsApp channels:
export CRM_STAGING_CHANNEL_ID="<approved staging ChannelConnectionID>"
node --import tsx scripts/crm-staging-http-smoke.ts --paired

# To prove positive matching, use a separately verified historical interval
# on staging and pass the exact Arabic request as CRM_STAGING_AI_REQUEST.
# Spend refinement is checked against that audience; no WhatsApp send occurs.

# Optional staging CRM snapshot (DB write, no campaign send):
export CRM_STAGING_ENABLE_SNAPSHOT=YES_STAGING_ONLY
node --import tsx scripts/crm-staging-http-smoke.ts --paired
```

The smoke prints **counts and status only**; no customer names, phones, tokens or invoice payloads. It never calls WhatsApp send, launch or campaign execution APIs.

## Required *additional* verification before release

- Fully reconcile Cashier source totals with AutoRespond mirror totals **after all append pages have reached `SUCCESS`**; a `PARTIAL` cursor state is not a completed sync. Check customer ID/phone linking, invoice composite keys, deleted/voided sales, line totals, and catalog deletion/name changes.
- Verify one Customer 360 profile against the source's invoice history, service names, favorite branch/employee and lifetime spend, without disclosing PII in PR comments.
- Test Arabic AI request `هات العملاء اللي عملوا بروتين آخر 30 يوم` and then `هات منهم اللي صرفوا أكثر من 1000 جنيه`; compare both with independently calculated tenant-scoped source SQL. Source baseline at the November 14 staging SQL check: **zero distinct clients** for Protein ProIDs 15/16/1077 during the previous 30 days. An empty-result test **does not** establish correct positive matching. Use an isolated test fixture on a disposable database, or an independently verified existing historical interval (read-only) for a positive case.
- Validate real channel-specific consent, no permission, wrong-channel permission, opt-out, final eligible count, and zero-eligible behavior using only consenting synthetic test recipients.
- In the UI, freeze/revalidate final eligible count and channel; create **draft only**, verify persistence and idempotent retries. Do not use a real send-capable recipient except an explicitly consenting designated test number; never bulk-send.
- Regression smoke: existing WhatsApp QR, Inbox send in a non-production channel, Pulse, billing and onboarding.

## Evidence required on both PRs

Record exact PR SHAs, staging runtime URLs (omit authentication data), isolated database identifiers, test case IDs, source and mirror counts, example validation IDs redacted, CI links, every skipped scenario, known discrepancies and a clear **PASS/FAIL/BLOCKED** per step. A source SQL contract gate alone is not cross-app E2E.

**Merge/deploy gate remains closed** until paired staging runtime, HTTP connector, CRM source-to-mirror, AI refinement, consent, and draft-without-send are verified and the owner explicitly approves.
