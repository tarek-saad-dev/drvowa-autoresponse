# V1 payment intent staging integration

Migration 092 adds a nullable catalog-version snapshot to manual-payment requests. The request already snapshots amount, plan and currency. The server-side create intent now chooses the V1 quote only when `isPricingV1PaymentEnabled()` permits it. For now this is explicitly **disabled in production**; existing behavior is unchanged.

**Do not enable even in staging before running migration 092**. The insert requires the new nullable column. For staging, align price cards with the server quote before enabling: the existing billing UI still derives annual totals from legacy monthly DB prices. The preview remains non-purchasable.

Future work: safe per-tenant pricing enrollment, display consistency, entitlement migration for FREE/AI/knowledge/team quotas, SQL-backed approval and invoice tests, and production rollout. No active subscriptions or old payment amounts are rewritten.
