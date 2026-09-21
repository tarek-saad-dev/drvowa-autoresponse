import { describe, expect, it, beforeEach } from "vitest";

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
  getEmailProvider,
  isEmailDeliveryEnabled,
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

  it("production without real provider stays gated and reports delivery disabled", () => {
    const prevNode = process.env.NODE_ENV;
    const prevProvider = process.env.EMAIL_PROVIDER;
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_PROVIDER;
    try {
      expect(getEmailProvider().name).toBe("gated-production");
      expect(isEmailDeliveryEnabled()).toBe(false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevProvider === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = prevProvider;
    }
  });
});
