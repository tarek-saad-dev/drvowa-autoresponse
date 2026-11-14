import { describe, expect, it } from "vitest";

import { parseAudienceFilterAst } from "@/modules/crm/audience-ast";
import { compileAudienceFilter } from "@/modules/crm/audience-compiler";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

describe("crm audience SQL compiler security", () => {
  it("fails closed without a selected channel for marketing eligible predicates", () => {
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [{ type: "marketing_permission", op: "eligible" }],
    });
    expect(() => compileAudienceFilter({ businessId: BUSINESS_ID, filter }))
      .toThrow(/explicit WhatsApp channel/i);
  });

  it("scopes consent and opt-out to the same parameterized WhatsApp channel", () => {
    const channelConnectionId = "22222222-2222-4222-8222-222222222222";
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [
        { type: "has_phone", value: true },
        { type: "marketing_permission", op: "eligible" },
      ],
    });
    const compiled = compileAudienceFilter({ businessId: BUSINESS_ID, channelConnectionId, filter });
    expect(compiled.sqlText).toContain("p.ChannelConnectionID = @channelConnectionId");
    expect(compiled.sqlText).toContain("o.ChannelConnectionID = @channelConnectionId");
    expect(compiled.countSqlText).toContain("p.ChannelConnectionID = @channelConnectionId");
    expect(compiled.countSqlText).toContain("o.ChannelConnectionID = @channelConnectionId");
    expect(compiled.inputs.some((i) => i.name === "channelConnectionId" && i.value === channelConnectionId)).toBe(true);
    expect(compiled.sqlText).not.toContain(channelConnectionId);
  });

  it("always scopes queries to BusinessID and uses parameters", () => {
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [
        { type: "erp_service", op: "name_contains", values: ["بروتين"], windowDays: 30 },
        { type: "erp_spend", op: "gte", amount: 1000 },
      ],
      limit: 50,
    });
    const compiled = compileAudienceFilter({ businessId: BUSINESS_ID, filter });
    expect(compiled.sqlText).toContain("c.BusinessID = @businessId");
    expect(compiled.sqlText).toContain("c.Status <> N'MERGED'");
    expect(compiled.sqlText.toLowerCase()).not.toContain("drop ");
    expect(compiled.sqlText).not.toMatch(/;\s*(delete|update|insert)/i);
    expect(compiled.inputs.some((i) => i.name === "businessId" && i.value === BUSINESS_ID)).toBe(true);
    expect(compiled.inputs.some((i) => String(i.value).includes("بروتين") || String(i.value).includes("%بروتين%"))).toBe(true);
    expect(compiled.inputs.every((i) => typeof i.name === "string")).toBe(true);
    expect(compiled.sqlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not interpolate user strings into SQL identifiers or free text", () => {
    const evil = "'; DROP TABLE TblCrmCustomer;--";
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [{ type: "erp_service", op: "name_contains", values: [evil] }],
    });
    const compiled = compileAudienceFilter({ businessId: BUSINESS_ID, filter });
    expect(compiled.sqlText).not.toContain("DROP TABLE");
    expect(compiled.inputs.some((i) => String(i.value).includes("DROP TABLE"))).toBe(true);
  });

  it("enforces row limit caps at compile time even when AST allows 5000", () => {
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [{ type: "has_phone", value: true }],
      limit: 5000,
    });
    const compiled = compileAudienceFilter({ businessId: BUSINESS_ID, filter });
    expect(compiled.limit).toBe(2000);
    expect(compiled.inputs.find((i) => i.name === "limit")?.value).toBe(2000);
  });

  it("compiles away-customers and top-spender orderings", () => {
    const away = compileAudienceFilter({
      businessId: BUSINESS_ID,
      filter: parseAudienceFilterAst({
        version: 1,
        all: [{ type: "erp_last_visit", op: "before_days_ago", days: 45 }],
      }),
    });
    expect(away.sqlText).toContain("DATEADD(day");

    const top = compileAudienceFilter({
      businessId: BUSINESS_ID,
      filter: parseAudienceFilterAst({
        version: 1,
        all: [{ type: "has_phone", value: true }],
        orderBy: "spend_desc",
        limit: 50,
      }),
    });
    expect(top.sqlText).toContain("ORDER BY");
    expect(top.sqlText).toContain("SUM(inv.GrandTotal)");
  });
});
