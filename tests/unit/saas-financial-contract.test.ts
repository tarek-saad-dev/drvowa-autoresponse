import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decimal12_2ToMinorUnits,
  eventIdForManualPaymentConfirmation,
  isHubIdentifier,
  isSaasFinancialCurrency,
  parseHubTimestamp,
  parsePaymentConfirmedV1,
  serializeUtcOccurredAt,
  sourcePaymentIdForManualRequest,
} from "../../src/modules/billing/saas-financial-contract";
import { readSaasFinancialConfig } from "../../src/modules/billing/saas-financial-config";

const UUID = "9E921EC1-E38E-4420-BD3E-6ABEAEF494F5";
const ACTIVATED_AT = "2026-10-17T00:00:00.000000Z";
const NOW = new Date("2026-10-18T10:00:00.000Z");
const payment = {
  schema_version: 1,
  event_id: "autorespond:payment.confirmed:9e921ec1-e38e-4420-bd3e-6abeaef494f5",
  type: "payment.confirmed",
  source_payment_id: "autorespond:manual-payment:9e921ec1-e38e-4420-bd3e-6abeaef494f5",
  amount_minor: 1,
  currency: "EGP",
  occurred_at: "2026-10-18T10:00:00Z",
};

describe("Hub payment.confirmed v1 contract", () => {
  it("enforces the Hub's exact identifier pattern and length", () => {
    for (const id of ["a", "A0_.:-", "x".repeat(150)]) expect(isHubIdentifier(id)).toBe(true);
    for (const id of ["", "_first", "x".repeat(151), "has space", "é", "a/b", "a\n", 42]) {
      expect(isHubIdentifier(id)).toBe(false);
    }
  });

  it("derives stable, distinct payment and event IDs from a manual PaymentRequestID", () => {
    const paymentId = sourcePaymentIdForManualRequest(UUID);
    const eventId = eventIdForManualPaymentConfirmation(UUID);
    expect(paymentId).toBe("autorespond:manual-payment:9e921ec1-e38e-4420-bd3e-6abeaef494f5");
    expect(eventId).toBe("autorespond:payment.confirmed:9e921ec1-e38e-4420-bd3e-6abeaef494f5");
    expect(sourcePaymentIdForManualRequest(UUID.toLowerCase())).toBe(paymentId);
    expect(eventIdForManualPaymentConfirmation(UUID.toLowerCase())).toBe(eventId);
    expect(paymentId).not.toBe(eventId);
    expect(isHubIdentifier(paymentId)).toBe(true);
    expect(isHubIdentifier(eventId)).toBe(true);
    expect(() => sourcePaymentIdForManualRequest("a/b")).toThrow(RangeError);
    expect(() => sourcePaymentIdForManualRequest(`${UUID}\n`)).toThrow(RangeError);
    expect(() => eventIdForManualPaymentConfirmation("x".repeat(36))).toThrow(RangeError);
  });

  it("converts exact SQL DECIMAL(12,2) text without rounding", () => {
    expect(decimal12_2ToMinorUnits("0.01")).toBe(1);
    expect(decimal12_2ToMinorUnits("123.45")).toBe(12_345);
    expect(decimal12_2ToMinorUnits("9999999999.99")).toBe(999_999_999_999);
  });

  it("rejects zero, negatives, fractions, noncanonical text and unsafe bounds", () => {
    for (const amount of ["0.00", "-0.01", "1.001", "1.5", "1", "01.00",
      "+1.00", "1e2", "1.00\n", "99999999999.99", "90071992547409.91", "NaN"]) {
      expect(() => decimal12_2ToMinorUnits(amount)).toThrow(RangeError);
    }
    expect(() => decimal12_2ToMinorUnits(0.01 as unknown as string)).toThrow(RangeError);
  });

  it("accepts only configured uppercase Hub currencies", () => {
    for (const currency of ["EGP", "USD", "SAR"]) expect(isSaasFinancialCurrency(currency)).toBe(true);
    for (const currency of ["egp", "EUR", "EG", "EGP ", 1]) {
      expect(isSaasFinancialCurrency(currency)).toBe(false);
    }
  });

  it("serializes UTC time and normalizes valid offsets with microsecond precision", () => {
    expect(serializeUtcOccurredAt(new Date("2026-10-18T10:00:00.123Z")))
      .toBe("2026-10-18T10:00:00.123Z");
    expect(parseHubTimestamp("2026-10-18T12:00:00.123456+02:00").canonical)
      .toBe("2026-10-18T10:00:00.123456Z");
    expect(parseHubTimestamp("2026-10-18T10:00:00Z").canonical)
      .toBe("2026-10-18T10:00:00.000000Z");
    for (const time of ["2026-02-30T00:00:00Z", "2026-10-18", "2026-10-18T10:00:00",
      "2026-10-18T10:00:00.1234567Z", "2026-10-18T10:00:00+14:01",
      "2026-10-18T24:00:00Z", "2026-10-18T10:00:00Z\n"]) {
      expect(() => parseHubTimestamp(time)).toThrow(RangeError);
    }
    expect(() => serializeUtcOccurredAt(new Date(NaN))).toThrow(RangeError);
    expect(() => serializeUtcOccurredAt(new Date("+010000-01-01T00:00:00.000Z")))
      .toThrow(RangeError);
  });

  it("accepts exactly the seven payment fields within activation and future limits", () => {
    expect(parsePaymentConfirmedV1(payment, { sourceActivatedAt: ACTIVATED_AT, now: NOW }))
      .toEqual({ ...payment, occurred_at: "2026-10-18T10:00:00.000000Z" });
    expect(parsePaymentConfirmedV1({ ...payment, amount_minor: 1_000_000_000_000_000 },
      { sourceActivatedAt: ACTIVATED_AT, now: NOW }).amount_minor).toBe(1_000_000_000_000_000);
    expect(parsePaymentConfirmedV1({ ...payment, occurred_at: "2026-10-18T10:05:00Z" },
      { sourceActivatedAt: ACTIVATED_AT, now: NOW }).occurred_at)
      .toBe("2026-10-18T10:05:00.000000Z");
  });

  it("rejects malformed fields, unsafe integers and impossible occurrence times", () => {
    const bounds = { sourceActivatedAt: ACTIVATED_AT, now: NOW };
    for (const change of [
      { schema_version: "1" }, { type: "payment.refunded" }, { event_id: "_bad" },
      { source_payment_id: "" }, { amount_minor: 0 }, { amount_minor: -1 },
      { amount_minor: 1.5 }, { amount_minor: "1" },
      { amount_minor: 1_000_000_000_000_001 },
      { amount_minor: Number.MAX_SAFE_INTEGER + 1 }, { currency: "EUR" },
      { occurred_at: "2026-10-16T23:59:59.999999Z" },
      { occurred_at: "2026-10-18T10:05:00.000001Z" },
    ]) {
      expect(() => parsePaymentConfirmedV1({ ...payment, ...change }, bounds)).toThrow(RangeError);
    }
    expect(() => parsePaymentConfirmedV1({ ...payment, customer_id: "x" }, bounds)).toThrow(RangeError);
    const withoutPaymentId = Object.fromEntries(
      Object.entries(payment).filter(([key]) => key !== "source_payment_id"),
    );
    expect(() => parsePaymentConfirmedV1(withoutPaymentId, bounds)).toThrow(RangeError);
  });
});

