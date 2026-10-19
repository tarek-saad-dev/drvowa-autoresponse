import { query, sql, type QueryInput } from "@/lib/db";
import { DRVO_AUTORESPONSE_PRODUCT_ID } from "./group-finance-contract";
import {
  decodeCollectionCursor, encodeCollectionCursor, parseExportLimit, validateExportTimestamp,
} from "./group-finance-export-cursor";

type RefundRow = {
  RefundID: string; PaymentRequestID: string; BusinessID: string;
  AmountMinor: string | number; CompletedAtUtc: Date; CurrencyCode: string;
};

export type ConfirmedRefundEventV1 = {
  schemaVersion: 1;
  productId: typeof DRVO_AUTORESPONSE_PRODUCT_ID;
  eventType: "REFUND_CONFIRMED";
  sourceEntity: "BILLING_REFUND";
  sourceEntityId: string;
  sourceVersion: 1;
  sourceTenantId: string;
  originalPaymentRequestId: string;
  occurredAtUtc: string;
  currency: "EGP";
  /** Positive minor units; central consumers subtract once from gross collections. */
  amountMinor: number;
};

export type ConfirmedRefundsPageV1 = {
  schemaVersion: 1;
  productId: typeof DRVO_AUTORESPONSE_PRODUCT_ID;
  currency: "EGP";
  periodBasis: "REFUND_COMPLETION_UTC";
  events: ConfirmedRefundEventV1[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** Refunds are immutable successful financial facts, separate from payment approvals. */
export async function listConfirmedRefundsForGroupFinance(params: {
  after?: string | null; from?: string | null; limit?: string | null;
}): Promise<ConfirmedRefundsPageV1> {
  const limit = parseExportLimit(params.limit ?? null);
  const from = validateExportTimestamp(params.from ?? "1970-01-01T00:00:00.000Z");
  // Reuse the strict timestamp + UUID cursor encoding, with RefundID as the key.
  const after = params.after ? decodeCollectionCursor(params.after) : null;
  const inputs: QueryInput[] = [
    { name: "start", type: sql.DateTime2, value: new Date(from) },
    { name: "fetchLimit", type: sql.Int, value: limit + 1 },
  ];
  if (after) {
    inputs.push(
      { name: "afterAt", type: sql.DateTime2, value: new Date(after.reviewedAtUtc) },
      { name: "afterId", type: sql.UniqueIdentifier, value: after.paymentRequestId },
    );
  }
  const rows = await query<RefundRow>(`
    SELECT TOP (@fetchLimit) r.RefundID, r.PaymentRequestID, p.BusinessID,
      CONVERT(varchar(20), r.AmountMinor) AS AmountMinor,
      r.CompletedAtUtc, r.CurrencyCode
    FROM dbo.TblBillingRefund r
    JOIN dbo.TblManualPaymentRequest p ON p.PaymentRequestID = r.PaymentRequestID
    WHERE r.State = N'SUCCEEDED' AND r.CompletedAtUtc IS NOT NULL
      AND r.CurrencyCode = N'EGP' AND p.Status = N'APPROVED'
      AND r.CompletedAtUtc >= @start
      ${after ? "AND (r.CompletedAtUtc > @afterAt OR (r.CompletedAtUtc = @afterAt AND r.RefundID > @afterId))" : ""}
    ORDER BY r.CompletedAtUtc, r.RefundID
  `, inputs);
  const hasMore = rows.recordset.length > limit;
  const page = rows.recordset.slice(0, limit);
  const last = page.at(-1);
  return {
    schemaVersion: 1,
    productId: DRVO_AUTORESPONSE_PRODUCT_ID,
    currency: "EGP",
    periodBasis: "REFUND_COMPLETION_UTC",
    events: page.map(row => {
      const amountMinor = Number(row.AmountMinor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new RangeError("Invalid successful refund amount");
      }
      return {
        schemaVersion: 1 as const,
        productId: DRVO_AUTORESPONSE_PRODUCT_ID,
        eventType: "REFUND_CONFIRMED" as const,
        sourceEntity: "BILLING_REFUND" as const,
        sourceEntityId: String(row.RefundID).toLowerCase(),
        sourceVersion: 1 as const,
        sourceTenantId: String(row.BusinessID).toLowerCase(),
        originalPaymentRequestId: String(row.PaymentRequestID).toLowerCase(),
        occurredAtUtc: new Date(row.CompletedAtUtc).toISOString(),
        currency: "EGP" as const,
        amountMinor,
      };
    }),
    hasMore,
    nextCursor: last ? encodeCollectionCursor({
      reviewedAtUtc: new Date(last.CompletedAtUtc).toISOString(),
      paymentRequestId: String(last.RefundID),
    }) : (params.after ?? null),
  };
}
