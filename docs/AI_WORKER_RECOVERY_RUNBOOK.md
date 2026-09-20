# AI Worker Recovery Runbook

Read-only operations for DRVOWA AI reply jobs (`TblAiReplyJob`).
No customer message bodies, phones, `GeneratedReplyText`, or `LeaseToken` in ops output.

## Inspect (safe)

```bash
npm run ai:worker:status
```

Optional tenant filter:

```bash
npx tsx scripts/ai-worker-status.ts --business=<BusinessID>
```

Fields: pending / eligible / processing / expired leases / unknown-outbound PROCESSING /
recent SENT+FAILED (24h) / SAFETY_PAUSED conversations / ages.

May also inspect (aggregates only): `LeaseOwner`, `LeaseVersion`, `LeaseUntilUtc`,
`AttemptCount`, `OutboundUnknownCount` — never `LeaseToken`.

## Normal restart

1. Stop worker (SIGTERM).
2. Worker stops **new claims** immediately.
3. Active jobs keep **heartbeats** while they still own a live lease.
4. Clean drain → pool closes → exit 0.
5. If shutdown deadline hits: process may exit without marking jobs FAILED.
   Jobs remain PROCESSING until lease expiry, then reclaim with a **new** token.

## Expired PROCESSING lease

- Another worker `claimNextJob` reclaims with new `LeaseToken` / `LeaseVersion`.
- Old token cannot complete / extend / persist / defer (requires live unexpired lease).
- If `GeneratedReplyText` exists → reuse; Gemini is not called again.
- Outbound key remains `ai:<jobId>`.

## OUTBOUND_RESULT_UNKNOWN

Atomic path:

1. Increment `OutboundUnknownCount` in SQL.
2. Counts 1–2: defer retry (2s / 5s), **clear LeaseToken/Owner**, keep PROCESSING.
3. Count 3: **one transaction** → job FAILED (`OUTBOUND_RESULT_UNKNOWN_FINAL`) + conversation `SAFETY_PAUSED`.

Claim crashes alone do **not** burn the unknown budget (`AttemptCount` ≠ unknown budget).

## SAFETY_PAUSED from ambiguous outbound

Investigate runtime / WhatsApp health before resume.
Do not mass-resume.

## Gemini / runtime failures

- Gemini empty/timeout/failed → job FAILED (generation terminal today; no auto-retry).
- Runtime `NOT_READY` / `LOGGED_OUT` / `NOT_STARTED` → definitive FAILED (not unknown).
- Timeout / unavailable after a send may have started → treat as ambiguous unknown.

## Operator NEVER

- Manually set job Status to SENT
- Change or regenerate idempotency key (`ai:<jobId>` is stable)
- Clear ambiguous PROCESSING rows to “unblock” the queue
- Mass-resume SAFETY_PAUSED without investigation
- Log or export GeneratedReplyText / phones / LeaseToken in ops tooling

## Lease fencing reminder

Authoritative mutations require:

`Status=PROCESSING` AND `LeaseToken=@token` AND `LeaseUntilUtc >= now`

Expired leases cannot be revived by heartbeat even if unreclaimed.
