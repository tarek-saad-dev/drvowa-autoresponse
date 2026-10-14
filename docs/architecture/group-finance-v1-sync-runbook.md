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
