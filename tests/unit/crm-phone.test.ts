import { describe, expect, it } from "vitest";

import { normalizeCrmPhone, phoneMatchSuffix, phonesLikelySame } from "@/modules/crm/phone";

describe("crm phone normalization", () => {
  it("normalizes Egyptian local mobiles to country code form", () => {
    expect(normalizeCrmPhone("01012345678")).toBe("201012345678");
    expect(normalizeCrmPhone("+20 101 234 5678")).toBe("201012345678");
    expect(normalizeCrmPhone("00201012345678")).toBe("201012345678");
  });

  it("rejects invalid values", () => {
    expect(normalizeCrmPhone("abc")).toBeNull();
    expect(normalizeCrmPhone("123")).toBeNull();
    expect(normalizeCrmPhone("")).toBeNull();
  });

  it("matches ERP phones by last-10 suffix", () => {
    expect(phoneMatchSuffix("201012345678")).toBe("1012345678");
    expect(phonesLikelySame("01012345678", "201012345678")).toBe(true);
    expect(phonesLikelySame("01012345678", "01099999999")).toBe(false);
  });
});
