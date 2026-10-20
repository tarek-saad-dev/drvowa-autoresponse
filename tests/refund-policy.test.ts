import { describe, expect, it } from "vitest";
import { invoiceTotals, validateRefundAmount } from "../src/modules/billing/ledger-policy";
import { isRefundProcessingAllowed } from "../src/modules/billing/refund-readiness";

describe("refund activation policy: fail closed for financial consumers", () => {
  it.each([
    { hubCaptureEnabled: false, financeExportConfigured: false, refundConsumerReady: false, allowed: true },
    { hubCaptureEnabled: false, financeExportConfigured: false, refundConsumerReady: true, allowed: true },
    { hubCaptureEnabled: false, financeExportConfigured: true, refundConsumerReady: false, allowed: false },
    { hubCaptureEnabled: false, financeExportConfigured: true, refundConsumerReady: true, allowed: true },
    { hubCaptureEnabled: true, financeExportConfigured: false, refundConsumerReady: false, allowed: false },
    { hubCaptureEnabled: true, financeExportConfigured: false, refundConsumerReady: true, allowed: false },
    { hubCaptureEnabled: true, financeExportConfigured: true, refundConsumerReady: false, allowed: false },
    { hubCaptureEnabled: true, financeExportConfigured: true, refundConsumerReady: true, allowed: false },
  ])("hub=$hubCaptureEnabled export=$financeExportConfigured ready=$refundConsumerReady => $allowed", ({
    allowed, ...config
  }) => {
    expect(isRefundProcessingAllowed({ ...config, refundCaptureEnabled: false,
      hubSourceConfigured: false })).toBe(allowed);
  });
  it("requires explicit refund capture and verified source configuration when Hub capture is active", () => {
    const base = { hubCaptureEnabled: true, financeExportConfigured: false,
      refundConsumerReady: false, refundCaptureEnabled: true, hubSourceConfigured: true };
    expect(isRefundProcessingAllowed(base)).toBe(true);
    expect(isRefundProcessingAllowed({ ...base, refundCaptureEnabled: false })).toBe(false);
    expect(isRefundProcessingAllowed({ ...base, hubSourceConfigured: false })).toBe(false);
    expect(isRefundProcessingAllowed({ ...base, financeExportConfigured: true })).toBe(false);
  });
});

describe("refund monetary invariants in minor units", () => {
  it("accepts exactly the remaining captured balance", () => {
    expect(validateRefundAmount(12345, 0, 12345)).toBe(12345);
    expect(validateRefundAmount(12345, 2345, 10000)).toBe(10000);
  });

  it("rejects zero, over-refunds, and already exhausted balance", () => {
    expect(() => validateRefundAmount(10000, 0, 0)).toThrow(RangeError);
    expect(() => validateRefundAmount(10000, 0, 10001)).toThrow(RangeError);
    expect(() => validateRefundAmount(10000, 10000, 1)).toThrow(RangeError);
    expect(() => validateRefundAmount(10000, 9999, 2)).toThrow(RangeError);
    expect(() => validateRefundAmount(10000, 10001, 1)).toThrow(RangeError);
  });

  it("rejects negative, fractional, infinite, and unsafe monetary values", () => {
    for (const invalid of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
      expect(() => validateRefundAmount(10000, 0, invalid)).toThrow(RangeError);
    }
  });

  it("uses server-side discounted invoice total as the maximum refundable amount", () => {
    const invoice = invoiceTotals(10000, 20, "Approved discount");
    expect(invoice).toMatchObject({ subtotalMinor: 10000, discountMinor: 2000, totalMinor: 8000 });
    expect(validateRefundAmount(invoice.totalMinor, 0, 8000)).toBe(8000);
    expect(() => validateRefundAmount(invoice.totalMinor, 0, 10000)).toThrow(RangeError);
  });
});
