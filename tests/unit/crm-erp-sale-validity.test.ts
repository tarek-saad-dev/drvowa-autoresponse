import { describe, expect, it } from "vitest";

import { erpInvoiceExternalKey, isValidErpSaleInvoice } from "@/modules/crm/erp-sync";

describe("ERP sale validity", () => {
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
