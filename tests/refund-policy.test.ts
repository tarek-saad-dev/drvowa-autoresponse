import { describe, expect, it } from "vitest";
import { invoiceTotals, validateRefundAmount } from "../src/modules/billing/ledger-policy";
import { isRefundProcessingAllowed, productionRefundReadiness } from "../src/modules/billing/refund-readiness";

const productionFinancialEnv = {
  DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1",
  DRVO_SAAS_FINANCIAL_ENDPOINT: "https://drvotech.com/api/saas-financial/v1/events",
  DRVO_SAAS_FINANCIAL_SOURCE_KEY: "drvo-autorespond",
  DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "active",
  DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: "2026-10-18T04:59:46.821598Z",
  DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: "2026-10-18T04:59:46.821598Z",
};

describe("production billing smoke readiness", () => {
  it("fails when the service financial environment was not loaded", () => {
    expect(() => productionRefundReadiness({}, false)).toThrow(/capture configuration/);
    expect(() => productionRefundReadiness({ DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1" }, false))
      .toThrow(/verified active source/);
    expect(() => productionRefundReadiness({ ...productionFinancialEnv,
      DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "0" }, false)).toThrow(/capture configuration/);
  });

  it("reports deliberately disabled refund capture without failing the smoke", () => {
    expect(productionRefundReadiness(productionFinancialEnv, false)).toEqual({
      refundCaptureEnabled: false, refundActionsEnabled: false,
    });
    expect(productionRefundReadiness({ ...productionFinancialEnv,
      DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED: "0" }, false).refundActionsEnabled).toBe(false);
    expect(() => productionRefundReadiness({ ...productionFinancialEnv,
      DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED: "enabled" }, false))
      .toThrow(/refund capture configuration/);
  });

  it("permits actions only with enabled refund capture and verified source", () => {
    const enabled = { ...productionFinancialEnv, DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED: "1" };
    expect(productionRefundReadiness(enabled, false)).toEqual({
      refundCaptureEnabled: true, refundActionsEnabled: true,
    });
    expect(() => productionRefundReadiness({ ...enabled,
      DRVO_SAAS_FINANCIAL_SOURCE_KEY: "another-source" }, false)).toThrow(/source configuration/);
    expect(() => productionRefundReadiness({ ...enabled,
      DRVO_SAAS_FINANCIAL_ENDPOINT: "http://drvotech.com/api/saas-financial/v1/events" }, false))
      .toThrow(/ENDPOINT/);
  });

  it("keeps actions closed when a configured pull consumer is not ready", () => {
    const enabled = { ...productionFinancialEnv, DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED: "1" };
    expect(productionRefundReadiness(enabled, true).refundActionsEnabled).toBe(false);
    expect(productionRefundReadiness({ ...enabled,
      DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY: "1" }, true).refundActionsEnabled).toBe(true);
  });
});

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
