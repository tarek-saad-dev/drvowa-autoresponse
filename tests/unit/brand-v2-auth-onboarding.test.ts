import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const theme = read("src/components/onboarding/onboarding-theme.css");
const authLayout = read("src/app/(auth)/layout.tsx");
const login = read("src/app/(auth)/login/login-form.tsx");
const signup = read("src/app/(auth)/signup/page.tsx");
const forgot = read("src/app/(auth)/forgot-password/page.tsx");
const reset = read("src/app/(auth)/reset-password/page.tsx");
const choose = read("src/app/(app)/choose-plan/page.tsx");
const guided = read("src/components/onboarding/guided-preview.tsx");

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("Brand V2 auth, plan selection and conversational onboarding", () => {
  it("uses official dark palette, readable light UI green and matching text", () => {
    expect(theme).toContain("--ob-neon: var(--brand-signal, #7bf36a)");
    expect(theme).toContain("--ob-on-accent: var(--brand-ink, #0b0f14)");
    expect(theme).toContain("--ob-neon: #188342");
    expect(theme).toContain("--ob-on-accent: #ffffff");
    expect(theme).toContain("--ob-ink: var(--brand-white, #f7f9fc)");
    expect(contrast("#7bf36a", "#0b0f14")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#188342")).toBeGreaterThanOrEqual(4.5);
  });

  it("exposes non-text accessible input boundaries for both themes", () => {
    expect(theme).toContain("--ob-input-border: #64717f");
    expect(theme).toContain("--ob-input-border: #8895a1");
    expect(theme).toContain("border-color: var(--ob-input-border) !important");
    expect(contrast("#64717f", "#151b23")).toBeGreaterThanOrEqual(3);
    expect(contrast("#8895a1", "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("does not reintroduce cyan, separate web font download or dark button labels in light mode", () => {
    expect(theme).not.toMatch(/#(?:3de7ff|0496bd|00759a|0b8bb5)\b/i);
    expect(theme).not.toContain("rgb(61 231 255");
    expect(theme).not.toContain("rgb(4 150 189");
    expect(theme).not.toContain("@dawod/thmanyah-font-web");
    expect(theme).toContain("font-family: var(--font-display-arabic)");
    expect(theme).toContain("color: var(--ob-on-accent) !important");
    expect(theme).toContain("background: var(--ob-neon);");
    expect(theme).toContain("color: var(--ob-on-accent);");
  });

  it("keeps status semantics and reduced motion in onboarding chat", () => {
    expect(theme).toContain(".drvo-ob-learn-fill.is-low");
    expect(theme).toContain("#e11d48");
    expect(theme).toContain(".drvo-ob-learn-fill.is-mid");
    expect(theme).toContain("#f59e0b");
    expect(theme).toContain(".drvo-ob-learn-fill.is-high");
    expect(theme).toContain("var(--brand-deep-green, #1f9d55)");
    expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
    expect(guided).toContain("drvo-ob-chat-thread");
    expect(guided).toContain("drvo-ob-bubble-out");
  });

  it("keeps auth layout minimal, themed and linked to canonical product identity", () => {
    expect(authLayout).toContain("<BrandLogo");
    expect(authLayout).toContain("<ThemeToggle");
    expect(authLayout).toContain('href="/"');
    expect(authLayout).toContain("bg-primary/5");
    expect(authLayout).toContain("DRVO / YOUR WORKSPACE");
  });

  it("preserves login persistence and existing role-based redirects", () => {
    expect(login).toContain('name="rememberMe"');
    expect(login).toContain('data.redirectTo === "/admin"');
    expect(login).toContain('data.redirectTo === "/dashboard"');
    expect(login).toContain('data.redirectTo === "/choose-plan"');
    expect(login).toContain("window.location.assign(redirectTo)");
    expect(login).toContain("loading={pending}");
  });

  it("preserves signup and password reset endpoints and pending button states", () => {
    expect(signup).toContain('fetch("/api/auth/signup"');
    expect(signup).toContain('window.location.assign("/choose-plan")');
    expect(forgot).toContain('fetch("/api/auth/password-reset/request"');
    expect(reset).toContain('fetch("/api/auth/password-reset/complete"');
    for (const surface of [signup, forgot, reset]) {
      expect(surface).toContain("loading={pending}");
    }
  });

  it("preserves promo quotes, workspace redirects and onboarding plan routing", () => {
    expect(choose).toContain("previewPromoPrice");
    expect(choose).toContain('redirect("/admin")');
    expect(choose).toContain('redirect("/dashboard/billing")');
    expect(choose).toContain('href={`/onboarding?plan=${encodeURIComponent(plan.code)}`}');
    expect(choose).toContain('href="/onboarding?plan=FREE"');
    expect(choose).toContain("focus-visible:outline-ring");
    expect(choose).not.toContain("الخطوة ٢ من ٣");
  });
});
