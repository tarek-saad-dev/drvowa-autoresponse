# Migration Release Notes

## Latest: `012_password_reset_tokens.sql`

Adds `TblPasswordResetToken` for durable hashed reset tokens.

- Idempotent `IF OBJECT_ID … IS NULL`
- Stores SHA-256 token hashes only (never raw tokens)
- Used by password-reset request/complete APIs

## `011_usage_counter_backfill.sql`

Backfills missing `TblUsagePeriodCounter` rows from `TblUsageEvent` for:

- `AI_REPLY_GENERATED`
- `WHATSAPP_OUTBOUND_MESSAGE`

Grouped by BusinessID + EventType + UTC calendar month with `SUM(Quantity)`.

**Critical:** existing counter rows are **not** overwritten (preserves RESERVED/UNCERTAIN commitments).

## `010_plan_entitlements_and_usage_counters.sql`

Plan limits, usage counters, reservations, subscription status foundation.

## Upgrade path

Clean DB: `001` → `012` via `npm run db:migrate`.

Upgrade from pre-010: apply `010`, `011`, `012` in order.

## Verification

- Unit: `tests/unit/migration-011-usage-counter-backfill.test.ts`
- Integration: `tests/integration/migration-011-backfill.test.ts`
- Manual: `npm run db:status` after migrate
