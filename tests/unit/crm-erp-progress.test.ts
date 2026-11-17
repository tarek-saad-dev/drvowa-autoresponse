import { describe, expect, it } from "vitest";
import { calculateErpProgressRows, overallErpProgress } from "@/modules/crm/erp-progress";

describe("CRM ERP source-vs-mirror progress", () => {
  it("counts actual row totals, not processed or highest source IDs", () => {
    const rows = calculateErpProgressRows({
      sourceCounts: { customers: 100, invoices: 20, catalog: 10 },
      mirrored: { customers: 25, invoices: 10, catalog: 10 },
    });
    expect(rows.map((row) => row.percent)).toEqual([25, 50, 100]);
    expect(overallErpProgress(rows)).toBe(34.6);
  });
  it("treats cancelled sales and deleted catalog entries as counted source rows", () => {
    const rows = calculateErpProgressRows({
      sourceCounts: { customers: 3, invoices: 3, catalog: 1 },
      mirrored: { customers: 3, invoices: 3, catalog: 1 },
    });
    expect(overallErpProgress(rows)).toBe(100);
    expect(rows.every((row) => !row.discrepancy)).toBe(true);
  });
  it("does not silently show success when CRM mirror exceeds the Cashier source", () => {
    const rows = calculateErpProgressRows({
      sourceCounts: { customers: 10, invoices: 2, catalog: 4 },
      mirrored: { customers: 11, invoices: 2, catalog: 4 },
    });
    expect(rows[0]?.discrepancy).toBe(true);
    expect(overallErpProgress(rows)).toBeNull();
  });
  it("handles an empty source without dividing by zero", () => {
    const rows = calculateErpProgressRows({
      sourceCounts: { customers: 0, invoices: 0, catalog: 0 },
      mirrored: { customers: 0, invoices: 0, catalog: 0 },
    });
    expect(overallErpProgress(rows)).toBe(100);
  });
  it("rejects invalid reported counts", () => {
    const rows = calculateErpProgressRows({
      sourceCounts: { customers: -1, invoices: 3.5, catalog: 0 },
      mirrored: { customers: 0, invoices: 0, catalog: 0 },
    });
    expect(rows[0]?.percent).toBeNull();
    expect(rows[1]?.percent).toBeNull();
    expect(overallErpProgress(rows)).toBeNull();
  });
});
