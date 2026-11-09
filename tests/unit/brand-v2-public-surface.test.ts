import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const marketingCss = source("src/components/landing/landing.module.css");
const marketing = source("src/components/landing/marketing-page.tsx");
const pricing = source("src/components/landing/pricing-cards.tsx");
const promoCss = source("src/app/promo/[code]/promo.module.css");
const promo = source("src/app/promo/[code]/promo-landing.tsx");
const promoPage = source("src/app/promo/[code]/page.tsx");
const conversation = source("src/components/landing/conversation-flow.tsx");

describe("Brand V2 public launch surfaces", () => {
  it("anchors marketing layout to official Ink/Signal Green tokens", () => {
    expect(marketingCss).toContain("--lp-bg: var(--brand-ink, #0b0f14)");
    expect(marketingCss).toContain("--lp-panel: var(--brand-carbon, #151b23)");
    expect(marketingCss).toContain("--lp-accent: var(--brand-signal, #7bf36a)");
    expect(marketingCss).toContain("--lp-text: var(--brand-white, #f7f9fc)");
    expect(marketingCss).toContain("--lp-display-font:");
    expect(marketingCss).toContain("background: var(--lp-accent)");
    expect(marketingCss).toContain(".page :is(a, summary, button):focus-visible");
  });

  it("does not leave legacy decorative teal or cyan across public styles", () => {
    const legacy = /#(?:00759a|0b8bb5|38c6ed|3de7ff|0ba8d4|149bc7|005f80|004a66)\b/i;
    for (const file of [marketingCss, promoCss, conversation]) {
      expect(file).not.toMatch(legacy);
      expect(file).not.toMatch(/rgba?\(\s*0\s*[, ]\s*117\s*[, ]\s*154/i);
    }
  });

  it("preserves status red and responsive marketing/promo layouts", () => {
    expect(marketingCss).toContain("#f8a09b");
    expect(marketingCss).toContain("@media");
    expect(promoCss).toContain("@media (max-width: 700px)");
    expect(promoCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(promoCss).toContain(".cards { display: grid");
    expect(promoCss).toContain("var(--promo-green)");
  });

  it("uses the correct public product name in promo copy and metadata", () => {
    expect(promo).toContain("DRVO AutoRespond");
    expect(promoPage).toContain("DRVO AutoRespond");
    expect(promo).not.toMatch(/AutoResponse\b/);
    expect(promoPage).not.toMatch(/AutoResponse\b/);
    expect(marketing).not.toMatch(/AutoResponse\b/);
  });

  it("preserves the existing promo activation, pricing and signup behavior", () => {
    expect(promo).toContain("/promo/${encodeURIComponent(code)}/activate?plan=${encodeURIComponent(plan.code)}&interval=${activeInterval}");
    expect(promo).toContain("onClick={()=>setInterval");
    expect(pricing).toContain("isPublishedPlan");
    expect(pricing).toContain('href="/signup"');
    expect(marketing).toContain('href="#pricing"');
  });

  it("uses semantic accent colors for live product animation without motion regression", () => {
    expect(conversation).toContain('cssVar("--brand-signal", "#7bf36a")');
    expect(conversation).toContain('cssVar("--brand-deep-green", "#1f9d55")');
    expect(conversation).not.toContain("--brand-teal");
    expect(conversation).toContain("prefers-reduced-motion: reduce");
    expect(conversation).toContain("cancelAnimationFrame(raf)");
  });
});
