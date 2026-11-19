# DRVO AutoRespond — WhatsApp OTP API (CUT CLUB integration)

## Purpose
DRVO issues and verifies one-time codes using the WhatsApp account *already connected* to the authenticated business. This is a server-to-server feature, not a public browser API. For CUT CLUB, the paired Cut Salon ERP / Casher server calls DRVO; CUT CLUB only activates the corresponding phone after DRVO confirms verification.

No Meta Cloud API migration or additional WhatsApp account is required. Delivery uses the existing BAILEYS runtime via sendAccountMessage.

## Deployment prerequisites
1. Apply database migration `106_external_whatsapp_otp.sql` before traffic.
2. Set `OTP_HMAC_SECRET` to a cryptographically random secret of at least 32 bytes on the DRVO server; share it with **no** application or browser. Back it up securely: rotating it invalidates outstanding 5-minute codes.
3. Keep existing DRVO→ERP pairing active. The current `inboundApiKey` from pairing is used by the trusted ERP backend for these endpoints; never publish it to front-end JS.
4. Ensure the business's WhatsApp account is connected (ACTIVE). If not, DRVO returns 409.
5. Deploy server and migration, then test with an authorized phone. The endpoints are **not enabled in production simply by merging** until migration, secret, and deployment are complete.

## 1. Request a code
```http
POST https://app.drvotech.com/api/external/v1/otp/send
Authorization: Bearer <DRVO_INBOUND_INTEGRATION_API_KEY>
Content-Type: application/json

{
  "phone": "01012345678",
  "purpose": "CUT_CLUB_SIGNUP",
  "requestId": "e2872d8a-1cd6-4b41-9cc4-fde1f1ea7252"
}
```

Successful response:
```json
{
  "challengeId": "cf15e238-2d67-40e9-8b3c-c6e3748d18ed",
  "status": "SENT",
  "expiresAtUtc": "2026-11-19T12:00:00.000Z",
  "resendAfterSec": 60,
  "idempotentReplay": false
}
```

Use the **same** requestId for network retries; DRVO will return the existing challenge without resending. Use a **new** requestId for a deliberate resend after cooldown.

## 2. Verify a code
```http
POST https://app.drvotech.com/api/external/v1/otp/verify
Authorization: Bearer <DRVO_INBOUND_INTEGRATION_API_KEY>
Content-Type: application/json

{
  "challengeId": "cf15e238-2d67-40e9-8b3c-c6e3748d18ed",
  "phone": "01012345678",
  "purpose": "CUT_CLUB_SIGNUP",
  "code": "123456"
}
```

Success:
```json
{ "verified": true, "phoneNormalized": "201012345678", "purpose": "CUT_CLUB_SIGNUP" }
```

CUT CLUB's server must tie the result to the same pending registration session and update the verified phone **on the backend**. The returned value is not a reusable verification token; never trust a client-supplied `verified: true`.

## Safeguards / semantics
- Random 6-digit codes, HMAC-SHA256 hashed with `OTP_HMAC_SECRET`, never stored in plaintext.
- 5-minute validity; 5 guesses max; successful verify consumes the code exactly once.
- One active code per business + phone + purpose; issuing a new one invalidates the old.
- Persistent SQL rate limits: 60 sec cooldown, 3 requests/hour and 10/day per business + phone + purpose, plus 100/hour per business.
- Multi-tenant isolation via the paired integration ID and the associated DRVO business ID. No `businessId` can be submitted by a caller.
- Outbound messages count against the business's WhatsApp outbound usage entitlement.
- Normalization accepts international numbers and Egyptian local mobile numbers beginning 01.
- Codes must never appear in logs, events, analytics, inbox previews of *API* responses, or persisted request payloads.
- OTP is a transactional/account-access message, not marketing opt-in; **never** infer campaign consent from it.
- For an ambiguous WhatsApp send/timeout, a challenge may be in UNKNOWN state. Retries must reuse the same requestId, not create a second send. The customer may still verify a received code; do not automatically resend.
- Since Baileys uses WhatsApp Web, delivery is subject to WhatsApp availability and account health; sending is not equivalent to handset delivery.
- The first version is limited to active DRVO_ERP integration keys. A general third-party API-key management UI and billing can be added separately.

## Common errors
- 403 invalid/disabled integration key
- 400 INVALID_PHONE, INVALID_OTP
- 409 WHATSAPP_NOT_READY, OTP_NOT_READY, OTP_REQUEST_ALREADY_USED, REQUEST_ID_CONFLICT
- 410 OTP_EXPIRED
- 429 RATE_LIMITED (with Retry-After header)
- 503 OTP_DELIVERY_FAILED / gateway failure / quota or storage errors
