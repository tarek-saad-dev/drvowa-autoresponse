import { randomUUID } from "node:crypto";

import { query, sql, withTransaction } from "@/lib/db";
import { writeAuditEvent } from "@/modules/audit/service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { getCurrentSubscription, getPlanById } from "./entitlements";

export type CustomerRefundPayment = {
  PaymentRequestID: string;
  PaymentReference: string;
  PlanDisplayName: string;
  Amount: number;
  CurrencyCode: string;
  ReviewedAtUtc: Date | null;
  InvoiceNumber: string;
  RefundState: string | null;
  RefundAmountMinor: number | null;
  CustomerRequestID: string | null;
  CustomerRequestStatus: string | null;
  CustomerReviewNote: string | null;
  CustomerRequestedAtUtc: Date | null;
};

export function customerRefundStatus(
  refundState: string | null,
  requestStatus: string | null,
): "NONE" | "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REJECTED" {
  if (refundState === "SUCCEEDED") return "SUCCEEDED";
  if (refundState === "PENDING") return "PROCESSING";
  if (refundState === "FAILED") return "FAILED";
  if (requestStatus === "REJECTED") return "REJECTED";
  if (requestStatus === "REQUESTED") return "REQUESTED";
  return "NONE";
}

/** Only settled, approved, real-money invoices qualify. Tenant scoped. */
export async function listCustomerRefundPayments(businessId: string): Promise<CustomerRefundPayment[]> {
  const result = await query<CustomerRefundPayment>([
    "SELECT TOP (30) p.PaymentRequestID, p.PaymentReference,",
    "p.RequestedPlanDisplayName AS PlanDisplayName, p.Amount, p.CurrencyCode,",
    "p.ReviewedAtUtc, CONVERT(VARCHAR(24),i.InvoiceNumber) AS InvoiceNumber,",
    "f.State AS RefundState, f.AmountMinor AS RefundAmountMinor,",
    "r.RequestID AS CustomerRequestID, r.Status AS CustomerRequestStatus,",
    "r.ReviewNote AS CustomerReviewNote, r.RequestedAtUtc AS CustomerRequestedAtUtc",
    "FROM dbo.TblManualPaymentRequest p",
    "INNER JOIN dbo.TblBillingInvoice i ON i.PaymentRequestID=p.PaymentRequestID",
    "LEFT JOIN dbo.TblBillingRefund f ON f.PaymentRequestID=p.PaymentRequestID",
    "LEFT JOIN dbo.TblBillingCustomerRefundRequest r ON r.PaymentRequestID=p.PaymentRequestID",
    "WHERE p.BusinessID=@business AND i.BusinessID=@business",
    "AND p.Status=N'APPROVED' AND i.Status=N'PAID' AND i.TotalMinor>0",
    "ORDER BY p.ReviewedAtUtc DESC, p.PaymentRequestID DESC",
  ].join(" "), [{ name: "business", type: sql.UniqueIdentifier, value: businessId }]);
  return result.recordset;
}

