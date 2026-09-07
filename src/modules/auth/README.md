# Authentication approach

## Why bcryptjs

Password hashing uses **bcryptjs** at cost factor **12**.

- Mature, widely reviewed password hashing — not a custom scheme
- Pure JS (no native build tooling on Windows/Linux deploy targets)
- Adaptive cost; 12 is a solid default for interactive login latency

## Why opaque server-side sessions (not JWT-in-cookie)

Session tokens are random opaque values (`crypto.randomBytes(32)` → base64url).
Only a **SHA-256 hex hash** is stored in `TblSession`.

This was chosen over JWT-in-cookie because:

1. **Immediate revocation** — logout / compromise sets `RevokedAtUtc`; JWT cannot be revoked without an extra denylist (which becomes a session store anyway)
2. **No custom crypto / signing secrets** for auth tokens — avoid rolling JWT verification edge cases
3. **Active workspace** (`ActiveBusinessID`) lives with the session row and can change without re-issuing signed claims
4. Cookie carries only the opaque token (`drvowa_session`, httpOnly, `SameSite=Lax`, `Secure` in production)

Expiry: **14 days** from creation.
