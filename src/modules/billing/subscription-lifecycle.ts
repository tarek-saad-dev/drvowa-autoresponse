/**
 * Provider-agnostic subscription lifecycle (checkout/portal/webhooks).
 * Does not hardcode Stripe/Paymob — adapters live behind payment-provider.ts.
 */

import { withTransaction } from "@/lib/db";
import { structuredLog } from "@/lib/observability/logger";
import type { Subscription, SubscriptionStatus } from "@/types/domain";

import * as repo from "./repository";
import {
  getPaymentProvider,
  isPaymentCheckoutEnabled,
  PAYMENT_GATE_ERROR,
  type CheckoutSessionInput,
  type CheckoutSessionResult,
  type PortalSessionInput,
  type PortalSessionResult,
  type WebhookVerificationResult,
} from "./payment-provider";

export type ApplyWebhookResult =
  | { status: "applied"; subscriptionId?: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "failed"; reason: string };

function toDate(value: Date | string | undefined): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function mapLifecycleStatus(
  result: WebhookVerificationResult,
): SubscriptionStatus | undefined {
  if (result.mappedStatus) {
    return result.mappedStatus;
  }
  // Only a verified provider adapter may map an event to entitlements.
  // Text matching would treat invoice.unpaid / refund.succeeded as ACTIVE.
  return undefined;
}

/**
 * Apply a verified webhook idempotently via TblBillingWebhookEvent.
 */
export async function applyVerifiedWebhook(
  result: WebhookVerificationResult,
  options?: {
    providerName?: string;
    rawBody?: string;
  },
): Promise<ApplyWebhookResult> {
  if (!result.ok) {
    return { status: "failed", reason: "WEBHOOK_NOT_VERIFIED" };
  }

  const providerName =
    options?.providerName?.trim()
    || getPaymentProvider().name
    || "unconfigured";
  const providerEventId = result.providerEventId?.trim();
  if (!providerEventId) {
    return { status: "failed", reason: "MISSING_PROVIDER_EVENT_ID" };
  }

  return withTransaction(async (trx): Promise<ApplyWebhookResult> => {
  const payloadDigest = repo.digestWebhookPayload(options?.rawBody ?? "");
  const insert = await repo.tryInsertWebhookEvent({
    providerName,
    providerEventId,
    eventType: result.eventType ?? "unknown",
    payloadDigest,
    outcome: "IGNORED",
  }, trx);

  if (!insert.inserted) {
    structuredLog("billing", "billing.webhook.duplicate", {
      providerName,
      providerEventId,
    });
    return { status: "duplicate" };
  }

  const nextStatus = mapLifecycleStatus(result);
  if (!nextStatus) {
    await repo.finishWebhookEvent(insert.billingWebhookEventId, "IGNORED", "UNMAPPED_EVENT", trx);
    return { status: "ignored", reason: "UNMAPPED_EVENT" };
  }
  let subscription: Subscription | null = null;
  if (result.externalSubscriptionId) {
    subscription = await repo.findSubscriptionByExternalId({
      externalSubscriptionId: result.externalSubscriptionId,
      providerName,
    }, trx);
  }
  if (!result.externalSubscriptionId && result.businessId) {
    subscription = await repo.getSubscriptionByBusinessId({
      businessId: result.businessId,
    }, trx);
  }

  // Roll back the dedup marker as well: a delayed local write must be retryable.
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
  if ((result.businessId && subscription.businessId.toLowerCase() !== result.businessId.toLowerCase())
    || (subscription.providerName && subscription.providerName !== providerName)) {
    throw new Error("SUBSCRIPTION_IDENTITY_MISMATCH");
  }
  const periodStart = toDate(result.periodStartUtc);
  const periodEnd = toDate(result.periodEndUtc);
  if ((result.periodStartUtc !== undefined && (!periodStart || !Number.isFinite(periodStart.getTime())))
    || (result.periodEndUtc !== undefined && (!periodEnd || !Number.isFinite(periodEnd.getTime())))
    || (periodStart && periodEnd && periodEnd <= periodStart)) {
    throw new Error("INVALID_BILLING_PERIOD");
  }
  let nextPlanId: string | undefined;
  if (result.planCode) {
    const plan = await repo.getPlanByCode(result.planCode, trx);
    if (!plan || plan.status !== "ACTIVE") throw new Error("INVALID_BILLING_PLAN");
    nextPlanId = plan.planId;
  }

  await repo.updateSubscriptionBillingFields({
    subscriptionId: subscription.subscriptionId,
    status: nextStatus,
    planId: nextPlanId,
    providerName,
    externalCustomerId:
      result.externalCustomerId !== undefined
        ? result.externalCustomerId
        : undefined,
    externalSubscriptionId:
      result.externalSubscriptionId !== undefined
        ? result.externalSubscriptionId
        : undefined,
    periodStartUtc: periodStart,
    periodEndUtc: periodEnd,
  }, trx);
  await repo.finishWebhookEvent(insert.billingWebhookEventId, "APPLIED", null, trx);

  structuredLog("billing", "billing.webhook.applied", {
    providerName,
    providerEventId,
    subscriptionId: subscription.subscriptionId,
    mappedStatus: nextStatus ?? null,
    planCode: result.planCode ?? null,
  });

  return {
    status: "applied",
    subscriptionId: subscription.subscriptionId,
  };
  });
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  if (!isPaymentCheckoutEnabled()) {
    throw new Error(PAYMENT_GATE_ERROR);
  }
  return getPaymentProvider().createCheckout(input);
}

export async function createPortalSession(
  input: PortalSessionInput,
): Promise<PortalSessionResult> {
  if (!isPaymentCheckoutEnabled()) {
    throw new Error(PAYMENT_GATE_ERROR);
  }
  return getPaymentProvider().createPortal(input);
}