export async function requestCustomerRefund(input: {
  businessId: string;
  actorUserId: string;
  paymentRequestId: string;
  reason: string;
}): Promise<{ requestId: string; status: "REQUESTED" }> {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1000) {
    throw new ValidationError("اكتب سبب الاسترداد بوضوح (من ٨ إلى ١٠٠٠ حرف).");
  }
  return withTransaction(async trx => {
    await trx.query(
      "SELECT BusinessID FROM dbo.TblBusiness WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@business",
      [{ name: "business", type: sql.UniqueIdentifier, value: input.businessId }],
    );
    const p = (await trx.query<{
      InvoiceID: string;
      PaymentRequestID: string;
      RefundState: string | null;
      RequestID: string | null;
      RequestStatus: string | null;
    }>([
      "SELECT p.PaymentRequestID,i.InvoiceID,f.State AS RefundState,",
      "r.RequestID,r.Status AS RequestStatus",
      "FROM dbo.TblManualPaymentRequest p WITH (UPDLOCK,HOLDLOCK)",
      "JOIN dbo.TblBillingInvoice i ON i.PaymentRequestID=p.PaymentRequestID",
      "LEFT JOIN dbo.TblBillingRefund f ON f.PaymentRequestID=p.PaymentRequestID",
      "LEFT JOIN dbo.TblBillingCustomerRefundRequest r ON r.PaymentRequestID=p.PaymentRequestID",
      "WHERE p.PaymentRequestID=@payment AND p.BusinessID=@business AND i.BusinessID=@business",
      "AND p.Status=N'APPROVED' AND p.Amount>0 AND i.Status=N'PAID' AND i.TotalMinor>0",
    ].join(" "), [
      { name: "payment", type: sql.UniqueIdentifier, value: input.paymentRequestId },
      { name: "business", type: sql.UniqueIdentifier, value: input.businessId },
    ])).recordset[0];
    if (!p) throw new ConflictError("الدفعة غير مؤهلة لطلب استرداد. راجع حالة الفاتورة أولًا.");
    if (p.RefundState) throw new ConflictError("لهذه الدفعة استرداد مسجل بالفعل. راجع حالة الطلب.");
    if (p.RequestID) {
      if (p.RequestStatus === "REQUESTED") {
        return { requestId: p.RequestID, status: "REQUESTED" as const };
      }
      throw new ConflictError("تمت مراجعة طلب الاسترداد السابق لهذه الدفعة. تواصل مع الإدارة إن احتجت متابعة.");
    }
    const requestId = randomUUID();
    await trx.query(
      "INSERT dbo.TblBillingCustomerRefundRequest (RequestID,BusinessID,PaymentRequestID,Reason,RequestedByUserID) VALUES (@id,@business,@payment,@reason,@actor)",
      [
        { name: "id", type: sql.UniqueIdentifier, value: requestId },
        { name: "business", type: sql.UniqueIdentifier, value: input.businessId },
        { name: "payment", type: sql.UniqueIdentifier, value: input.paymentRequestId },
        { name: "reason", type: sql.NVarChar(1000), value: reason },
        { name: "actor", type: sql.UniqueIdentifier, value: input.actorUserId },
      ],
    );
    await writeAuditEvent({
      businessId: input.businessId, actorUserId: input.actorUserId,
      action: "BILLING_CUSTOMER_REFUND_REQUESTED", entityType: "ManualPaymentRequest",
      entityId: input.paymentRequestId, metadata: { customerRefundRequestId: requestId },
    }, trx);
    return { requestId, status: "REQUESTED" as const };
  });
}

export async function rejectCustomerRefund(input: {
  requestId: string;
  adminUserId: string;
  note: string;
}) {
  const note = input.note.trim();
  if (note.length < 5 || note.length > 1000) throw new ValidationError("اكتب سبب الرفض (٥ أحرف على الأقل).");
  return withTransaction(async trx => {
    const owner = (await trx.query<{ BusinessID: string }>(
      "SELECT BusinessID FROM dbo.TblBillingCustomerRefundRequest WHERE RequestID=@id",
      [{ name: "id", type: sql.UniqueIdentifier, value: input.requestId }],
    )).recordset[0];
    if (!owner) throw new NotFoundError("طلب الاسترداد غير موجود");
    await trx.query("SELECT BusinessID FROM dbo.TblBusiness WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@business",
      [{ name: "business", type: sql.UniqueIdentifier, value: owner.BusinessID }]);
    const row = (await trx.query<{ PaymentRequestID: string; Status: string; RefundState: string | null }>(
      [
        "SELECT r.PaymentRequestID,r.Status,f.State AS RefundState",
        "FROM dbo.TblBillingCustomerRefundRequest r WITH (UPDLOCK,HOLDLOCK)",
        "LEFT JOIN dbo.TblBillingRefund f ON f.PaymentRequestID=r.PaymentRequestID",
        "WHERE r.RequestID=@id AND r.BusinessID=@business",
      ].join(" "), [
        { name: "id", type: sql.UniqueIdentifier, value: input.requestId },
        { name: "business", type: sql.UniqueIdentifier, value: owner.BusinessID },
      ],
    )).recordset[0];
    if (!row || row.Status !== "REQUESTED" || row.RefundState) {
      throw new ConflictError("لا يمكن رفض طلب دخل بالفعل مرحلة معالجة الاسترداد.");
    }
    await trx.query(
      "UPDATE dbo.TblBillingCustomerRefundRequest SET Status=N'REJECTED',ReviewedByUserID=@actor,ReviewedAtUtc=SYSUTCDATETIME(),ReviewNote=@note WHERE RequestID=@id",
      [
        { name: "actor", type: sql.UniqueIdentifier, value: input.adminUserId },
        { name: "note", type: sql.NVarChar(1000), value: note },
        { name: "id", type: sql.UniqueIdentifier, value: input.requestId },
      ],
    );
    await writeAuditEvent({
      businessId: owner.BusinessID, actorUserId: input.adminUserId,
      action: "BILLING_CUSTOMER_REFUND_REJECTED", entityType: "ManualPaymentRequest",
      entityId: row.PaymentRequestID, metadata: { customerRefundRequestId: input.requestId },
    }, trx);
    return { status: "REJECTED" as const };
  });
}

