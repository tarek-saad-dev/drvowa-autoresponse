import { describe, expect, it } from "vitest";
import { quotePricingV1, isPricingV1PaymentEnabled } from "@/modules/pricing/payment-quote";

describe("pricing v1 server-side payment quote", () => {
  it("quotes agreed monthly amounts", () => {
    expect(quotePricingV1("STARTER", "MONTHLY").amount).toBe(299);
    expect(quotePricingV1("PRO", "MONTHLY").amount).toBe(599);
    expect(quotePricingV1("BUSINESS", "MONTHLY").amount).toBe(1199);
  });
  it("quotes explicit annual discounted amounts, not 12 times the monthly rate", () => {
    expect(quotePricingV1("STARTER", "ANNUAL").amount).toBe(2990);
    expect(quotePricingV1("PRO", "ANNUAL").amount).toBe(5990);
    expect(quotePricingV1("BUSINESS", "ANNUAL").amount).toBe(11990);
  });
  it("rejects free and invalid plans", () => {
    expect(() => quotePricingV1("FREE", "MONTHLY")).toThrow();
    expect(() => quotePricingV1("UNKNOWN", "MONTHLY")).toThrow();
    expect(() => quotePricingV1("PRO", "WEEKLY" as "MONTHLY")).toThrow();
  });
  it("will not enable production billing while catalog is in draft", () => {
    expect(isPricingV1PaymentEnabled()).toBe(false);
  });
});
