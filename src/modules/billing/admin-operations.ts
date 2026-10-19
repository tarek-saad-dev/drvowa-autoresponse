import { randomUUID } from "node:crypto";
import { sql, withTransaction, type TransactionClient } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { writeAuditEvent } from "@/modules/audit/service";
import { invoiceTotals, validateRefundAmount } from "./ledger-policy";
import * as payments from "./manual-payment-repository";
import * as repo from "./repository";
import { ensurePaymentInvoice } from "./documents";
import { getCurrentSubscription } from "./entitlements";
import { assertNoScheduledChange } from "./scheduled-changes";
import { configuredFinanceExportToken } from "./group-finance-export-auth";

export type BillingAdminAction = "discount" | "cancel_now" | "cancel_at_end" | "cancel_scheduled" | "request_refund" | "confirm_refund" | "fail_refund";

async function cancelToFree(businessId: string, trx: TransactionClient) {
  const paidChange = await trx.query(`SELECT ChangeID FROM TblBillingScheduledChange
    WHERE BusinessID = @business AND State = N'PENDING' AND PaymentRequestID IS NOT NULL`, [
    { name: "business", type: sql.UniqueIdentifier, value: businessId },
  ]);
  if (paidChange.recordset.length) throw new ConflictError("يوجد تخفيض مدفوع مجدول؛ سوِّ أو استرد دفعه أولاً");
  const current = await getCurrentSubscription(businessId, trx);
  const free = await repo.getPlanByCode("FREE", trx);
  if (!free || free.status !== "ACTIVE") throw new ConflictError("الخطة المجانية غير مهيأة");
  if (current) await repo.updateSubscriptionBillingFields({ subscriptionId: current.subscriptionId, status: "CANCELED" }, trx);
  await trx.query(`UPDATE TblBillingScheduledChange SET State = N'CANCELED' WHERE BusinessID = @business AND State = N'PENDING'`, [
    { name: "business", type: sql.UniqueIdentifier, value: businessId },
  ]);
  return repo.insertSubscription({ businessId, planId: free.planId, periodEndUtc: null }, trx);
}

