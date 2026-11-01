# Pricing V1 presentation preview
Set `DRVO_PRICING_V1_PREVIEW=true` on a staging environment to review `/dashboard/billing/pricing-preview`. Default: redirects to existing billing page. Requires authenticated business membership. This route is informational ONLY: no purchase buttons, no new charges or modified entitlements, and no change to current billing UX.

Priority rollout after this preview: approval-backed prices in TblPlan, subscription snapshots, free one-time trial enforcement, credit purchase and expiry, full integration tests. Reserve/send/settle has been deferred by product direction; maintain idempotency on delivered AI replies and ensure quota checks before generation by existing consumption path.
