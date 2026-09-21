import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { approveManualPayment } from "../src/modules/billing/manual-payment-service";
import {
  findOpenByBusinessId,
  findPendingByBusinessId,
} from "../src/modules/billing/manual-payment-repository";
import { upsertPlatformAdmin } from "../src/modules/platform-admin/service";
import { closePool } from "../src/lib/db";

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

function smokeIp(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
}

async function apiSignup(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/signup", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { fullName: "Billing E2E", email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    user: { userId: string };
    session: { sessionId: string };
  };
}

async function apiLogin(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/login", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
}

async function apiOnboarding(page: Page) {
  const res = await page.request.post("/api/onboarding/complete", {
    data: {
      business: {
        name: `Pay Biz ${randomUUID().slice(0, 6)}`,
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
        tone: "مهني",
        instructions: null,
      },
      knowledgeItems: [
        {
          category: "ABOUT",
          title: "عن النشاط",
          content: "معرفة اختبار الفوترة",
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { business: { businessId: string } };
}

test.describe.serial("manual instapay billing e2e", () => {
  test.afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  test("customer: DRV before transfer → confirm → admin approve STARTER", async ({
    page,
  }) => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const password = "BillingE2E!23456";
    const customerEmail = uniqueEmail("pay_cust");
    const adminEmail = uniqueEmail("pay_admin");

    const customer = await apiSignup(page, customerEmail, password);
    await apiOnboarding(page);

    await page.goto("/dashboard/billing");
    await page
      .getByTestId("plan-card-STARTER")
      .getByRole("button", { name: "اختيار الباقة" })
      .click();

    await expect(
      page.getByRole("heading", { name: "الدفع عبر InstaPay" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("drv-payment-reference")).toBeVisible();
    const drvRef = (await page.getByTestId("drv-payment-reference").innerText()).trim();
    expect(drvRef).toMatch(/^DRV-/);
    await expect(page.getByTestId("pay-amount")).toContainText("499");
    await expect(
      page.getByText("اكتب مرجع DRVOWA في وصف التحويل"),
    ).toBeVisible();

    const mePre = await page.request.get("/api/auth/me");
    const mePreJson = (await mePre.json()) as { activeBusinessId: string };
    const openIntent = await findOpenByBusinessId(mePreJson.activeBusinessId);
    expect(openIntent?.status).toBe("AWAITING_TRANSFER");
    expect(openIntent?.paymentReference).toBe(drvRef);
    expect(await findPendingByBusinessId(mePreJson.activeBusinessId)).toBeNull();

    await page.getByRole("button", { name: "لقد حوّلت المبلغ" }).click();
    await page.locator("#payerName").fill("عميل تجريبي");
    await page.getByRole("button", { name: "إرسال تأكيد الدفع" }).click();
    await expect(page.getByText("طلب الدفع قيد المراجعة")).toBeVisible({
      timeout: 15_000,
    });

    const pending = await findPendingByBusinessId(mePreJson.activeBusinessId);
    expect(pending).toBeTruthy();
    expect(pending!.paymentReference).toBe(drvRef);

    const adminSignup = await apiSignup(page, adminEmail, password);
    await upsertPlatformAdmin({
      userId: adminSignup.user.userId,
      role: "SUPER_ADMIN",
    });
    await apiLogin(page, adminEmail, password);

    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { name: "طلبات الدفع" })).toBeVisible();
    await expect(page.getByText(pending!.paymentReference).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByText(pending!.paymentReference).first().click();
    await expect(page.getByText("مراجعة الدفع")).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "اعتماد الدفع" }).click();
    await expect(
      page.getByText(pending!.paymentReference).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 15_000 });

    const again = await approveManualPayment({
      paymentRequestId: pending!.paymentRequestId,
      reviewerUserId: adminSignup.user.userId,
    });
    expect(again.alreadyApproved).toBe(true);

    await apiLogin(page, customerEmail, password);
    await page.goto("/dashboard/billing");
    await expect(page.getByText("تم اعتماد الدفع وتفعيل الباقة")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("plan-card-STARTER")).toContainText("خطتك الحالية");
    await expect(page.getByText(/3000/).first()).toBeVisible();

    void customer;
  });

  test("customer reject flow shows safe reason", async ({ page }) => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const password = "BillingE2E!23456";
    const customerEmail = uniqueEmail("pay_rej");
    const adminEmail = uniqueEmail("pay_rej_admin");

    await apiSignup(page, customerEmail, password);
    await apiOnboarding(page);
    await page.goto("/dashboard/billing");
    await page
      .getByTestId("plan-card-PRO")
      .getByRole("button", { name: "اختيار الباقة" })
      .click();
    await expect(page.getByTestId("drv-payment-reference")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "لقد حوّلت المبلغ" }).click();
    await page.locator("#payerName").fill("مرفوض");
    await page.getByRole("button", { name: "إرسال تأكيد الدفع" }).click();
    await expect(page.getByText("طلب الدفع قيد المراجعة")).toBeVisible({
      timeout: 15_000,
    });

    const me = await page.request.get("/api/auth/me");
    const meJson = (await me.json()) as { activeBusinessId: string };
    const pending = await findPendingByBusinessId(meJson.activeBusinessId);
    expect(pending).toBeTruthy();

    const adminSignup = await apiSignup(page, adminEmail, password);
    await upsertPlatformAdmin({
      userId: adminSignup.user.userId,
      role: "BILLING_ADMIN",
    });
    await apiLogin(page, adminEmail, password);
    await page.goto("/admin/payments");
    await page.getByText(pending!.paymentReference).first().click();
    await page.locator("textarea").fill("لم يصل التحويل في InstaPay");
    await page.getByRole("button", { name: "رفض الدفع" }).click();

    await apiLogin(page, customerEmail, password);
    await page.goto("/dashboard/billing");
    await expect(page.getByText("تعذر اعتماد الدفع")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/لم يصل التحويل/).first()).toBeVisible();
  });
});
