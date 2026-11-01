/**
 * Proposed Egyptian-market pricing v1.
 * Data-only catalog: NOT connected to checkout or tenant entitlements yet.
 * Preserve existing subscriptions until an explicit migration is approved.
 */
export const PRICING_V1_STATUS = "draft" as const;
export const PRICING_V1_CURRENCY = "EGP" as const;
export const PRICING_V1_PLANS = [
  { code: "FREE", nameAr: "مجاني", monthlyEgp: 0, annualEgp: 0, aiReplies: 30, quotaPeriod: "lifetime", trialDays: 7, seats: 1, knowledgeItems: 50, whatsappNumbers: 1 },
  { code: "STARTER", nameAr: "بداية", monthlyEgp: 299, annualEgp: 2990, aiReplies: 750, quotaPeriod: "month", trialDays: null, seats: 1, knowledgeItems: 200, whatsappNumbers: 1 },
  { code: "PRO", nameAr: "نمو", monthlyEgp: 599, annualEgp: 5990, aiReplies: 2500, quotaPeriod: "month", trialDays: null, seats: 3, knowledgeItems: 500, whatsappNumbers: 1 },
  { code: "BUSINESS", nameAr: "أعمال", monthlyEgp: 1199, annualEgp: 11990, aiReplies: 6000, quotaPeriod: "month", trialDays: null, seats: 8, knowledgeItems: 2000, whatsappNumbers: 1 },
] as const;
export const PRICING_V1_ADDONS = [
  { code: "replies_250", type: "one_time", quantity: 250, unit: "ai_reply", priceEgp: 99, validDays: 30 },
  { code: "replies_1000", type: "one_time", quantity: 1000, unit: "ai_reply", priceEgp: 249, validDays: 30 },
  { code: "replies_3000", type: "one_time", quantity: 3000, unit: "ai_reply", priceEgp: 599, validDays: 30 },
  { code: "seat_1", type: "recurring", quantity: 1, unit: "seat", priceEgp: 59, allowedPlans: ["PRO", "BUSINESS"] },
  { code: "seats_5", type: "recurring", quantity: 5, unit: "seat", priceEgp: 249, allowedPlans: ["PRO", "BUSINESS"] },
  { code: "voice_60", type: "one_time", quantity: 60, unit: "voice_minute", priceEgp: 79 },
  { code: "voice_200", type: "one_time", quantity: 200, unit: "voice_minute", priceEgp: 199 },
  { code: "assisted_setup", type: "one_time", quantity: 1, unit: "service", priceEgp: 399 },
  { code: "knowledge_import", type: "one_time", quantity: 1, unit: "service", priceEgp: 199, priceIsStartingFrom: true },
  { code: "team_training", type: "one_time", quantity: 1, unit: "service", priceEgp: 149 },
] as const;
export const PRICING_V1_COMING_SOON = ["multiple_whatsapp_numbers", "crm_integrations", "advanced_campaigns"] as const;
export function pricingV1MonthlyEquivalent(annualEgp: number): number { return Math.round((annualEgp / 12) * 100) / 100; }
export function pricingV1AnnualSavings(monthlyEgp: number, annualEgp: number): number { return monthlyEgp * 12 - annualEgp; }

/** No billing activation: these helpers are for validation and migration planning only. */
export type PricingV1PlanCode = (typeof PRICING_V1_PLANS)[number]["code"];
export function getPricingV1Plan(code: string) {
  return PRICING_V1_PLANS.find((plan) => plan.code === code) ?? null;
}
export function getPricingV1Addon(code: string) {
  return PRICING_V1_ADDONS.find((addon) => addon.code === code) ?? null;
}
export function isPricingV1AddonAllowed(addonCode: string, planCode: string): boolean {
  const addon = getPricingV1Addon(addonCode);
  const plan = getPricingV1Plan(planCode);
  if (!addon || !plan || plan.code === "FREE") return false;
  return !("allowedPlans" in addon) || (addon.allowedPlans as readonly string[]).includes(plan.code);
}
export function getPricingV1AiReplyBalance(planCode: string, consumed: number, extraCredits = 0): number {
  const plan = getPricingV1Plan(planCode);
  if (!plan || !Number.isSafeInteger(consumed) || consumed < 0
    || !Number.isSafeInteger(extraCredits) || extraCredits < 0) {
    throw new Error("INVALID_PRICING_BALANCE_INPUT");
  }
  return Math.max(0, plan.aiReplies + extraCredits - consumed);
}
export function isPricingV1TrialExpired(start: Date, now: Date): boolean {
  if (Number.isNaN(start.getTime()) || Number.isNaN(now.getTime())) throw new Error("INVALID_TRIAL_DATE");
  const trial = getPricingV1Plan("FREE");
  if (!trial?.trialDays) throw new Error("TRIAL_NOT_CONFIGURED");
  return now.getTime() >= start.getTime() + trial.trialDays * 86_400_000;
}
