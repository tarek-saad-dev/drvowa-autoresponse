import { sql, type TransactionClient } from "@/lib/db";
import type { PaymentConfirmedV1 } from "./saas-financial-contract";

type ApprovalSnapshotRow = {
  PaymentRequestID: string;
  BusinessID: string;
  PaymentMethod: string;
  CurrencyCode: string;
  AmountText: string;
  ReviewedAtText: string;
};

/** Read money and DATETIME2(7) as SQL text before the driver can coerce either value. */
export async function getApprovedPaymentSnapshot(
  paymentRequestId: string,
  trx: TransactionClient,
): Promise<ApprovalSnapshotRow> {
  const result = await trx.query<ApprovalSnapshotRow>(
    `SELECT PaymentRequestID, BusinessID, PaymentMethod, CurrencyCode,
            CONVERT(varchar(32), Amount) AS AmountText,
            CONVERT(varchar(27), ReviewedAtUtc, 126) AS ReviewedAtText
     FROM dbo.TblManualPaymentRequest
     WHERE PaymentRequestID = @paymentRequestId AND Status = N'APPROVED'
       AND ReviewedAtUtc IS NOT NULL`,
    [{ name: "paymentRequestId", type: sql.UniqueIdentifier, value: paymentRequestId }],
  );
  const row = result.recordset[0];
  if (!row) throw new Error("Approved payment snapshot missing during financial capture");
  return row;
}

/** The caller's approval transaction owns this insert; unique errors must propagate. */
export async function insertPaymentConfirmed(
  params: {
    paymentRequestId: string;
    businessId: string;
    sourceKey: string;
    event: PaymentConfirmedV1;
    payload: string;
    occurredAtUtc: Date;
  },
  trx: TransactionClient,
): Promise<void> {
  const { event } = params;
  const affected = await trx.execute(
    `INSERT INTO dbo.TblSaasFinancialOutbox (
       EventID, SourcePaymentID, PaymentRequestID, BusinessID, SourceKey,
       EventType, SchemaVersion, AmountMinor, CurrencyCode, OccurredAtUtc,
       Payload, NextAttemptAtUtc
     ) VALUES (
       @eventId, @sourcePaymentId, @paymentRequestId, @businessId, @sourceKey,
       @eventType, @schemaVersion, @amountMinor, @currencyCode, @occurredAtUtc,
       @payload, @occurredAtUtc
     )`,
    [
      { name: "eventId", type: sql.NVarChar(150), value: event.event_id },
      { name: "sourcePaymentId", type: sql.NVarChar(150), value: event.source_payment_id },
      { name: "paymentRequestId", type: sql.UniqueIdentifier, value: params.paymentRequestId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "sourceKey", type: sql.NVarChar(100), value: params.sourceKey },
      { name: "eventType", type: sql.NVarChar(64), value: event.type },
      { name: "schemaVersion", type: sql.Int, value: event.schema_version },
      { name: "amountMinor", type: sql.BigInt, value: event.amount_minor },
      { name: "currencyCode", type: sql.NVarChar(3), value: event.currency },
      { name: "occurredAtUtc", type: sql.DateTime2(3), value: params.occurredAtUtc },
      { name: "payload", type: sql.NVarChar(2000), value: params.payload },
    ],
  );
  if (affected !== 1) throw new Error("Financial outbox insertion did not affect one row");
}
