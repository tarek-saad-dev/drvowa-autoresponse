import { expect, test } from "@playwright/test";

/**
 * Non-destructive anonymous real-browser screenshots for Brand V2.
 * These are valid only for public pages; authenticated dashboard, WhatsApp,
 * campaigns and payment workflows require a separately provisioned test tenant.
 */
const cases = [
  { slug: "landing", href: "/", widths: [360, 390, 768, 1280, 1440] },
  { slug: "login", href: "/login", widths: [390, 1280] },
  { slug: "signup", href: "/signup", widths: [390, 1280] },
  { slug: "terms", href: "/terms", widths: [390, 1280] },
  { slug: "privacy", href: "/privacy", widths: [390, 1280] },
] as const;

for (const screen of cases) {
  for (const width of screen.widths) {
    for (const scheme of ["light", "dark"] as const) {
      test(`Brand V2 ${screen.slug} ${width}px ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.addInitScript((theme) => {
          window.localStorage.setItem("drvo-theme", theme);
        }, scheme);

        const response = await page.goto(screen.href, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        expect(response?.status(), `HTTP status for ${screen.href}`).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", "ar");
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("body")).not.toContainText(/AutoResponse\b/);

        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(layout.width, `Horizontal overflow in ${screen.slug}, ${width}px ${scheme}: ${JSON.stringify(layout)}`)
          .toBeLessThanOrEqual(layout.viewport + 4);

        await page.screenshot({
          path: `test-results/brand-v2/${screen.slug}-${width}-${scheme}.png`,
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }
}
