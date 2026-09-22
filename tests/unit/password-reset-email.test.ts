import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractEmailAddress,
  getEmailProvider,
  GatedProductionEmailProvider,
  isEmailDeliveryEnabled,
  ResendEmailProvider,
} from "@/modules/auth/email-provider";
import {
  buildPasswordResetEmail,
  hashResetToken,
  isProductionSafeAppBaseUrl,
  resolveAppBaseUrl,
} from "@/modules/auth/password-reset";

describe("password reset email production readiness", () => {
  const envKeys = [
    "APP_BASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "RESEND_API_KEY",
  ] as const;
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = {};
    for (const key of envKeys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      const prev = snapshot[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolveAppBaseUrl prefers APP_BASE_URL then NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://public.example.com/";
    expect(resolveAppBaseUrl()).toBe("https://public.example.com");
    process.env.APP_BASE_URL = "https://app.drvotech.com/";
    expect(resolveAppBaseUrl()).toBe("https://app.drvotech.com");
  });

  it("password reset URL uses APP_BASE_URL and encodes token", () => {
    process.env.APP_BASE_URL = "https://app.drvotech.com";
    const token = "abc+/=xyz";
    const url = `${resolveAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    expect(url).toBe(
      "https://app.drvotech.com/reset-password?token=abc%2B%2F%3Dxyz",
    );
    expect(url).not.toContain("localhost");
  });

  it("production rejects localhost / http bases for email links", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionSafeAppBaseUrl("https://app.drvotech.com")).toBe(true);
    expect(isProductionSafeAppBaseUrl("http://app.drvotech.com")).toBe(false);
    expect(isProductionSafeAppBaseUrl("https://localhost:3000")).toBe(false);
    expect(isProductionSafeAppBaseUrl("http://127.0.0.1:3100")).toBe(false);
  });

  it("Arabic reset email includes branding, expiry, ignore notice, and link", () => {
    const url = "https://app.drvotech.com/reset-password?token=TOK";
    const mail = buildPasswordResetEmail(url);
    expect(mail.subject).toContain("DRVOWA");
    expect(mail.textBody).toContain("ساعة");
    expect(mail.textBody).toContain("تجاهل");
    expect(mail.textBody).toContain(url);
    expect(mail.htmlBody).toContain("DRVOWA");
    expect(mail.htmlBody).toContain('href="https://app.drvotech.com/reset-password?token=TOK"');
    expect(mail.htmlBody).toContain("تعيين كلمة مرور جديدة");
    expect(mail.htmlBody).not.toContain("localhost");
  });

  it("extractEmailAddress supports display-name From headers", () => {
    expect(extractEmailAddress("DRVOWA <noreply@drvotech.com>")).toBe(
      "noreply@drvotech.com",
    );
    expect(extractEmailAddress("noreply@drvotech.com")).toBe(
      "noreply@drvotech.com",
    );
  });

  it("token hash never equals raw token", () => {
    const raw = "super-secret-raw-token";
    expect(hashResetToken(raw)).not.toContain(raw);
  });

  it("unconfigured provider path reports delivery disabled", () => {
    process.env.EMAIL_PROVIDER = "resend";
    expect(isEmailDeliveryEnabled()).toBe(false);
    expect(getEmailProvider()).toBeInstanceOf(GatedProductionEmailProvider);
  });

  it("configured Resend path reports delivery enabled", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "DRVOWA <noreply@drvotech.com>";
    expect(isEmailDeliveryEnabled()).toBe(true);
    expect(getEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });

  it("Resend provider failure throws generic HTTP error without body leak", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@drvotech.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "secret-provider-detail" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const provider = new ResendEmailProvider();
    const err = await provider
      .send({
        to: "user@example.com",
        subject: "t",
        textBody: "body",
        htmlBody: "<p>body</p>",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toMatch(/Resend send failed \(HTTP 500\)/);
    expect(String(err)).not.toContain("secret-provider-detail");
  });

  it("Resend provider posts html when provided", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@drvotech.com";
    let postedBody = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "msg_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ResendEmailProvider();
    const result = await provider.send({
      to: "user@example.com",
      subject: "t",
      textBody: "plain",
      htmlBody: "<p>html</p>",
    });
    expect(result.status).toBe("SENT");
    const body = JSON.parse(postedBody) as { html?: string; text?: string };
    expect(body.text).toBe("plain");
    expect(body.html).toBe("<p>html</p>");
  });
});
