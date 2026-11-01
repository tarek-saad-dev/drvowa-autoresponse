# Pricing V1 integration audit — 2026-10-27

Existing implementation uses `TblPlan` codes `FREE`, `STARTER`, `PRO`, `BUSINESS` and `TblSubscription`. The proposed Arabic-facing "نمو" plan must retain internal `PRO` to avoid breaking lifecycle and scheduled downgrade logic.

Relevant modules verified:
- `src/modules/billing/repository.ts`: authoritative `TblPlan`, active plan listing, subscriptions and SQL mappings.
- `src/modules/billing/subscription-lifecycle.ts`: verified/idempotent provider webhook transitions.
- `src/modules/billing/subscription-entitlement-lifecycle.ts`: paid expiry, five-day grace, fall back to FREE.
- `src/components/dashboard/billing-plans-client.tsx`: monthly/annual manual payment initiation.
- `src/constants/billing.ts`: existing plan codes.

**Do not replace live `TblPlan` rows yet.** Current schema only models monthly reply quotas and a single price column; the proposed seven-day one-time trial and purchased add-ons need durable grants, consumption ledgers, atomic counters, purchase records and pricing snapshots. UI-only/free-plan changes without these would allow quota resets or create payment mismatches.

Next implementation: additive SQL migration and isolated metering tests, then server-side feature flags and checkout integration. Production activation remains blocked until SQL-backed tests and current-tenant cost audit pass.