/**
 * Schedules cancellation only after the current paid period.
 * It never sends money, creates a refund or cuts service immediately.
 */
export async function setCustomerCancellation(input: {
  businessId: string;
  actorUserId: string;
  action: "schedule_cancel" | "undo_cancel";
}) {
  return withTransaction(async trx => {
    await trx.query("SELECT BusinessID FROM dbo.TblBusiness WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@business",
      [{ name: "business", type: sql.UniqueIdentifier, value: input.businessId }]);
    const subscription = await getCurrentSubscription(input.businessId, trx);
    if (!subscription) throw new ConflictError("لا يوجد اشتراك نشط لإدارته.");
    const plan = await getPlanById(subscription.planId, trx);
    const scheduled = (await trx.query<{
      ChangeID: string; Kind: string; PaymentRequestID: string | null;
    }>([
      "SELECT ChangeID,Kind,PaymentRequestID FROM dbo.TblBillingScheduledChange WITH (UPDLOCK,HOLDLOCK)",
      "WHERE BusinessID=@business AND State=N'PENDING'",
    ].join(" "), [
      { name: "business", type: sql.UniqueIdentifier, value: input.businessId },
    ])).recordset[0];

    if (input.action === "schedule_cancel") {
      if (!plan || plan.code === "FREE" || subscription.status !== "ACTIVE"
        || !subscription.periodEndUtc || subscription.periodEndUtc <= new Date()) {
        throw new ConflictError("الإلغاء بنهاية المدة متاح للاشتراك المدفوع الساري فقط.");
      }
      if (scheduled?.Kind === "CANCEL" && !scheduled.PaymentRequestID) {
        return { status: "CANCEL_SCHEDULED" as const };
      }
      if (scheduled) throw new ConflictError("يوجد تغيير آخر مجدول. راجعه قبل طلب الإلغاء.");
      await trx.query(
        [
          "INSERT dbo.TblBillingScheduledChange",
          "(ChangeID,BusinessID,SubscriptionID,Kind,State,EffectiveAtUtc,Reason)",
          "VALUES (@id,@business,@subscription,N'CANCEL',N'PENDING',@effective,@reason)",
        ].join(" "), [
          { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
          { name: "business", type: sql.UniqueIdentifier, value: input.businessId },
          { name: "subscription", type: sql.UniqueIdentifier, value: subscription.subscriptionId },
          { name: "effective", type: sql.DateTime2, value: subscription.periodEndUtc },
          { name: "reason", type: sql.NVarChar(1000), value: "Customer cancellation at end of paid period" },
        ],
      );
    } else {
      if (!scheduled || scheduled.Kind !== "CANCEL" || scheduled.PaymentRequestID) {
        throw new ConflictError("لا يوجد إلغاء مجدول يمكنك التراجع عنه.");
      }
      await trx.query("UPDATE dbo.TblBillingScheduledChange SET State=N'CANCELED' WHERE ChangeID=@id AND State=N'PENDING'",
        [{ name: "id", type: sql.UniqueIdentifier, value: scheduled.ChangeID }]);
    }
    await writeAuditEvent({
      businessId: input.businessId, actorUserId: input.actorUserId,
      action: input.action === "schedule_cancel" ? "BILLING_CUSTOMER_CANCEL_SCHEDULED" : "BILLING_CUSTOMER_CANCEL_UNDONE",
      entityType: "Subscription", entityId: subscription.subscriptionId,
    }, trx);
    return {
      status: input.action === "schedule_cancel" ? "CANCEL_SCHEDULED" as const : "CANCEL_UNDONE" as const,
    };
  });
}
