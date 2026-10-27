/**
 * Proposed Egyptian-market pricing v1.
 * Data-only catalog: NOT connected to checkout or tenant entitlements yet.
 * Preserve existing subscriptions until an explicit migration is approved.
 */
export const PRICING_V1_STATUS = "draft" as const;
export const PRICING_V1_CURRENCY = "EGP" as const;
export const PRICING_V1_PLANS = [
  { code: "free", nameAr: "مجاني", monthlyEgp: 0, annualEgp: 0, aiReplies: 30, quotaPeriod: "lifetime", trialDays: 7, seats: 1, knowledgeItems: 50, whatsappNumbers: 1 },
  { code: "starter", nameAr: "بداية", monthlyEgp: 299, annualEgp: 2990, aiReplies: 750, quotaPeriod: "month", trialDays: null, seats: 1, knowledgeItems: 200, whatsappNumbers: 1 },
  { code: "growth", nameAr: "نمو", monthlyEgp: 599, annualEgp: 5990, aiReplies: 2500, quotaPeriod: "month", trialDays: null, seats: 3, knowledgeItems: 500, whatsappNumbers: 1 },
  { code: "business", nameAr: "أعمال", monthlyEgp: 1199, annualEgp: 11990, aiReplies: 6000, quotaPeriod: "month", trialDays: null, seats: 8, knowledgeItems: 2000, whatsappNumbers: 1 },
] as const;
export const PRICING_V1_ADDONS = [
  { code: "replies_250", type: "one_time", quantity: 250, unit: "ai_reply", priceEgp: 99, validDays: 30 },
  { code: "replies_1000", type: "one_time", quantity: 1000, unit: "ai_reply", priceEgp: 249, validDays: 30 },
  { code: "replies_3000", type: "one_time", quantity: 3000, unit: "ai_reply", priceEgp: 599, validDays: 30 },
  { code: "seat_1", type: "recurring", quantity: 1, unit: "seat", priceEgp: 59, allowedPlans: ["growth", "business"] },
  { code: "seats_5", type: "recurring", quantity: 5, unit: "seat", priceEgp: 249, allowedPlans: ["growth", "business"] },
  { code: "voice_60", type: "one_time", quantity: 60, unit: "voice_minute", priceEgp: 79 },
  { code: "voice_200", type: "one_time", quantity: 200, unit: "voice_minute", priceEgp: 199 },
  { code: "assisted_setup", type: "one_time", quantity: 1, unit: "service", priceEgp: 399 },
  { code: "knowledge_import", type: "one_time", quantity: 1, unit: "service", priceEgp: 199, priceIsStartingFrom: true },
  { code: "team_training", type: "one_time", quantity: 1, unit: "service", priceEgp: 149 },
] as const;
export const PRICING_V1_COMING_SOON = ["multiple_whatsapp_numbers", "crm_integrations", "advanced_campaigns"] as const;
export function pricingV1MonthlyEquivalent(annualEgp: number): number { return Math.round((annualEgp / 12) * 100) / 100; }
export function pricingV1AnnualSavings(monthlyEgp: number, annualEgp: number): number { return monthlyEgp * 12 - annualEgp; }
