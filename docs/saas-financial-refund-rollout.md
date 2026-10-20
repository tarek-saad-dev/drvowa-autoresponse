# AutoRespond refund capture activation

The reported production baseline at commit `796b46f` is: migration 033 applied,
payment capture enabled, delivery worker active, scheduled reconciliation
successful, and refund capture **not enabled**. Recheck each fact at cutover.
The source key is `drvo-autorespond`; its immutable Hub activation timestamp is
`2026-10-18T04:59:46.821598Z`. Never round or replace it. The separately
approved capture cutoff must also be verified. Existing pre-cutoff payments
without a captured original payment event cannot be refunded through this path.

## Before enabling refunds

1. Deploy the smoke correction through the normal reviewed deployment. The
   standalone billing smoke must read `/etc/drvowa/financial-hub.env` as the app
   service does. It fails if that file is unreadable or active payment capture
   configuration is missing/invalid. Do not print the file or credentials. Check
   the app unit's `EnvironmentFiles` metadata with
   `systemctl show drvowa.service -p EnvironmentFiles` and inspect any overrides
   with authorized operations access; the smoke and service must use the same
   financial values.
   The deployment smoke should report `refundCaptureEnabled: false` and
   `refundActionsEnabled: false` while capture is deliberately disabled. A
   `PASS` here verifies read-only controls and policy inputs, **not** worker
   health, Hub acceptance, or reconciliation completeness.
2. Verify migration 033 is recorded as applied after 029–032. Check the
   migration and isolated SQL CI evidence. Do not reapply it or alter accepted
   financial facts. Keep `DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED=1`; confirm
   `DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED` is absent or `0` in the effective
   app environment.
3. Confirm Hub source `drvo-autorespond` is active with the exact activation
   timestamp above, the approved capture cutoff, source-scoped credential, and
   unchanged `payment.confirmed` delivery. Check
   `drvowa-financial-worker.service` is active with stable restart count and
   review its bounded error logs. Check `drvowa-financial-reconcile.timer` is
   scheduled, its service's latest exit succeeded, and the latest persisted run
   status, age, findings and scope. `OBSERVED_MATCHES_PROVISIONAL` is only a
   clean observation, never certified completeness; `PAUSED` or
   `SCAN_INCOMPLETE` needs investigation. Review open investigation cases.
4. Review the read-only outbox backlog by source and event type. Investigate
   `DEAD`, overdue `PENDING`, and expired `LEASED` events before cutover.
   Preserve event IDs and immutable payloads.
5. Verify the separate group-finance pull consumer configuration. Its
   `REFUND_CONFIRMED` feed and snapshot are read-only exports, not Hub HMAC
   ingestion. The checked-out Hub SaaS reporting service sums accepted
   `saas_financial_events` by type, but that cannot establish how every
   external production consumer books pull refunds. With authorized read-only
   access, inspect active import jobs, their destinations and source mapping.
   Confirm that no pull refund or snapshot amount is also booked into the Hub
   SaaS ledger or added to the same net total as accepted `payment.refunded`.
   Confirm DRVO Coach and AutoRespond remain distinct sources. If the export
   token is configured, verify the existing independent
   `DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY=1` requirement is genuinely met;
   a flag alone is not evidence of consumer behavior.

## Coordinated cutover and first real refund

6. After those gates pass, an authorized operator sets only
   `DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED=1` in the protected financial
   environment, preserving ownership and permissions, then restarts
   `drvowa.service` in the approved window. Do not rotate credentials or change
   payment capture. Verify the service is healthy and that the production
   billing smoke now reports `refundCaptureEnabled: true` and
   `refundActionsEnabled: true`. If the pull consumer is configured but not
   ready, actions must remain blocked. This step permits business actions; it
   does not itself prove the worker or Hub accepted a refund.
7. Wait for the first **legitimate** successful refund on a payment eligible
   under the capture cutoff. Do not create a synthetic production transaction.
   Verify exactly one `SUCCEEDED` local refund with the correct original
   `PaymentRequestID`, amount, currency and completion time; one immutable
   `payment.refunded` outbox event with matching `RefundID`, `SourceRefundID`,
   original `SourcePaymentID` and payload; and accepted delivery settlement.
   Match the source-scoped Hub accepted refund to that same event and original
   payment. Gross collections remain unchanged; net collections equal gross
   minus each successful refund once.
8. Run or await a full inventory reconciliation after Hub acceptance. Inspect
   the persisted run, findings and cases as well as the worker backlog. A clean
   full run is `OBSERVED_MATCHES_PROVISIONAL`; it is not proof of historical or
   future completeness. A windowed scan or incomplete traversal cannot close
   a missing-Hub question. Retain any investigation evidence.

## Read-only operational checks

Use a restricted operations account and avoid selecting outbox `Payload`,
secrets, raw request bodies, or customer details. Check service state with
`systemctl is-active drvowa-financial-worker.service`,
`systemctl show drvowa-financial-worker.service -p NRestarts --value`,
`systemctl list-timers drvowa-financial-reconcile.timer`, and
`systemctl show drvowa-financial-reconcile.service -p Result -p ExecMainStatus`.
Check the latest bounded worker and reconciliation log entries with `journalctl -u`.
For a controlled read-only smoke rerun from `/home/drvowa/app`, use the same
`node --env-file-if-exists=.env.production.local --env-file=/etc/drvowa/financial-hub.env --import tsx scripts/billing-production-smoke.ts`
command as deployment, with an account already authorized to read the protected
environment file. Do not change file permissions to make this check pass.
For persisted evidence, filter by the verified source key:

```sql
SELECT TOP (5) RunID, Status, StartedAtUtc, CompletedAtUtc, PagesRead,
       EventsRead, ErrorCode, AcceptedFromUtc, AcceptedBeforeUtc
FROM dbo.TblSaasFinancialReconciliationRun
WHERE SourceKey = N'drvo-autorespond'
ORDER BY StartedAtUtc DESC;

SELECT COUNT_BIG(*) AS FindingsInRun
FROM dbo.TblSaasFinancialReconciliationFinding
WHERE RunID = @verifiedRunId;

SELECT DeliveryState, EventType, LastErrorCode, COUNT_BIG(*) AS Events,
       MIN(NextAttemptAtUtc) AS OldestNextAttemptUtc,
       MIN(LeaseUntilUtc) AS OldestLeaseUntilUtc
FROM dbo.TblSaasFinancialOutbox
WHERE SourceKey = N'drvo-autorespond'
GROUP BY DeliveryState, EventType, LastErrorCode;

SELECT Code, InvestigationState, COUNT_BIG(*) AS Cases
FROM dbo.TblSaasFinancialReconciliationCase
WHERE SourceKey = N'drvo-autorespond'
GROUP BY Code, InvestigationState;
```

After the first refund, inspect its source fact, outbox event, accepted Hub
event and run-specific finding membership using restricted read-only queries
and the verified refund/event IDs. A local `ACCEPTED` state and a clean scan
are separate observations; inspect both.

## Incident response

If capture or acceptance is uncertain, set the refund capture flag to `0` and
restart only the app service through the approved procedure. This blocks new
refund transitions; it does not undo completed refunds. Keep the financial
worker processing already captured events unless its own security or delivery
condition requires a controlled pause. Investigate `DEAD`, pending, and
reconciliation cases without deleting evidence, rewriting outbox payloads,
changing accepted Hub records, or backfilling historical refunds. A response
lost after Hub acceptance is retried with the same immutable event and fresh
signing metadata. Coordinate any replay or manual recovery separately.
