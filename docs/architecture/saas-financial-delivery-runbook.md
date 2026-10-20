# SaaS Financial Hub delivery worker

This worker is a separate process from the AI worker. All three financial flags default to `0` in code. The reported production worker and payment capture are active; verify current service state and source configuration before refund activation. The [refund activation checklist](../saas-financial-refund-rollout.md) covers that cutover.

## Configuration and startup

Use the Phase 1 `DRVO_SAAS_FINANCIAL_*` configuration described in [the integration contract](saas-financial-hub-integration.md). For delivery, `CAPTURE_ENABLED=1`, `DELIVERY_ENABLED=1`, `SOURCE_STATUS=active`, and all verified source boundaries and endpoint are required. The endpoint must be the exact HTTPS events URL. `CREDENTIAL_KEY_ID` must identify an active, source-scoped Hub credential. Set `CREDENTIAL_SECRET_REF=env:YOUR_DEDICATED_SECRET_VARIABLE` and inject that variable into the worker's server environment. `secret://` references are rejected until a secret-manager resolver is implemented. Never point to `DRVO_GROUP_FINANCE_EXPORT_TOKEN` or reuse its value. The service environment overrides the local `.env` file; keep credentials out of logs and version control.

On Node 22, run `npm run saas-financial:worker` as a separately supervised service. `DRVO_SAAS_FINANCIAL_WORKER_BATCH_SIZE` defaults to 10 and must be 1–100. `DRVO_SAAS_FINANCIAL_WORKER_POLL_MS` defaults to 5000 and must be 100–60000. The worker is sequential, so batch size limits claims per poll and never creates HTTP fan-out. Each request has a five-second connection deadline, 15-second total deadline, and 16 KiB response cap. Its lease lasts 60 seconds. Ensure the worker and Hub clocks are synchronized within the Hub's five-minute signing window.

SIGTERM or SIGINT stops new claims, finishes the current bounded request and database update, and closes the SQL pool. A hard crash leaves a lease to expire. The next worker retries the same immutable event ID and body with a fresh timestamp and nonce. Do not run the AI worker command for this queue.

## Backlog and review

Use a read-only SQL account for inspection. Filter by the configured source key and inspect counts and oldest schedules without printing `Payload` or credentials:

```sql
SELECT DeliveryState, LastErrorCode, COUNT_BIG(*) AS Events,
       MIN(NextAttemptAtUtc) AS OldestNextAttemptUtc,
       MIN(LeaseUntilUtc) AS OldestLeaseUntilUtc
FROM dbo.TblSaasFinancialOutbox
WHERE SourceKey = @verifiedSourceKey
GROUP BY DeliveryState, LastErrorCode;
```

`PENDING` is due at `NextAttemptAtUtc`; `LEASED` is in flight and becomes claimable after expiry; `ACCEPTED` has a verified matching 201 or 200 duplicate response and `AcceptedAtUtc`; `DEAD` requires operator investigation. `LastErrorCode` is a bounded category without response bodies. Network uncertainty, 5xx, and 429 return to `PENDING` with exponential backoff, jitter, and a maximum one-hour delay. There is no automatic deletion or maximum-attempt drop. 401/403, 409, 422, redirects, and invalid success responses enter `DEAD`. Correct the underlying credential, source state, identity conflict, or payload issue before a controlled retry; preserve the original row and event ID. A 201/200 may have been accepted even when the local acknowledgement failed; Hub duplicate acceptance resolves this safely.

For manual recovery after investigation, update only mutable delivery columns with a reviewed, source-scoped procedure. Clear `LeaseOwner` and `LeaseUntilUtc`, set `DeliveryState='PENDING'`, set `NextAttemptAtUtc=SYSUTCDATETIME()`, and retain immutable facts and `AttemptCount`. Record the operator's reason outside the outbox. Do not reset a live lease or overwrite an accepted row. Repeated authentication failures should stop operational retries until credentials and source state are corrected.

## Rotation and rollout

Issue a replacement Hub credential for the same active source using the Hub's restricted credential command. Inject the new key ID and dedicated secret in the worker service, restart it, verify acceptance or idempotent duplicates, then revoke the old key after overlap. Never copy a signing secret into this repository. Before enabling delivery for a new source, verify Hub replay-cache sharing, TLS proxy configuration, source status and activation boundary, time sync, isolated SQL migrations, backlog alerts, and the approved capture boundary. Reconciliation remains a separate operational control.
