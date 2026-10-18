# DRVO AutoRespond → DRVO Tech SaaS Financial Hub

## Phase 1 state

This phase defines a pure payment contract and strict, inactive configuration. It creates no financial event, database table, HTTP request, secret, scheduler, or Hub source. Capture, delivery, and reconciliation default to `0` (off). The DRVO Tech AutoRespond source is currently designated disabled; repository defaults do not prove live database state. No activation timestamp or capture cutoff is assumed.

The existing [group-finance pull export](group-finance-v1-sync-runbook.md) and its `DRVO_GROUP_FINANCE_EXPORT_TOKEN` setting remain separate. Its snapshot and collections endpoints are unchanged. Its rounded report values are not inputs to this new contract. Do not add pull-export totals to Hub event totals.

## Verified Hub payment contract

Verified against DRVO Tech `app/Services/SaasFinancial/EventPayload.php`, `RequestAuthenticator.php`, `config/saas_financial.php`, `docs/saas-financial-api-v1.md`, and the financial migration in `/media/omar/New Volume/DRVO Tech/drvotech`.

`POST /api/saas-financial/v1/events` takes one JSON object, at most 8,192 bytes, with exactly these seven keys:

```json
{
  "schema_version": 1,
  "event_id": "autorespond:payment.confirmed:9e921ec1-e38e-4420-bd3e-6abeaef494f5",
  "type": "payment.confirmed",
  "source_payment_id": "autorespond:manual-payment:9e921ec1-e38e-4420-bd3e-6abeaef494f5",
  "amount_minor": 1,
  "currency": "EGP",
  "occurred_at": "2026-10-18T10:00:00Z"
}
```

The example time is illustrative, not an activation boundary. The actual source activation and capture cutoff must be supplied and verified before any later phase enables work.

| Field | Hub rule |
| --- | --- |
| `schema_version` | JSON integer `1` only. |
| `event_id`, `source_payment_id` | Case-sensitive ASCII, 1–150 characters, regex `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,149}$`. The Hub uniquely indexes each per authenticated source. |
| `type` | Literal `payment.confirmed` for this phase. The Hub also supports refunds, which are outside this scope. |
| `amount_minor` | Positive JSON integer from 1 through 1,000,000,000,000,000. No strings, fractions, exponents, zero, or negatives. The JavaScript representation must be a safe integer. |
| `currency` | Exact uppercase `EGP`, `USD`, or `SAR`, each with two minor-unit digits in current Hub config. AutoRespond's manual payment flow currently uses EGP. |
| `occurred_at` | ISO 8601 calendar date and seconds, explicit `Z` or numeric offset up to `±14:00`, at most six fractional digits. It must be at or after the source's immutable first Hub activation and no more than five minutes ahead of Hub time. The Hub normalizes to UTC microseconds. |

Unknown keys are rejected by the Hub, including a claimed source identity. The authenticated key chooses the source. Hub ingestion also rejects duplicate JSON keys. The Phase 1 object validator checks the exact field set; future raw-body handling must reject duplicate JSON keys before sending. Accepted retries reuse the same event identity, financial values, and occurrence time, with a fresh signing timestamp and nonce.

AutoRespond `TblManualPaymentRequest.PaymentRequestID` is a SQL `UNIQUEIDENTIFIER`. Both identity helpers validate a UUID and canonicalize it to lowercase. The fixed prefixes make the payment operation and event distinct; each ID is stable across retries and within the Hub's length and character rules. Future capture must snapshot both IDs once and never regenerate them from mutable billing data.

`TblManualPaymentRequest.Amount` is `DECIMAL(12,2)` with a positive constraint. The Phase 1 conversion accepts canonical SQL text with exactly two fraction digits, calculates minor units using `BigInt`, and converts to a JavaScript number only after checking safe and Hub bounds. Thus `0.01` EGP is `1` piaster and the SQL maximum `9999999999.99` is `999999999999` minor units. Future capture must select the decimal as text directly from SQL. It must not pass through the existing `number` mapping, floating-point arithmetic, or `Math.round`.

## Inactive configuration

The pure `readSaasFinancialConfig()` reader accepts these server-only environment variables. No `NEXT_PUBLIC_` setting is used. Setting a value here does not activate the Hub source or schedule work.

| Variable suffix after `DRVO_SAAS_FINANCIAL_` | Meaning and default |
| --- | --- |
| `ENDPOINT` | Exact HTTPS Hub events URL, with `/api/saas-financial/v1/events`; absent by default. |
| `SOURCE_KEY` | Verified Hub source key, at most 100 conservative ASCII identifier characters; absent by default. It is not sent in the event body. |
| `SOURCE_STATUS` | `disabled` by default; `active` requires operator verification of the Hub source and its first activation time. |
| `CAPTURE_ENABLED` | `0` by default; only literal `0` or `1` accepted. |
| `DELIVERY_ENABLED` | `0` by default; only literal `0` or `1` accepted. |
| `RECONCILIATION_ENABLED` | `0` by default; only literal `0` or `1` accepted. |
| `SOURCE_ACTIVATED_AT` | Hub's immutable first activation time in UTC ISO format; absent by default. |
| `CAPTURE_CUTOFF_AT` | Separately approved AutoRespond capture boundary in UTC ISO format, at or after source activation; absent by default. |
| `CREDENTIAL_KEY_ID` | Hub public key ID matching its header regex, absent by default. |
| `CREDENTIAL_SECRET_REF` | A reference such as `env:NAME` or `secret://path`, absent by default; never a raw HMAC secret. |

Malformed or inconsistent configuration throws before any future caller can proceed. Enabling any control requires a verified active source, endpoint, source key, activation time, and capture cutoff. Delivery and reconciliation also require capture and both credential references. These are conservative Phase 1 prerequisites, not a claim that source activation has occurred. No code consumes these controls yet. The current disabled source and absent boundaries leave every control off.

## Later phases and dependencies

1. **Phase 2 — durable capture:** Confirm the Hub source and exact first activation in the real environment; approve a separate capture cutoff. Read approved manual payment amount as SQL decimal text and approval time at an agreed fixed precision. Add a transactional outbox tied to the approval commit, with stable IDs and immutable payloads. Decide how SQL `DATETIME2` precision maps to the Hub's six fractional digits before capture, so retries cannot change `occurred_at`. Do not backfill pre-cutoff payments.
2. **Phase 3 — delivery:** Provision source-scoped, expiring Hub credentials through the restricted operator process. Resolve the configured secret reference only in a server worker. Sign the exact raw body with `POST`, path, ten-digit Unix timestamp, fresh 16–100-character URL-safe nonce, SHA-256 body digest, and HMAC-SHA-256. Use HTTPS, bounded retries, and Hub's 201/200 duplicate semantics; retain events on uncertain outcomes. Verify shared Hub replay cache and synchronized clocks.
3. **Phase 4 — independent reconciliation:** Consume the Hub's authenticated accepted-event inventory in bounded pages. Compare its decimal-string minor amounts, event and payment IDs, currency, and UTC occurrence times with durable local records. Treat discrepancies as investigations, not automatic corrections. Observe the Hub inventory's provisional upper ID and rescan windows rather than treating it as a permanent watermark.
4. **Phase 5 — controlled activation and operations:** Review live source status, activation/capture boundaries, credential rotation, privacy, monitoring, and recovery with operators. Enable capture first, then delivery, then reconciliation through separate controls after each gate passes. Preserve the group-finance pull export as its existing independent interface.

The Hub endpoint, source key, actual activation time, capture cutoff, credential references, precision policy, and live infrastructure checks remain external implementation dependencies. None is invented by this phase.
