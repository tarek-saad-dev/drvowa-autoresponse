# AutoResponse → DRVO Tech finance sync (v1)

**Status:** API code in feature PR. Inactive in production until `DRVO_GROUP_FINANCE_EXPORT_TOKEN` is configured on AutoResponse and matching secret is stored in DRVO Tech. No automatic DRVO Tech sync job exists yet.

## API contract

Both endpoints:
- HTTPS only, GET only, Node server runtime.
- Required header: `Authorization: Bearer <service secret>` (32+ characters).
- Fail closed: **503** if service secret is not configured, **401** if token is wrong, **200** if valid. `Cache-Control: private, no-store`.
- Money values are **minor EGP units (piasters)**; UTC approval-date semantics. Do not treat results as recognized accounting revenue or bank-cleared cash.

### `GET /api/internal/group-finance/v1/snapshot`

Returns the `ProductFinancialSnapshotV1` object, keyed by `productId = DRVO_AUTORESPONSE`, with:
- `figures.approvedCollectionsThisMonthMinor`
- `figures.approvedCollectionsLifetimeMinor`
- `figures.estimatedMonthlyPlanRunRateMinor`
- `figures.pendingPaymentRequestsMinor`
- Subscription counts: active paid/free, trialing, past due, expiring in 7 days
- `monthlyApprovedCollections` (last 12 months, zero months included)
- `generatedAtUtc`, `periodBasis: APPROVAL_UTC`, `currency: EGP`

### `GET /api/internal/group-finance/v1/collections`

Parameters:
- `limit`: optional, 1–250, default 100.
- `from`: optional strict UTC ISO timestamp, e.g. `2026-01-01T00:00:00.000Z`, inclusive; omitted starts from the earliest historical approval.
- `after`: optional opaque cursor from a previous result; advances by timestamp + payment ID, exclusive.

Response:
- `schemaVersion`, `productId`, `currency`, `periodBasis`
- `events[]` includes `sourceEntityId`, `sourceVersion=1`, `sourceTenantId`, `eventType=PAYMENT_APPROVED`, `amountMinor`, `occurredAtUtc`, `planCode`, `reference`
- `nextCursor` is the checkpoint even when the consumer is caught up (unless no events ever returned).
- `hasMore` means request the next page immediately. Without `hasMore`, store `nextCursor` for the next scheduled poll.

In DRVO Tech:
1. Load product registry and credential reference from private configuration.
2. GET all event pages while `hasMore=true`. Stop and retry on any network/auth/validation failure.
3. Inside the central DB transaction, insert each event with a unique `(productId,sourceEntity,sourceEntityId,sourceVersion)`. Duplicate insert is a no-op, not an error/revenue.
4. Commit the checkpoint with the inserted events. On retry, previously imported events are deduped.
5. Fetch snapshot for source control totals. Compare monthly sums with imported events (same currency/period definition); alert when mismatched.
6. Track per-product `lastSuccessAtUtc`, freshness, failures, duplicates, and reconciliation delta. Display stale data as stale, not as zero.

**Never sum `snapshot.figures.approvedCollections...` on top of event amounts.** Snapshot is a *control total*, the event feed is the detailed canonical group-read-model source.

## Rollout smoke tests

1. Without setting token: GET snapshot returns 503 with no private figures.
2. With configured token, omitted / wrong Authorization returns 401.
3. Correct Authorization returns the correct product ID, no user PII, no-cache response.
4. Create one PENDING InstaPay request: neither snapshot approved collections nor feed events increases.
5. Approve once: export includes one event; retry the same approval does not create another event.
6. Fetch same event pages repeatedly: group's stored events and consolidated amount remain unchanged.
7. Compare last 6/12 months of group EGP events against product EGP dashboard.
8. Drop a source credential/network and verify DRVO Tech flags staleness while keeping last known figures with timestamps.
9. Test two different product IDs with the same UUID: no accidental dedupe across products.
10. Verify export secret is never exposed in browser output, client bundles, audit contents, or Git logs.

## Deferred to later contract versions

Refunds, reversals, contracted MRR, invoices, expenses, payment-provider settlement, tax and recognized revenue need durable source-of-truth tables **inside each product**. They cannot be derived safely from the manual approval table. These should be added as dedicated signed financial events with original payment references and independent idempotency keys.

## Refund export extension (AutoResponse-owned, additive)

`GET /api/internal/group-finance/v1/refunds` uses the **same service Bearer token** and
`from` / `after` / `limit` pagination as collections. Only successful, completed
EGP refunds are returned. `periodBasis=REFUND_COMPLETION_UTC`. Each event has
`eventType=REFUND_CONFIRMED`, `sourceEntity=BILLING_REFUND`, stable `sourceEntityId`
(RefundID), `sourceVersion=1`, `originalPaymentRequestId`, `sourceTenantId`,
`occurredAtUtc`, and **positive** `amountMinor`. No customer PII or transfer
reference is exposed.

**Group consumer requirements (must be implemented and verified in DRVO Tech):**
1. Import collections and refunds as distinct, immutable facts; dedupe on
   `(productId, sourceEntity, sourceEntityId, sourceVersion)`.
2. Validate that `originalPaymentRequestId` belongs to the same product and tenant,
   and that a refund never exceeds the associated approved collection.
3. Compute **net collections = approved collections − successful refunds**, once each.
   Preserve separate gross and refund metrics; do not add snapshot gross totals to events.
4. Persist each feed's cursor **atomically with imported events** and reconcile by
   payment/refund completion UTC respectively. Re-poll overlaps safely.
5. Verify replay, failed HTTP requests, duplicate deliveries, wrong tenant references,
   full refund, and stale-feed behavior before enabling refunds.

**Activation is deliberately fail-closed:**
- If `DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED=1`, admin refunds remain blocked.
  The signed SaaS Financial Hub event endpoint still accepts `payment.confirmed`
  only; this read-only feed is not a replacement for a Hub `refund.confirmed` event.
- If `DRVO_GROUP_FINANCE_EXPORT_TOKEN` is configured, admin refunds remain blocked
  until the central consumer is deployed and verified **and** the AutoResponse server
  explicitly sets `DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY=1`.
- Never set this flag based only on an HTTP 200 from the new endpoint; first prove
  that the consumer ingests refunds and reconciles net totals correctly.
- If neither central integration is configured, existing product-local manual refund
  operations retain their previous behavior.

This extension prepares the product-owned refund source for central consumption.
**It does not claim the DRVO Tech central integration is finished.**
