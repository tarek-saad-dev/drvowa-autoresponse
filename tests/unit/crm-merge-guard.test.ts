import { describe, expect, it } from "vitest";

import { phonesLikelySame } from "@/modules/crm/phone";

/**
 * Merge policy unit contract: never merge on name similarity alone.
 * Full mergeCustomers service requires DB; this locks the phone predicate.
 */
describe("crm merge guardrails", () => {
  it("allows phone-based identity match", () => {
    expect(phonesLikelySame("01012345678", "201012345678")).toBe(true);
  });

  it("does not treat similar names as a merge key", () => {
    const nameA = "أحمد محمد";
    const nameB = "احمد محسن";
    // Names are intentionally not compared by phonesLikelySame.
    expect(phonesLikelySame(nameA, nameB)).toBe(false);
    expect(nameA).not.toEqual(nameB);
  });
});
