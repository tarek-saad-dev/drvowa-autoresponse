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

  it("keeps paid plans in the main grid and demotes FREE to a gray row below", () => {
    const html = render([
      plan({
        code: "FREE",
        displayName: "مجاني",
        monthlyPriceAmount: 0,
        monthlyAiReplies: 500,
        monthlyWhatsAppOutbound: 500,
        maxAgents: 1,
        maxActiveKnowledgeItems: 50,
      }),
      plan({ code: "STARTER", displayName: "بداية", monthlyPriceAmount: 499 }),
      plan({ code: "PRO", displayName: "احترافي", monthlyPriceAmount: 999 }),
      plan({
        code: "BUSINESS",
        displayName: "أعمال",
        monthlyPriceAmount: 1999,
        maxAgents: 15,
      }),
    ]);
    expect(html).toContain("بداية");
    expect(html).toContain("احترافي");
    expect(html).toContain("أعمال");
    expect(html).toContain("مجاني");
    expect(html).toContain('aria-label="الخطة المجانية"');
    expect(html.indexOf("بداية")).toBeLessThan(html.indexOf("الخطة المجانية"));
    expect(html.indexOf("أعمال")).toBeLessThan(html.indexOf("الخطة المجانية"));
  });
});


describe("Pricing V1 public comparison", () => {
  const live = [
    plan({ code: "FREE", displayName: "مجاني", monthlyPriceAmount: 0,
      monthlyAiReplies: 30, maxAgents: 1, maxActiveKnowledgeItems: 50 }),
    plan({ code: "STARTER", displayName: "بداية", monthlyPriceAmount: 299,
      monthlyAiReplies: 750, maxAgents: 1, maxActiveKnowledgeItems: 200 }),
    plan({ code: "PRO", displayName: "نمو", monthlyPriceAmount: 599,
      monthlyAiReplies: 2500, maxAgents: 3, maxActiveKnowledgeItems: 500 }),
    plan({ code: "BUSINESS", displayName: "أعمال", monthlyPriceAmount: 1199,
      monthlyAiReplies: 6000, maxAgents: 8, maxActiveKnowledgeItems: 2000 }),
  ];
  it("shows the live Egyptian prices and all four plans, with an accessible comparison", () => {
    const html = renderToStaticMarkup(createElement(PricingCards, {
      plans: live,
      annualPrices: { STARTER: 2990, PRO: 5990, BUSINESS: 11990 },
      freeTrialEnabled: true,
      replyAddons: [
        { quantity: 250, priceEgp: 99, validDays: 30 },
        { quantity: 1000, priceEgp: 249, validDays: 30 },
        { quantity: 3000, priceEgp: 599, validDays: 30 },
      ],
    }));
    for (const price of ["299", "599", "1,199"]) expect(html).toContain(price);
    for (const allowance of ["750", "2,500", "6,000"]) expect(html).toContain(allowance);
    expect(html).toContain('aria-label="مدة الاشتراك"');
    expect(html).toContain('aria-label="جدول مقارنة الأسعار وحدود الاستخدام"');
    expect(html).toContain("وفّر شهرين");
    expect(html).toContain("2,990 جنيه سنويًا");
    expect(html).toContain("30 رد مرة واحدة خلال 7 أيام");
    expect(html).not.toContain("30 رد AI / شهر");
    expect(html).toContain("99 ج");
    expect(html).toContain("249 ج");
    expect(html).toContain("مدة التجربة المجانية");
  });
  it("never advertises annual checkout prices when quotes are not enabled", () => {
    const html = renderToStaticMarkup(createElement(PricingCards, {
      plans: live, annualPrices: null, freeTrialEnabled: false,
    }));
    expect(html).not.toContain('aria-label="مدة الاشتراك"');
    expect(html).not.toContain("2,990");
    expect(html).not.toContain("30 رد مرة واحدة خلال 7 أيام");
    expect(html).not.toContain("99 ج");
  });
});
