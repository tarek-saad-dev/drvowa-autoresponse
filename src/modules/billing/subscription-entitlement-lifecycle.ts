/**
 * Authoritative paid-subscription expiry → FREE bootstrap.
 * Neutral module — does not import entitlements.ts (avoids cycles).
 */

import { DEFAULT_BOOTSTRAP_PLAN_CODE, isPaidPlanCode } from "@/constants/billing";
import {
  query,
  sql,
  withTransaction,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import { NotFoundError } from "@/lib/tenancy/errors";
import type { Plan, Subscription, SubscriptionStatus } from "@/types/domain";

import * as billingRepo from "./repository";
import { isSubscriptionPeriodExpired } from "./subscription-period";

type SubscriptionRow = {
  SubscriptionID: string;
  BusinessID: string;
  PlanID: string;
  Status: string;
  PeriodStartUtc: Date | null;
  PeriodEndUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    subscriptionId: normalizeUuid(row.SubscriptionID),
    businessId: normalizeUuid(row.BusinessID),
    planId: normalizeUuid(row.PlanID),
    status: row.Status as SubscriptionStatus,
    periodStartUtc: row.PeriodStartUtc,
    periodEndUtc: row.PeriodEndUtc,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

async function lockCurrentSubscription(
  businessId: string,
  trx: TransactionClient,
): Promise<Subscription | null> {
  const result = await trx.query<SubscriptionRow>(
    `SELECT TOP 1 SubscriptionID, BusinessID, PlanID, Status,
            PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblSubscription WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
     WHERE BusinessID = @businessId
       AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSubscription(row) : null;
}

async function readCurrentSubscription(
  businessId: string,
  trx: TransactionClient,
): Promise<Subscription | null> {
  const result = await trx.query<SubscriptionRow>(
    `SELECT TOP 1 SubscriptionID, BusinessID, PlanID, Status,
            PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblSubscription
     WHERE BusinessID = @businessId
       AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSubscription(row) : null;
}

async function expirePaidAndBootstrapFree(
  businessId: string,
  trx: TransactionClient,
): Promise<Subscription | null> {
  const locked = await lockCurrentSubscription(businessId, trx);
  if (!locked) return null;

  if (!isSubscriptionPeriodExpired({ periodEndUtc: locked.periodEndUtc })) {
    return locked;
  }

  const plan = await billingRepo.getPlanById(locked.planId, trx);
  if (!plan || plan.code === DEFAULT_BOOTSTRAP_PLAN_CODE) {
    return locked;
  }
  if (!isPaidPlanCode(plan.code)) {
    return locked;
  }

  await billingRepo.updateSubscriptionBillingFields(
    {
      subscriptionId: locked.subscriptionId,
      status: "EXPIRED",
    },
    trx,
  );

  const existingAfter = await readCurrentSubscription(businessId, trx);
  if (existingAfter) return existingAfter;

  const freePlan = await billingRepo.getPlanByCode(
    DEFAULT_BOOTSTRAP_PLAN_CODE,
    trx,
  );
  if (!freePlan || freePlan.status !== "ACTIVE") {
    throw new NotFoundError("FREE plan is not configured");
  }

  try {
    return await billingRepo.insertSubscription(
      {
        businessId,
        planId: freePlan.planId,
        status: "ACTIVE",
        periodEndUtc: null,
      },
      trx,
    );
  } catch {
    const raced = await readCurrentSubscription(businessId, trx);
    if (raced) return raced;
    throw new NotFoundError("Failed to bootstrap FREE after expiry");
  }
}

/**
 * Ensure current subscription reflects paid PeriodEndUtc expiry.
 * Safe inside an outer transaction (pass trx) or standalone.
 */
export async function ensureCurrentSubscriptionEntitlements(
  businessId: string,
  trx?: TransactionClient,
): Promise<{
  subscription: Subscription | null;
  plan: Plan | null;
}> {
  const run = async (client: TransactionClient) => {
    const subscription = await expirePaidAndBootstrapFree(businessId, client);
    const plan = subscription
      ? await billingRepo.getPlanById(subscription.planId, client)
      : null;
    return { subscription, plan };
  };

  if (trx) return run(trx);
  return withTransaction(run);
}

/** Standalone reconcile for callers that only need the side-effect. */
export async function reconcileExpiredPaidSubscription(
  businessId: string,
): Promise<Subscription | null> {
  const { subscription } = await ensureCurrentSubscriptionEntitlements(
    businessId,
  );
  return subscription;
}

void query;
