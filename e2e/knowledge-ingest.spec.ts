import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `ki_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

function smokeIp(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
}

async function apiSignup(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/signup", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { fullName: "Knowledge Copilot", email, password },
  });
  if (!res.ok()) {
    throw new Error(`signup ${res.status()}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function apiOnboarding(page: Page) {
  const res = await page.request.post("/api/onboarding/complete", {
    data: {
      business: {
        name: "KI Salon",
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
        tone: "مهني",
        instructions: null,
      },
      knowledgeItems: [
        {
          category: "LOCATION_INFO",
          title: "فرع جليم",
          content:
            "فرع جليم في سابا باشا.\nالمواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
        },
        {
          category: "SERVICE",
          title: "حلاقة شعر",
          content: "الحلاقة 200 جنيه.",
        },
      ],
    },
  });
  if (!res.ok()) {
    throw new Error(
      `onboarding ${res.status()}: ${(await res.text()).slice(0, 300)}`,
    );
  }
}

test.describe("AI knowledge ingestion", () => {
  test("analyze → review cards → resolve conflict → apply", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "KnowledgeIngest99!";
    await apiSignup(page, email, password);
    await apiOnboarding(page);

    await page.goto("/dashboard/knowledge", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "إضافة بالذكاء" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "علّم موظف الاستقبال" })).toBeVisible();

    const paste = [
      "وده لينك فرع جليم على جوجل مابس:",
      "https://maps.example/gleem",
      "",
      "والحلاقة بقت 250 جنيه.",
      "شعر ودقن 300 جنيه.",
    ].join("\n");

    await page.locator("textarea").fill(paste);
    await page.getByRole("button", { name: "حلّل المعلومات" }).click();

    await expect(page.getByText(/حللت المعلومات ووجدت/)).toBeVisible({
      timeout: 60_000,
    });

    await expect(page.getByText("معلومة جديدة").first()).toBeVisible();
    await expect(page.getByText("تحديث معلومة موجودة").first()).toBeVisible();
    await expect(page.getByText("تحتاج مراجعة").first()).toBeVisible();

    await page
      .getByRole("button", { name: "استخدم المعلومة الجديدة" })
      .first()
      .click();

    await page.getByRole("button", { name: /اعتماد \d+ تغيير/ }).click();
    await expect(page.getByText(/تم الاعتماد/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "إضافة يدويًا" }).click();
    await expect(page.getByText(/maps\.example\/gleem/).first()).toBeVisible();
    await expect(page.getByText(/250/).first()).toBeVisible();
    await expect(page.getByText(/شعر ودقن|300/).first()).toBeVisible();
  });

  test("mobile viewport shows AI composer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = uniqueEmail();
    await apiSignup(page, email, "KnowledgeIngest99!");
    await apiOnboarding(page);
    await page.goto("/dashboard/knowledge", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "علّم موظف الاستقبال" })).toBeVisible();
    await expect(page.getByRole("button", { name: "حلّل المعلومات" })).toBeVisible();
  });
});
