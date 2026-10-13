import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PricingCards } from "@/components/landing/pricing-cards";
import type { Plan } from "@/types/domain";
const plan = (overrides: Partial<Plan> = {}): Plan => ({
  planId: "example",
  code: "STARTER",
  displayName: "بداية",
  status: "ACTIVE",
  maxWhatsAppConnections: 1,
  maxAgents: 2,
  maxActiveKnowledgeItems: 200,
  monthlyAiReplies: 3000,
  monthlyWhatsAppOutbound: 3000,
  monthlyPriceAmount: 649,
  currencyCode: "EGP",
  billingInterval: "MONTHLY",
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
  ...overrides,
});
const render = (plans: Plan[]) =>
  renderToStaticMarkup(createElement(PricingCards, { plans }));
describe("public landing pricing", () => {
  it("renders the current catalog price and allowance, not migration seed prices", () => {
    const html = render([plan()]);
    expect(html).toContain("649");
    expect(html).toContain("3,000");
    expect(html).not.toContain("499");
    expect(html).toContain('href="/signup"');
  });
  it("does not advertise unpriced, inactive or private plans", () => {
    const html = render([
      plan({ monthlyPriceAmount: null }),
      plan({ code: "CUSTOM", displayName: "PRIVATE" }),
      plan({ code: "PRO", status: "INACTIVE" }),
    ]);
    expect(html).toContain("تعذّر تحميل الأسعار");
    expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("مجاني");
  });
  it("preserves a zero allowance and distinguishes it from unlimited", () => {
    const html = render([
      plan({ monthlyAiReplies: 0, monthlyWhatsAppOutbound: null }),
    ]);
    expect(html).toContain("0");
    expect(html).toContain("بدون حد محدد");
  });
});
