import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  );
}

const light = tokens(stylesheet.slice(
  stylesheet.indexOf(":root,"),
  stylesheet.indexOf('html[data-theme="dark"]'),
));
const dark = tokens(stylesheet.slice(
  stylesheet.indexOf('html[data-theme="dark"]'),
  stylesheet.indexOf("@theme inline"),
));

function luminance(hex: string): number {
  const values = [1, 3, 5].map((position) => {
    const channel = parseInt(hex.slice(position, position + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const requiredPairs = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "surface"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["destructive", "destructive-soft"],
  ["success-foreground", "success"],
  ["success", "success-soft"],
  ["warning", "warning-soft"],
  ["info", "info-soft"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-muted", "sidebar"],
] as const;

describe("site-wide color contrast", () => {
  it.each([["light", light], ["dark", dark]] as const)(
    "%s semantic text and background tokens meet WCAG AA for normal text",
    (theme, palette) => {
      for (const [foreground, background] of requiredPairs) {
        expect(
          palette[foreground],
          `Missing ${foreground} in ${theme} theme`,
        ).toMatch(/^#[\da-f]{6}$/i);
        expect(
          palette[background],
          `Missing ${background} in ${theme} theme`,
        ).toMatch(/^#[\da-f]{6}$/i);
        const ratio = contrast(palette[foreground]!, palette[background]!);
        expect(ratio, `${theme} ${foreground}/${background}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("lets component text/border utilities override reset styles", () => {
    // An unlayered a { color: inherit } overrode Tailwind v4's text-* on
    // link buttons, producing pale text on white even with text-slate-900.
    const start = stylesheet.indexOf("@layer base {");
    const end = stylesheet.indexOf("\nhtml {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const baseRules = stylesheet.slice(start, end);
    expect(baseRules).toContain("a {");
    expect(baseRules).toContain("border-color: var(--border)");
    expect(stylesheet.match(/\ba\s*\{\s*color:\s*inherit;/g)).toHaveLength(1);
  });

  it("keeps the custom marketing chat action readable on its solid background", () => {
    const landing = readFileSync(
      join(process.cwd(), "src/components/landing/landing.module.css"), "utf8",
    );
    const start = landing.indexOf(".chatInput b {");
    expect(start).toBeGreaterThan(-1);
    const end = landing.indexOf("}", start);
    const styles = landing.slice(start, end);
    const background = styles.match(/#[0-9a-f]{6}/i)?.[0];
    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast("#ffffff", background!)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the semantic foreground for primary and destructive buttons", () => {
    const button = readFileSync(
      join(process.cwd(), "src/components/ui/button.tsx"), "utf8",
    );
    expect(button).toContain("bg-primary text-primary-foreground");
    expect(button).toContain("bg-destructive text-destructive-foreground");
  });
});
