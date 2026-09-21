import { expect, test, type Page, type Route } from "@playwright/test";

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

const CONV_ID = "11111111-1111-4111-8111-111111111111";
const MSG_IN = "22222222-2222-4222-8222-222222222222";
const MSG_OUT = "33333333-3333-4333-8333-333333333333";

type InboxFixtureState = {
  aiMode: "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";
  messages: Array<{
    messageId: string;
    direction: "INBOUND" | "OUTBOUND";
    textContent: string | null;
    contentType: string;
    createdAtUtc: string;
    receivedAtUtc: string;
    providerTimestampUtc: string | null;
  }>;
  nextSend: "SENT" | "AMBIGUOUS" | "FAILED";
  draftEcho: string | null;
};

function makeInboxState(): InboxFixtureState {
  const inboundAt = new Date(Date.now() - 60_000).toISOString();
  return {
    aiMode: "AUTO",
    messages: [
      {
        messageId: MSG_IN,
        direction: "INBOUND",
        textContent: "مرحبا، ما مواعيدكم؟",
        contentType: "text",
        createdAtUtc: inboundAt,
        receivedAtUtc: inboundAt,
        providerTimestampUtc: inboundAt,
      },
    ],
    nextSend: "SENT",
    draftEcho: null,
  };
}

async function installInboxMocks(page: Page, state: InboxFixtureState) {
  await page.route("**/api/inbox/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (method === "GET" && /\/api\/inbox\/conversations\/?$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversations: [
            {
              conversationId: CONV_ID,
              contactExternalKey: "966500000001",
              contactDisplayName: "عميل تجريبي",
              contactPhoneNormalized: "966500000001",
              lastMessagePreview:
                state.draftEcho
                ?? state.messages[state.messages.length - 1]?.textContent
                ?? "—",
              lastMessageDirection:
                state.messages[state.messages.length - 1]?.direction
                ?? "INBOUND",
              lastMessageAtUtc: new Date().toISOString(),
              status: "OPEN",
              aiMode: state.aiMode,
              aiPauseReason:
                state.aiMode === "HUMAN_PAUSED"
                  ? "HUMAN_TAKEOVER"
                  : state.aiMode === "SAFETY_PAUSED"
                    ? "SAFETY"
                    : null,
            },
          ],
        }),
      });
      return;
    }

    if (
      method === "GET"
      && path.includes(`/conversations/${CONV_ID}/messages`)
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversationId: CONV_ID,
          messages: state.messages,
        }),
      });
      return;
    }

    if (
      method === "POST"
      && path.includes(`/conversations/${CONV_ID}/messages`)
    ) {
      let text = "";
      try {
        const raw = req.postData();
        const parsed = raw ? (JSON.parse(raw) as { text?: string }) : {};
        text = parsed.text ?? "";
      } catch {
        text = "";
      }
      if (state.nextSend === "AMBIGUOUS") {
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({
            conversationId: CONV_ID,
            status: "AMBIGUOUS",
            errorCode: "SEND_UNCERTAIN",
            error:
              "أُرسل الطلب لكن النتيجة غير مؤكدة. لا تعِد الإرسال تلقائياً — راجع المحادثة.",
          }),
        });
        return;
      }
      if (state.nextSend === "FAILED") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "تعذر إرسال الرسالة.",
            code: "ACCOUNT_KEY_MISSING",
          }),
        });
        return;
      }
      state.draftEcho = text;
      state.aiMode = "HUMAN_PAUSED";
      const outAt = new Date().toISOString();
      state.messages = [
        ...state.messages,
        {
          messageId: MSG_OUT,
          direction: "OUTBOUND",
          textContent: text,
          contentType: "text",
          createdAtUtc: outAt,
          receivedAtUtc: outAt,
          providerTimestampUtc: outAt,
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversationId: CONV_ID,
          status: "SENT",
          messageId: MSG_OUT,
          providerMessageId: "wa-mock-1",
          aiPaused: true,
        }),
      });
      return;
    }

    if (
      method === "POST"
      && path.includes(`/conversations/${CONV_ID}/ai/resume`)
    ) {
      state.aiMode = "AUTO";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: { mode: "AUTO", pauseReason: null },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "mock route not matched", path, method }),
    });
  });
}

async function fulfillWhatsAppState(
  route: Route,
  uiState: string,
  extras: Record<string, unknown> = {},
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      uiState,
      message: null,
      connection:
        uiState === "READY"
          ? {
              channelConnectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              status: "ACTIVE",
              isActive: true,
              displayName: "Test WA",
              maskedPhone: "+9665****0001",
            }
          : null,
      runtime: {
        state: uiState === "READY" ? "READY" : uiState,
        ready: uiState === "READY",
        qrAvailable: uiState === "QR_REQUIRED",
        lastErrorCode: uiState === "ERROR" ? "MOCK" : null,
      },
      ...extras,
    }),
  });
}

