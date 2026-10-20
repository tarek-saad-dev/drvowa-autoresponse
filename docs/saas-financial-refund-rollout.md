# AutoRespond refund capture rollout

The source is `drvo-autorespond`. Its immutable Hub activation is
`2026-10-18T04:59:46.821598Z`; configure this exact value. Migration 033 adds
refund identity to the existing outbox. It must be applied after 029–032, with
refund capture still disabled. Preserve the existing payment capture setting
and `payment.confirmed` worker. Do not run it against production as part of
local verification.

## Activation sequence

1. Review the migration, Hub refund contract, isolated SQL test results, and
   existing payment capture/reconciliation status. Back up the SQL database and
   verify the migration deployment mechanism before scheduling production work.
2. Deploy code and migration 033 with `DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED=0`.
   Keep refund actions blocked while the existing payment capture flag is on.
   Verify the outbox constraints, immutability trigger, filtered refund indexes,
   and unchanged payment-confirmation delivery.
3. Verify the configured source key, exact activation, capture cutoff, dedicated
   Hub credential, delivery worker, and reconciliation timer. Confirm a payment
   approved after the cutoff has its original outbox row and has been accepted
   at the Hub. Verify the Hub accepts `payment.refunded` for this source using
   a separately approved safe test operation if available; do not fabricate a
   production refund.
4. Verify the independent group-finance refund consumer contract if its export
   token is configured. Ensure the Central Hub's SaaS ledger uses accepted push
   events only: the `REFUND_CONFIRMED` pull feed must not also be booked there.
5. Set `DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED=1` in a coordinated cutover.
   Keep `DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED=1`. No Hub HTTP call occurs in the
   billing transaction; each successful refund requires an outbox insert in the
   same SQL transaction. Old payments without a captured original are blocked
   from refund confirmation and need a separate reviewed business process.
6. For the first legitimate successful refund, verify one `SUCCEEDED` refund,
   one immutable `payment.refunded` outbox row, accepted worker settlement, one
   source-scoped Hub refund linked to the original payment, unchanged gross,
   and net = gross minus refunds. Run full inventory reconciliation and inspect
   the durable findings/cases. A clean scan is
   `OBSERVED_MATCHES_PROVISIONAL`, never certified completeness.

## Incident handling

For a new capture failure, turn the refund capture flag off to block further
refund transitions; do not turn off the payment capture flag as a substitute.
Keep the worker processing already captured events unless credentials or Hub
responses require operator intervention. Investigate `DEAD`, pending, and
reconciliation cases without deleting evidence or modifying accepted Hub facts.
If delivery must pause, disable delivery while retaining the outbox; restart
only after the cause is fixed. A response lost after Hub acceptance is retried
with the same event and fresh signing metadata. Do not backfill historical
refunds without an approved identity, cutoff, and double-counting design.
