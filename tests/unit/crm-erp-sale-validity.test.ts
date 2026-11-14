import { describe, expect, it } from "vitest";

import { erpInvoiceExternalKey, isValidErpSaleInvoice, isErpAppendPageExhausted } from "@/modules/crm/erp-sync";

describe("ERP sale validity", () => {
  it("marks a full append page as potentially incomplete, even before sweep pages", () => {
    expect(isErpAppendPageExhausted(200, 200)).toBe(false);
    expect(isErpAppendPageExhausted(100, 100)).toBe(false);
    expect(isErpAppendPageExhausted(0, 200)).toBe(true);
    expect(isErpAppendPageExhausted(114, 200)).toBe(true);
    expect(isErpAppendPageExhausted(40, 100)).toBe(true);
  });

  it("requires مبيعات invoice type and non-cancelled status", () => {
    expect(
      isValidErpSaleInvoice({
        invId: 10,
        invType: "مبيعات",
        isActive: "no",
        status: "active",
      }),
    ).toBe(true);

    expect(
      isValidErpSaleInvoice({
        invId: 11,
        invType: "مرتجع",
        isActive: "no",
        status: "active",
      }),
    ).toBe(false);

    expect(
      isValidErpSaleInvoice({
        invId: 12,
        invType: "مبيعات",
        isActive: "yes",
        status: "cancelled",
      }),
    ).toBe(false);
  });

  it("builds composite external invoice keys", () => {
    expect(erpInvoiceExternalKey({ invId: 5670, invType: "مبيعات" })).toBe("مبيعات:5670");
    expect(erpInvoiceExternalKey({ invId: null })).toBeNull();
  });
});
