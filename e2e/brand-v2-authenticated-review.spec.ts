import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { upsertPlatformAdmin } from "../src/modules/platform-admin/service";
import { closePool } from "../src/lib/db";

/** Every account and payment record stays in ephemeral SQL Server CI. */
const password = "BrandV2Test!23456";
function email(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}@example.com`;
}
function fakeIp() {
  return `203.0.113.${Math.floor(Math.random() * 240) + 10}`;
}
async function signup(page: Page, prefix: string): Promise<string> {
  const response = await page.request.post("/api/auth/signup", {
    headers: { "x-forwarded-for": fakeIp() },
    data: { fullName: "Brand V2 E2E", email: email(prefix), password },
  });
  if (!response.ok()) {
    throw new Error(`Isolated signup failed (${response.status()}): ${(await response.text()).slice(0, 350)}`);
  }
  const json = await response.json() as { user: { userId: string } };
  return json.user.userId;
}

async function screenshotGrid(page: Page, name: string, href: string) {
  for (const width of [390, 1280]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 850 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => localStorage.setItem("drvo-theme", value), theme);
      const response = await page.goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      expect(response?.status(), `${name}: server response`).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/AutoResponse\b/);
      const actualPath = new URL(page.url()).pathname;
      expect(actualPath, `${name}: unexpected redirect`).toBe(new URL(href, page.url()).pathname);
      const sizes = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(sizes.document, `${name} ${theme} ${width}: ${JSON.stringify(sizes)}`).toBeLessThanOrEqual(width + 4);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `test-results/brand-v2-authenticated/${name}-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
}

test.describe.serial("Brand V2 isolated logged-in browser QA", () => {
  test.setTimeout(600_000);
  test.afterAll(async () => closePool().catch(() => undefined));

  test("owner choose-plan/onboarding/dashboard/inbox/agent/knowledge/billing", async ({ page }) => {
    await signup(page, "brand_owner");
    await page.goto("/choose-plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "اختار الخطة المناسبة لشغلك" })).toBeVisible();
    await screenshotGrid(page, "choose-plan", "/choose-plan");

    const response = await page.request.post("/api/onboarding/complete", {
      data: {
        business: {
          name: "Brand V2 Isolated QA",
          category: "عام",
          countryCode: "EG",
          locale: "ar-EG",
          timezone: "Africa/Cairo",
        },
        location: null,
        agent: {
          name: "موظف الاستقبال",
          roleTitle: "موظف استقبال",
          language: "ar",
          dialect: null,
          tone: "مهني وودود",
          instructions: null,
        },
        knowledgeItems: [{ category: "ABOUT", title: "عن النشاط", content: "بيانات اختبار معزول" }],
      },
    });
    if (!response.ok()) {
      throw new Error(`Isolated onboarding failed (${response.status()}): ${(await response.text()).slice(0, 380)}`);
    }

    for (const [name, href] of [
      ["dashboard", "/dashboard"],
      ["inbox", "/dashboard/inbox"],
      ["agent", "/dashboard/agent"],
      ["knowledge", "/dashboard/knowledge"],
      ["billing", "/dashboard/billing"],
      ["campaigns", "/dashboard/whatsapp?tab=campaigns"],
    ]) {
      await screenshotGrid(page, name, href);
    }
  });

  test("platform admin finances and privileged action screens, read-only", async ({ page }) => {
    const userId = await signup(page, "brand_admin");
    await upsertPlatformAdmin({ userId, role: "SUPER_ADMIN" });
    // Establish the localhost origin before localStorage theme access.
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    for (const [name, href] of [
      ["admin", "/admin"],
      ["admin-payments", "/admin/payments"],
      ["admin-refunds", "/admin/refunds"],
      ["admin-discounts", "/admin/discount-codes"],
    ]) {
      await screenshotGrid(page, name, href);
    }
  });
});
