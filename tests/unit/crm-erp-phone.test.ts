import { describe, expect, it } from "vitest";
import { normalizeCrmPhone } from "@/modules/crm/phone";
import { normalizeErpCustomerPhone } from "@/modules/crm/erp-phone";

describe("ERP phone import normalization", () => {
  it("keeps ordinary Egyptian mobiles stable for the repository's second validation", () => {
    expect(normalizeErpCustomerPhone("01055554444")).toBe("201055554444");
    expect(normalizeErpCustomerPhone("+20 105 555 4444")).toBe("201055554444");
  });

  it("drops legacy values that pass one normalization but fail on a second pass", () => {
    const once = normalizeCrmPhone("00001234567");
    expect(once).toBe("001234567");
    expect(normalizeCrmPhone(once)).toBeNull();
    expect(normalizeErpCustomerPhone("00001234567")).toBeNull();
  });

  it("falls back from unusable mobile to a valid secondary phone", () => {
    expect(normalizeErpCustomerPhone("not-a-phone", "01055554444")).toBe("201055554444");
  });

  it("retains a null phone when Cashier has no usable contact number", () => {
    expect(normalizeErpCustomerPhone(null, undefined)).toBeNull();
    expect(normalizeErpCustomerPhone("N/A", "1234")).toBeNull();
  });

  it("does not assign ambiguous phone strings as messaging recipients", () => {
    expect(normalizeErpCustomerPhone("01055554444/01055552222")).toBeNull();
  });
});
