# Rollback Runbook

## Principles

1. Prefer rolling the **application** back to the previous known-good build.
2. Do **not** casually reverse SQL migrations that already wrote production data.
3. Never wipe WhatsApp sessions to “fix” an app rollback.

## App rollback

1. Stop AI worker (drain).
2. Redeploy previous image/build SHA.
3. Restart AI worker.
4. Verify `/api/health?ready=1`.

## Migration rollback limitations

| Migration | Forward-only notes |
|-----------|--------------------|
| 010 entitlements | New tables/columns — leaving them is usually safe if app is older |
| 011 counter backfill | INSERT-only; no undo needed |
| 012 password reset | Table can remain unused by older app |

If a forward migration is incompatible with old code, deploy a hotfix forward instead of destructive DROP.

## Quota / ambiguous outbound

If rollback happens mid-outbound:

- Reservations may be `RESERVED` / `UNCERTAIN`.
- Do not mass-release. Inspect with ops SQL (see incident runbook).
