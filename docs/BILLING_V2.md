# Billing V2 implementation and release gate

## Scope and policies

This change keeps AutoResponse as the source of truth. It extends manual InstaPay billing; it does not claim an online payment/refund provider is connected.

- Monthly and annual purchases. Annual price is twelve current monthly prices, with no invented annual discount. The request snapshots the amount and interval.
- Immediate paid upgrade starts a fresh monthly/yearly period at approval, preserving the existing no-proration policy. UI discloses it. A future prorated upgrade policy needs separate commercial approval.
- A lower paid plan is prepaid and scheduled for the current period end. The higher plan remains usable until then. A paid scheduled change cannot be silently dropped; refund its payment first.
- Same-plan early renewal extends the existing end. Payment during grace starts a new period at approval. Grace is exactly five elapsed days, retaining existing ACTIVE paid access; then FREE is created without deleting customer data.
- Admin discounts apply to an OPEN invoice before customer transfer confirmation. They require a reason and are one-time. 100% moves the request to review, settles as WAIVED on approval and produces no cash receipt.
- Full manual refunds have PENDING / SUCCEEDED / FAILED states. Only actual transfer confirmation with a reference subtracts cash and cancels the linked current subscription. A refund for a scheduled lower plan cancels that scheduled plan; it does not cancel the still-paid higher plan. An old payment cannot cancel a newer subscription.
- Separate cancellation without refund supports immediate cancellation and end-of-period scheduling. Canceling a scheduled cancellation is supported. Partial refunds are not in this iteration.
- Invoice comes before transfer; receipt is created atomically with approval and subscription activation. Original receipts remain after refunds. Gross collections and refund movements are separate; `/admin/financials` shows net cash by currency.
- Legacy historical approvals are not backdated or assigned fabricated invoice/receipt dates. Their refund path requires an explicitly reviewed historical reconciliation migration.

## Implementation map

| Area | Implementation |
| --- | --- |
| Schema | `db/migrations/032_billing_documents_foundation.sql` |
| Money validation | `src/modules/billing/ledger-policy.ts` |
| Invoice and receipt issuance | `src/modules/billing/documents.ts` |
| Approval and annual period | `manual-payment-service.ts`, `subscription-period.ts` |
| Deferred changes | `scheduled-changes.ts`, `subscription-entitlement-lifecycle.ts` |
| Discounts/cancellation/refunds | `admin-operations.ts`, existing admin payment route |
| Renewal invoices and notification delivery | `renewal-worker.ts`, `scripts/billing-maintenance.ts` |
| Customer documents | `/dashboard/billing/documents` |
| Admin operations | `/admin/payments`, select a payment; pre-transfer tab for discounts |
| Net collections/refund list | `/admin/financials` |

## Safety review

Webhook event text no longer guesses entitlement status (e.g. `invoice.unpaid` and `refund.succeeded` must not activate subscriptions). A verified adapter must supply `mappedStatus`. Dedup marker and subscription mutation share one SQL transaction. A failed mutation rolls back the marker for retry. Event ID reuse with different payload is rejected. External subscription lookup is provider-scoped and never falls back to an arbitrary business subscription when the external ID is unknown.

Manual payment mutation paths lock the business before payment/subscription rows, serializing approval, discounts, refunds and maintenance within a tenant. Unique invoice-per-payment and receipt-per-invoice keys provide a second guard against duplicate issuance. Client-computed amounts are never accepted. Tenant billing writes require OWNER or ADMIN; platform actions require the existing platform-admin gate.

The SaaS Financial Hub integration now has a transactional `payment.refunded` outbox path. It remains disabled by default through `DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED=0`; enabling it requires migration 033, the verified source configuration, and the gates in [the refund rollout](saas-financial-refund-rollout.md). The separate group-finance pull refund feed retains its independent consumer readiness requirement. Gross collections remain unchanged; net collections subtract successful refunds once.

## Historical Billing V2 release gate — not a production deployment

1. Use Node 22 (project requirement). Local validation here used Node 24, so Node 22 CI is required.
2. Run the new **Billing SQL Server checks** workflow against its disposable SQL Server database. It applies all migrations and exercises transactions. Local unit/build success is not a substitute for this check.
3. Back up production, drain billing writes, apply migration 032 before deploying the matching application. Keep the schema on app rollback; do not delete financial records.
4. Run `npm run billing:maintain` hourly from the same application directory and environment. It processes up to 100 renewal/expiry candidates per invocation; repeat/schedule more often for larger volumes. Entitlement reads also apply expiry/scheduled transitions, but invoices depend on this job.
5. Set `BILLING_EMAIL_NOTICES_ENABLED=1` only when the existing SMTP/Resend configuration is ready. Renewal invoices are generated within the final three days. Disabled email does not pretend delivery succeeded. Inspect `NoticeState` for PENDING, SENDING, SENT and UNKNOWN. Ambiguous failures/crashes need operator review before retry, to avoid duplicate notices.
6. Smoke as owner/member/platform admin: create annual request, discount, approve twice, inspect invoice/receipt, schedule lower plan, run maintenance at due date, exercise grace expiry, confirm full refund twice, and confirm tenant isolation. Printing uses the browser's Print/Save PDF facility.
7. Confirm the no-proration upgrade and full-only refund policies before customer rollout. Neither live database migration nor real money movement has been performed in this workspace.

## Known verification limits

No SQL Server credentials/runtime were configured locally. Integration tests therefore skip locally and must pass in the disposable SQL CI job before merge. An independent reviewer attempt was unavailable due to the session usage limit; this remains a review gate. No production schema changes, external customer notices or production deployment were performed.
