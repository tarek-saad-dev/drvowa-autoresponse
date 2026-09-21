/**
 * Bootstrap + commercial plan codes.
 * Prices/limits are authoritative in TblPlan (migration 014).
 */

/** Plan assigned at signup/onboarding — never use paid codes here. */
export const DEFAULT_BOOTSTRAP_PLAN_CODE = "FREE" as const;

export const PAID_PLAN_CODES = ["STARTER", "PRO", "BUSINESS"] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];

export function isPaidPlanCode(code: string): code is PaidPlanCode {
  return (PAID_PLAN_CODES as readonly string[]).includes(code);
}
