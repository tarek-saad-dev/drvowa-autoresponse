# Rate Limits (V1)

In-memory sliding window (`src/lib/security/rate-limit.ts`). Suitable for single-process V1.
Replace with shared store for multi-instance production.

| Key pattern | Limit | Window | Applied on |
|-------------|-------|--------|------------|
| `login:{ip}:{email}` | 10 | 15 min | `POST /api/auth/login` |
| `signup:{ip}` | 5 | 60 min | `POST /api/auth/signup` |
| `password-reset:{ip}:{email}` | 5 | 60 min | `POST /api/auth/password-reset/request` |
| `password-reset-complete:{ip}` | 5 | 60 min | `POST /api/auth/password-reset/complete` |
| `manual-send:{businessId}` | 30 | 5 min | `POST …/messages` (manual reply) |
| `wa-connect:{businessId}` | 20 | 15 min | `POST /api/channels/whatsapp/connect` |

**Not applied** to trusted WhatsApp runtime ingest (server-to-server auth).

Response: HTTP 429 + `Retry-After` + `{ code: "RATE_LIMITED", retryAfterSec }`.
