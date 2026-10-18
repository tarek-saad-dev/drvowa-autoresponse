import { decimal12_2ToMinorUnits, eventIdForManualPaymentConfirmation,
  parseHubTimestamp, sourcePaymentIdForManualRequest } from "./saas-financial-contract";
import { sqlApprovalTimeToHubUtc } from "./saas-financial-outbox";
import type { InventoryEvent } from "./saas-financial-reconciliation-client";

export type Approval = {
  paymentRequestId: string; method: string; amountText: string; currency: string;
  reviewedAtText: string; reviewedByUserId: string | null; approvedSubscriptionId: string | null;
};
export type Outbox = {
  eventId: string; sourcePaymentId: string; paymentRequestId: string; amountMinor: string;
  currency: string; occurredAtText: string; payload: string; state: string;
};
export type Finding = { subject: string; code: string };

export function compareFinancialEvidence(input: {
  approvals: Approval[]; outbox: Outbox[]; hub: InventoryEvent[];
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
  for (const row of input.outbox) {
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
  for (const row of input.hub) {
    if (hub.has(row.event_id)) add(row.event_id, "DUPLICATE_HUB_OBSERVATION");
    hub.set(row.event_id, row);
    if (row.source_payment_id) {
      if (hubPayments.has(row.source_payment_id) && hubPayments.get(row.source_payment_id) !== row.event_id)
        add(row.event_id, "HUB_PAYMENT_ID_CONFLICT");
      hubPayments.set(row.source_payment_id, row.event_id);
    }
    if (row.type !== "payment.confirmed") {
      add(row.event_id, "UNEXPECTED_HUB_REFUND");
      continue;
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
  return [...findings.values()];
}
