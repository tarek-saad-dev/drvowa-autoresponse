import { query, sql, type QueryInput } from "@/lib/db";
import { DRVO_AUTORESPONSE_PRODUCT_ID } from "./group-finance-contract";
import {
  decodeCollectionCursor,
  encodeCollectionCursor,
  parseExportLimit,
  validateExportTimestamp,
} from "./group-finance-export-cursor";

type ApprovedPaymentRow = {
  PaymentRequestID: string;
  BusinessID: string;
  RequestedPlanCode: string;
  PaymentReference: string;
  CurrencyCode: string;
  Amount: number;
  ReviewedAtUtc: Date;
};

export type ApprovedCollectionEventV1 = {
  schemaVersion: 1;
  productId: typeof DRVO_AUTORESPONSE_PRODUCT_ID;
  eventType: "PAYMENT_APPROVED";
  sourceEntity: "MANUAL_PAYMENT_REQUEST";
  sourceEntityId: string;
  sourceVersion: 1;
  sourceTenantId: string;
  occurredAtUtc: string;
  currency: "EGP";
  amountMinor: number;
  planCode: string;
  reference: string;
};

export type ApprovedCollectionsPageV1 = {
  schemaVersion: 1;
  productId: typeof DRVO_AUTORESPONSE_PRODUCT_ID;
  currency: "EGP";
  periodBasis: "APPROVAL_UTC";
  events: ApprovedCollectionEventV1[];
  nextCursor: string | null;
  hasMore: boolean;
};

function toMinorUnits(amount: number): number {
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(minor)) {
    throw new RangeError("Invalid payment amount for export");
  }
  return minor;
}

/**
 * Exports replayable, append-only approval facts. Incremental consumers may
 * re-fetch an overlapping window and deduplicate by product + source entity +
 * source ID + version. NEVER sum snapshot figures AND event totals together.
 *
 * This v1 does not support corrections/refunds/settlements; those require
 * separate product-owned signed events before consolidated net revenue.
 */
export async function listApprovedCollectionsForGroupFinance(
  params: { after?: string | null; from?: string | null; limit?: string | null },
): Promise<ApprovedCollectionsPageV1> {
  const limit = parseExportLimit(params.limit ?? null);
  const from = validateExportTimestamp(params.from ?? "1970-01-01T00:00:00.000Z");
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

  const rows = await query<ApprovedPaymentRow>(`
    SELECT TOP (@fetchLimit) p.PaymentRequestID, p.BusinessID,
      p.RequestedPlanCode, p.PaymentReference, p.CurrencyCode,
      p.Amount, p.ReviewedAtUtc
    FROM TblManualPaymentRequest p
    WHERE p.Status = N'APPROVED'
      AND p.CurrencyCode = N'EGP'
      AND p.ReviewedAtUtc >= @start
      AND p.ReviewedAtUtc IS NOT NULL
      ${after ? "AND (p.ReviewedAtUtc > @afterAt OR (p.ReviewedAtUtc = @afterAt AND p.PaymentRequestID > @afterId))" : ""}
    ORDER BY p.ReviewedAtUtc ASC, p.PaymentRequestID ASC
  `, inputs);

  const hasMore = rows.recordset.length > limit;
  const page = rows.recordset.slice(0, limit);
  const last = page.at(-1);
  return {
    schemaVersion: 1,
    productId: DRVO_AUTORESPONSE_PRODUCT_ID,
    currency: "EGP",
    periodBasis: "APPROVAL_UTC",
    events: page.map((row) => ({
      schemaVersion: 1,
      productId: DRVO_AUTORESPONSE_PRODUCT_ID,
      eventType: "PAYMENT_APPROVED",
      sourceEntity: "MANUAL_PAYMENT_REQUEST",
      sourceEntityId: String(row.PaymentRequestID).toLowerCase(),
      sourceVersion: 1,
      sourceTenantId: String(row.BusinessID).toLowerCase(),
      occurredAtUtc: new Date(row.ReviewedAtUtc).toISOString(),
      currency: "EGP",
      amountMinor: toMinorUnits(Number(row.Amount)),
      planCode: row.RequestedPlanCode,
      reference: row.PaymentReference,
    })),
    hasMore,
    nextCursor: hasMore && last ? encodeCollectionCursor({
      reviewedAtUtc: new Date(last.ReviewedAtUtc).toISOString(),
      paymentRequestId: String(last.PaymentRequestID),
    }) : null,
  };
}
