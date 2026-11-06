import type { EntitlementSnapshot } from "@/modules/billing/entitlements";
import type { FreeTrialUsage } from "@/modules/pricing/free-trial-usage";

/**
 * Historical quota-failed escalations survive a successful payment until
 * they're handled. Their count must not be presented as an ACTIVE quota outage.
 *
 * This is only the AI-reply quota: outbound WhatsApp limits have a separate
 * status, and inactive/unknown subscriptions have their own billing notice.
 */
export function isAiReplyQuotaCurrentlyExhausted(
  billing: EntitlementSnapshot | null,
  freeTrial: FreeTrialUsage | null = null,
): boolean {
  if (!billing?.canAct || !billing.plan) return false;

  const limit = billing.plan.monthlyAiReplies;
  if (limit !== null && limit !== undefined && billing.aiUsed >= limit) {
    return true;
  }

  return billing.plan.code === "FREE"
    && freeTrial !== null
    && (freeTrial.expired || freeTrial.remaining <= 0);
}
