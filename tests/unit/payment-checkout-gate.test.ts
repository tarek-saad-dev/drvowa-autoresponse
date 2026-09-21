import { describe, expect, it } from "vitest";

import {
  getPaymentProvider,
  isPaymentCheckoutEnabled,
} from "@/modules/billing/payment-provider";

describe("payment checkout gate", () => {
  it("isPaymentCheckoutEnabled stays false without real adapter", async () => {
    const prev = process.env.PAYMENT_PROVIDER;
    try {
      delete process.env.PAYMENT_PROVIDER;
      expect(isPaymentCheckoutEnabled()).toBe(false);
      process.env.PAYMENT_PROVIDER = "unconfigured";
      expect(isPaymentCheckoutEnabled()).toBe(false);
      process.env.PAYMENT_PROVIDER = "stripe";
      expect(isPaymentCheckoutEnabled()).toBe(false);
      await expect(
        getPaymentProvider().createCheckout({
          businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          planCode: "PRO",
          successUrl: "https://example.com/ok",
          cancelUrl: "https://example.com/cancel",
        }),
      ).rejects.toThrow(/EXTERNAL_GATE_PAYMENT_PROVIDER/);
    } finally {
      if (prev === undefined) delete process.env.PAYMENT_PROVIDER;
      else process.env.PAYMENT_PROVIDER = prev;
    }
  });
});
