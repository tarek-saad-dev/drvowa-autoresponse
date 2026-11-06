import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PulseReviewCenter } from "@/components/dashboard/pulse/review-center";
import type { PulseSnapshot } from "@/modules/pulse/report";

function snapshot(count: number): PulseSnapshot {
  return {
    period: "today",
    start: "2026-11-05T22:00:00Z",
    end: "2026-11-06T22:00:00Z",
    conversations: count,
    messages: count,
    aiConversations: 0,
    eligible: count,
    analyzed: count,
    openFollowups: count,
    pendingSignals: 0,
    handlingSignals: 0,
    handlingFollowups: 0,
    needsAttentionFollowups: count,
    quotaBlockedFollowups: 0,
    categories: [],
    reviews: Array.from({ length: count }, (_, i) => ({
      conversationId: "conversation-" + i,
      intent: "FOLLOW_UP",
      label: "متابعة بشرية",
      evidence: "طلب العميل " + i,
      priority: "URGENT" as const,
      actionType: "REVIEW" as const,
      name: "عميل " + i,
      at: "2026-11-06T12:00:00Z",
      kind: "ESCALATION" as const,
    })),
  };
}

describe("dashboard review center preview", () => {
  const props = { businessId: "business-1", periodLabel: "اليوم" };

  it("shows three compact review cards with reply actions, not inbox navigation", () => {
    const html = renderToStaticMarkup(<PulseReviewCenter {...props} data={snapshot(5)} />);
    expect(html.match(/رد على العميل/g)).toHaveLength(3);
    expect(html).not.toContain("/dashboard/inbox?businessId=");
    expect(html).toContain("محتاج رد");
    expect(html).toContain("عرض الكل");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("conversation-4");
  });

  it("hides the see-more action when three or fewer chats need review", () => {
    const html = renderToStaticMarkup(<PulseReviewCenter {...props} data={snapshot(2)} />);
    expect(html.match(/رد على العميل/g)).toHaveLength(2);
    expect(html).not.toContain("عرض الكل");
  });

  it("supports older dashboard review links by opening the popup directly", () => {
    const html = renderToStaticMarkup(<PulseReviewCenter {...props} data={snapshot(5)} allReviews />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("عميل 4");
  });
});
