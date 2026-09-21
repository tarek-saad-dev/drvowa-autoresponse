/**
 * Provider-agnostic subscription lifecycle (checkout/portal/webhooks).
 * Does not hardcode Stripe/Paymob — adapters live behind payment-provider.ts.
 */

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
  const event = (result.eventType ?? "").toLowerCase();
  if (
    event.includes("activate")
    || event.includes("created")
    || event.includes("renew")
    || event.includes("paid")
    || event.includes("succeeded")
  ) {
    return "ACTIVE";
  }
  if (event.includes("past_due") || event.includes("past-due")) {
    return "PAST_DUE";
  }
  if (event.includes("cancel")) {
    return "CANCELED";
  }
  if (event.includes("expir")) {
    return "EXPIRED";
  }
  if (event.includes("trial")) {
    return "TRIALING";
  }
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

  const payloadDigest = repo.digestWebhookPayload(options?.rawBody ?? "");
  const insert = await repo.tryInsertWebhookEvent({
    providerName,
    providerEventId,
    eventType: result.eventType ?? "unknown",
    payloadDigest,
    outcome: "APPLIED",
  });

  if (!insert.inserted) {
    structuredLog("billing", "billing.webhook.duplicate", {
      providerName,
      providerEventId,
    });
    return { status: "duplicate" };
  }

  let subscription: Subscription | null = null;
  if (result.externalSubscriptionId) {
    subscription = await repo.findSubscriptionByExternalId({
      externalSubscriptionId: result.externalSubscriptionId,
    });
  }
  if (!subscription && result.businessId) {
    subscription = await repo.getSubscriptionByBusinessId({
      businessId: result.businessId,
    });
  }

  if (!subscription) {
    structuredLog("billing", "billing.webhook.ignored", {
      reason: "SUBSCRIPTION_NOT_FOUND",
      providerEventId,
    });
    return { status: "ignored", reason: "SUBSCRIPTION_NOT_FOUND" };
  }

  const nextStatus = mapLifecycleStatus(result);
  let nextPlanId: string | undefined;
  if (result.planCode) {
    const plan = await repo.getPlanByCode(result.planCode);
    if (plan && plan.status === "ACTIVE") {
      nextPlanId = plan.planId;
    }
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
    periodStartUtc: toDate(result.periodStartUtc),
    periodEndUtc: toDate(result.periodEndUtc),
  });

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
