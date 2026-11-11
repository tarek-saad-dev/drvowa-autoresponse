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
      ["knowledge", "/dashboard/agent?tab=knowledge"],
      ["billing", "/dashboard/billing"],
      ["campaigns", "/dashboard/agent?tab=campaigns"],
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
      ["brand-assets", "/admin/brand-assets"],
      ["admin", "/admin"],
      ["admin-payments", "/admin/payments"],
      ["admin-refunds", "/admin/refunds"],
      ["admin-discounts", "/admin/discount-codes"],
    ]) {
      await screenshotGrid(page, name, href);
    }
  });

  test("super admin can upload a draft, publish, restore history and keep drafts private", async ({ page, browser }) => {
    const userId = await signup(page, "brand_assets");
    await upsertPlatformAdmin({ userId, role: "SUPER_ADMIN" });

    await page.goto("/admin/brand-assets", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "هوية DRVO AutoRespond" })).toBeVisible();

    const original = await page.request.get("/api/brand/assets/primary-dark");
    expect(original.ok()).toBe(true);
    const fallbackBytes = Buffer.from(await original.body());
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+QblvAAAAAElFTkSuQmCC", "base64");

    await page.locator('input[name="brand-primary-dark"]').setInputFiles({
      name: "brand-v2-dark.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.getByRole("button", { name: "رفع كمسودة" }).first().click();
    await expect(page.getByRole("status")).toContainText("تم الرفع كمسودة");
    let items = await page.request.get("/api/admin/brand-assets");
    expect(items.ok()).toBe(true);
    let rows = (await items.json()).assets as { id: string; variant: string; active: boolean }[];
    const first = rows.find((asset) => asset.variant === "primary-dark");
    expect(first?.active).toBe(false);

    // Uploading a draft never changes the public image.
    const beforePublish = await page.request.get("/api/brand/assets/primary-dark");
    expect(Buffer.from(await beforePublish.body()).equals(fallbackBytes)).toBe(true);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "اعتماد ونشر" }).first().click();
    await expect(page.getByRole("status")).toContainText("تم نشر اللوجو الجديد");
    const published = await page.request.get("/api/brand/assets/primary-dark");
    expect(Buffer.from(await published.body()).equals(png)).toBe(true);

    // Re-publish an older version: history is durable and one per variant is active.
    const secondUpload = await page.request.post("/api/admin/brand-assets", {
      headers: { origin: "http://localhost:3000" },
      multipart: { variant: "primary-dark", file: { name: "brand-v3-dark.png", mimeType: "image/png", buffer: png } },
    });
    expect(secondUpload.status()).toBe(201);
    const secondId = (await secondUpload.json()).id as string;
    const activate = (id: string) => page.request.patch("/api/admin/brand-assets/" + id, {
      headers: { origin: "http://localhost:3000" },
      data: { action: "publish" },
    });
    expect((await activate(secondId)).ok()).toBe(true);
    expect((await activate(first!.id)).ok()).toBe(true);
    items = await page.request.get("/api/admin/brand-assets");
    rows = (await items.json()).assets;
    expect(rows.filter((asset) => asset.variant === "primary-dark" && asset.active).map((asset) => asset.id))
      .toEqual([first!.id]);

    const guest = await browser.newContext();
    try {
      expect((await guest.request.get("http://localhost:3000/api/admin/brand-assets")).status()).toBe(401);
      expect((await guest.request.get("http://localhost:3000/api/admin/brand-assets/" + first!.id + "/image")).status()).toBe(401);
      expect((await guest.request.get("http://localhost:3000/api/brand/assets/primary-dark")).status()).toBe(200);
    } finally {
      await guest.close();
    }
    await page.screenshot({ path: "test-results/brand-v2-authenticated/brand-assets-admin-upload.png", fullPage: true });
  });
});