export async function performBillingAdminAction(params: {
  paymentRequestId: string; actorUserId: string; action: BillingAdminAction;
  reason: string; discountPercent?: number; transferReference?: string;
}) {
  const reason = params.reason.trim();
  if (!reason || reason.length > 1000) throw new ValidationError("سبب الإجراء مطلوب ولا يتجاوز 1000 حرف");
  return withTransaction(async trx => {
    // Resolve the tenant without taking a payment write lock. All billing mutations
    // must acquire the business lock before the payment lock to prevent deadlocks
    // with approval and subscription-maintenance transactions.
    const tenant = (await trx.query<{ BusinessID: string }>(
      `SELECT BusinessID FROM TblManualPaymentRequest WHERE PaymentRequestID = @payment`,
      [{ name: "payment", type: sql.UniqueIdentifier, value: params.paymentRequestId }],
    )).recordset[0];
    if (!tenant) throw new NotFoundError("طلب الدفع غير موجود");
    await trx.query(`SELECT BusinessID FROM TblBusiness WITH (UPDLOCK, HOLDLOCK) WHERE BusinessID = @business`, [
      { name: "business", type: sql.UniqueIdentifier, value: tenant.BusinessID },
    ]);
    const payment = await payments.lockPaymentRequest(params.paymentRequestId, trx);
    if (!payment || payment.businessId.toLowerCase() !== tenant.BusinessID.toLowerCase()) {
      throw new ConflictError("طلب الدفع تغيّر أثناء تنفيذ الإجراء؛ أعد المحاولة");
    }
    const key = [{ name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId }];
    if (params.action === "discount") {
      if (payment.status !== "AWAITING_TRANSFER") throw new ConflictError("الخصم متاح قبل تأكيد التحويل فقط");
      await ensurePaymentInvoice(payment, trx);
      const invoice = (await trx.query<{ SubtotalMinor: number; Status: string }>(`SELECT SubtotalMinor, Status FROM TblBillingInvoice WITH (UPDLOCK, HOLDLOCK) WHERE PaymentRequestID = @payment`, key)).recordset[0];
      if (!invoice || invoice.Status !== "OPEN") throw new ConflictError("الفاتورة غير قابلة للتعديل");
      const totals = invoiceTotals(Number(invoice.SubtotalMinor), params.discountPercent ?? NaN, reason);
      await trx.query(`UPDATE TblBillingInvoice SET DiscountMinor = @discount, DiscountReason = @reason, TotalMinor = @total WHERE PaymentRequestID = @payment;
        UPDATE TblManualPaymentRequest SET Amount = @amount, UpdatedAtUtc = SYSUTCDATETIME() WHERE PaymentRequestID = @payment;`, [
        ...key, { name: "discount", type: sql.BigInt, value: totals.discountMinor },
        { name: "total", type: sql.BigInt, value: totals.totalMinor },
        { name: "amount", type: sql.Decimal(12,2), value: (totals.totalMinor / 100).toFixed(2) },
        { name: "reason", type: sql.NVarChar(1000), value: reason },
      ]);
      if (totals.totalMinor === 0) await payments.markPaymentPending({
        paymentRequestId: payment.paymentRequestId, submittedByUserId: params.actorUserId,
        payerName: "إعفاء كامل معتمد للمراجعة", transferReference: null, customerNote: reason,
      }, trx);
    } else if (params.action === "request_refund" || params.action === "confirm_refund" || params.action === "fail_refund") {
      if (payment.status !== "APPROVED") throw new ConflictError("الاسترداد متاح للمدفوعات المعتمدة فقط");
      // The currently deployed Hub contract supports payment.confirmed only.
      // Fail closed until a reviewed refund delivery adapter exists.
      if (process.env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED === "1"
        || (configuredFinanceExportToken() && process.env.DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY !== "1")) {
        throw new ConflictError("يلزم تفعيل دعم الاسترداد في ربط المركز المالي قبل تنفيذ الاسترداد");
      }
      const invoice = (await trx.query<{ InvoiceID: string; TotalMinor: number }>(`SELECT InvoiceID, TotalMinor FROM TblBillingInvoice WHERE PaymentRequestID = @payment AND Status = N'PAID'`, key)).recordset[0];
      if (!invoice) throw new ConflictError("لا توجد فاتورة مدفوعة مرتبطة؛ المدفوعات القديمة تحتاج تسوية موثقة");
      const existing = (await trx.query<{ RefundID: string; State: string; AmountMinor: number }>(`SELECT RefundID, State, AmountMinor FROM TblBillingRefund WITH (UPDLOCK, HOLDLOCK) WHERE PaymentRequestID = @payment`, key)).recordset[0];
      if (params.action === "request_refund") {
        if (!existing) {
          const amount = validateRefundAmount(Number(invoice.TotalMinor), 0, Number(invoice.TotalMinor));
          await trx.query(`INSERT INTO TblBillingRefund (RefundID, PaymentRequestID, InvoiceID, AmountMinor, CurrencyCode, Reason, State, RequestedByUserID)
            VALUES (@id, @payment, @invoice, @amount, @currency, @reason, N'PENDING', @actor)`, [
            ...key, { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
            { name: "invoice", type: sql.UniqueIdentifier, value: invoice.InvoiceID },
            { name: "amount", type: sql.BigInt, value: amount },
            { name: "currency", type: sql.NVarChar(3), value: payment.currencyCode },
            { name: "reason", type: sql.NVarChar(1000), value: reason },
            { name: "actor", type: sql.UniqueIdentifier, value: params.actorUserId },
          ]);
        } else if (existing.State === "FAILED") {
          await trx.query(`UPDATE TblBillingRefund SET State = N'PENDING', Reason = @reason,
            CompletedAtUtc = NULL, ConfirmedByUserID = NULL, TransferReference = NULL
            WHERE PaymentRequestID = @payment`, [...key, { name: "reason", type: sql.NVarChar(1000), value: reason }]);
        }
      } else {
        if (!existing) throw new ConflictError("اطلب الاسترداد أولاً");
        if (existing.State === "SUCCEEDED") return { status: "already_completed" };
        if (existing.State !== "PENDING") throw new ConflictError("الاسترداد ليس قيد التنفيذ");
        const confirmed = params.action === "confirm_refund";
        if (confirmed && (!params.transferReference?.trim() || params.transferReference.length > 160)) throw new ValidationError("مرجع التحويل الفعلي مطلوب");
        await trx.query(`UPDATE TblBillingRefund SET State = @state, TransferReference = @reference,
          ConfirmedByUserID = @actor, CompletedAtUtc = SYSUTCDATETIME() WHERE PaymentRequestID = @payment`, [
          ...key, { name: "state", type: sql.NVarChar(16), value: confirmed ? "SUCCEEDED" : "FAILED" },
          { name: "reference", type: sql.NVarChar(160), value: params.transferReference?.trim() ?? null },
          { name: "actor", type: sql.UniqueIdentifier, value: params.actorUserId },
        ]);
        if (confirmed) {
          const scheduled = (await trx.query(`UPDATE TblBillingScheduledChange SET State = N'CANCELED'
            OUTPUT inserted.ChangeID WHERE PaymentRequestID = @payment AND State = N'PENDING'`, key)).recordset;
          const current = await getCurrentSubscription(payment.businessId, trx);
          // Refunding an old period must never cancel a newer, separately paid subscription.
          if (!scheduled.length && current?.subscriptionId === payment.approvedSubscriptionId) {
            await cancelToFree(payment.businessId, trx);
          }
        }
      }
    } else {
      const current = await getCurrentSubscription(payment.businessId, trx);
      if (!current) throw new ConflictError("لا يوجد اشتراك حالي");
      if (current.subscriptionId !== payment.approvedSubscriptionId) {
        throw new ConflictError("هذا الدفع لا يرتبط بالاشتراك الحالي؛ اختر آخر دفعة للاشتراك الحالي");
      }
      if (params.action === "cancel_now") await cancelToFree(payment.businessId, trx);
      else if (params.action === "cancel_scheduled") {
        // A paid downgrade must be refunded or reassigned, never silently discarded.
        const paid = (await trx.query(`SELECT ChangeID FROM TblBillingScheduledChange WHERE BusinessID = @business AND State = N'PENDING' AND PaymentRequestID IS NOT NULL`, [{ name: "business", type: sql.UniqueIdentifier, value: payment.businessId }])).recordset.length;
        if (paid) throw new ConflictError("التخفيض مدفوع؛ يلزم تسوية الدفع أو استرداده قبل إلغائه");
        await trx.query(`UPDATE TblBillingScheduledChange SET State = N'CANCELED' WHERE BusinessID = @business AND State = N'PENDING'`, [{ name: "business", type: sql.UniqueIdentifier, value: payment.businessId }]);
      } else {
        if (!current.periodEndUtc || current.periodEndUtc <= new Date()) throw new ConflictError("الاشتراك ليس له فترة مدفوعة متبقية");
        await assertNoScheduledChange(payment.businessId, trx);
        await trx.query(`INSERT INTO TblBillingScheduledChange (ChangeID, BusinessID, SubscriptionID, Kind, State, EffectiveAtUtc, Reason)
          VALUES (@id, @business, @subscription, N'CANCEL', N'PENDING', @effective, @reason)`, [
          { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
          { name: "business", type: sql.UniqueIdentifier, value: payment.businessId },
          { name: "subscription", type: sql.UniqueIdentifier, value: current.subscriptionId },
          { name: "effective", type: sql.DateTime2, value: current.periodEndUtc },
          { name: "reason", type: sql.NVarChar(1000), value: reason },
        ]);
      }
    }
    await writeAuditEvent({ businessId: payment.businessId, actorUserId: params.actorUserId,
      action: `BILLING_${params.action.toUpperCase()}`, entityType: "ManualPaymentRequest", entityId: payment.paymentRequestId,
      metadata: { reason, previousAmount: payment.amount, discountPercent: params.discountPercent ?? null } }, trx);
    return { status: "completed" };
  });
}
