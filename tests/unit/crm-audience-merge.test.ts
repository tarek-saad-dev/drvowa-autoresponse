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

  it("throws instead of silently truncating when complexity is exceeded", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: "tag" as const,
      op: "has_any" as const,
      tagNames: [`t${i}`],
    }));
    const base = parseAudienceFilterAst({ version: 1, all: many.slice(0, 20) });
    const refinement = parseAudienceFilterAst({ version: 1, all: many.slice(0, 10) });
    expect(() => mergeAudienceFilters(base, refinement)).toThrow(AudienceComplexityError);
  });
});
