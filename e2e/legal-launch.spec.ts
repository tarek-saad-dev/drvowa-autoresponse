import { expect, test } from "@playwright/test";

test.describe("V1 legal launch surfaces", () => {
  test("privacy has no draft placeholder and shows operator + last updated", async ({
    page,
  }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "سياسة الخصوصية" })).toBeVisible();
    await expect(page.getByText("مسودة بانتظار المراجعة القانونية")).toHaveCount(0);
    await expect(page.getByText("النسخة المعتمدة قانونياً")).toHaveCount(0);
    await expect(page.getByText("فريق الدعم")).toHaveCount(0);
    await expect(page.getByText(/مشغل الخدمة:\s*DRVO TECH/)).toBeVisible();
    await expect(page.getByText("آخر تحديث: 22 سبتمبر 2026")).toBeVisible();
    await expect(page.getByText(/لا نبيع بيانات العملاء/)).toBeVisible();
  });

  test("terms reflects InstaPay V1 commercial model", async ({ page }) => {
    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "شروط الاستخدام" })).toBeVisible();
    await expect(page.getByText("الأسعار النهائية والتوفر التجاري")).toHaveCount(0);
    await expect(page.getByText("عند تفعيل بوابة دفع معتمدة")).toHaveCount(0);
    await expect(page.getByText("مسودة بانتظار المراجعة القانونية")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "الدفع اليدوي عبر InstaPay" }),
    ).toBeVisible();
    await expect(page.getByText(/اعتماد طلب الدفع من مسؤول المنصة/)).toBeVisible();
    await expect(page.getByText("آخر تحديث: 22 سبتمبر 2026")).toBeVisible();
    await expect(page.getByText(/ليست شريكاً رسمياً/)).toBeVisible();
  });

  test("signup shows Terms and Privacy acknowledgement links", async ({
    page,
  }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/بإنشاء الحساب، أنت توافق على/)).toBeVisible();
    const terms = page.getByRole("link", { name: "شروط الاستخدام" });
    const privacy = page.getByRole("link", { name: "سياسة الخصوصية" });
    await expect(terms).toHaveAttribute("href", "/terms");
    await expect(privacy).toHaveAttribute("href", "/privacy");
  });
});
