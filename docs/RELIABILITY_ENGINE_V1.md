# DRVO AutoResponse — Reliability Engine V1

## Core contracts

1. WhatsApp Runtime supplies independent, bounded capture-receipt batches keyed by `(ChannelConnectionID, ProviderMessageID)`.
2. S2S accountKey is resolved to the tenant on the server; never trust an inbound BusinessID.
3. No provider message ID / content is treated as delivery proof without an explicit Runtime acknowledgment. The current receipt `DELIVERED` status means Runtime-to-SaaS HTTP acknowledgment, **not** delivered/read at the customer's device.
4. A customer inbound may be merged with adjacent inbound messages; evaluating each message as requiring an individual outgoing send creates fake failures. Detect only the latest actionable inbound tail.
5. A human takeover is eligible for resumption 30 minutes after **last actual human outbound**. Pure `MANUAL_PAUSE`, `ESCALATION`, and `SAFETY_PAUSED` are excluded. Unresolved `TblHumanEscalation` always blocks automatic handback.
6. Automatic handbacks set a fresh watermark: they **never** replay historical customer messages; only messages received after resumption become eligible.
7. A durable handback event is written in the same SQL UPDATE as the state transition. One event per actual timed return.
8. AI jobs with ambiguous WhatsApp delivery must not be retried with a new idempotency key.

## Current instrumentation

- `TblRuntimeInboundReceipt`: last status of capture proof from Runtime (v6/v7).
- `TblReliabilityIncident`: `RUNTIME_NOT_INGESTED`, `AI_REPLY_MISSING` with open/resolved lifecycle.
- `TblReliabilityHandoffReturn`: auto-resume event history, late/on-time measurement.
- `TblHumanEscalation`: notification, acknowledgment, and human-reply measurements.
- Dashboard: `/dashboard/reliability` scoped to authenticated active business.

## Escalation SLA semantics

- **Notified:** Runtime acknowledged sending the owner notification; no handset delivery promise.
- **Acknowledged:** A human explicitly confirmed receipt inside DRVO.
- **Answered:** evidence of a human-originated outbound after the escalation was opened.
- **Auto-resumed:** state transitioned to AUTO because the last human response was at least 30 minutes old, with no unresolved escalation.
- **Within SLA:** auto-resumed within 32 minutes of last human reply (30 min policy + 2 min scheduling tolerance).

## Monitoring limitations

- Runtime captures are not a complete independent WhatsApp server-side feed, especially during disconnections, crypto/LID failures, or missing events. Coverage is measured only against observed captures.
- The Runtime's spool retains a bounded sample of delivered records; this is not an eternal audit of all WhatsApp history.
- Model answer factuality and quality need a separately validated evaluation dataset and deterministic assertions for booking, prices, addresses and policies. V1 does not claim accuracy percentages.
- Watchdog records incidents but intentionally does not resend an ambiguous or failed outbound. v7 inbound, in contrast, retries safely with identical provider message IDs.
- No success percentage should be displayed with an empty denominator: use `—`.

## Incident response

Check `/dashboard/reliability`, then inspect Runtime inbound delivery stats, last AI job/error code, session/worker health, and message trace. Resolve uncertain WhatsApp sends manually only after checking actual chat delivery. Avoid synthetic tests on customer numbers.
