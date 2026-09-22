import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

function smokeIp(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
}

async function apiSignup(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/signup", {
    headers: { "x-forwarded-for": smokeIp() },
    data: { fullName: "Redirect Tester", email, password },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function apiOnboarding(page: Page) {
  const res = await page.request.post("/api/onboarding/complete", {
    data: {
      business: {
        name: "Redirect Biz",
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
          title: "عن",
          content: "معرفة اختبار",
        },
      ],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function apiLogout(page: Page) {
  await page.request.post("/api/auth/logout");
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

test.describe("platform admin login redirect UX", () => {
  test("normal user without business → /onboarding", async ({ page }) => {
    const email = uniqueEmail("norm_ob");
    const password = "NormalUser!23456789";
    await apiSignup(page, email, password);
    await apiLogout(page);

    await fillLogin(page, email, password);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  });

  test("normal user with business → /dashboard", async ({ page }) => {
    const email = uniqueEmail("norm_dash");
    const password = "NormalUser!23456789";
    await apiSignup(page, email, password);
    await apiOnboarding(page);
    await apiLogout(page);

    await fillLogin(page, email, password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("login client navigates to server redirectTo=/admin", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            userId: "00000000-0000-4000-8000-000000000099",
            email: "admin.follow@example.com",
            fullName: "Admin Follow",
            status: "ACTIVE",
          },
          session: { sessionId: "s9" },
          isPlatformAdmin: true,
          redirectTo: "/admin",
        }),
      });
    });

    const paths: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        paths.push(new URL(frame.url()).pathname);
      }
    });

    await fillLogin(page, "admin.follow@example.com", "unused");
    await expect
      .poll(() => paths.some((p) => p === "/admin" || p.startsWith("/admin/")), {
        timeout: 15_000,
      })
      .toBe(true);
  });

  test("login API returns redirectTo=/admin shape for platform admin payload", async ({
    page,
  }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            userId: "00000000-0000-4000-8000-000000000001",
            email: "admin@example.com",
            fullName: "Admin",
            status: "ACTIVE",
          },
          session: { sessionId: "s1" },
          isPlatformAdmin: true,
          redirectTo: "/admin",
        }),
      });
    });

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/login") && res.request().method() === "POST",
    );
    await fillLogin(page, "admin@example.com", "unused-password");
    const response = await responsePromise;
    const data = (await response.json()) as {
      redirectTo?: string;
      isPlatformAdmin?: boolean;
    };
    expect(data.isPlatformAdmin).toBe(true);
    expect(data.redirectTo).toBe("/admin");
  });

  test("inactive/non-platform user cannot access /admin", async ({ page }) => {
    const email = uniqueEmail("deny_admin");
    const password = "NormalUser!23456789";
    await apiSignup(page, email, password);
    await apiOnboarding(page);

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/(dashboard|login|onboarding)/);

    const api = await page.request.get("/api/admin/overview");
    expect(api.status()).toBe(403);
  });
});
