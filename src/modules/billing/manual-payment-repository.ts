import { randomUUID } from "node:crypto";

import {
  query,
  sql,
  type QueryInput,
  type TransactionClient,
} from "@/lib/db";
import { normalizeNullableUuid, normalizeUuid } from "@/lib/ids/uuid";
import type {
  ManualPaymentMethod,
  ManualPaymentRequest,
  ManualPaymentStatus,
} from "@/types/domain";

type PaymentRow = {
  PaymentRequestID: string;
  BusinessID: string;
  RequestedPlanID: string;
  RequestedPlanCode: string;
  RequestedPlanDisplayName: string;
  PaymentMethod: string;
  CurrencyCode: string;
  Amount: number;
  PaymentReference: string;
  PayerName: string | null;
  TransferReference: string | null;
  CustomerNote: string | null;
  Status: string;
  CreatedByUserID: string;
  SubmittedByUserID: string | null;
  SubmittedAtUtc: Date | null;
  ReviewedByUserID: string | null;
  ReviewedAtUtc: Date | null;
  ReviewNote: string | null;
  ApprovedSubscriptionID: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function db(trx?: TransactionClient) {
  return { query: trx?.query.bind(trx) ?? query };
}

function mapPayment(row: PaymentRow): ManualPaymentRequest {
  return {
    paymentRequestId: normalizeUuid(row.PaymentRequestID),
    businessId: normalizeUuid(row.BusinessID),
    requestedPlanId: normalizeUuid(row.RequestedPlanID),
    requestedPlanCode: row.RequestedPlanCode,
    requestedPlanDisplayName: row.RequestedPlanDisplayName,
    paymentMethod: row.PaymentMethod as ManualPaymentMethod,
    currencyCode: row.CurrencyCode,
    amount: Number(row.Amount),
    paymentReference: row.PaymentReference,
    payerName: row.PayerName,
    transferReference: row.TransferReference,
    customerNote: row.CustomerNote,
    status: row.Status as ManualPaymentStatus,
    createdByUserId: normalizeUuid(row.CreatedByUserID),
    submittedByUserId: normalizeNullableUuid(row.SubmittedByUserID),
    submittedAtUtc: row.SubmittedAtUtc,
    reviewedByUserId: normalizeNullableUuid(row.ReviewedByUserID),
    reviewedAtUtc: row.ReviewedAtUtc,
    reviewNote: row.ReviewNote,
    approvedSubscriptionId: normalizeNullableUuid(row.ApprovedSubscriptionID),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

const PAYMENT_SELECT = `
  PaymentRequestID, BusinessID, RequestedPlanID, RequestedPlanCode, RequestedPlanDisplayName,
  PaymentMethod, CurrencyCode, Amount, PaymentReference, PayerName, TransferReference,
  CustomerNote, Status, CreatedByUserID, SubmittedByUserID, SubmittedAtUtc,
  ReviewedByUserID, ReviewedAtUtc, ReviewNote, ApprovedSubscriptionID,
  CreatedAtUtc, UpdatedAtUtc`;

export async function getPaymentRequestById(
  paymentRequestId: string,
  trx?: TransactionClient,
): Promise<ManualPaymentRequest | null> {
  const result = await db(trx).query<PaymentRow>(
    `SELECT ${PAYMENT_SELECT} FROM TblManualPaymentRequest
     WHERE PaymentRequestID = @paymentRequestId`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: paymentRequestId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapPayment(row) : null;
}

export async function lockPaymentRequest(
  paymentRequestId: string,
  trx: TransactionClient,
): Promise<ManualPaymentRequest | null> {
  const result = await trx.query<PaymentRow>(
    `SELECT ${PAYMENT_SELECT}
     FROM TblManualPaymentRequest WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
     WHERE PaymentRequestID = @paymentRequestId`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: paymentRequestId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapPayment(row) : null;
}

/** Open intent = AWAITING_TRANSFER or PENDING (blocks a second open request). */
export async function findOpenByBusinessId(
  businessId: string,
  trx?: TransactionClient,
): Promise<ManualPaymentRequest | null> {
  const result = await db(trx).query<PaymentRow>(
    `SELECT TOP 1 ${PAYMENT_SELECT}
     FROM TblManualPaymentRequest
     WHERE BusinessID = @businessId
       AND Status IN (N'AWAITING_TRANSFER', N'PENDING')
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapPayment(row) : null;
}

export async function findPendingByBusinessId(
  businessId: string,
  trx?: TransactionClient,
): Promise<ManualPaymentRequest | null> {
  const result = await db(trx).query<PaymentRow>(
    `SELECT TOP 1 ${PAYMENT_SELECT}
     FROM TblManualPaymentRequest
     WHERE BusinessID = @businessId AND Status = N'PENDING'
     ORDER BY SubmittedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapPayment(row) : null;
}

export async function getLatestByBusinessId(
  businessId: string,
): Promise<ManualPaymentRequest | null> {
  const result = await query<PaymentRow>(
    `SELECT TOP 1 ${PAYMENT_SELECT}
     FROM TblManualPaymentRequest
     WHERE BusinessID = @businessId
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapPayment(row) : null;
}

export async function insertAwaitingTransfer(
  params: {
    businessId: string;
    requestedPlanId: string;
    requestedPlanCode: string;
    requestedPlanDisplayName: string;
    paymentMethod: ManualPaymentMethod;
    currencyCode: string;
    amount: number;
    paymentReference: string;
    createdByUserId: string;
  },
  trx?: TransactionClient,
): Promise<ManualPaymentRequest> {
  const paymentRequestId = randomUUID();
  const now = new Date();

  await db(trx).query(
    `INSERT INTO TblManualPaymentRequest (
      PaymentRequestID, BusinessID, RequestedPlanID, RequestedPlanCode, RequestedPlanDisplayName,
      PaymentMethod, CurrencyCode, Amount, PaymentReference, Status,
      CreatedByUserID, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @paymentRequestId, @businessId, @requestedPlanId, @requestedPlanCode, @requestedPlanDisplayName,
      @paymentMethod, @currencyCode, @amount, @paymentReference, N'AWAITING_TRANSFER',
      @createdByUserId, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: paymentRequestId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "requestedPlanId",
        type: sql.UniqueIdentifier,
        value: params.requestedPlanId,
      },
      {
        name: "requestedPlanCode",
        type: sql.NVarChar(64),
        value: params.requestedPlanCode,
      },
      {
        name: "requestedPlanDisplayName",
        type: sql.NVarChar(120),
        value: params.requestedPlanDisplayName,
      },
      {
        name: "paymentMethod",
        type: sql.NVarChar(32),
        value: params.paymentMethod,
      },
      {
        name: "currencyCode",
        type: sql.NVarChar(3),
        value: params.currencyCode,
      },
      { name: "amount", type: sql.Decimal(12, 2), value: params.amount },
      {
        name: "paymentReference",
        type: sql.NVarChar(64),
        value: params.paymentReference,
      },
      {
        name: "createdByUserId",
        type: sql.UniqueIdentifier,
        value: params.createdByUserId,
      },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    paymentRequestId,
    businessId: params.businessId,
    requestedPlanId: params.requestedPlanId,
    requestedPlanCode: params.requestedPlanCode,
    requestedPlanDisplayName: params.requestedPlanDisplayName,
    paymentMethod: params.paymentMethod,
    currencyCode: params.currencyCode,
    amount: params.amount,
    paymentReference: params.paymentReference,
    payerName: null,
    transferReference: null,
    customerNote: null,
    status: "AWAITING_TRANSFER",
    createdByUserId: params.createdByUserId,
    submittedByUserId: null,
    submittedAtUtc: null,
    reviewedByUserId: null,
    reviewedAtUtc: null,
    reviewNote: null,
    approvedSubscriptionId: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function markPaymentCanceled(
  paymentRequestId: string,
  trx: TransactionClient,
): Promise<void> {
  await trx.query(
    `UPDATE TblManualPaymentRequest
     SET Status = N'CANCELED', UpdatedAtUtc = SYSUTCDATETIME()
     WHERE PaymentRequestID = @paymentRequestId
       AND Status = N'AWAITING_TRANSFER'`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: paymentRequestId,
      },
    ],
  );
}

export async function markPaymentPending(
  params: {
    paymentRequestId: string;
    submittedByUserId: string;
    payerName: string;
    transferReference: string | null;
    customerNote: string | null;
  },
  trx: TransactionClient,
): Promise<void> {
  const now = new Date();
  await trx.query(
    `UPDATE TblManualPaymentRequest
     SET Status = N'PENDING',
         PayerName = @payerName,
         TransferReference = @transferReference,
         CustomerNote = @customerNote,
         SubmittedByUserID = @submittedByUserId,
         SubmittedAtUtc = @submittedAtUtc,
         UpdatedAtUtc = @updatedAtUtc
     WHERE PaymentRequestID = @paymentRequestId
       AND Status = N'AWAITING_TRANSFER'`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: params.paymentRequestId,
      },
      {
        name: "payerName",
        type: sql.NVarChar(160),
        value: params.payerName,
      },
      {
        name: "transferReference",
        type: sql.NVarChar(160),
        value: params.transferReference,
      },
      {
        name: "customerNote",
        type: sql.NVarChar(1000),
        value: params.customerNote,
      },
      {
        name: "submittedByUserId",
        type: sql.UniqueIdentifier,
        value: params.submittedByUserId,
      },
      { name: "submittedAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
}

export async function markPaymentApproved(
  params: {
    paymentRequestId: string;
    reviewedByUserId: string;
    approvedSubscriptionId: string;
    reviewNote?: string | null;
  },
  trx: TransactionClient,
): Promise<void> {
  const now = new Date();
  await trx.query(
    `UPDATE TblManualPaymentRequest
     SET Status = N'APPROVED',
         ReviewedByUserID = @reviewedByUserId,
         ReviewedAtUtc = @reviewedAtUtc,
         ReviewNote = @reviewNote,
         ApprovedSubscriptionID = @approvedSubscriptionId,
         UpdatedAtUtc = @updatedAtUtc
     WHERE PaymentRequestID = @paymentRequestId
       AND Status = N'PENDING'`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: params.paymentRequestId,
      },
      {
        name: "reviewedByUserId",
        type: sql.UniqueIdentifier,
        value: params.reviewedByUserId,
      },
      { name: "reviewedAtUtc", type: sql.DateTime2, value: now },
      {
        name: "reviewNote",
        type: sql.NVarChar(1000),
        value: params.reviewNote ?? null,
      },
      {
        name: "approvedSubscriptionId",
        type: sql.UniqueIdentifier,
        value: params.approvedSubscriptionId,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
}

export async function markPaymentRejected(
  params: {
    paymentRequestId: string;
    reviewedByUserId: string;
    reviewNote?: string | null;
  },
  trx: TransactionClient,
): Promise<void> {
  const now = new Date();
  await trx.query(
    `UPDATE TblManualPaymentRequest
     SET Status = N'REJECTED',
         ReviewedByUserID = @reviewedByUserId,
         ReviewedAtUtc = @reviewedAtUtc,
         ReviewNote = @reviewNote,
         UpdatedAtUtc = @updatedAtUtc
     WHERE PaymentRequestID = @paymentRequestId
       AND Status = N'PENDING'`,
    [
      {
        name: "paymentRequestId",
        type: sql.UniqueIdentifier,
        value: params.paymentRequestId,
      },
      {
        name: "reviewedByUserId",
        type: sql.UniqueIdentifier,
        value: params.reviewedByUserId,
      },
      { name: "reviewedAtUtc", type: sql.DateTime2, value: now },
      {
        name: "reviewNote",
        type: sql.NVarChar(1000),
        value: params.reviewNote ?? null,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
}

export type AdminPaymentListItem = ManualPaymentRequest & {
  businessName: string;
  submitterEmail: string;
  submitterName: string;
  currentPlanCode: string | null;
  currentPlanName: string | null;
  /** Live monthly price of the *requested* plan (may differ from snapshot). */
  liveRequestedPlanPrice: number | null;
};

export async function listPaymentsForAdmin(params: {
  status?: ManualPaymentStatus | "ALL";
  limit?: number;
}): Promise<AdminPaymentListItem[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const inputs: QueryInput[] = [
    { name: "limit", type: sql.Int, value: limit },
  ];
  let statusClause = "AND p.Status = N'PENDING'";
  if (params.status === "ALL") {
    // Review queue diagnostics may include terminal states, but never AWAITING_TRANSFER.
    statusClause =
      "AND p.Status IN (N'PENDING', N'APPROVED', N'REJECTED', N'CANCELED')";
  } else if (params.status) {
    statusClause = "AND p.Status = @status";
    inputs.push({
      name: "status",
      type: sql.NVarChar(32),
      value: params.status,
    });
  }

  const result = await query<
    PaymentRow & {
      BusinessName: string;
      SubmitterEmail: string;
      SubmitterName: string;
      CurrentPlanCode: string | null;
      CurrentPlanName: string | null;
      LiveRequestedPlanPrice: number | null;
    }
  >(
    `SELECT TOP (@limit)
        p.PaymentRequestID, p.BusinessID, p.RequestedPlanID, p.RequestedPlanCode, p.RequestedPlanDisplayName,
        p.PaymentMethod, p.CurrencyCode, p.Amount, p.PaymentReference, p.PayerName, p.TransferReference,
        p.CustomerNote, p.Status, p.CreatedByUserID, p.SubmittedByUserID, p.SubmittedAtUtc,
        p.ReviewedByUserID, p.ReviewedAtUtc, p.ReviewNote, p.ApprovedSubscriptionID,
        p.CreatedAtUtc, p.UpdatedAtUtc,
        b.Name AS BusinessName,
        COALESCE(u.Email, cu.Email) AS SubmitterEmail,
        COALESCE(u.FullName, cu.FullName) AS SubmitterName,
        curPl.Code AS CurrentPlanCode,
        curPl.DisplayName AS CurrentPlanName,
        reqPl.MonthlyPriceAmount AS LiveRequestedPlanPrice
     FROM TblManualPaymentRequest p
     INNER JOIN TblBusiness b ON b.BusinessID = p.BusinessID
     INNER JOIN TblUser cu ON cu.UserID = p.CreatedByUserID
     LEFT JOIN TblUser u ON u.UserID = p.SubmittedByUserID
     INNER JOIN TblPlan reqPl ON reqPl.PlanID = p.RequestedPlanID
     OUTER APPLY (
       SELECT TOP 1 s.PlanID
       FROM TblSubscription s
       WHERE s.BusinessID = p.BusinessID
         AND s.Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
       ORDER BY s.CreatedAtUtc DESC
     ) curSub
     LEFT JOIN TblPlan curPl ON curPl.PlanID = curSub.PlanID
     WHERE 1=1 ${statusClause}
     ORDER BY
       CASE p.Status WHEN N'PENDING' THEN 0 ELSE 1 END,
       COALESCE(p.SubmittedAtUtc, p.CreatedAtUtc) DESC`,
    inputs,
  );

  return result.recordset.map((row) => ({
    ...mapPayment(row),
    businessName: row.BusinessName,
    submitterEmail: row.SubmitterEmail,
    submitterName: row.SubmitterName,
    currentPlanCode: row.CurrentPlanCode,
    currentPlanName: row.CurrentPlanName,
    liveRequestedPlanPrice:
      row.LiveRequestedPlanPrice == null
        ? null
        : Number(row.LiveRequestedPlanPrice),
  }));
}

export async function getAdminOverviewCounts(): Promise<{
  pendingPayments: number;
  activePaidSubscriptions: number;
  approvedThisMonth: number;
  approvedAmountThisMonth: number;
}> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const pending = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblManualPaymentRequest WHERE Status = N'PENDING'`,
  );
  const activePaid = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt
     FROM TblSubscription s
     INNER JOIN TblPlan p ON p.PlanID = s.PlanID
     WHERE s.Status IN (N'ACTIVE', N'TRIALING')
       AND p.Code <> N'FREE'
       AND (s.PeriodEndUtc IS NULL OR s.PeriodEndUtc > SYSUTCDATETIME())`,
  );
  const approved = await query<{ Cnt: number; TotalAmount: number | null }>(
    `SELECT COUNT(1) AS Cnt, SUM(Amount) AS TotalAmount
     FROM TblManualPaymentRequest
     WHERE Status = N'APPROVED'
       AND ReviewedAtUtc >= @monthStart`,
    [{ name: "monthStart", type: sql.DateTime2, value: monthStart }],
  );

  return {
    pendingPayments: Number(pending.recordset[0]?.Cnt ?? 0),
    activePaidSubscriptions: Number(activePaid.recordset[0]?.Cnt ?? 0),
    approvedThisMonth: Number(approved.recordset[0]?.Cnt ?? 0),
    approvedAmountThisMonth: Number(approved.recordset[0]?.TotalAmount ?? 0),
  };
}
