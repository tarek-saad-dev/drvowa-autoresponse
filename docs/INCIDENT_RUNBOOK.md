# Incident Runbook

## WhatsApp LOGGED_OUT

1. Confirm runtime status for the business connection (dashboard / status API).
2. Instruct operator to re-scan QR (relink) — do not reset auth from this app unless operator confirms.
3. AI outbound will fail with definitive `LOGGED_OUT` / `NOT_READY`; quotas for fresh RESERVED may release.
4. Existing conversations remain readable.

## Ambiguous outbound (AI or manual)

Symptoms: `OUTBOUND_RESULT_UNKNOWN`, `RUNTIME_TIMEOUT`, reservation → `UNCERTAIN`, conversation may be `SAFETY_PAUSED`.

Actions:

1. Do **not** auto-resend the same idempotency key blindly.
2. Check WhatsApp chat history / runtime logs for the provider message id.
3. If message **was** delivered: ensure DB message exists; consume/leave UNCERTAIN as designed; resume AI only after human review.
4. If message **was not** delivered: ops may release only when certain the side effect did not occur (rare; prefer leaving UNCERTAIN).

## AI worker stuck / lease fencing

See `AI_WORKER_RECOVERY_RUNBOOK.md`.

## Quota reservation inspection (ops)

```sql
SELECT TOP 100 BusinessID, EventType, ReservationKey, State, CreatedAtUtc, UpdatedAtUtc
FROM TblUsageReservation
WHERE State IN (N'RESERVED', N'UNCERTAIN')
ORDER BY UpdatedAtUtc DESC;
```

## Auth / session spike

1. Check rate-limit 429 responses on `/api/auth/login`.
2. Rotate compromised session by password reset (revokes all sessions) once email provider is live.
