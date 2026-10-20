import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "../../src/lib/db";
import { eventIdForBillingRefund, sourceRefundIdForBillingRefund,
  sourcePaymentIdForManualRequest, parsePaymentRefundedV1 } from "../../src/modules/billing/saas-financial-contract";
import { validateClaim, deliverFinancialClaim } from "../../src/modules/billing/saas-financial-worker";
import { classifyHubResponse } from "../../src/modules/billing/saas-financial-client";
import { compareFinancialEvidence, type Refund, type Outbox } from "../../src/modules/billing/saas-financial-reconciliation-compare";
import { captureSucceededBillingRefund } from "../../src/modules/billing/saas-financial-refund-outbox";
import type { InventoryEvent } from "../../src/modules/billing/saas-financial-reconciliation-client";

const refundId = "f1162d94-08a2-4665-a1a7-9e2e67af3091";
const paymentId = "9e921ec1-e38e-4420-bd3e-6abeaef494f5";
const activated = "2026-10-18T04:59:46.821598Z";
const occurred = "2026-10-19T12:01:02.123000Z";
const event = { schema_version: 1 as const, event_id: eventIdForBillingRefund(refundId),
  type: "payment.refunded" as const, source_refund_id: sourceRefundIdForBillingRefund(refundId),
  original_source_payment_id: sourcePaymentIdForManualRequest(paymentId),
  amount_minor: 12345, currency: "EGP" as const, occurred_at: occurred };
const source: Refund = { refundId, paymentRequestId: paymentId, amountMinor: "12345",
  currency: "EGP", completedAtText: occurred.slice(0,23), state: "SUCCEEDED" };
const local: Outbox = { eventId: event.event_id, sourcePaymentId: event.original_source_payment_id,
  sourceRefundId: event.source_refund_id, refundId, paymentRequestId: paymentId,
  amountMinor: "12345", currency: "EGP", occurredAtText: occurred,
  payload: JSON.stringify(event), state: "ACCEPTED", eventType: "payment.refunded" };
const hub: InventoryEvent = { hub_event_id: "1", event_id: event.event_id,
  type: "payment.refunded", source_payment_id: null, source_refund_id: event.source_refund_id,
  original_source_payment_id: event.original_source_payment_id, amount_minor: "12345",
  currency: "EGP", occurred_at: occurred, accepted_at: "2026-10-19T12:02:00.000000Z" };
const claim = { eventId: event.event_id, sourcePaymentId: event.original_source_payment_id,
  sourceRefundId: event.source_refund_id, eventType: "payment.refunded", payload: JSON.stringify(event),
  amountMinor: "12345", currency: "EGP", leaseToken: "lease", attemptCount: 1 };
const compare = (refunds: Refund[] = [source], outbox: Outbox[] = [local], events: InventoryEvent[] = [hub],
  fullInventory = true) => compareFinancialEvidence({ approvals: [], refunds, outbox, hub: events,
    cutoff: activated, fullInventory }).map(f => f.code);

afterEach(() => vi.unstubAllEnvs());

function captureTransaction(originalSourcePaymentId: string) {
  vi.stubEnv("DRVO_SAAS_FINANCIAL_ENDPOINT", "https://hub.example.com/api/saas-financial/v1/events");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_KEY", "drvo-autorespond");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_STATUS", "active");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT", activated);
  vi.stubEnv("DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT", activated);
  vi.stubEnv("DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED", "1");
  const query = vi.fn().mockResolvedValueOnce({ recordset: [{ RefundID: refundId,
    AmountText: "12345", CurrencyCode: "EGP", CompletedText: "2026-10-19T12:01:02.123" }] })
    .mockResolvedValueOnce({ recordset: [{ SourcePaymentID: originalSourcePaymentId,
      AmountMinor: "12345", CurrencyCode: "EGP", OccurredText: "2026-10-19T12:00:00.000000Z" }] });
  const execute = vi.fn().mockResolvedValue(1);
  return { query, execute };
}

