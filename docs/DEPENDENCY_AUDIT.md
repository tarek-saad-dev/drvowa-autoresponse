# Dependency Security Audit

**Date:** 2026-09-21  
**Branch:** `release/prelaunch-v1`  
**Command:** `npm audit --omit=dev`

## Result

**0 known vulnerabilities** in production dependencies at audit time.

## Stack reviewed

| Package | Role |
|---------|------|
| `next@16.3.4` | App framework |
| `react` / `react-dom@19.2.8` | UI |
| `bcryptjs` | Password hashing |
| `mssql` | SQL Server driver |
| `@google/genai` | Gemini |
| `zod` | Validation |
| `qrcode` | WhatsApp QR rendering |

## Policy

- Do not blindly upgrade majors before RC freeze.
- Re-run `npm audit --omit=dev` before production deploy.
- Document any deferred High/Critical with exposure rationale.
