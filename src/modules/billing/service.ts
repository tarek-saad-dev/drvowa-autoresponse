import { DEFAULT_BOOTSTRAP_PLAN_CODE } from "@/constants/billing";
import { isUniqueViolationError } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import type { Plan, Subscription } from "@/types/domain";

import {
  getCurrentSubscription,
  getEntitlementSnapshot,
  getLatestSubscription,
  getPlanByCode,
  type EntitlementSnapshot,
} from "./entitlements";
import * as repo from "./repository";

export async function getSubscription(params: {
  businessId: string;
}): Promise<Subscription | null> {
  return (
    (await getCurrentSubscription(params.businessId))
    ?? (await getLatestSubscription(params.businessId))
  );
}

export async function getBillingOverview(params: {
  businessId: string;
}): Promise<EntitlementSnapshot> {
  return getEntitlementSnapshot(params.businessId);
}

export async function listActivePlans(): Promise<Plan[]> {
  return repo.listActivePlans();
}

/**
 * Ensures the business has a current bootstrap (FREE) subscription.
 * Concurrency-safe: filtered unique index + unique-violation re-read.
 */
export async function ensureDefaultSubscription(params: {
  businessId: string;
}): Promise<Subscription> {
  const existing = await getCurrentSubscription(params.businessId);
  if (existing) {
    return existing;
  }

  const freePlan = await getPlanByCode(DEFAULT_BOOTSTRAP_PLAN_CODE);
  if (!freePlan || freePlan.status !== "ACTIVE") {
    throw new NotFoundError(
      `${DEFAULT_BOOTSTRAP_PLAN_CODE} plan is not configured`,
    );
  }

  try {
    return await repo.insertSubscription({
      businessId: params.businessId,
      planId: freePlan.planId,
      status: "ACTIVE",
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      const raced =
        (await getCurrentSubscription(params.businessId))
        ?? (await getLatestSubscription(params.businessId));
      if (raced) {
        return raced;
      }
    }
    throw error;
  }
}
