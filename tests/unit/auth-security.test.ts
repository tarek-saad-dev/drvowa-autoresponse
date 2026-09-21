import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  RATE_LIMITS,
  RateLimitError,
  assertRateLimit,
  resetRateLimitBucketsForTests,
} from "@/lib/security/rate-limit";
import {
  manualWaIdempotencyKey,
  manualWaOutboundReservationKey,
} from "@/modules/billing/period";
import { hashResetToken } from "@/modules/auth/password-reset";
import {
  LocalDevEmailProvider,
  GatedProductionEmailProvider,
  ResendEmailProvider,
  SmtpEmailProvider,
  getEmailProvider,
  isEmailDeliveryEnabled,
  hasResendCredentials,
  hasSmtpCredentials,
} from "@/modules/auth/email-provider";

describe("rate limit", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
  });

  it("allows up to limit then throws", () => {
    const key = "test:login";
    for (let i = 0; i < RATE_LIMITS.login.limit; i += 1) {
      expect(() => assertRateLimit(key, RATE_LIMITS.login)).not.toThrow();
    }
    expect(() => assertRateLimit(key, RATE_LIMITS.login)).toThrow(RateLimitError);
  });
});

describe("manual wa keys", () => {
  it("prefixes reservation and runtime idempotency keys", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(manualWaOutboundReservationKey(id)).toBe(`manual-wa:${id}`);
    expect(manualWaIdempotencyKey(id)).toBe(`manual:${id}`);
  });
});

describe("password reset token hash", () => {
  it("hashes deterministically without storing raw token", () => {
    const a = hashResetToken("abc");
    const b = hashResetToken("abc");
    const c = hashResetToken("abd");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("email provider adapters", () => {
  const emailEnvKeys = [
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_SECURE",
  ] as const;

  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = {};
    for (const key of emailEnvKeys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of emailEnvKeys) {
      const prev = snapshot[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  it("local adapter queues without external send", async () => {
    const p = new LocalDevEmailProvider();
    const result = await p.send({
      to: "user@example.com",
      subject: "test",
      textBody: "hello",
    });
    expect(result.status).toBe("QUEUED_LOCAL");
  });

  it("gated production adapter refuses send", async () => {
    const p = new GatedProductionEmailProvider();
    const result = await p.send({
      to: "user@example.com",
      subject: "test",
      textBody: "hello",
    });
    expect(result.status).toBe("DISABLED");
    if (result.status === "DISABLED") {
      expect(result.reason).toBe("EXTERNAL_GATE_EMAIL_PROVIDER");
    }
  });

  it("reports email delivery disabled without credentials", () => {
    expect(isEmailDeliveryEnabled()).toBe(false);
  });

  it("production provider selection prefers gated when EMAIL_PROVIDER unset", async () => {
    const gated = new GatedProductionEmailProvider();
    const result = await gated.send({
      to: "user@example.com",
      subject: "test",
      textBody: "hello",
    });
    expect(result.status).toBe("DISABLED");
    expect(isEmailDeliveryEnabled()).toBe(false);
  });

  it("resend/smtp without credentials stay gated and delivery disabled", () => {
    process.env.EMAIL_PROVIDER = "resend";
    expect(hasResendCredentials()).toBe(false);
    expect(getEmailProvider()).toBeInstanceOf(GatedProductionEmailProvider);
    expect(isEmailDeliveryEnabled()).toBe(false);

    process.env.EMAIL_PROVIDER = "smtp";
    expect(hasSmtpCredentials()).toBe(false);
    expect(getEmailProvider()).toBeInstanceOf(GatedProductionEmailProvider);
    expect(isEmailDeliveryEnabled()).toBe(false);
  });

  it("resend credentials enable delivery flag and select Resend provider", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "noreply@example.com";
    expect(hasResendCredentials()).toBe(true);
    expect(isEmailDeliveryEnabled()).toBe(true);
    expect(getEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });

  it("smtp credentials enable delivery flag and select Smtp provider", () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_SECURE = "false";
    process.env.EMAIL_FROM = "noreply@example.com";
    expect(hasSmtpCredentials()).toBe(true);
    expect(isEmailDeliveryEnabled()).toBe(true);
    expect(getEmailProvider()).toBeInstanceOf(SmtpEmailProvider);
  });

  it("explicit local/dev never reports delivery enabled", () => {
    process.env.EMAIL_PROVIDER = "local";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "noreply@example.com";
    expect(getEmailProvider()).toBeInstanceOf(LocalDevEmailProvider);
    expect(isEmailDeliveryEnabled()).toBe(false);
  });
});