describe("Hub refund contract and identity", () => {
  it("captures exact minor units only when the stored original payment identity matches", async () => {
    const trx = captureTransaction(event.original_source_payment_id);
    await captureSucceededBillingRefund(refundId, paymentId, "a05d9b8e-ab3c-41a7-a8e9-3b0058ed8d8c",
      trx as unknown as TransactionClient);
    expect(trx.execute).toHaveBeenCalledTimes(1);
    expect(trx.execute.mock.calls[0][1]).toContainEqual(expect.objectContaining({ name: "amount", value: 12345 }));
    expect(trx.execute.mock.calls[0][1]).toContainEqual(expect.objectContaining({
      name: "original", value: event.original_source_payment_id }));
  });
  it("fails closed before insertion when the captured original payment identity differs", async () => {
    const trx = captureTransaction("different-payment");
    await expect(captureSucceededBillingRefund(refundId, paymentId,
      "a05d9b8e-ab3c-41a7-a8e9-3b0058ed8d8c", trx as unknown as TransactionClient)).rejects.toThrow();
    expect(trx.execute).not.toHaveBeenCalled();
  });
  it("keeps refund and original payment operations distinct and stable", () => {
    expect(event.event_id).toBe(eventIdForBillingRefund(refundId.toUpperCase()));
    expect(event.source_refund_id).not.toBe(event.original_source_payment_id);
    expect(parsePaymentRefundedV1(event, { sourceActivatedAt: activated })).toEqual(event);
    expect(validateClaim(claim, activated)).toBe(true);
  });
  it("rejects unknown fields, fractional money, and preactivation timestamps", () => {
    expect(() => parsePaymentRefundedV1({ ...event, source_payment_id: paymentId },
      { sourceActivatedAt: activated })).toThrow();
    expect(() => parsePaymentRefundedV1({ ...event, amount_minor: 1.01 },
      { sourceActivatedAt: activated })).toThrow();
    expect(() => parsePaymentRefundedV1({ ...event, occurred_at: "2026-10-18T04:59:46.821597Z" },
      { sourceActivatedAt: activated })).toThrow();
    expect(validateClaim({ ...claim, sourceRefundId: "other" }, activated)).toBe(false);
  });
  it("retries only the Hub's missing-original conflict", () => {
    expect(classifyHubResponse({ status: 409, body: '{"error":{"code":"original_payment_missing"}}', headers: {} },
      event.event_id)).toMatchObject({ kind: "retry", code: "ORIGINAL_PAYMENT_MISSING" });
    expect(classifyHubResponse({ status: 409, body: '{"error":{"code":"refund_exceeds_payment"}}', headers: {} },
      event.event_id).kind).toBe("review");
  });
  it("delivers a refund and accepts an idempotent replay", async () => {
    const settle = vi.fn().mockResolvedValue(true);
    await deliverFinancialClaim(claim, activated, async () => ({ status: 201,
      body: JSON.stringify({ event_id: event.event_id, duplicate: false }), headers: {} }), settle);
    await deliverFinancialClaim({ ...claim, attemptCount: 2 }, activated, async () => ({ status: 200,
      body: JSON.stringify({ event_id: event.event_id, duplicate: true }), headers: {} }), settle);
    expect(settle.mock.calls.map(call => call[1].state)).toEqual(["ACCEPTED", "ACCEPTED"]);
  });
});

describe("independent refund reconciliation", () => {
  it("matches all three facts without altering payment comparisons", () => expect(compare()).toEqual([]));
  it("finds missing capture, pending delivery, and Hub-only refunds", () => {
    expect(compare([source], [], [])).toContain("REFUND_MISSING_OUTBOX");
    expect(compare([source], [{ ...local, state: "PENDING" }], [])).toContain("REFUND_DELIVERY_PENDING");
    expect(compare([], [], [hub])).toContain("HUB_REFUND_WITHOUT_SOURCE");
    expect(compare([source], [local], [])).toContain("REFUND_HUB_NOT_OBSERVED_PROVISIONAL");
    expect(compare([source], [local], [], false)).not.toContain("REFUND_HUB_NOT_OBSERVED_PROVISIONAL");
  });
  it("finds link, amount, currency, time, event ID and payload conflicts", () => {
    const codes = compare([source], [{ ...local, amountMinor: "1" }], [{ ...hub,
      original_source_payment_id: "wrong", amount_minor: "1", currency: "USD",
      occurred_at: "2026-10-19T12:01:03.123000Z" }]);
    for (const code of ["REFUND_OUTBOX_PAYLOAD_CONFLICT", "REFUND_OUTBOX_AMOUNT_MISMATCH",
      "REFUND_HUB_IDENTITY_MISMATCH", "REFUND_HUB_AMOUNT_MISMATCH",
      "REFUND_HUB_CURRENCY_MISMATCH", "REFUND_HUB_TIME_MISMATCH"]) expect(codes).toContain(code);
    expect(compare([source], [{ ...local, eventId: "other" }], [{ ...hub, event_id: "different" }]))
      .toEqual(expect.arrayContaining(["REFUND_OUTBOX_EVENT_ID_CONFLICT", "REFUND_HUB_EVENT_ID_CONFLICT"]));
  });
  it("ignores unsuccessful and pre-cutoff refund facts", () => {
    expect(compare([{ ...source, state: "FAILED" }], [], [])).toEqual([]);
    expect(compare([{ ...source, completedAtText: "2026-10-18T04:59:46.821" }], [], [])).toEqual([]);
  });
});
