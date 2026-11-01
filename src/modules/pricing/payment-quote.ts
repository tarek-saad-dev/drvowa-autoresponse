import {
  getPricingV1Plan,
  PRICING_V1_CURRENCY,
  PRICING_V1_STATUS,
} from "@/modules/pricing/pricing-v1-catalog";

export type PricingBillingInterval = "MONTHLY" | "ANNUAL";
export type PricingQuote = {
  code: "STARTER" | "PRO" | "BUSINESS";
  amount: number;
  currencyCode: "EGP";
  billingInterval: PricingBillingInterval;
  catalogVersion: "pricing-v1";
};

/** Pure quote helper. Never trusts client-provided prices. */
export function quotePricingV1(planCode: string, billingInterval: PricingBillingInterval): PricingQuote {
  if (billingInterval !== "MONTHLY" && billingInterval !== "ANNUAL") {
    throw new Error("INVALID_BILLING_INTERVAL");
  }
  const plan = getPricingV1Plan(planCode);
  if (!plan || plan.code === "FREE") throw new Error("INVALID_PAID_PLAN");
  return {
    code: plan.code,
    amount: billingInterval === "ANNUAL" ? plan.annualEgp : plan.monthlyEgp,
    currencyCode: PRICING_V1_CURRENCY,
    billingInterval,
    catalogVersion: "pricing-v1",
  };
}

/**
 * Explicit opt-in for later controlled rollout.
 * Inactive by default: pricing-v1 catalog remains draft.
 */
export function isPricingV1PaymentEnabled(): boolean {
  return process.env.DRVO_PRICING_V1_PAYMENTS === "true"
    && process.env.NODE_ENV !== "production"
    && PRICING_V1_STATUS === "draft";
}
