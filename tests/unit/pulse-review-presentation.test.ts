import { describe, expect, it } from "vitest";
import { presentEscalationReview } from "@/modules/pulse/review-presentation";

describe("Pulse review-center escalation copy", () => {
  it("never exposes raw quota codes as a customer request", () => {
    const card = presentEscalationReview({
      reasonCode: "AI_REPLY_FAILED",
      reason: "الموظف الذكي لم يتمكن من إرسال رد للعميل: PLAN_AI_QUOTA_EXCEEDED",
      lastCustomerText: "ممكن سعر البروتين لو متاح",
    });
    expect(card).toEqual({
      label: "محتاج رد يدوي",
      evidence: "ممكن سعر البروتين لو متاح",
      issueType: "AI_QUOTA",
    });
    expect(card.evidence).not.toContain("PLAN_AI_QUOTA_EXCEEDED");
  });

  it("keeps a helpful customer-action fallback when no plaintext is available", () => {
    const card = presentEscalationReview({
      reasonCode: "AI_REPLY_FAILED",
      reason: "AI reply failed: PLAN_AI_QUOTA_EXCEEDED",
      lastCustomerText: null,
    });
    expect(card.issueType).toBe("AI_QUOTA");
    expect(card.evidence).toContain("رصيد");
    expect(card.evidence).not.toContain("PLAN_AI_QUOTA_EXCEEDED");
  });

  it("distinguishes a general delivery failure without leaking internal errors", () => {
    const card = presentEscalationReview({
      reasonCode: "AI_REPLY_FAILED",
      reason: "الموظف الذكي لم يتمكن من إرسال رد للعميل: NOT_READY",
    });
    expect(card.issueType).toBe("AI_DELIVERY");
    expect(card.evidence).not.toContain("NOT_READY");
    expect(card.label).toBe("محتاج رد يدوي");
  });

  it("preserves genuine customer-requested human follow-up details", () => {
    const card = presentEscalationReview({
      reasonCode: "CUSTOMER_REQUEST",
      reason: "العميل طلب التحدث مع موظف",
      lastCustomerText: "فين رقم المدير؟",
    });
    expect(card).toEqual({
      label: "متابعة بشرية",
      evidence: "العميل طلب التحدث مع موظف",
      issueType: null,
    });
  });
});
