import { describe, expect, it } from "vitest";

import {
  explainAudienceFilterAr,
  mergeAudienceFilters,
  parseAudienceFilterAst,
} from "@/modules/crm/audience-ast";

describe("crm audience AST validation", () => {
  it("accepts a protein-last-month style filter", () => {
    const filter = parseAudienceFilterAst({
      version: 1,
      name: "بروتين آخر شهر",
      all: [
        {
          type: "erp_service",
          op: "name_contains",
          values: ["بروتين", "protein"],
          from: "2026-10-01",
          to: "2026-10-31",
        },
      ],
    });
    expect(filter.all?.[0].type).toBe("erp_service");
    expect(explainAudienceFilterAr(filter)).toContain("بروتين");
  });

  it("rejects empty filters and unknown fields", () => {
    expect(() => parseAudienceFilterAst({ version: 1 })).toThrow();
    expect(() =>
      parseAudienceFilterAst({
        version: 1,
        all: [{ type: "status", op: "eq", values: ["ACTIVE"] }],
        evilSql: "DROP TABLE",
      }),
    ).toThrow();
  });

  it("rejects unauthorized predicate types", () => {
    expect(() =>
      parseAudienceFilterAst({
        version: 1,
        all: [{ type: "raw_sql", sql: "1=1" }],
      }),
    ).toThrow();
  });

  it("merges refinements instead of replacing the base audience", () => {
    const base = parseAudienceFilterAst({
      version: 1,
      all: [{ type: "erp_service", op: "name_contains", values: ["بروتين"], windowDays: 30 }],
    });
    const refined = mergeAudienceFilters(
      base,
      parseAudienceFilterAst({
        version: 1,
        all: [{ type: "erp_spend", op: "gte", amount: 1000 }],
      }),
    );
    expect(refined.all).toHaveLength(2);
    expect(refined.all?.[1]).toMatchObject({ type: "erp_spend", amount: 1000 });
  });
});
