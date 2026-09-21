import { describe, expect, it } from "vitest";

import { AGENT_INSTRUCTIONS_MAX } from "@/constants/field-limits";
import { buildSystemPrompt } from "@/modules/ai/provider";
import {
  manualWaIdempotencyKey,
  manualWaOutboundReservationKey,
} from "@/modules/billing/period";
import {
  RATE_LIMITS,
  RateLimitError,
  assertRateLimit,
  resetRateLimitBucketsForTests,
} from "@/lib/security/rate-limit";
import { hashResetToken } from "@/modules/auth/password-reset";

/**
 * Release-candidate flow contracts (mocked / unit level).
 * Full browser E2E is EXTERNAL when Playwright is not installed;
 * these guard the critical invariants for flows A–J where practical.
 */
describe("prelaunch release flow contracts", () => {
  it("FLOW D/F keys: AI and manual WA reservation prefixes stay distinct", () => {
    const job = "job-1";
    const manual = "11111111-1111-4111-8111-111111111111";
    expect(manualWaOutboundReservationKey(manual)).toContain("manual-wa:");
    expect(manualWaIdempotencyKey(manual)).toContain("manual:");
    expect(manualWaOutboundReservationKey(manual)).not.toContain(`ai-reply:${job}`);
  });

  it("FLOW E: human takeover path uses dedicated manual reservation key", () => {
    const key = manualWaOutboundReservationKey(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(key.startsWith("manual-wa:")).toBe(true);
  });

  it("FLOW H: password reset tokens are hashed", () => {
    const hash = hashResetToken("raw-token-value");
    expect(hash).not.toContain("raw-token");
    expect(hash).toHaveLength(64);
  });

  it("FLOW abuse: login rate limit trips", () => {
    resetRateLimitBucketsForTests();
    const key = "release-flow-login";
    for (let i = 0; i < RATE_LIMITS.login.limit; i += 1) {
      assertRateLimit(key, RATE_LIMITS.login);
    }
    expect(() => assertRateLimit(key, RATE_LIMITS.login)).toThrow(RateLimitError);
  });

  it("agent instructions are truncated in system prompt", () => {
    const huge = "x".repeat(AGENT_INSTRUCTIONS_MAX + 500);
    const prompt = buildSystemPrompt({
      name: "R",
      roleTitle: "Receptionist",
      language: "ar",
      dialect: null,
      tone: null,
      instructions: huge,
    });
    expect(prompt.includes("x".repeat(AGENT_INSTRUCTIONS_MAX))).toBe(true);
    expect(prompt.includes("x".repeat(AGENT_INSTRUCTIONS_MAX + 1))).toBe(false);
  });

  it("payment provider remains gated (EXTERNAL_GATE)", async () => {
    const {
      getPaymentProvider,
      isPaymentCheckoutEnabled,
    } = await import("@/modules/billing/payment-provider");
    expect(isPaymentCheckoutEnabled()).toBe(false);
    const provider = getPaymentProvider();
    await expect(
      provider.createCheckout({
        businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        planCode: "PRO",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toThrow(/EXTERNAL_GATE_PAYMENT_PROVIDER/);
  });
});
