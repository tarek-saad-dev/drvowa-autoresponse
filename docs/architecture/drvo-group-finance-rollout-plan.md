# DRVO Group Finance — implementation roadmap

**Owner:** DRVO Tech (central reporting), each individual product (finance source of truth)
**Status:** In progress. AutoResponse PR #47 adds product reporting and versioned export; group ingestion cannot be deployed until the DRVO Tech repository and its deployment are connected.
**Decision date:** 2026-10-14.

## Non-negotiable invariant

**Products own their finance. DRVO Tech owns only reconciled projections.**

A payment is created/approved/refunded in its own product, never in a group UI. A group user can drill down to a product to take an authorized action. Product data is read-only in the group. Do not sum a payment event and a snapshot total; those are two representations of the same facts.

## Phase A — AutoResponse financial owner panel (code ready, verification required)

- [x] Product admin dashboard: monthly approved collections, estimated monthly run rate, pending approvals and operational renewals.
- [x] Six-/twelve-month trend, plan mix, and basic export-compatible snapshot.
- [x] Separate platform-owner `/admin` from tenant/customer `/dashboard`.
- [ ] Verify SQL data schema/performance against staging and run typecheck/test/build.
- [ ] Backfill any real payment adjustments, refunds, charges, invoice accounting as first-class entries instead of silently reinterpreting approvals.
- [ ] Release only after matching existing manual-payment reports and production smoke tests.

**Acceptance:** Approving one EGP payment changes AutoResponse approved collections exactly once; pending requests and failed/rejected payments do not. Active-plan estimate is shown with an estimate label.

## Phase B — Secure AutoResponse export (code ready, deployment disabled by default)

- [x] Read-only versioned finance snapshot: `GET /api/internal/group-finance/v1/snapshot`.
- [x] Keyset paginated approved payment feed: `GET /api/internal/group-finance/v1/collections?limit=100[&from=UTC][&after=CURSOR]`.
- [x] Bearer service token `DRVO_GROUP_FINANCE_EXPORT_TOKEN`, checked server-side and denied if missing or shorter than 32 chars.
- [x] Minor-unit amounts (piasters for EGP), product ID, source tenant ID, source payment ID, event type/version, UTC approval date and ISO currency.
- [x] Stable dedupe identity `(productId, sourceEntity, sourceEntityId, sourceVersion)`.
- [ ] Configure secret in DRVO Tech **and** AutoResponse environment secret stores (not in Git or browser).
- [ ] Add mTLS/private network/IP allowlist when deployment networking permits; enforce HTTPS for all service connections.
- [ ] Verify export is 503 without configured secret, 401 for an invalid token and 200 with valid token, never publicly readable.
- [ ] Compare export event sum by UTC month to product-owner dashboard totals after deployment.

**Important:** v1 exports *approved manual InstaPay payment records*, not bank-settled cash, accounting revenue or net profit. Reversals/refunds are unsupported until a real product finance ledger is implemented.

## Phase C — DRVO Tech central read model (blocked: repository/deployment not currently accessible)

Create these central entities (not in AutoResponse DB):

`GroupProduct`: productId, name, adminUrl, status, supported currencies, contract version, sync enabled.

`GroupFinanceEvent`: productId, sourceEntity, sourceEntityId, sourceVersion, type, sourceTenantId, currency, amountMinor, occurredAtUtc, receivedAtUtc, payloadHash; enforce UNIQUE(productId,sourceEntity,sourceEntityId,sourceVersion).

`GroupFinanceSyncState`: productId, encrypted credential reference, checkpoint cursor, lastAttemptUtc, lastSuccessUtc, lastSourceSnapshotUtc, error status, retry count.

`GroupFinancialSnapshot`: productId, period, currency, activePaid, trials, pendingRequests, estimatedRunRateMinor, generatedAtUtc, importedAtUtc, sourceSchemaVersion.

Create independent privileges `GROUP_FINANCE_READ` and `GROUP_FINANCE_ADMIN`, with DRVO Tech audit logging. Never reuse tenant roles as group finance roles.

**Consumer sync algorithm:**

1. Fetch a product snapshot and validate product ID, schema, currency, freshness and generated time.
2. Fetch all paginated collection events using the product's last checkpoint (or earliest date for first backfill). Verify each row.
3. Insert new events using unique source key under a DB transaction; on duplicate, skip and count it. Do not treat a duplicate as a second credit.
4. Commit checkpoint **in the same transaction** as inserted events. If process crashes, restart safely.
5. Reconcile per-month sums from unique events against product snapshots using identical UTC boundaries.
6. Update `lastSuccessUtc` only after reconciliation; surface stale/error status prominently on the dashboard.
7. Continue polling every 5–15 minutes as operational need dictates. Polling is disabled automatically for missing/invalid credentials.

Do not overwrite aggregate event truth with the latest snapshot; they have different purposes. If a snapshot changes unexpectedly, raise reconciliation alert rather than double-counting.

**Acceptance:** Replay the same page 100 times -> one event per source payment. Adding a collection in Coach changes Coach's and group totals on next successful poll, not AutoResponse's totals. Loss of the Coach connection shows a **stale** marker instead of an invented zero.

## Phase D — DRVO Coach and additional products (blocked: product repos not connected)

- [ ] Each product publishes v1 snapshot and approval/settlement event feeds with its own product ID and service credential.
- [ ] Standardize billable entities, billing periods, month cutoffs, chargebacks, discounts and amount precision.
- [ ] Backfill historical events idempotently.
- [ ] Reconcile each source before enabling product contribution charts.

**Acceptance:** Coach approved 1,000 EGP + AutoResponse approved 500 EGP -> consolidated *approved-collection* value increases 1,500 EGP, with two visible product contributions and no sharing of source databases.

## Phase E — Full P&L and professional SaaS KPIs (requires real product-owned primitives)

- [ ] `Invoice` + immutable invoice line and credit note, payment allocation, discounts, tax fields.
- [ ] `FinancialAdjustment` / refund / chargeback / bank settlement, compensating entries and idempotent provider references.
- [ ] `Expense` and `CostOfService` by product, vendor, category and date.
- [ ] Subscription contract/price snapshot to calculate defensible MRR; track scheduled cancellations, expansion, downgrade, and cohort churn.
- [ ] Recognized revenue by service period independent from collection date.
- [ ] Group dashboard: revenue, collections, MRR, ARR, renewal forecast, costs, gross margin, net profit (only when supported), product contribution, comparison periods, and sync/reconciliation health.

**Acceptance:** Group total = sum of valid canonical product entries for the same metric, currency, period and accounting basis, not arithmetic over UI cards. Refunds lower net collections once, but never erase the original approved payment.

## Release checklist

- Security: only group-service auth; token not logged; 401/503 fail closed; secure HTTPS and restricted egress.
- Correctness: sample reconciliation by hand, mixed-currency isolation, duplicate replay, boundary-month and timezone checks.
- Reliability: sync retries/backoff, observability, stale marker, pagination and lost-connection alerts.
- Verification: TypeScript, unit tests, DB-backed tests, Next production build, staging review, then production smoke test.
- Rollback: keep service secret unset/rotate to disable export immediately; group sync has independent enable flag. Read-only additions do not mutate paid user data.

## What is *not* yet implemented

This repo contains neither DRVO Tech's database nor DRVO Coach's data. This is **not** a live group rollup, automated transfer, or recognized-revenue ledger. Group ingestion, background polling, financial adjustments and cross-product dashboard require their respective repositories/deployments.
