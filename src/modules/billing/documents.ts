import { randomUUID } from "node:crypto";
import { query, sql, type TransactionClient } from "@/lib/db";
import { ConflictError } from "@/lib/tenancy/errors";
import type { ManualPaymentRequest } from "@/types/domain";
import { decimal12_2ToMinorUnits } from "./saas-financial-contract";

export type BillingDocument = {
  InvoiceID: string; InvoiceNumber: string; PlanDisplayName: string; CurrencyCode: string;
  SubtotalMinor: number; DiscountMinor: number; TotalMinor: number; Status: string;
  IssuedAtUtc: Date; SettledAtUtc: Date | null; ReceiptNumber: string | null;
  ReceiptIssuedAtUtc: Date | null;
  RefundState: string | null; RefundAmountMinor: number | null; BillingInterval: string;
};

/** Caller holds the payment-request lock, or has just inserted that request. */
export async function ensurePaymentInvoice(payment: ManualPaymentRequest, trx: TransactionClient): Promise<void> {
  const totalMinor = (payment.amount === 0 ? 0 : decimal12_2ToMinorUnits(payment.amount.toFixed(2)));
  await trx.query(`IF NOT EXISTS (
      SELECT 1 FROM TblBillingInvoice WITH (UPDLOCK, HOLDLOCK) WHERE PaymentRequestID = @paymentId
    ) INSERT INTO TblBillingInvoice
      (InvoiceID, BusinessID, PaymentRequestID, PlanCode, PlanDisplayName, CurrencyCode,
       SubtotalMinor, DiscountMinor, TotalMinor, Status, BillingInterval)
    VALUES (@id, @businessId, @paymentId, @planCode, @planName, @currency, @amount, 0, @amount, N'OPEN', @interval)`, [
    { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
    { name: "businessId", type: sql.UniqueIdentifier, value: payment.businessId },
    { name: "paymentId", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
    { name: "planCode", type: sql.NVarChar(64), value: payment.requestedPlanCode },
    { name: "planName", type: sql.NVarChar(120), value: payment.requestedPlanDisplayName },
    { name: "currency", type: sql.NVarChar(3), value: payment.currencyCode },
    { name: "amount", type: sql.BigInt, value: totalMinor },
    { name: "interval", type: sql.NVarChar(16), value: payment.billingInterval ?? "MONTHLY" },
  ]);
}

/** Settlement, receipt and approval commit together. Zero invoices do not invent cash. */
export async function settlePaymentInvoice(payment: ManualPaymentRequest, trx: TransactionClient): Promise<void> {
  await ensurePaymentInvoice(payment, trx);
  const inputs = [{ name: "paymentId", type: sql.UniqueIdentifier, value: payment.paymentRequestId }];
  const { recordset } = await trx.query<{
    InvoiceID: string; TotalMinor: number; CurrencyCode: string; Status: string; ValidUntilUtc: Date | null;
  }>(`SELECT InvoiceID, TotalMinor, CurrencyCode, Status, ValidUntilUtc FROM TblBillingInvoice WITH (UPDLOCK, HOLDLOCK)
      WHERE PaymentRequestID = @paymentId`, inputs);
  const invoice = recordset[0];
  const amount = (payment.amount === 0 ? 0 : decimal12_2ToMinorUnits(payment.amount.toFixed(2)));
  if (!invoice || (invoice.ValidUntilUtc && invoice.ValidUntilUtc <= new Date()) || invoice.Status === "VOID" || Number(invoice.TotalMinor) !== amount || invoice.CurrencyCode !== payment.currencyCode) {
    throw new ConflictError("قيمة الفاتورة أو عملتها لا تطابق طلب الدفع");
  }
  if (invoice.Status !== "OPEN") return;
  await trx.query(`UPDATE TblBillingInvoice SET Status = CASE WHEN TotalMinor = 0 THEN N'WAIVED' ELSE N'PAID' END,
      SettledAtUtc = SYSUTCDATETIME() WHERE PaymentRequestID = @paymentId;
    INSERT INTO TblBillingReceipt (ReceiptID, InvoiceID, AmountMinor, CurrencyCode)
      SELECT @receiptId, InvoiceID, TotalMinor, CurrencyCode FROM TblBillingInvoice
      WHERE PaymentRequestID = @paymentId AND TotalMinor > 0;`, [
    ...inputs, { name: "receiptId", type: sql.UniqueIdentifier, value: randomUUID() },
  ]);
}

export async function voidPaymentInvoice(paymentRequestId: string, trx: TransactionClient): Promise<void> {
  await trx.query(`UPDATE TblBillingInvoice SET Status = N'VOID'
    WHERE PaymentRequestID = @paymentId AND Status = N'OPEN'`, [
    { name: "paymentId", type: sql.UniqueIdentifier, value: paymentRequestId },
  ]);
}

export async function listBillingDocuments(businessId: string): Promise<BillingDocument[]> {
  const { recordset } = await query<BillingDocument>(`SELECT TOP (100) i.InvoiceID,
    CONVERT(VARCHAR(24), i.InvoiceNumber) AS InvoiceNumber, i.PlanDisplayName, i.CurrencyCode,
    i.SubtotalMinor, i.DiscountMinor, i.TotalMinor, i.Status, i.IssuedAtUtc, i.SettledAtUtc,
    CONVERT(VARCHAR(24), r.ReceiptNumber) AS ReceiptNumber, r.IssuedAtUtc AS ReceiptIssuedAtUtc,
    f.State AS RefundState, f.AmountMinor AS RefundAmountMinor, i.BillingInterval
    FROM TblBillingInvoice i LEFT JOIN TblBillingReceipt r ON r.InvoiceID = i.InvoiceID
    LEFT JOIN TblBillingRefund f ON f.InvoiceID = i.InvoiceID
    WHERE i.BusinessID = @businessId ORDER BY i.IssuedAtUtc DESC, i.InvoiceNumber DESC`, [
    { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
  ]);
  return recordset;
}

export async function getScheduledBillingChange(businessId: string) {
  const result = await query<{ Kind: string; EffectiveAtUtc: Date; PlanDisplayName: string | null }>(`
    SELECT c.Kind, c.EffectiveAtUtc, p.DisplayName AS PlanDisplayName
    FROM TblBillingScheduledChange c LEFT JOIN TblPlan p ON p.PlanID = c.TargetPlanID
    WHERE c.BusinessID = @business AND c.State = N'PENDING'`, [
    { name: "business", type: sql.UniqueIdentifier, value: businessId },
  ]);
  return result.recordset[0] ?? null;
}
