import { expect, test } from "@playwright/test";

test("remember me stays optional and is passed to login API", async ({ page }) => {
  await page.goto("/login");

  const payloads: Array<{ email?: string; rememberMe?: boolean }> = [];
  await page.route("**/api/auth/login", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid credentials" }),
    });
  });

  await page.locator("#email").fill("member@example.com");
  await page.locator("#password").fill("ExamplePassword123");

  const rememberMe = page.getByRole("checkbox", { name: "تذكرني" });
  await expect(rememberMe).not.toBeChecked();

  await page.getByRole("button", { name: "دخول" }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toMatchObject({
    email: "member@example.com",
    rememberMe: false,
  });

  await rememberMe.check();
  await page.getByRole("button", { name: "دخول" }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toMatchObject({
    email: "member@example.com",
    rememberMe: true,
  });
});
