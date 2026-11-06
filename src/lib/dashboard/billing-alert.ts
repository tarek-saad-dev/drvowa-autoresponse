import type { EntitlementSnapshot } from "@/modules/billing/entitlements";
import type { FreeTrialUsage } from "@/modules/pricing/free-trial-usage";

export type HomeBillingAlert = {
  kind: "subscription_inactive" | "paid_grace" | "paid_expired" | "free_trial_ended" | "quota_exhausted";
  title: string;
  description: string;
  detail: string | null;
  actionLabel: string;
};

type BillingInput = {
  snapshot: EntitlementSnapshot;
  freeTrial?: FreeTrialUsage | null;
  lastExpiredPaidAt?: Date | null;
  now?: Date;
  timezone?: string;
};

function formatDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      timeZone: timezone, day: "numeric", month: "long", year: "numeric",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo", day: "numeric", month: "long", year: "numeric",
    }).format(date);
  }
}

function limitReached(used: number, limit: number | null | undefined): boolean {
  return limit != null && limit >= 0 && used >= limit;
}

/**
 * One truthful, account-wide alert above the overview. This does not depend on
 * the Pulse today/yesterday/month filter, and never mistakes a FREE plan's
 * monthly usage cap for expiry of the subscription itself.
 */
export function deriveHomeBillingAlert({
  snapshot, freeTrial = null, lastExpiredPaidAt = null,
  now = new Date(), timezone = "Africa/Cairo",
}: BillingInput): HomeBillingAlert | null {
  const { subscription, plan, canAct, usagePeriod, aiUsed, whatsappOutboundUsed } = snapshot;

  if (!subscription || !plan || !canAct) {
    return {
      kind: "subscription_inactive",
      title: "اشتراكك يحتاج مراجعة",
      description: subscription?.status === "PAST_DUE"
        ? "فيه مشكلة في حالة الدفع أو تجديد الاشتراك. راجع تفاصيل الباقة علشان تعرف الخطوة المطلوبة."
        : "الباقة الحالية غير متاحة للاستخدام. راجع حالة اشتراكك قبل الاعتماد على ردود الموظف الذكي.",
      detail: null,
      actionLabel: "مراجعة الاشتراك",
    };
  }

  const isFree = plan.code === "FREE";
  const monthlyAiExhausted = limitReached(aiUsed, plan.monthlyAiReplies);
  const outboundExhausted = limitReached(whatsappOutboundUsed, plan.monthlyWhatsAppOutbound);
  const trialEnded = isFree && freeTrial != null && (freeTrial.expired || freeTrial.remaining <= 0);
  const aiExhausted = monthlyAiExhausted || trialEnded;
  const exhaustedParts = [
    ...(monthlyAiExhausted ? [`${aiUsed.toLocaleString("en-US")} من ${plan.monthlyAiReplies?.toLocaleString("en-US")} رد ذكي`] : []),
    ...(outboundExhausted ? [`${whatsappOutboundUsed.toLocaleString("en-US")} من ${plan.monthlyWhatsAppOutbound?.toLocaleString("en-US")} رسالة واتساب صادرة`] : []),
  ];
  const usageText = exhaustedParts.length
    ? `وصلت للحد المتاح: ${exhaustedParts.join("، و")}.`
    : "";
  const monthlyReset = `تتجدد حدود الاستخدام الشهرية في ${formatDate(usagePeriod.usagePeriodEndUtc, timezone)}.`;

  // Paid service may still operate in the 5-day grace window. Do not claim
  // its status is inactive merely because the paid period date has passed.
  if (!isFree && subscription.periodEndUtc && subscription.periodEndUtc <= now) {
    return {
      kind: "paid_grace",
      title: "فترة اشتراكك المدفوعة انتهت",
      description: `انتهت الفترة يوم ${formatDate(subscription.periodEndUtc, timezone)}. أنت في فترة السماح قبل التحويل للباقة المجانية؛ راجع التجديد.`,
      detail: usageText || null,
      actionLabel: "تجديد الاشتراك",
    };
  }

  // Expired paid plans are converted to an ACTIVE FREE subscription by the
  // billing lifecycle. The previous expired paid record is the evidence.
  if (isFree && lastExpiredPaidAt) {
    return {
      kind: "paid_expired",
      title: "انتهى اشتراكك المدفوع",
      description: `انتهت الباقة المدفوعة يوم ${formatDate(lastExpiredPaidAt, timezone)} وتم تحويل حسابك إلى الباقة المجانية. ${usageText || "أصبحت حدود الباقة المجانية هي المطبقة على حسابك."}`,
      detail: trialEnded ? "رصيد التجربة المجانية لا يتجدد شهريًا." : (exhaustedParts.length ? monthlyReset : null),
      actionLabel: "تجديد أو تغيير الباقة",
    };
  }

  if (trialEnded) {
    return {
      kind: "free_trial_ended",
      title: "انتهى رصيد ردود التجربة المجانية",
      description: "الموظف الذكي مش هيقدر يرسل ردود جديدة على رصيد التجربة. تقدر تختار باقة مناسبة لاستكمال الردود الآلية." +
        (outboundExhausted ? ` ووصلت كمان لحد رسائل واتساب الصادرة (${whatsappOutboundUsed} من ${plan.monthlyWhatsAppOutbound}).` : ""),
      detail: outboundExhausted ? "حد رسائل واتساب الشهري بيتجدد في " + formatDate(usagePeriod.usagePeriodEndUtc, timezone) + "، لكن رصيد التجربة نفسه لا يتجدد." : "رصيد التجربة المجانية لا يتجدد تلقائيًا كل شهر.",
      actionLabel: "اختيار باقة",
    };
  }

  if (aiExhausted || outboundExhausted) {
    return {
      kind: "quota_exhausted",
      title: aiExhausted && outboundExhausted
        ? "وصلت للحد الشهري لردود AI ورسائل واتساب"
        : aiExhausted ? "رصيد ردود الموظف الذكي خلص" : "وصلت للحد الشهري لرسائل واتساب",
      description: `${usageText} ${aiExhausted ? "الردود الآلية الجديدة قد تتوقف حتى يتوفر رصيد." : "الإرسال الجديد المقيد بالباقة قد يتوقف حتى يتوفر رصيد."}`,
      detail: monthlyReset,
      actionLabel: isFree ? "ترقية الباقة" : "زيادة الحدود أو تغيير الباقة",
    };
  }

  return null;
}
