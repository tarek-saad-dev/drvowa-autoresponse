# DRVO AutoRespond — Brand V2 Phase 04: Auth / Choose-Plan / Onboarding

## Intent
Apply the approved **Ink, Carbon, Soft White, Mist Gray, Signal Green, Deep Green** identity to the journey from account creation to conversational product training, without changing authorization, plan decisions, promo calculations or WhatsApp setup.

## Changed files
- `src/components/onboarding/onboarding-theme.css`: replaced independent Cyan Neon and extra headline font import with semantic Brand V2 tokens and accessible light/dark surface/foreground pairs.
- `src/app/(auth)/layout.tsx`: simple centered account shell with brand role typography, theme toggle, proper focus and responsive padding.
- `src/app/(auth)/login/login-form.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`: shared card hierarchy and button busy UI via existing `Button.loading`; login remember-me and redirect logic preserved.
- `src/app/(app)/choose-plan/page.tsx`: clearer plan hierarchy and semantic primary/secondary CTAs, responsive cards, visible focus, removed cosmetic numbered-step heading that suggested a form/stepper.
- `tests/unit/brand-v2-auth-onboarding.test.ts`: static contract covering semantic colors, contrast, existing flow and routes.

## Design rules
- Dark onboarding `--ob-neon`: **Signal Green #7BF36A** with Ink text; light onboarding `--ob-neon`: **#188342** derived accessible UI tone with white text.
- Accent and text colors are independent by theme. **Never** use dark text on the dark-green light-mode CTA.
- Input borders use **#64717F** on Carbon (dark) and **#8895A1** on white (light), with >=3:1 non-text contrast.
- Error/warning/success learning-level indications remain distinct; this is a brand migration, not a status-semantic rewrite.
- Removed a separate onboarding font import; body and headings now use standard global roles. No new commercial or unapproved font is claimed.
- Keep the **WhatsApp-like training chat** in `guided-preview.tsx`; no new setup form or numbered wizard replacing it. No new runtime package dependency.
- Keep public product name **DRVO AutoRespond**. Internal repo/module IDs containing `autoresponse` remain untouched.

## Functional regression protection
- `/api/auth/login` and `rememberMe`, role-aware redirect to dashboard/admin/choose-plan.
- Signup hard navigation after session establishment, preserving iOS Safari session behavior.
- Password reset request/complete endpoints and token validation.
- Choose-plan filtered catalog, promo preview, paid and Free onboarding plan routing.
- Existing chat training/onboarding state, WhatsApp and preview logic unchanged.

## Release gates
1. GitHub CI: Typecheck, migration gate, Next production build and full unit test suite.
2. Authenticated browser QA (not provided by code-only checks): login/signup/forgot/reset/choose-plan and chat training at 360, 390, 768, 1280, 1440; RTL; focus; light/dark; long copy; loading/empty/error states.
3. Smoke actual choose-plan checkout and Promo URL after final release signoff.
4. Existing official logo assets preserved pending brand-approved vector lettering. No direct main/Production merge; PR #121 remains draft.

Master: #119 · Phase issue: #128.
