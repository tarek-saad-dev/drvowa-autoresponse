import { sql, type TransactionClient } from "@/lib/db";
import { eventIdForBillingRefund, sourceRefundIdForBillingRefund,
  sourcePaymentIdForManualRequest, parsePaymentRefundedV1, parseHubTimestamp,
  isSaasFinancialCurrency } from "./saas-financial-contract";
import { readSaasFinancialConfig } from "./saas-financial-config";

/** A failed insert aborts the caller's refund transition and its subscription changes. */
export async function captureSucceededBillingRefund(refundId: string, paymentRequestId: string,
  businessId: string, trx: TransactionClient): Promise<void> {
  const config = readSaasFinancialConfig();
  if (!config.captureEnabled || !config.sourceKey || !config.sourceActivatedAt || !config.captureCutoffAt)
    throw new Error("Refund financial capture is unavailable");
  const snapshot = (await trx.query<{
    RefundID: string; AmountText: string; CurrencyCode: string; CompletedText: string;
  }>(`SELECT RefundID, CONVERT(varchar(20),AmountMinor) AS AmountText, CurrencyCode,
      CONVERT(varchar(23),CompletedAtUtc,126) AS CompletedText
      FROM dbo.TblBillingRefund WHERE RefundID=@refund AND PaymentRequestID=@payment
      AND State=N'SUCCEEDED' AND CompletedAtUtc IS NOT NULL`, [
    { name: "refund", type: sql.UniqueIdentifier, value: refundId },
    { name: "payment", type: sql.UniqueIdentifier, value: paymentRequestId },
  ])).recordset[0];
  if (!snapshot || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/.test(snapshot.CompletedText)
    || !/^[1-9]\d*$/.test(snapshot.AmountText) || !isSaasFinancialCurrency(snapshot.CurrencyCode))
    throw new Error("Successful refund financial fact is invalid");
  const occurredAt = `${snapshot.CompletedText}000Z`;
  if (parseHubTimestamp(occurredAt).epochMicroseconds
    < parseHubTimestamp(config.captureCutoffAt).epochMicroseconds)
    throw new Error("Refund precedes capture cutoff");
  const original = (await trx.query<{ SourcePaymentID: string; AmountMinor: string; CurrencyCode: string; OccurredText: string }>(
    `SELECT SourcePaymentID, CONVERT(varchar(20),AmountMinor) AS AmountMinor, CurrencyCode,
      CONVERT(varchar(23),OccurredAtUtc,126)+'000Z' AS OccurredText
      FROM dbo.TblSaasFinancialOutbox WITH (UPDLOCK,HOLDLOCK)
      WHERE PaymentRequestID=@payment AND EventType=N'payment.confirmed' AND SourceKey=@source`, [
      { name: "payment", type: sql.UniqueIdentifier, value: paymentRequestId },
      { name: "source", type: sql.NVarChar(100), value: config.sourceKey },
    ])).recordset[0];
  if (!original || original.SourcePaymentID !== sourcePaymentIdForManualRequest(paymentRequestId)
    || original.CurrencyCode !== snapshot.CurrencyCode
    || BigInt(snapshot.AmountText) > BigInt(original.AmountMinor)
    || parseHubTimestamp(occurredAt).epochMicroseconds < parseHubTimestamp(original.OccurredText).epochMicroseconds)
    throw new Error("Refund has no eligible captured original payment");
  const amount = Number(snapshot.AmountText);
  const event = parsePaymentRefundedV1({ schema_version: 1,
    event_id: eventIdForBillingRefund(refundId), type: "payment.refunded",
    source_refund_id: sourceRefundIdForBillingRefund(refundId),
    original_source_payment_id: sourcePaymentIdForManualRequest(paymentRequestId),
    amount_minor: amount, currency: snapshot.CurrencyCode, occurred_at: occurredAt,
  }, { sourceActivatedAt: config.sourceActivatedAt });
  const payload = JSON.stringify(event);
  if (Buffer.byteLength(payload, "utf8") > 8192) throw new Error("Refund payload exceeds Hub limit");
  const affected = await trx.execute(`INSERT dbo.TblSaasFinancialOutbox
    (EventID,SourcePaymentID,SourceRefundID,RefundID,PaymentRequestID,BusinessID,SourceKey,
     EventType,SchemaVersion,AmountMinor,CurrencyCode,OccurredAtUtc,Payload,NextAttemptAtUtc)
    VALUES (@event,@original,@refundSource,@refund,@payment,@business,@source,
     N'payment.refunded',1,@amount,@currency,@occurred,@payload,SYSUTCDATETIME())`, [
    { name: "event", type: sql.NVarChar(150), value: event.event_id },
    { name: "original", type: sql.NVarChar(150), value: event.original_source_payment_id },
    { name: "refundSource", type: sql.NVarChar(150), value: event.source_refund_id },
    { name: "refund", type: sql.UniqueIdentifier, value: refundId },
    { name: "payment", type: sql.UniqueIdentifier, value: paymentRequestId },
    { name: "business", type: sql.UniqueIdentifier, value: businessId },
    { name: "source", type: sql.NVarChar(100), value: config.sourceKey },
    { name: "amount", type: sql.BigInt, value: amount },
    { name: "currency", type: sql.NVarChar(3), value: event.currency },
    { name: "occurred", type: sql.DateTime2(3), value: new Date(occurredAt) },
    { name: "payload", type: sql.NVarChar(2000), value: payload },
  ]);
  if (affected !== 1) throw new Error("Refund financial outbox insertion failed");
}
