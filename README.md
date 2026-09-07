# DRVOWA AutoResponse

Standalone multi-tenant SaaS control plane for AI-powered WhatsApp receptionists.

## Current phase

**Phase 1** — multi-tenant control-plane foundation.

Includes: SQL Server access layer, deterministic migrations, local auth/sessions, businesses & memberships, locations, AI agent configuration, manual knowledge, channel/integration/usage/billing/audit foundations, onboarding, Arabic RTL landing page, and dashboard shell with tenant isolation tests.

Deferred to Phase 2+: WhatsApp runtime (Baileys/QR), AI conversation runtime (Gemini), inbox messaging, contacts, ERP live integration, payment checkout.

## Architecture boundary

This repository owns the DRVOWA SaaS / control plane.

It does **not** own the existing production ERP repository.

Future integrations with the WhatsApp runtime and DRVO ERP will use explicit APIs.

## Tenant model

**Business** is the SaaS tenant/workspace. `BusinessID` is the hard isolation boundary.

Authorization path:

authenticated user → membership → permitted Business → scoped repository/service operation

Business-owned repository APIs require `businessId` in their function signature.

## Authentication

Opaque HTTP-only session cookies (`drvowa_session`) with server-side `TblSession` rows (token hash only). Passwords hashed with bcryptjs (cost 12). See `src/modules/auth/README.md`.

## Local requirements

- Node 22
- npm
- SQL Server reachable for migrations and DB-backed tests (database `DRVOWA`)

## Local commands

```bash
npm install
cp .env.example .env.local   # then fill DB_* values
npm run db:migrate
npm run db:status
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

## Environment

Names only (see `.env.example`):

`NODE_ENV`, `HOST`, `PORT`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`

Do not commit secrets. Do not use `sa`. Do not connect to ERP database `last132`.

## Future production target

- Directory: `/home/drvowa/app`
- Bind: `127.0.0.1:3100`
- Node: 22
- Database: `DRVOWA` (login `drvowa_app`)
