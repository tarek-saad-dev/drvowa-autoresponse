import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PulseOverview } from "@/components/dashboard/pulse/pulse-overview";
import { getPulseSummaryCopy, PulseSummaryChat } from "@/components/dashboard/pulse/pulse-summary-chat";
import type { PulseSnapshot } from "@/modules/pulse/report";

const snapshot: PulseSnapshot = {
  period: "month",
  start: "2026-10-31T22:00:00Z",
  end: "2026-11-30T22:00:00Z",
  conversations: 36,
  messages: 173,
  aiConversations: 20,
  eligible: 160,
  analyzed: 160,
  openFollowups: 15,
  pendingSignals: 3,
  needsAttentionFollowups: 8,
  handlingFollowups: 12,
  handlingSignals: 3,
  quotaBlockedFollowups: 0,
  categories: [],
  reviews: [],
};

describe("floating Pulse activity summary", () => {
  it("keeps the dashboard top clean and offers a bottom chat-style prompt", () => {
    const html = renderToStaticMarkup(
      <PulseOverview data={snapshot} businessName="Cut Salon" businessId="business-1" />,
    );
    expect(html).toContain("ملخص الشهر");
    expect(html).toContain("محادثات واردة");
    expect(html).toContain("إيه اللي حصل الشهر ده؟");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("خلال الشهر الحالي وصلتك");
    expect(html).not.toContain('role="dialog"');
  });

  it("preserves the existing factual summary in the chat response", () => {
    const copy = getPulseSummaryCopy(snapshot, "month");
    expect(copy.question).toBe("✦ إيه اللي حصل الشهر ده؟");
    expect(copy.summary).toContain("١٧٣ رسالة واردة");
    expect(copy.summary).toContain("٣٦ محادثة");
    expect(copy.summary).toContain("١١ متابعة");
    expect(copy.handling).toContain("١٥ متابعة");
    expect(copy.coverage).toContain("160 من 160");
  });

  it("adapts the prompt to the selected period and handles unavailable data", () => {
    expect(getPulseSummaryCopy(snapshot, "today").question).toBe("✦ إيه اللي حصل النهارده؟");
    expect(getPulseSummaryCopy(snapshot, "yesterday").question).toBe("✦ إيه اللي حصل أمس؟");
    const offlineMarkup = renderToStaticMarkup(
      <PulseOverview data={null} selectedPeriod="yesterday" businessName="Cut Salon" businessId="business-1" />,
    );
    expect(offlineMarkup).toContain("إيه اللي حصل أمس؟");
    expect(offlineMarkup).toContain('aria-current="page"');
    const fallback = getPulseSummaryCopy(null, "month");
    expect(fallback.summary).toContain("غير متاح");
    expect(fallback.coverage).toBeNull();
    const html = renderToStaticMarkup(<PulseSummaryChat data={null} period="today" businessName="Cut Salon" />);
    expect(html).toContain("إيه اللي حصل النهارده؟");
    expect(html).not.toContain('role="dialog"');
  });

  it("keeps the bubble above the mobile navigation and away from the desktop sidebar", () => {
    const html = renderToStaticMarkup(<PulseSummaryChat data={snapshot} period="month" businessName="Cut Salon" />);
    expect(html).toContain("bottom-[calc(6.25rem+env(safe-area-inset-bottom))]");
    expect(html).toContain("md:left-6");
    expect(html).toContain('aria-expanded="false"');
  });
});
