# DRVO AutoRespond — Super Admin Brand Asset Library

## Admin workflow
Open `/admin/brand-assets` from the **الهوية واللوجوهات** tab (visible only for `SUPER_ADMIN`).

1. Extract PNG/JPG/WebP images from the brand ZIP. Upload each of five variants separately: `primary-dark`, `primary-light`, `compact`, `stacked`, `icon`.
2. Uploaded images are **drafts** only. Nothing changes publicly until you click **اعتماد ونشر** and accept the confirmation.
3. The published version becomes active. Previously published images stay in version history; click **اعتماد ونشر** on an older version to roll back instantly. Delete is allowed only for drafts/inactive versions.
4. No app rebuild or server restart is required to change the currently active logo; refresh any open browser tabs.
5. When a variant has no active upload, the application still shows the current bundled logo. The public icon variant falls back to `/favicon.ico`.

## Where published assets are used
- `BrandLogo` (Landing, Dashboard, Auth, Admin, Sidebar) dynamically reads `primary-dark` and `primary-light` via `/api/brand/assets/[variant]` without stale Next Image optimization.
- App icon metadata points to `/api/brand/assets/icon`.
- `compact` and `stacked` variants have public asset endpoints available for further UI placements and can be managed/previewed from Admin.

## File safety, permissions, persistence
- Admin GET/POST/PATCH/DELETE and unpublished preview require active `SUPER_ADMIN` in DB (not a client-controlled flag).
- Mutating requests require a matching Origin host to prevent cross-site form submissions; request body and IDs are validated.
- PNG/JPG/WebP only; file MIME **and magic bytes** validated. SVG and animated/scriptable documents are rejected. Max 2 MB each. PNG dimensions capped at 4096x4096.
- Upload stores bytes in `dbo.TblBrandAsset` (migration 104) on the existing SQL Server, surviving VPS app restarts and deploys. One active version per variant is enforced by a filtered unique index.
- Publication happens within one SQL transaction. Previously active versions are not erased, allowing rollback.
- Public endpoint serves only the current active version. Draft preview requires Admin. All image responses are `no-store`, `nosniff`, with CSP sandbox. There is no anonymous upload route.
- No modified pricing, users, WhatsApp, campaign send status, billing, consent or business-facing APIs.

## Release checklist
- Run `npm run db:migrate` before serving updated app routes.
- Typecheck, production build and full test suite on PR.
- On an isolated test DB as a Super Admin: upload PNG into each slot, confirm staged preview, publish and refresh Logo across Admin/Auth/Landing/Dashboard, then roll back to prior asset.
- Confirm billing admins cannot see/access the brand asset editor (403).
- Confirm anonymous users can read the public approved image but cannot see preview/draft or change anything.
- Verify exact favicon selection in browser; Next.js may retain a bundled file-based favicon as a fallback.
- Verify screenshots/contrast and output sizing across mobile/desktop; PNG wordmark dimensions vary by designer.
- Keep final release PR #121 Draft until owner-approved brand assets and QA are complete; **do not merge to main yet**.
