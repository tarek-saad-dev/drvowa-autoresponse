import { describe, expect, it } from "vitest";

import {
  AudienceComplexityError,
  mergeAudienceFilters,
  parseAudienceFilterAst,
} from "@/modules/crm/audience-ast";

describe("audience filter merge complexity", () => {
  it("merges refinement predicates without dropping them", () => {
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
  });

  it("does not duplicate the same condition across consecutive Egyptian Arabic follow-ups", () => {
    const base = parseAudienceFilterAst({
      version: 1,
      all: [{type:"erp_service",op:"name_contains",values:["بروتين"]}],
    });
    const request = parseAudienceFilterAst({
      version: 1,
      all: [
        {type:"erp_service",op:"name_contains",values:["بروتين"]},
        {type:"erp_spend",op:"gte",amount:1000},
      ],
    });
    const once = mergeAudienceFilters(base, request);
    const twice = mergeAudienceFilters(once, request);
    expect(once.all).toHaveLength(2);
    expect(twice.all).toEqual(once.all);
  });

  it("throws instead of silently truncating when complexity is exceeded", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: "tag" as const,
      op: "has_any" as const,
      tagNames: [`t${i}`],
    }));
    const base = parseAudienceFilterAst({ version: 1, all: many.slice(0, 20) });
    const refinement = parseAudienceFilterAst({
      version: 1,
      all: Array.from({ length: 10 }, (_, i) => ({
        type: "tag" as const, op: "has_any" as const, tagNames: [`t${20 + i}`],
      })),
    });
    expect(() => mergeAudienceFilters(base, refinement)).toThrow(AudienceComplexityError);
  });
});