test.describe.configure({ mode: "serial" });

test.describe("V1 product finish smoke", () => {
  const password = "GatePass123!";
  let email = "";

  test("1-3 signup → onboarding → dashboard → logout → login", async ({
    page,
  }) => {
    email = uniqueEmail();

    await page.goto("/signup", { waitUntil: "domcontentloaded" });
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

  test("4 agent edit/save persists", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/dashboard/agent", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "موظف الاستقبال", level: 1 }),
    ).toBeVisible();

    await page.getByTestId("agent-edit").click();
    await expect(page.getByTestId("agent-save-edit")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "تعديل موظف الاستقبال" }),
    ).toBeVisible();

    const tone = `نبرة-${Date.now()}`;
    await page.locator("#tone").fill(tone);
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/agents/")
        && res.request().method() === "PATCH",
    );
    await page.getByTestId("agent-save-edit").click();
    const patchRes = await saveResponse;
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy();
    await expect(page.getByText(/تم حفظ/)).toBeVisible({ timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(tone).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main")).not.toContainText("AI Agent");
    await expect(page.locator("main")).not.toContainText("EXTERNAL_GATE");
  });

  test("5 knowledge create/edit/disable/enable", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);
    await page.goto("/dashboard/knowledge");
    await expect(
      page.getByRole("heading", { name: /المعرفة/, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/من .* معلومة نشطة/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("RAG");
    await expect(page.locator("#category")).toContainText("سؤال وإجابة");

    const title = `معرفة-${Date.now()}`;
    await page.locator("#title").fill(title);
    await page.locator("#content").fill("محتوى اختبار المنتج");
    await page.getByRole("button", { name: "إضافة" }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div")
      .filter({ hasText: title })
      .getByRole("button", { name: "تعديل" })
      .first()
      .click();
    const edited = `${title}-معدّل`;
    await page.locator("#title").fill(edited);
    await page.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByText(edited).first()).toBeVisible({ timeout: 20_000 });

    page.once("dialog", (d) => d.accept());
    await page
      .locator("div")
      .filter({ hasText: edited })
      .getByRole("button", { name: "تعطيل" })
      .first()
      .click();
    await expect(
      page
        .locator("div")
        .filter({ hasText: edited })
        .getByText("معطّل")
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await page
      .locator("div")
      .filter({ hasText: edited })
      .getByRole("button", { name: "تفعيل" })
      .first()
      .click();
    await expect(
      page
        .locator("div")
        .filter({ hasText: edited })
        .getByText("نشط")
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("6 WhatsApp state UX (mocked)", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);

    const states: Array<{
      uiState: string;
      expectText: RegExp;
      qr?: boolean;
    }> = [
      { uiState: "NOT_CONNECTED", expectText: /ربط واتساب|غير مربوط/ },
      {
        uiState: "QR_REQUIRED",
        expectText: /الأجهزة المرتبطة|امسح الرمز|ربط جهاز/,
        qr: true,
      },
      { uiState: "CONNECTING", expectText: /جارٍ تأكيد|جارٍ الاتصال|تجهيز/ },
      { uiState: "READY", expectText: /متصل|جاهز/ },
      { uiState: "LOGGED_OUT", expectText: /إعادة ربط|انتهت الجلسة/ },
      { uiState: "ERROR", expectText: /إعادة المحاولة|خطأ/ },
    ];

    for (const s of states) {
      await page.unroute("**/api/channels/whatsapp/**").catch(() => undefined);
      await page.route("**/api/channels/whatsapp/**", async (route) => {
        const url = route.request().url();
        if (url.includes("/qr") && s.qr) {
          await fulfillWhatsAppState(route, "QR_REQUIRED", {
            qrAvailable: true,
            qrImageDataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          });
          return;
        }
        await fulfillWhatsAppState(route, s.uiState);
      });

      await page.goto("/dashboard/whatsapp");
      await expect(page.getByText(s.expectText).first()).toBeVisible({
        timeout: 15_000,
      });
      const panel = page.locator("main");
      await expect(panel).not.toContainText("MULTI_ACCOUNT");
      await expect(panel).not.toContainText("EXTERNAL_GATE");
      await expect(panel).not.toContainText("accountKey");
      await expect(panel).not.toContainText("محرك واتساب");
    }
  });

  test("7-11 inbox select, reply, takeover, resume, ambiguous", async ({
    page,
  }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);

    const state = makeInboxState();
    await installInboxMocks(page, state);

    await page.goto("/dashboard/inbox");
    await expect(
      page.getByRole("heading", { name: "المحادثات", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("عميل تجريبي").first()).toBeVisible();

    await page.getByText("عميل تجريبي").first().click();
    await expect(
      page.getByRole("paragraph").filter({ hasText: "مرحبا، ما مواعيدكم؟" }).first(),
    ).toBeVisible();

    const composer = page.locator("#inbox-manual-reply-desktop");
    await expect(composer).toBeVisible();
    await composer.fill("رد يدوي للاختبار");
    const sendBtn = page
      .locator("#inbox-manual-reply-desktop")
      .locator("xpath=ancestor::div[contains(@class,'border-t')][1]")
      .getByRole("button", { name: /^إرسال$/ });
    const sendResponse = page.waitForResponse(
      (r) =>
        r.request().method() === "POST"
        && r.url().includes(`/api/inbox/conversations/${CONV_ID}/messages`),
    );
    await sendBtn.click();
    const posted = await sendResponse;
    expect(posted.status(), await posted.text()).toBe(200);

    await expect(page.getByText(/الرد الآلي متوقف/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(composer).toHaveValue("");
    await expect(
      page.getByRole("paragraph").filter({ hasText: "رد يدوي للاختبار" }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /استئناف الرد الآلي/ }).first().click();
    await expect(page.getByText(/الرد الآلي متوقف/)).toHaveCount(0, {
      timeout: 15_000,
    });

    // Ambiguous send — draft preserved
    state.nextSend = "AMBIGUOUS";
    await composer.fill("رسالة غامضة");
    const ambiguousResponse = page.waitForResponse(
      (r) =>
        r.request().method() === "POST"
        && r.url().includes(`/api/inbox/conversations/${CONV_ID}/messages`),
    );
    await sendBtn.click();
    expect((await ambiguousResponse).status()).toBe(202);
    await expect(page.getByText(/غير مؤكدة|لا تعِد الإرسال/).first()).toBeVisible();
    await expect(composer).toHaveValue("رسالة غامضة");

    // SAFETY_PAUSED warning
    state.aiMode = "SAFETY_PAUSED";
    state.nextSend = "SENT";
    await page.getByRole("button", { name: "تحديث" }).first().click();
    await page.getByText("عميل تجريبي").first().click();
    await expect(
      page.getByText(/توقف أمان|راجع المحادثة قبل الاستئناف/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("12-13 usage billing settings + manual payment", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);

    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: /الخطة/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("EXTERNAL_GATE");
    await expect(page.locator("body")).not.toContainText("الترقية قريباً");
    await expect(page.getByTestId("plan-card-STARTER")).toBeVisible();
    await expect(page.getByTestId("plan-card-STARTER")).toContainText("499");
    await expect(page.getByTestId("plan-card-PRO")).toContainText("999");
    await expect(page.getByTestId("plan-card-BUSINESS")).toContainText("1999");

    await page.getByTestId("plan-card-STARTER").getByRole("button", { name: "اختيار الباقة" }).click();
    await expect(page.getByText(/حوّل المبلغ التالي عبر InstaPay/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("drv-payment-reference")).toBeVisible();
    await expect(page.getByTestId("drv-payment-reference")).toContainText(/DRV-/);
    await expect(page.getByTestId("pay-amount")).toContainText("499");
    await page.getByRole("button", { name: "لقد حوّلت المبلغ" }).click();
    await page.locator("#payerName").fill("مختبر الإطلاق");
    await page.locator("#transferReference").fill("E2E-TX-1");
    await page.getByRole("button", { name: "إرسال تأكيد الدفع" }).click();
    await expect(page.getByText(/طلب الدفع قيد المراجعة/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/DRV-/).first()).toBeVisible();

    await page.goto("/dashboard/usage");
    await expect(page.getByRole("heading", { name: "الاستخدام" })).toBeVisible();
    await expect(page.getByText(/يتجدد|ردود|واتساب/i).first()).toBeVisible();

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
    await expect(page.getByText(/النشاط|الحساب|الأمان/i).first()).toBeVisible();
  });

  test("14-15 mobile inbox + onboarding overflow", async ({ page }) => {
    expect(email).toBeTruthy();
    await apiLogin(page, email, password);

    const state = makeInboxState();
    await installInboxMocks(page, state);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/inbox");
    const mobileContact = page
      .getByText("عميل تجريبي")
      .filter({ visible: true })
      .first();
    await expect(mobileContact).toBeVisible();
    await mobileContact.click();
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: "مرحبا، ما مواعيدكم؟" })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    const back = page
      .getByRole("button", { name: /رجوع|المحادثات|خلف/i })
      .filter({ visible: true });
    if (await back.count()) {
      await back.first().click();
      await expect(
        page.getByText("عميل تجريبي").filter({ visible: true }).first(),
      ).toBeVisible();
    }

    for (const path of [
      "/dashboard",
      "/dashboard/whatsapp",
      "/dashboard/inbox",
      "/dashboard/agent",
      "/dashboard/knowledge",
      "/dashboard/billing",
      "/dashboard/usage",
      "/dashboard/settings",
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
