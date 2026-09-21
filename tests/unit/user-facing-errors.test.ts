import { describe, expect, it } from "vitest";

import { mapUserFacingError } from "@/lib/ui/user-errors";
import { knowledgeCategoryLabel } from "@/lib/ui/labels";

describe("user-facing error mapper", () => {
  it("maps plan knowledge limit without exposing code", () => {
    const msg = mapUserFacingError({
      code: "PLAN_KNOWLEDGE_LIMIT",
      error: "PLAN_KNOWLEDGE_LIMIT",
    });
    expect(msg).toMatch(/الحد الأقصى/);
    expect(msg).not.toContain("PLAN_");
  });

  it("maps EXTERNAL_GATE strings away", () => {
    const msg = mapUserFacingError({
      error: "EXTERNAL_GATE_PAYMENT_PROVIDER",
    });
    expect(msg).not.toContain("EXTERNAL_GATE");
  });

  it("keeps already-human Arabic", () => {
    expect(mapUserFacingError({ error: "تعذر الحفظ حالياً" })).toBe(
      "تعذر الحفظ حالياً",
    );
  });
});

describe("knowledge category labels", () => {
  it("never returns raw enum codes", () => {
    for (const code of [
      "FAQ",
      "ABOUT",
      "POLICY",
      "SERVICE",
      "LOCATION_INFO",
      "CUSTOM",
    ]) {
      const label = knowledgeCategoryLabel(code);
      expect(label).not.toBe(code);
      expect(label.length).toBeGreaterThan(2);
    }
  });
});
