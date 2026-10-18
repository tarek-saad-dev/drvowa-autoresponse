import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/db";
import {
  captureApprovedManualPayment,
  sqlApprovalTimeToHubUtc,
} from "@/modules/billing/saas-financial-outbox";

const ID = "9e921ec1-e38e-4420-bd3e-6abeaef494f5";
const BUSINESS = "d33928c9-d2ef-4f3e-8147-c8f4aa607eb7";
const TIME = "2026-10-18T10:00:00.1230000";
const config = {
  DRVO_SAAS_FINANCIAL_ENDPOINT: "https://hub.example.com/api/saas-financial/v1/events",
  DRVO_SAAS_FINANCIAL_SOURCE_KEY: "DRVO_AUTORESPOND",
  DRVO_SAAS_FINANCIAL_SOURCE_STATUS: "active",
  DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT: "2026-10-18T09:00:00Z",
  DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: "2026-10-18T09:30:00Z",
  DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED: "1",
};

function enableCapture(changes: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...config, ...changes })) vi.stubEnv(key, value);
}

function fakeTransaction(changes: Record<string, unknown> = {}) {
  const row = {
    PaymentRequestID: ID,
    BusinessID: BUSINESS,
    PaymentMethod: "INSTAPAY",
    CurrencyCode: "EGP",
    AmountText: "9999999999.99",
    ReviewedAtText: TIME,
    ...changes,
  };
  const query = vi.fn<(text: string, inputs?: unknown) => Promise<{ recordset: typeof row[] }>>(
    async () => ({ recordset: [row] }),
  );
  const execute = vi.fn<(text: string, inputs?: unknown) => Promise<number>>(async () => 1);
  return { trx: { query, execute } as unknown as TransactionClient, query, execute };
}

describe("transactional financial capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:01Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps disabled billing independent of the outbox table", async () => {
    vi.stubEnv("DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED", "0");
    const { trx, query, execute } = fakeTransaction();
    await captureApprovedManualPayment(ID, trx);
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("stores one exact immutable seven-field payload with stable IDs", async () => {
    enableCapture();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { trx, query, execute } = fakeTransaction();
    await captureApprovedManualPayment(ID, trx);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("CONVERT(varchar(32), Amount)");
    expect(query.mock.calls[0][0]).toContain("CONVERT(varchar(27), ReviewedAtUtc, 126)");
    expect(execute).toHaveBeenCalledTimes(1);
    const inputs = execute.mock.calls[0][1] as Array<{ name: string; value: unknown }>;
    const values = Object.fromEntries(inputs.map(({ name, value }) => [name, value]));
    expect(values).toMatchObject({
      paymentRequestId: ID,
      businessId: BUSINESS,
      sourceKey: "DRVO_AUTORESPOND",
      amountMinor: 999_999_999_999,
      currencyCode: "EGP",
      eventId: `autorespond:payment.confirmed:${ID}`,
      sourcePaymentId: `autorespond:manual-payment:${ID}`,
    });
    expect(values.occurredAtUtc).toEqual(new Date("2026-10-18T10:00:00.123Z"));
    expect(JSON.parse(values.payload as string)).toEqual({
      schema_version: 1,
      event_id: `autorespond:payment.confirmed:${ID}`,
      type: "payment.confirmed",
      source_payment_id: `autorespond:manual-payment:${ID}`,
      amount_minor: 999_999_999_999,
      currency: "EGP",
      occurred_at: "2026-10-18T10:00:00.123000Z",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("excludes pre-cutoff, zero-value and other payment methods", async () => {
    enableCapture();
    for (const changes of [
      { ReviewedAtText: "2026-10-18T09:29:59.9990000" },
      { AmountText: "0.00" },
      { PaymentMethod: "OTHER" },
    ]) {
      const { trx, execute } = fakeTransaction(changes);
      await captureApprovedManualPayment(ID, trx);
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("captures exactly at the cutoff and fails closed for inconsistent active config", async () => {
    enableCapture({ DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT: "2026-10-18T10:00:00.123Z" });
    const { trx, execute } = fakeTransaction();
    await captureApprovedManualPayment(ID, trx);
    expect(execute).toHaveBeenCalledTimes(1);
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_STATUS", "disabled");
    await expect(captureApprovedManualPayment(ID, trx)).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects non-exact decimals, unsupported currency, and insertion failures", async () => {
    enableCapture();
    for (const changes of [{ AmountText: "1.001" }, { CurrencyCode: "EUR" }]) {
      const { trx, execute } = fakeTransaction(changes);
      await expect(captureApprovedManualPayment(ID, trx)).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
    const { trx, execute } = fakeTransaction();
    execute.mockRejectedValueOnce(new Error("outbox insert failed"));
    await expect(captureApprovedManualPayment(ID, trx)).rejects.toThrow("outbox insert failed");
  });

  it("normalizes only millisecond-exact DATETIME2(7) values", () => {
    expect(sqlApprovalTimeToHubUtc(TIME)).toBe("2026-10-18T10:00:00.123000Z");
    for (const value of ["2026-10-18T10:00:00.1234567", "2026-10-18T10:00:00.123",
      "2026-02-30T10:00:00.1230000"]) {
      expect(() => sqlApprovalTimeToHubUtc(value)).toThrow();
    }
  });
});
