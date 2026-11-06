import { describe, expect, it } from "vitest";
import { deriveHomeBillingAlert } from "@/lib/dashboard/billing-alert";
import { isAiReplyQuotaCurrentlyExhausted } from "@/lib/dashboard/pulse-quota-notice";
import type { EntitlementSnapshot } from "@/modules/billing/entitlements";

const now = new Date("2026-11-06T12:00:00Z");
const periodEnd = new Date("2026-12-01T00:00:00Z");
const pastEnd = new Date("2026-11-03T12:00:00Z");

function snapshot(overrides: {
  planCode?: "FREE" | "STARTER";
  monthlyAiReplies?: number | null;
  monthlyWhatsAppOutbound?: number | null;
  aiUsed?: number;
  whatsappOutboundUsed?: number;
  canAct?: boolean;
  status?: "ACTIVE" | "PAST_DUE" | "EXPIRED";
  periodEndUtc?: Date | null;
} = {}): EntitlementSnapshot {
  return {
    plan: {
      planId: "plan", code: overrides.planCode ?? "FREE",
      displayName: "Test", status: "ACTIVE",
      monthlyAiReplies: overrides.monthlyAiReplies === undefined ? 30 : overrides.monthlyAiReplies,
      monthlyWhatsAppOutbound: overrides.monthlyWhatsAppOutbound === undefined ? 500 : overrides.monthlyWhatsAppOutbound,
      maxAgents: 1, maxWhatsAppConnections: 1, maxActiveKnowledgeItems: 100,
      createdAtUtc: now, updatedAtUtc: now,
    },
    subscription: {
      subscriptionId: "subscription", businessId: "business", planId: "plan",
      status: overrides.status ?? "ACTIVE",
      periodStartUtc: null, periodEndUtc: overrides.periodEndUtc ?? null,
      createdAtUtc: now, updatedAtUtc: now,
    },
    usagePeriod: {
      usagePeriodStartUtc: new Date("2026-11-01T00:00:00Z"),
      usagePeriodEndUtc: periodEnd,
    },
    aiUsed: overrides.aiUsed ?? 0,
    whatsappOutboundUsed: overrides.whatsappOutboundUsed ?? 0,
    agentsUsed: 1, activeKnowledgeUsed: 0, whatsappConnectionsUsed: 1,
    canAct: overrides.canAct ?? true, blockReason: null,
  };
}
const compute = (
  input: EntitlementSnapshot,
  options: { lastExpiredPaidAt?: Date; freeTrial?: { remaining: number; used: number; expiresAtUtc: Date; expired: boolean } } = {},
) => deriveHomeBillingAlert({ snapshot: input, now, timezone: "Africa/Cairo", ...options });

describe("dashboard billing notices", () => {
  it("keeps the homepage clean when plan and usage are healthy", () => {
    expect(compute(snapshot())).toBeNull();
    expect(compute(snapshot({ monthlyAiReplies: null, monthlyWhatsAppOutbound: null, aiUsed: 9999 }))).toBeNull();
  });

  it("identifies exactly the 30/30 and 500/500 FREE quota situation without claiming subscription expiry", () => {
    const alert = compute(snapshot({ aiUsed: 30, whatsappOutboundUsed: 500 }));
    expect(alert?.kind).toBe("quota_exhausted");
    expect(alert?.title).toContain("AI");
    expect(alert?.description).toContain("30 من 30");
    expect(alert?.description).toContain("500 من 500");
    expect(alert?.detail).toContain("ديسمبر");
    expect(alert?.description).not.toContain("انتهى اشتراكك");
    expect(alert?.actionLabel).toBe("ترقية الباقة");
  });

  it("distinguishes exhausted AI replies from exhausted WhatsApp outbound only", () => {
    const ai = compute(snapshot({ aiUsed: 30 }));
    expect(ai?.title).toContain("ردود الموظف الذكي");
    expect(ai?.description).not.toContain("500 من 500");
    const wa = compute(snapshot({ whatsappOutboundUsed: 500 }));
    expect(wa?.title).toContain("رسائل واتساب");
    expect(wa?.description).not.toContain("الردود الآلية");
  });

  it("shows the paid grace window without falsely claiming the bot is disabled", () => {
    const alert = compute(snapshot({
      planCode: "STARTER", periodEndUtc: pastEnd,
    }));
    expect(alert?.kind).toBe("paid_grace");
    expect(alert?.description).toContain("فترة السماح");
    expect(alert?.actionLabel).toBe("تجديد الاشتراك");
  });

  it("recognizes a paid-to-free downgrade by the expired PAID record, not FREE quota", () => {
    const alert = compute(snapshot(), { lastExpiredPaidAt: pastEnd });
    expect(alert?.kind).toBe("paid_expired");
    expect(alert?.description).toContain("الباقة المجانية");
    expect(alert?.actionLabel).toContain("تجديد");
  });

  it("does not promise monthly renewal of a one-time free trial", () => {
    const alert = compute(snapshot({ aiUsed: 30 }), {
      freeTrial: { expired: true, used: 30, remaining: 0, expiresAtUtc: pastEnd },
    });
    expect(alert?.kind).toBe("free_trial_ended");
    expect(alert?.detail).toContain("لا يتجدد");
    expect(alert?.detail).not.toContain("ديسمبر");
  });

  it("prioritizes an unusable subscription over usage metrics", () => {
    const alert = compute(snapshot({ canAct: false, status: "PAST_DUE", aiUsed: 30 }));
    expect(alert?.kind).toBe("subscription_inactive");
    expect(alert?.description).toContain("الدفع");
  });

  it("treats configured zero quotas as blocked, while unbounded quotas are not exhausted", () => {
    expect(compute(snapshot({ monthlyAiReplies: 0 }))?.kind).toBe("quota_exhausted");
    expect(compute(snapshot({ monthlyWhatsAppOutbound: null, whatsappOutboundUsed: 500 }))).toBeNull();
  });
});

describe("historical Pulse quota warning matches live entitlements", () => {
  it("hides old quota failure counts when an activated paid plan has available AI replies", () => {
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({
      planCode: "STARTER", monthlyAiReplies: 1000, aiUsed: 50,
    }))).toBe(false);
  });

  it("only displays quota warning when the current plan really exhausted AI replies", () => {
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({
      planCode: "STARTER", monthlyAiReplies: 50, aiUsed: 50,
    }))).toBe(true);
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({
      planCode: "STARTER", monthlyAiReplies: null, aiUsed: 50000,
    }))).toBe(false);
  });

  it("does not claim quota exhaustion when billing cannot be verified or the subscription is inactive", () => {
    expect(isAiReplyQuotaCurrentlyExhausted(null)).toBe(false);
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({canAct: false, aiUsed: 100}))).toBe(false);
  });

  it("accounts for a one-time free trial that expired despite spare monthly counter capacity", () => {
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({aiUsed: 0}), {
      expired: true, used: 30, remaining: 0, expiresAtUtc: pastEnd,
    })).toBe(true);
    expect(isAiReplyQuotaCurrentlyExhausted(snapshot({planCode: "STARTER"}), {
      expired: true, used: 30, remaining: 0, expiresAtUtc: pastEnd,
    })).toBe(false);
  });
});
