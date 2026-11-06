/**
 * Review-center copy should describe the customer's pending action, not expose
 * internal AI error codes as if the customer typed them.
 *
 * These are still actionable conversations: a failed bot reply means the
 * customer may need a manual answer while the underlying issue is addressed.
 */
export type EscalationReviewIssue = "AI_QUOTA" | "AI_DELIVERY" | null;

export function presentEscalationReview(input: {
  reasonCode: string | null;
  reason: string | null;
  lastCustomerText?: string | null;
}): {
  label: string;
  evidence: string;
  issueType: EscalationReviewIssue;
} {
  const reason = input.reason?.trim() ?? "";
  const customerText = input.lastCustomerText?.trim() ?? "";

  if (input.reasonCode === "AI_REPLY_FAILED") {
    if (reason.includes("QUOTA_EXCEEDED")) {
      return {
        label: "محتاج رد يدوي",
        evidence: customerText || "العميل مستني رد؛ رصيد ردود الموظف الذكي في الباقة انتهى.",
        issueType: "AI_QUOTA",
      };
    }
    return {
      label: "محتاج رد يدوي",
      evidence: customerText || "الموظف الذكي لم يتمكن من الرد. راجع رسالة العميل في المحادثة.",
      issueType: "AI_DELIVERY",
    };
  }

  return {
    label: "متابعة بشرية",
    evidence: reason || "متابعة مفتوحة",
    issueType: null,
  };
}
