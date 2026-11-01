# Pricing V1 rollout (DRAFT — not live)

Approved proposed prices: Free (30 AI replies once / 7 days), Starter 299 EGP (750), Growth 599 EGP (2,500), Business 1,199 EGP (6,000). Annual full upfront prices 2,990 / 5,990 / 11,990 EGP, with monthly quota resets even for annual contracts. One WhatsApp number on all plans. Multi-number support is COMING SOON, not purchasable.

## Safe activation gates
1. Audit existing payment, subscription, entitlement, billing, migration, AI worker and WhatsApp runtime flows.
2. Measure real AI, voice, runtime and per-tenant support costs; validate full-quota gross margins before activating any prices.
3. Introduce versioned database catalog and migration preserving existing paid customers without unilateral term changes.
4. Implement atomic reservation/settlement for AI reply credits, idempotency, free one-time quota / 7-day expiry, team seats, knowledge quotas and voice minutes.
5. Separate subscription add-ons from one-time credits, handle refund/reversal, invoicing and reconciled billing.
6. Build dashboard pricing, unified plan/usage/invoice interface, admin controls and alerts.
7. End-to-end tests: payment approval, concurrency, retries, depleted credits, annual renewal, upgrades and scheduled downgrades, and manual refund.
8. Gate rollout behind a disabled-by-default feature flag and stage it with rollback.

This commit adds a typed proposal only. It MUST NOT alter live entitlements, prices, checkout, or existing customers.
