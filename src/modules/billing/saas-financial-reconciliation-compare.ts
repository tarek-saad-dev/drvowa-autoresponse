import { decimal12_2ToMinorUnits, eventIdForManualPaymentConfirmation,
  eventIdForBillingRefund, sourceRefundIdForBillingRefund, parseHubTimestamp,
  sourcePaymentIdForManualRequest, parsePaymentRefundedV1 } from "./saas-financial-contract";
import { sqlApprovalTimeToHubUtc } from "./saas-financial-outbox";
import type { InventoryEvent } from "./saas-financial-reconciliation-client";

export type Approval = {
  paymentRequestId: string; method: string; amountText: string; currency: string;
  reviewedAtText: string; reviewedByUserId: string | null; approvedSubscriptionId: string | null;
};
export type Outbox = {
  eventId: string; sourcePaymentId: string; paymentRequestId: string; amountMinor: string;
  currency: string; occurredAtText: string; payload: string; state: string;
  eventType?: string; refundId?: string | null; sourceRefundId?: string | null;
};
export type Refund = { refundId: string; paymentRequestId: string; amountMinor: string;
  currency: string; completedAtText: string; state: string };
export type Finding = { subject: string; code: string };

export function compareFinancialEvidence(input: {
  approvals: Approval[]; refunds?: Refund[]; outbox: Outbox[]; hub: InventoryEvent[];
  cutoff: string; fullInventory: boolean;
}): Finding[] {
  const findings = new Map<string, Finding>();
  const add = (subject: string, code: string) => findings.set(`${subject}\0${code}`, { subject, code });
  const cutoff = parseHubTimestamp(input.cutoff).epochMicroseconds;
  const approved = new Map<string, { eventId: string; paymentId: string; amount: string; currency: string; occurred: string }>();
  for (const row of input.approvals) {
    if (row.method !== "INSTAPAY") continue;
    let occurred: string;
    try { occurred = sqlApprovalTimeToHubUtc(row.reviewedAtText); }
    catch { add(row.paymentRequestId, "APPROVAL_TIME_INVALID"); continue; }
    if (parseHubTimestamp(occurred).epochMicroseconds < cutoff) continue;
    if (!row.reviewedByUserId || !row.approvedSubscriptionId) add(row.paymentRequestId, "APPROVAL_RECORD_INCONSISTENT");
    let amount: string;
    try { amount = String(decimal12_2ToMinorUnits(row.amountText)); }
    catch { add(row.paymentRequestId, "APPROVAL_AMOUNT_INVALID"); continue; }
    let eventId: string, paymentId: string;
    try {
      eventId = eventIdForManualPaymentConfirmation(row.paymentRequestId);
      paymentId = sourcePaymentIdForManualRequest(row.paymentRequestId);
    } catch { add(row.paymentRequestId, "APPROVAL_ID_INVALID"); continue; }
    if (approved.has(eventId)) add(eventId, "DUPLICATE_APPROVAL");
    approved.set(eventId, { eventId, paymentId, amount, currency: row.currency, occurred });
  }
  const outbox = new Map<string, Outbox>();
  const paymentIds = new Map<string, string>();
  const requestIds = new Map<string, string>();
  for (const row of input.outbox.filter(row => !row.eventType || row.eventType === "payment.confirmed")) {
    if (outbox.has(row.eventId) || (paymentIds.has(row.sourcePaymentId)
      && paymentIds.get(row.sourcePaymentId) !== row.eventId)) add(row.eventId, "DUPLICATE_OUTBOX");
    outbox.set(row.eventId, row);
    paymentIds.set(row.sourcePaymentId, row.eventId);
    requestIds.set(row.paymentRequestId.toLowerCase(), row.eventId);
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(row.payload) as Record<string, unknown>; }
    catch { add(row.eventId, "OUTBOX_PAYLOAD_INVALID"); continue; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).length !== 7 || !["schema_version", "event_id", "type",
        "source_payment_id", "amount_minor", "currency", "occurred_at"].every(k => k in payload)
      || payload.schema_version !== 1 || payload.type !== "payment.confirmed"
      || !Number.isSafeInteger(payload.amount_minor)
      || payload.event_id !== row.eventId || payload.source_payment_id !== row.sourcePaymentId
      || String(payload.amount_minor) !== row.amountMinor || payload.currency !== row.currency
      || payload.occurred_at !== row.occurredAtText) add(row.eventId, "OUTBOX_PAYLOAD_CONFLICT");
  }
  const hub = new Map<string, InventoryEvent>();
  const hubPayments = new Map<string, string>();
  for (const row of input.hub.filter(row => row.type === "payment.confirmed")) {
    if (hub.has(row.event_id)) add(row.event_id, "DUPLICATE_HUB_OBSERVATION");
    hub.set(row.event_id, row);
    if (row.source_payment_id) {
      if (hubPayments.has(row.source_payment_id) && hubPayments.get(row.source_payment_id) !== row.event_id)
        add(row.event_id, "HUB_PAYMENT_ID_CONFLICT");
      hubPayments.set(row.source_payment_id, row.event_id);
    }
    if (!approved.has(row.event_id)) add(row.event_id, "HUB_WITHOUT_ELIGIBLE_APPROVAL");
  }
  for (const [id, a] of approved) {
    const o = outbox.get(id);
    if (!o) {
      add(id, "APPROVAL_MISSING_OUTBOX");
      if (requestIds.has(id.slice("autorespond:payment.confirmed:".length))
        || paymentIds.has(a.paymentId)) add(id, "OUTBOX_EVENT_ID_CONFLICT");
    } else {
      if (o.paymentRequestId.toLowerCase() !== id.slice("autorespond:payment.confirmed:".length)
        || o.sourcePaymentId !== a.paymentId) add(id, "OUTBOX_IDENTITY_MISMATCH");
      if (o.amountMinor !== a.amount) add(id, "OUTBOX_AMOUNT_MISMATCH");
      if (o.currency !== a.currency) add(id, "OUTBOX_CURRENCY_MISMATCH");
      if (o.occurredAtText !== a.occurred) add(id, "OUTBOX_TIME_MISMATCH");
      if (o.state !== "ACCEPTED") add(id, o.state === "PENDING" || o.state === "LEASED"
        ? "DELIVERY_PENDING" : "DELIVERY_REVIEW");
    }
    const h = hub.get(id);
    if (!h) {
      if (hubPayments.has(a.paymentId)) add(id, "HUB_EVENT_ID_CONFLICT");
      if (input.fullInventory && o?.state === "ACCEPTED") add(id, "HUB_NOT_OBSERVED_PROVISIONAL");
      continue;
    }
    if (h.source_payment_id !== a.paymentId || h.type !== "payment.confirmed") add(id, "HUB_IDENTITY_MISMATCH");
    if (h.amount_minor !== a.amount) add(id, "HUB_AMOUNT_MISMATCH");
    if (h.currency !== a.currency) add(id, "HUB_CURRENCY_MISMATCH");
    if (parseHubTimestamp(h.occurred_at).epochMicroseconds !== parseHubTimestamp(a.occurred).epochMicroseconds)
      add(id, "HUB_TIME_MISMATCH");
  }
  for (const [id] of outbox) if (!approved.has(id)) add(id, "OUTBOX_WITHOUT_ELIGIBLE_APPROVAL");
  const refundOutbox = input.outbox.filter(row => row.eventType === "payment.refunded");
  const refundHub = input.hub.filter(row => row.type === "payment.refunded");
  const expected = new Map<string, { refund: Refund; paymentId: string; refundSource: string; occurred: string }>();
  for (const refund of input.refunds ?? []) {
    if (refund.state !== "SUCCEEDED") continue;
    let eventId: string, paymentId: string, refundSource: string, occurred: string;
    try {
      eventId = eventIdForBillingRefund(refund.refundId);
      paymentId = sourcePaymentIdForManualRequest(refund.paymentRequestId);
      refundSource = sourceRefundIdForBillingRefund(refund.refundId);
      occurred = `${refund.completedAtText}000Z`;
      if (parseHubTimestamp(occurred).epochMicroseconds < cutoff) continue;
      if (!/^[1-9]\d*$/.test(refund.amountMinor)
        || !Number.isSafeInteger(Number(refund.amountMinor))) throw new RangeError("Invalid refund amount");
    } catch { add(refund.refundId, "REFUND_FACT_INVALID"); continue; }
    if (expected.has(eventId)) add(eventId, "DUPLICATE_REFUND_FACT");
    expected.set(eventId, { refund, paymentId, refundSource, occurred });
  }
  const localRefunds = new Map<string, Outbox>();
  const localOperations = new Map<string, string>();
  for (const row of refundOutbox) {
    if (localRefunds.has(row.eventId) || (row.sourceRefundId && localOperations.has(row.sourceRefundId)))
      add(row.eventId, "DUPLICATE_REFUND_OUTBOX");
    localRefunds.set(row.eventId, row);
    if (row.sourceRefundId) localOperations.set(row.sourceRefundId, row.eventId);
    try {
      const parsed = JSON.parse(row.payload);
      if (JSON.stringify(parsed) !== row.payload) throw new Error();
      const event = parsePaymentRefundedV1(parsed, { sourceActivatedAt: input.cutoff });
      if (event.event_id !== row.eventId || event.source_refund_id !== row.sourceRefundId
        || event.original_source_payment_id !== row.sourcePaymentId
        || String(event.amount_minor) !== row.amountMinor || event.currency !== row.currency
        || event.occurred_at !== row.occurredAtText) throw new Error();
    } catch { add(row.eventId, "REFUND_OUTBOX_PAYLOAD_CONFLICT"); }
    if (!expected.has(row.eventId)) add(row.eventId, "REFUND_OUTBOX_WITHOUT_SOURCE");
  }
  const hubRefunds = new Map<string, InventoryEvent>();
  const hubOperations = new Map<string, string>();
  for (const row of refundHub) {
    if (hubRefunds.has(row.event_id) || (row.source_refund_id && hubOperations.has(row.source_refund_id)))
      add(row.event_id, "DUPLICATE_HUB_REFUND");
    hubRefunds.set(row.event_id, row);
    if (row.source_refund_id) hubOperations.set(row.source_refund_id, row.event_id);
    if (!expected.has(row.event_id)) add(row.event_id, "HUB_REFUND_WITHOUT_SOURCE");
  }
  for (const [id, { refund, paymentId, refundSource, occurred }] of expected) {
    const local = localRefunds.get(id);
    if (input.outbox.some(row => row.eventId === id && row.eventType !== "payment.refunded"))
      add(id, "REFUND_OUTBOX_TYPE_MISMATCH");
    if (!local) {
      add(id, "REFUND_MISSING_OUTBOX");
      if (localOperations.has(refundSource)) add(id, "REFUND_OUTBOX_EVENT_ID_CONFLICT");
    } else {
      if (local.refundId?.toLowerCase() !== refund.refundId.toLowerCase()
        || local.paymentRequestId.toLowerCase() !== refund.paymentRequestId.toLowerCase()
        || local.sourceRefundId !== refundSource || local.sourcePaymentId !== paymentId)
        add(id, "REFUND_OUTBOX_IDENTITY_MISMATCH");
      if (local.amountMinor !== refund.amountMinor) add(id, "REFUND_OUTBOX_AMOUNT_MISMATCH");
      if (local.currency !== refund.currency) add(id, "REFUND_OUTBOX_CURRENCY_MISMATCH");
      if (local.occurredAtText !== occurred) add(id, "REFUND_OUTBOX_TIME_MISMATCH");
      if (local.state !== "ACCEPTED") add(id, local.state === "PENDING" || local.state === "LEASED"
        ? "REFUND_DELIVERY_PENDING" : "REFUND_DELIVERY_REVIEW");
    }
    const hub = hubRefunds.get(id);
    if (input.hub.some(row => row.event_id === id && row.type !== "payment.refunded"))
      add(id, "REFUND_HUB_TYPE_MISMATCH");
    if (!hub) {
      if (hubOperations.has(refundSource)) add(id, "REFUND_HUB_EVENT_ID_CONFLICT");
      if (input.fullInventory && local?.state === "ACCEPTED") add(id, "REFUND_HUB_NOT_OBSERVED_PROVISIONAL");
    } else {
      if (hub.source_refund_id !== refundSource || hub.original_source_payment_id !== paymentId
        || hub.type !== "payment.refunded") add(id, "REFUND_HUB_IDENTITY_MISMATCH");
      if (hub.amount_minor !== refund.amountMinor) add(id, "REFUND_HUB_AMOUNT_MISMATCH");
      if (hub.currency !== refund.currency) add(id, "REFUND_HUB_CURRENCY_MISMATCH");
      if (parseHubTimestamp(hub.occurred_at).epochMicroseconds !== parseHubTimestamp(occurred).epochMicroseconds)
        add(id, "REFUND_HUB_TIME_MISMATCH");
    }
  }
  return [...findings.values()];
}
