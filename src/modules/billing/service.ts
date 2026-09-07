import { NotFoundError } from "@/lib/tenancy/errors";
import type { Subscription } from "@/types/domain";

import * as repo from "./repository";

export async function getSubscription(params: {
  businessId: string;
}): Promise<Subscription | null> {
  return repo.getSubscriptionByBusinessId({ businessId: params.businessId });
}

/**
 * Ensures the business has a subscription on the FREE plan.
 * Idempotent if a subscription already exists.
 */
export async function ensureDefaultSubscription(params: {
  businessId: string;
}): Promise<Subscription> {
  const existing = await repo.getSubscriptionByBusinessId({
    businessId: params.businessId,
  });
  if (existing) {
    return existing;
  }

  const freePlan = await repo.getPlanByCode("FREE");
  if (!freePlan || freePlan.status !== "ACTIVE") {
    throw new NotFoundError("FREE plan is not configured");
  }

  return repo.insertSubscription({
    businessId: params.businessId,
    planId: freePlan.planId,
    status: "ACTIVE",
  });
}
