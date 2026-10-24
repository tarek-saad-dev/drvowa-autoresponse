import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BillingPlansClient } from "@/components/dashboard/billing-plans-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const plan = {
  code: "STARTER",
  displayName: "بداية",
  monthlyPriceAmount: 499,
  currencyCode: "EGP",
  maxWhatsAppConnections: 1,
  maxAgents: 1,
  maxActiveKnowledgeItems: 100,
  monthlyAiReplies: 3000,
  monthlyWhatsAppOutbound: 3000,
};

const baseProps = {
  plans: [plan],
  currentPlanCode: "FREE",
  instructions: { displayName: "DRVO TECH", handle: "example@instapay", instructions: "" },
  enabled: true,
};

describe("unified subscription and usage page", () => {
  it("does not show plan cards or transfer instructions on initial load", () => {
    const html = renderToStaticMarkup(<BillingPlansClient {...baseProps} />);
    expect(html).toContain("تغيير الباقة");
    expect(html).not.toContain("plan-card-STARTER");
    expect(html).not.toContain("معرّف InstaPay");
    expect(html).not.toContain('role="dialog"');
  });

  it("offers a separate action for a confirmed open transfer intent", () => {
    const html = renderToStaticMarkup(
      <BillingPlansClient
        {...baseProps}
        initialOpenIntent={{
          paymentRequestId: "pay-1",
          paymentReference: "DRV-123",
          amount: 499,
          currencyCode: "EGP",
          planDisplayName: "بداية",
          planCode: "STARTER",
        }}
      />,
    );
    expect(html).toContain("عرض تعليمات الدفع");
    expect(html).not.toContain("معرّف InstaPay");
  });

  it("blocks new plans when payment is under review", () => {
    const html = renderToStaticMarkup(
      <BillingPlansClient {...baseProps} initialPendingReview />,
    );
    expect(html).toContain("أثناء مراجعة التحويل الحالي");
    expect(html).toMatch(/disabled[^>]*>تغيير الباقة/);
  });
});
