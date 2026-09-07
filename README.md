# DRVOWA AutoResponse

Standalone multi-tenant SaaS control plane for AI-powered WhatsApp receptionists.

## Current phase

Project Bootstrap.

This repository establishes the technical foundation only. Product features are not implemented yet.

## Architecture boundary

This repository owns the DRVOWA SaaS / control plane.

It does **not** own the existing production ERP repository.

Future integrations with the WhatsApp runtime and DRVO ERP will use explicit APIs.

## Intended domain modules (not implemented yet)

- auth
- businesses
- agents
- knowledge
- channels
- contacts
- conversations
- messaging
- integrations
- usage
- billing

## Local requirements

- Node 22
- npm

## Local commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Environment

Copy `.env.example` to `.env.local` for local overrides. Do not commit secrets.

Development uses normal Next.js local defaults. Production bind settings are provided via environment variables (`HOST`, `PORT`).

## Future production target

- Directory: `/home/drvowa/app`
- Bind: `127.0.0.1:3100`
- Node: 22
