import type { TransactionClient } from "@/lib/db";
import {
  decimal12_2ToMinorUnits,
  eventIdForManualPaymentConfirmation,
  isSaasFinancialCurrency,
  parseHubTimestamp,
  parsePaymentConfirmedV1,
  sourcePaymentIdForManualRequest,
} from "./saas-financial-contract";
import { readSaasFinancialConfig } from "./saas-financial-config";
import {
  getApprovedPaymentSnapshot,
  insertPaymentConfirmed,
} from "./saas-financial-outbox-repository";

/**
 * ReviewedAtUtc is DATETIME2(7), but mssql/tedious Date inputs carry only
 * milliseconds. Read its full SQL text and require the unused four digits to
 * be zero. Store the same instant as DATETIME2(3) and a six-digit Hub UTC
 * string. A future change to database-side microsecond timestamps fails closed.
 */
export function sqlApprovalTimeToHubUtc(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}$/.test(value)
    || !value.endsWith("0000")) {
    throw new RangeError("Approval DATETIME2(7) is not millisecond exact");
  }
  return parseHubTimestamp(`${value.slice(0, 23)}Z`).canonical;
}

/** Called only on a successful PENDING → APPROVED transition, inside its transaction. */
export async function captureApprovedManualPayment(
  paymentRequestId: string,
  trx: TransactionClient,
): Promise<void> {
  // The default-off path must not depend on an outbox table or Hub setup.
  const flag = process.env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED;
  if (flag === undefined || flag === "0") return;

  const config = readSaasFinancialConfig();
  if (!config.captureEnabled || !config.sourceKey || !config.sourceActivatedAt
    || !config.captureCutoffAt) {
    throw new Error("Financial capture configuration is inconsistent");
  }

  const row = await getApprovedPaymentSnapshot(paymentRequestId, trx);
  if (row.PaymentMethod !== "INSTAPAY") return;
  const occurredAt = sqlApprovalTimeToHubUtc(row.ReviewedAtText);
  if (parseHubTimestamp(occurredAt).epochMicroseconds
    < parseHubTimestamp(config.captureCutoffAt).epochMicroseconds) return;
  if (row.AmountText === "0.00") return;
  if (!isSaasFinancialCurrency(row.CurrencyCode)) {
    throw new RangeError("Unsupported financial capture currency");
  }

  const event = parsePaymentConfirmedV1({
    schema_version: 1,
    event_id: eventIdForManualPaymentConfirmation(row.PaymentRequestID),
    type: "payment.confirmed",
    source_payment_id: sourcePaymentIdForManualRequest(row.PaymentRequestID),
    amount_minor: decimal12_2ToMinorUnits(row.AmountText),
    currency: row.CurrencyCode,
    occurred_at: occurredAt,
  }, { sourceActivatedAt: config.sourceActivatedAt });
  const payload = JSON.stringify(event);
  if (Buffer.byteLength(payload, "utf8") > 8192) {
    throw new RangeError("Financial event exceeds Hub body limit");
  }

  await insertPaymentConfirmed({
    paymentRequestId: row.PaymentRequestID,
    businessId: row.BusinessID,
    sourceKey: config.sourceKey,
    event,
    payload,
    occurredAtUtc: new Date(event.occurred_at),
  }, trx);
}
