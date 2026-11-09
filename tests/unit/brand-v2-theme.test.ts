import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

const lightStart = css.indexOf(":root,");
const darkStart = css.indexOf('html[data-theme="dark"],');
const themeStart = css.indexOf("@theme inline");
if (lightStart < 0 || darkStart < 0 || themeStart < 0) {
  throw new Error("Brand V2 root light/dark theme sections not found");
}
const light = css.slice(lightStart, darkStart);
const dark = css.slice(darkStart, themeStart);

function valueOf(section: string, token: string): string {
  const expression = new RegExp(`(?:^|\\n)\\s*--${token}:\\s*(#[0-9a-f]{6})\\s*;`, "i");
  const match = section.match(expression);
  if (!match) throw new Error(`Missing six-digit color token --${token}`);
  return match[1].toLowerCase();
}

function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const digits = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) =>
    linearChannel(Number.parseInt(digits.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const aLuminance = luminance(a);
  const bLuminance = luminance(b);
  return (Math.max(aLuminance, bLuminance) + 0.05) /
    (Math.min(aLuminance, bLuminance) + 0.05);
}

describe("Brand V2 theme foundation contract", () => {
  it("contains the six approved core colors (not additional marketing colors)", () => {
    expect(valueOf(light, "brand-ink")).toBe("#0b0f14");
    expect(valueOf(light, "brand-carbon")).toBe("#151b23");
    expect(valueOf(light, "brand-white")).toBe("#f7f9fc");
    expect(valueOf(light, "brand-mist")).toBe("#dce3ea");
    expect(valueOf(light, "brand-signal")).toBe("#7bf36a");
    expect(valueOf(light, "brand-deep-green")).toBe("#1f9d55");
  });

  it.each([
    ["light primary button", light, "primary", "primary-foreground"],
    ["dark primary button", dark, "primary", "primary-foreground"],
    ["light body", light, "foreground", "background"],
    ["dark body", dark, "foreground", "background"],
    ["light muted text", light, "muted-foreground", "background"],
    ["dark muted text", dark, "muted-foreground", "background"],
    ["light success", light, "success", "card"],
    ["dark status info", dark, "info", "background"],
  ])("%s meets 4.5:1 normal-text contrast", (_name, section, fgToken, bgToken) => {
    const foreground = valueOf(section, fgToken);
    const background = valueOf(section, bgToken);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps readable dark-green UI controls on light and signal green in dark", () => {
    expect(valueOf(light, "primary")).toBe("#188342");
    expect(valueOf(dark, "primary")).toBe("#7bf36a");
    expect(valueOf(light, "sidebar")).toBe("#0b0f14");
    expect(valueOf(dark, "card")).toBe("#151b23");
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("%s input border has non-text contrast >= 3:1 against the card", (_theme, section) => {
    const inputBorder = valueOf(section, "input");
    const card = valueOf(section, "card");
    expect(contrastRatio(inputBorder, card)).toBeGreaterThanOrEqual(3);
  });

  it("maps reusable elevation tokens without self-referencing custom properties", () => {
    expect(light).toContain("--elevation-sm:");
    expect(dark).toContain("--elevation-md:");
    expect(css).toContain("--shadow-sm: var(--elevation-sm)");
    expect(css).toContain("--shadow-md: var(--elevation-md)");
    expect(css).not.toContain("--shadow-sm: var(--shadow-sm)");
  });

  it("preserves expected semantic and operational tokens", () => {
    for (const token of ["destructive", "success", "warning", "info", "whatsapp-bubble", "sidebar-active"]) {
      expect(light).toContain(`--${token}:`);
      expect(dark).toContain(`--${token}:`);
    }
    expect(css).toContain("--color-primary: var(--primary)");
    expect(css).toContain("--font-sans: var(--font-ui-arabic)");
    expect(css).toContain("--font-display: var(--font-display-arabic)");
  });

  it("removes former decorative teal color values from global theme styles", () => {
    expect(css).not.toMatch(/#(?:00759a|0b8bb5|38c6ed|3de7ff|149bc7|005f80|004a66)\b/i);
    // The alias remains to avoid breaking existing animation consumers during P03.
    expect(css).toContain("--brand-teal: var(--primary)");
  });

  it("uses approved Ink and Soft White for browser chrome", () => {
    expect(layout).toContain('color: "#f7f9fc"');
    expect(layout).toContain('color: "#0b0f14"');
    expect(layout).not.toContain('color: "#00759a"');
  });
});
