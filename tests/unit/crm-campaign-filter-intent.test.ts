import { describe, expect, it } from "vitest";

import { parseAudienceFilterAst } from "@/modules/crm/audience-ast";
import {
  asksForMarketingEligibility,
  isNewAudienceRequest,
  normalizeCampaignFilterForRequest,
} from "@/modules/crm/campaign-filter-intent";

describe("CRM Egyptian Arabic audience chat intent", () => {
  it("treats independent 'هات العملاء' requests as new audiences, not refinements", () => {
    expect(isNewAudienceRequest("هات العملاء الى عملوا بروتين عندنا")).toBe(true);
    expect(isNewAudienceRequest("هات العملاء الى عملوا فواتير امبارح")).toBe(true);
    expect(isNewAudienceRequest("ومنهم اللي عملوا فواتير امبارح")).toBe(false);
    expect(isNewAudienceRequest("وكمان اللي صرفوا فوق 1000")).toBe(false);
  });

  it("does not treat 'اعرض العملاء' as permission to silently filter marketing consent", () => {
    expect(asksForMarketingEligibility("اعرض العملاء اللي عملوا بروتين")).toBe(false);
    expect(asksForMarketingEligibility("هات العملاء اللي عملوا بروتين عندنا")).toBe(false);
    expect(asksForMarketingEligibility("هات العملاء المسموح لهم بالتسويق")).toBe(true);
    expect(asksForMarketingEligibility("اعمل حملة واتساب للعملاء")).toBe(true);
  });

  it("removes model-invented consent restriction but still enables separate channel eligibility counts", () => {
    const normalized = normalizeCampaignFilterForRequest({
      message: "هات العملاء اللي عملوا بروتين عندنا",
      businessToday: "2026-11-14",
      filter: parseAudienceFilterAst({
        version: 1,
        all: [
          { type: "marketing_permission", op: "eligible" },
          { type: "erp_service", op: "name_contains", values: ["بروتين"] },
        ],
      }),
    });
    expect(normalized.all).toEqual([
      { type: "erp_service", op: "name_contains", values: ["بروتين", "protein"] },
    ]);
    expect(parseAudienceFilterAst(normalized)).toBeDefined();
  });

  it("does not strip consent restrictions explicitly requested by the owner", () => {
    const normalized = normalizeCampaignFilterForRequest({
      message: "هات العملاء المسموح لهم بالتسويق اللي عملوا بروتين",
      businessToday: "2026-11-14",
      filter: parseAudienceFilterAst({
        version: 1,
        all: [
          { type: "marketing_permission", op: "eligible" },
          { type: "erp_service", op: "name_contains", values: ["بروتين", "protein"] },
        ],
      }),
    });
    expect(normalized.all?.some((p) => p.type === "marketing_permission")).toBe(true);
  });

  it("maps invoices yesterday to exactly yesterday's business calendar date, never last visit", () => {
    const normalized = normalizeCampaignFilterForRequest({
      message: "هات العملاء الى عملوا فواتير امبارح",
      businessToday: "2026-11-14",
      filter: parseAudienceFilterAst({
        version: 1,
        all: [
          { type: "marketing_permission", op: "eligible" },
          { type: "erp_last_visit", op: "within_days", days: 1 },
          { type: "erp_last_visit", op: "within_days", days: 1 },
          { type: "erp_invoice_date", op: "between", from: "2026-11-14", to: "2026-11-14" },
        ],
      }),
    });
    expect(normalized.all).toEqual([
      { type: "erp_invoice_date", op: "between", from: "2026-11-13", to: "2026-11-13" },
    ]);
    expect(parseAudienceFilterAst(normalized)).toBeDefined();
  });

  it("deduplicates repeated equivalent predicates but preserves different conditions", () => {
    const normalized = normalizeCampaignFilterForRequest({
      message: "ومنهم اللي زاروا آخر 30 يوم",
      businessToday: "2026-11-14",
      filter: parseAudienceFilterAst({
        version: 1,
        all: [
          { type: "erp_last_visit", op: "within_days", days: 30 },
          { type: "erp_last_visit", op: "within_days", days: 30 },
          { type: "erp_spend", op: "gte", amount: 1000 },
        ],
      }),
    });
    expect(normalized.all).toHaveLength(2);
  });

  it("calculates yesterday correctly across year boundaries", () => {
    const normalized = normalizeCampaignFilterForRequest({
      message: "فواتير امبارح",
      businessToday: "2027-01-01",
      filter: parseAudienceFilterAst({
        version: 1,
        all: [{ type: "erp_last_visit", op: "within_days", days: 1 }],
      }),
    });
    expect(normalized.all).toEqual([
      { type: "erp_invoice_date", op: "between", from: "2026-12-31", to: "2026-12-31" },
    ]);
  });
});
