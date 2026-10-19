import { describe, expect, it } from "vitest";
import { invoiceTotals, validateRefundAmount } from "@/modules/billing/ledger-policy";

describe("invoice money policy", () => {
  it("calculates discounts in integer minor units", () => {
    expect(invoiceTotals(10001, 15, "Customer retention")).toEqual({ subtotalMinor: 10001, discountMinor: 1500, totalMinor: 8501 });
  });
  it("allows a fully waived invoice without inventing cash", () => {
    expect(invoiceTotals(120000, 100, "Approved complimentary year").totalMinor).toBe(0);
  });
  it("accepts two-decimal percentages despite floating-point representation", () => {
    expect(invoiceTotals(10000, 0.29, "reason").discountMinor).toBe(29);
    expect(() => invoiceTotals(10000, 0.291, "reason")).toThrow();
  });
  it.each([-1, 101, NaN, Infinity])("rejects invalid discount %s", percent => {
    expect(() => invoiceTotals(10000, percent, "reason")).toThrow();
  });
  it("requires a nonempty reason for a discount", () => {
    expect(() => invoiceTotals(10000, 1, "  ")).toThrow();
  });
  it.each([-1, 1.1, NaN, Number.MAX_SAFE_INTEGER])("rejects invalid invoice money %s", amount => {
    expect(() => invoiceTotals(amount, 0)).toThrow();
  });
  it("rejects refunds exceeding remaining captured cash", () => {
    expect(() => validateRefundAmount(10000, 6000, 4001)).toThrow();
    expect(validateRefundAmount(10000, 6000, 4000)).toBe(4000);
  });
  it("rejects zero refunds and malformed totals", () => {
    expect(() => validateRefundAmount(0, 0, 0)).toThrow();
    expect(() => validateRefundAmount(100, 101, 1)).toThrow();
  });
});
