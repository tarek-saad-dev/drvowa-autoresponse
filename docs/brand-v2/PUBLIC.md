# DRVO AutoRespond — Phase 03 Public Landing & Promo

## Target

Bring the marketing website, pricing presentation, public invite/promo screen, and live product Canvas illustration into the approved **Bold Editorial / Direction C** system. The source of truth for the core color palette is `src/app/globals.css`; these public pages are intentionally dark Ink surfaces.

## Scope implemented

| Surface | Files | Action |
| --- | --- | --- |
| Landing & pricing styles | `src/components/landing/landing.module.css` | Remap ~238 legacy color literals to a restricted palette of semantic role tokens; leave functional red/warning colors intact; add display role and coherent green CTA/focus |
| Public plan options | `src/components/landing/pricing-cards.tsx` | **No business-data or calculation changes**; existing plan listing, comparisons, signup CTA retained |
| Public promo | `src/app/promo/[code]/promo.module.css` | Rebuild independent Teal theme on Ink/Carbon/Signal Green; maintain existing selectors and mobile layout |
| Promo copy | `src/app/promo/[code]/promo-landing.tsx` | Replace visible AutoResponse with canonical **AutoRespond**; keep monthly/annual switches, displayed prices, link parameters |
| Promo metadata | `src/app/promo/[code]/page.tsx` | Canonical product name in page title |
| Canvas motion | `src/components/landing/conversation-flow.tsx` | Replace stale teal/cyan fallbacks with approved signal/deep green; dark Ink label on bright core, reduced-motion logic unchanged |
| Regression guard | `tests/unit/brand-v2-public-surface.test.ts` | Public branding tokens, naming, legacy color exclusion, responsive rules, promo activation URL, pricing and canvas |

## Palette

- Ink `#0B0F14`, Carbon `#151B23`, Soft White `#F7F9FC`.
- Signal Green `#7BF36A`, Deep Green `#1F9D55`.
- Role-based lighter derived greens support focus, hover, low-chroma background gradients. Derived tones are **not** new official brand colors.
- Status reds / warns are not indiscriminately recolored green.
- Existing logo files and IBM Plex / Space Grotesk font loaders are kept unchanged: final vector lettering and licensed font files were not supplied.

## Safety

**No modifications** to pricing database, discount quote, promo authorization, activation URLs, signup logic, billing or checkout. This PR targets `feat/brand-v2`, not deployment-triggering `main`. The final public rollout PR #121 must remain draft until all phases and browser visual QA are complete.

## QA / rollout gate

- CI: typecheck, Next build, all unit tests, static audit.
- In-browser QA still required before **production**: screenshot review of landing hero/pricing/FAQ/promo at 360, 390, 768, 1280, 1440; RTL; keyboard focus; contrast; reduced motion; CTA and promotional code activation, latest approved brand logo.
- PR CI can validate compilation and regression tests but cannot substitute for actual authenticated visual review.

See master Issue #119 and public UI Issue #126.
