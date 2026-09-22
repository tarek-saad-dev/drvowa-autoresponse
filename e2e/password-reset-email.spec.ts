import { expect, test } from "@playwright/test";

test.describe("password reset email honesty", () => {
  test("forgot-password does not claim email sent when delivery is unconfigured", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.locator("#email").fill(`reset.honest.${Date.now()}@example.com`);
    await page.getByRole("button", { name: "إرسال رابط الاستعادة" }).click();
    await expect(
      page.getByText(/إرسال البريد غير مفعّل حالياً|تم تسجيل طلب الاستعادة/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ستصل تعليمات إعادة التعيين قريباً/)).toHaveCount(
      0,
    );
  });
});
