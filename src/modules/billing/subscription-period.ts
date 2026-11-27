/**
 * Subscription billing-period helpers (TblSubscription.Period*).
 * Distinct from usage-period calendar month windows in period.ts.
 *
 * Rules (V1 manual billing):
 * - Paid monthly activation duration = 30 elapsed days from a base instant.
 * - Same-plan renewal: if current paid period has not passed its grace deadline, extend FROM
 *   existing PeriodEndUtc (customer does not lose remaining paid time).
 * - Upgrade to a different plan: period starts at approval time (no proration).
 */

export function addOneCalendarMonth(from: Date): Date {
  return addCalendarMonths(from, 1);
}

export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp overflow (e.g. Jan 31 → Mar 3) back to last day of target month.
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d;
}

/**
 * Compute paid subscription period for activation/renewal.
 * @param samePlanRenewal - true when renewing the same plan code
 * @param currentPeriodEndUtc - existing PeriodEndUtc when renewing
 * @param now - approval / activation instant
 */
export function addPaidBillingInterval(from: Date, interval: "MONTHLY" | "ANNUAL" = "MONTHLY"): Date {
  return interval === "ANNUAL" ? addCalendarMonths(from, 12) : new Date(from.getTime() + 30 * 86400000);
}

export function computePaidSubscriptionPeriod(params: {
  billingInterval?: "MONTHLY" | "ANNUAL";
  samePlanRenewal: boolean;
  currentPeriodEndUtc: Date | null | undefined;
  now?: Date;
}): { periodStartUtc: Date; periodEndUtc: Date } {
  const now = params.now ?? new Date();
  if (
    params.samePlanRenewal
    && params.currentPeriodEndUtc
    && !gracePeriodEnded(params.currentPeriodEndUtc, now)
  ) {
    const periodStartUtc = params.currentPeriodEndUtc;
    return {
      periodStartUtc,
      periodEndUtc: addPaidBillingInterval(periodStartUtc, params.billingInterval),
    };
  }
  return {
    periodStartUtc: now,
    periodEndUtc: addPaidBillingInterval(now, params.billingInterval),
  };
}

export function isSubscriptionPeriodExpired(params: {
  periodEndUtc: Date | null | undefined;
  now?: Date;
}): boolean {
  if (!params.periodEndUtc) return false;
  const now = params.now ?? new Date();
  return params.periodEndUtc.getTime() <= now.getTime();
}


export const GRACE_PERIOD_DAYS = 5;
export function gracePeriodEnded(end: Date | null | undefined, now = new Date()): boolean {
  return !!end && now.getTime() >= end.getTime() + GRACE_PERIOD_DAYS * 86400000;
}
