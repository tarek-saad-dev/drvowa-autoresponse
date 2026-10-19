/**
 * Subscription billing-period helpers (TblSubscription.Period*).
 * Distinct from usage-period calendar month windows in period.ts.
 *
 * Rules (V1 manual billing):
 * - Paid activation duration = 1 calendar month from a base instant.
 * - Same-plan renewal: if current paid PeriodEndUtc > now, extend FROM
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
    && params.currentPeriodEndUtc.getTime() > now.getTime()
  ) {
    const periodStartUtc = params.currentPeriodEndUtc;
    return {
      periodStartUtc,
      periodEndUtc: addCalendarMonths(periodStartUtc, params.billingInterval === "ANNUAL" ? 12 : 1),
    };
  }
  return {
    periodStartUtc: now,
    periodEndUtc: addCalendarMonths(now, params.billingInterval === "ANNUAL" ? 12 : 1),
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
