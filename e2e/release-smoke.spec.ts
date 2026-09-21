import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `gate_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

function smokeIp(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
}

async function apiSignup(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/signup", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { fullName: "Gate Tester", email, password },
  });
  if (!res.ok()) {
    throw new Error(`signup API ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function apiLogin(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/login", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login API ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function apiOnboarding(page: Page) {
  const res = await page.request.post("/api/onboarding/complete", {
    data: {
      business: {
        name: "Gate Biz",
        category: "عام",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
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
      knowledgeItems: [
        {
          category: "ABOUT",
          title: "عن النشاط",
          content: "معرفة اختبار الإطلاق",
        },
      ],
    },
  });
  if (!res.ok()) {
    throw new Error(
      `onboarding API ${res.status()}: ${(await res.text()).slice(0, 400)}`,
    );
  }
}

async function apiLogout(page: Page) {
  const res = await page.request.post("/api/auth/logout");
  if (!res.ok()) {
    throw new Error(`logout API ${res.status()}`);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("V1 product finish smoke", () => {
  const password = "GatePass123!";
  let email = "";

  test("signup → onboarding → dashboard → logout → login", async ({ page }) => {
    email = uniqueEmail();

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "إنشاء حساب" })).toBeVisible();
    await apiSignup(page, email, password);

    await page.goto("/onboarding");
    await expect(page.getByText(/إعداد|مرحباً|النشاط/i).first()).toBeVisible();
    await expect(page.locator("#businessName")).toBeVisible({ timeout: 15_000 });
    await apiOnboarding(page);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /مرحباً/ })).toBeVisible({
      timeout: 30_000,
    });

    await apiLogout(page);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await apiLogin(page, email, password);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /مرحباً/ })).toBeVisible();
  });

  test("agent, knowledge, whatsapp, billing, usage, settings", async ({
    page,
  }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);

    await page.goto("/dashboard/agent");
    await expect(
      page.getByRole("heading", { name: "موظف الاستقبال", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#name, input[name='name']").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/موظف الاستقبال/);

    await page.goto("/dashboard/knowledge");
    await expect(page.getByRole("heading", { name: /المعرفة/ })).toBeVisible();
    const smokeTitle = `Smoke ${Date.now()}`;
    const create = await page.request.post("/api/knowledge", {
      data: {
        category: "FAQ",
        title: smokeTitle,
        content: "محتوى اختبار الإطلاق",
      },
    });
    expect(create.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByText(smokeTitle).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/dashboard/whatsapp");
    await expect(
      page.getByRole("heading", { name: /واتساب|اتصال واتساب/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/غير مربوط|متصل|ربط|QR|رمز|حالة|بدء/i).first(),
    ).toBeVisible();

    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: /الخطة/ })).toBeVisible();
    await expect(page.getByText(/قريباً|الخطة|حدود/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("EXTERNAL_GATE");

    await page.goto("/dashboard/usage");
    await expect(page.getByRole("heading", { name: "الاستخدام" })).toBeVisible();
    await expect(page.getByText(/يتجدد|ردود|واتساب/i).first()).toBeVisible();

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
    await expect(page.getByText(/النشاط|الحساب|الأمان/i).first()).toBeVisible();
  });

  test("inbox shell + mobile", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);
    await page.goto("/dashboard/inbox");
    await expect(
      page.getByRole("heading", { name: "المحادثات", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/لا توجد محادثات|اختر محادثة|المحادثات/i).first(),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      "/dashboard",
      "/dashboard/whatsapp",
      "/dashboard/inbox",
      "/dashboard/billing",
      "/onboarding",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1;
      });
      expect(overflow, `horizontal overflow at ${path}`).toBe(false);
    }
  });
});