describe("inactive SaaS financial configuration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults every integration control to off with no invented source or dates", () => {
    expect(readSaasFinancialConfig({})).toEqual({
      endpoint: null, sourceKey: null, sourceStatus: "disabled",
      captureEnabled: false, deliveryEnabled: false, reconciliationEnabled: false,
      sourceActivatedAt: null, captureCutoffAt: null,
      credentialKeyId: null, credentialSecretRef: null,
    });
  });

  it("rejects missing, invalid and inconsistent active configuration", () => {
    const base = {
      DRVO_SAAS_FINANCIAL_ENDPOINT: "https://hub.example.com/api/saas-financial/v1/events",
      DRVO_SAAS_FINANCIAL_SOURCE_KEY: "DRVO_AUTORESPOND",
      DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "active",
      DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: ACTIVATED_AT,
      DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: ACTIVATED_AT,
      DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID: "key_1",
      DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: "env:DRVO_HUB_HMAC_SECRET",
    };
    expect(readSaasFinancialConfig(base).captureEnabled).toBe(false);
    expect(readSaasFinancialConfig({ ...base, DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1" }).captureEnabled)
      .toBe(true);
    const invalid = [
      { DRVO_SAAS_FINANCIAL_ENDPOINT: "http://hub.example.com/api/saas-financial/v1/events" },
      { DRVO_SAAS_FINANCIAL_ENDPOINT: "https://hub.example.com/api/saas-financial/v1/events?x=1" },
      { DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "true" },
      { DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "disabled", DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1" },
      { DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: "" },
      { DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: "2026-10-16T00:00:00Z" },
      { DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID: "bad key" },
      { DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID: "key_1\n" },
      { DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: "raw-secret-value" },
      { DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: "env:DRVO_HUB_HMAC_SECRET\n" },
      { DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF: undefined },
      { DRVO_SAAS_FINANCIAL_DELIVERY_ENABLED: "1" },
    ];
    for (const change of invalid) expect(() => readSaasFinancialConfig({ ...base, ...change }))
      .toThrow(RangeError);
    expect(() => readSaasFinancialConfig({ DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1" }))
      .toThrow(RangeError);
  });

  it("has no outbound side effects while validating identities, amounts and config", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    sourcePaymentIdForManualRequest(UUID);
    eventIdForManualPaymentConfirmation(UUID);
    decimal12_2ToMinorUnits("0.01");
    readSaasFinancialConfig({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
