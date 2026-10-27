import { DEFAULT_BOOTSTRAP_PLAN_CODE } from "@/constants/billing";
import { isUniqueViolationError, sql, withTransaction } from "@/lib/db";
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
    if (process.env.DRVO_PRICING_V1_FREE_TRIAL !== "true") {
      return await repo.insertSubscription({
        businessId: params.businessId, planId: freePlan.planId, status: "ACTIVE",
      });
    }
    return await withTransaction(async (trx) => {
      await trx.query(
        "SELECT BusinessID FROM TblBusiness WITH (UPDLOCK, HOLDLOCK) WHERE BusinessID = @businessId",
        [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
      );
      const current = await getCurrentSubscription(params.businessId, trx);
      if (current) return current;
      // Never enroll a previously subscribed business as a new trial.
      const prior = await getLatestSubscription(params.businessId, trx);
      const created = await repo.insertSubscription({
        businessId: params.businessId, planId: freePlan.planId, status: "ACTIVE",
      }, trx);
      if (!prior) {
        await trx.query(
          "EXEC dbo.PricingV1StartFreeTrial @BusinessID",
          [{ name: "BusinessID", type: sql.UniqueIdentifier, value: params.businessId }],
        );
      }
      return created;
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
