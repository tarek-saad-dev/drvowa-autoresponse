import { query, sql, withTransaction } from "@/lib/db";
import { getEmailProvider, isEmailDeliveryEnabled } from "@/modules/auth/email-provider";
import { ensurePaymentInvoice } from "./documents";
import { findOpenByBusinessId, insertAwaitingTransfer } from "./manual-payment-repository";
import { generatePaymentReference } from "./payment-reference";
import { reconcileExpiredPaidSubscription } from "./subscription-entitlement-lifecycle";
import { isManualInstaPayEnabled } from "./instapay-config";

export async function runBillingMaintenance() {
  const candidates = await query<{ BusinessID: string }>(`SELECT TOP (100) s.BusinessID FROM TblSubscription s
    WHERE s.Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE') AND
      (s.PeriodEndUtc <= DATEADD(DAY, -5, SYSUTCDATETIME()) OR EXISTS
        (SELECT 1 FROM TblBillingScheduledChange c WHERE c.SubscriptionID = s.SubscriptionID
         AND c.State = N'PENDING' AND c.EffectiveAtUtc <= SYSUTCDATETIME()))
    ORDER BY s.PeriodEndUtc`);
  for (const row of candidates.recordset) await reconcileExpiredPaidSubscription(row.BusinessID);
  // A stale renewal must not become a late activation against a different period.
  await query(`UPDATE i SET Status = N'VOID' FROM TblBillingInvoice i
    JOIN TblManualPaymentRequest p ON p.PaymentRequestID = i.PaymentRequestID
    WHERE i.Status = N'OPEN' AND i.ValidUntilUtc <= SYSUTCDATETIME() AND p.Status = N'AWAITING_TRANSFER';
    UPDATE p SET Status = N'CANCELED', UpdatedAtUtc = SYSUTCDATETIME() FROM TblManualPaymentRequest p
    JOIN TblBillingInvoice i ON i.PaymentRequestID = p.PaymentRequestID
    WHERE i.Status = N'VOID' AND p.Status = N'AWAITING_TRANSFER';`);
  if (!isManualInstaPayEnabled()) return;
  const upcoming = await query<{ SubscriptionID: string; BusinessID: string }>(`SELECT TOP (100) s.SubscriptionID, s.BusinessID
    FROM TblSubscription s JOIN TblPlan p ON p.PlanID = s.PlanID
    WHERE s.Status = N'ACTIVE' AND p.Code IN (N'STARTER', N'PRO', N'BUSINESS')
      AND s.PeriodEndUtc > SYSUTCDATETIME() AND s.PeriodEndUtc <= DATEADD(DAY, 3, SYSUTCDATETIME())
      AND NOT EXISTS (SELECT 1 FROM TblBillingInvoice i WHERE i.RenewalSubscriptionID = s.SubscriptionID)
    ORDER BY s.PeriodEndUtc`);
  for (const candidate of upcoming.recordset) {
    await withTransaction(async trx => {
      await trx.query(`SELECT BusinessID FROM TblBusiness WITH (UPDLOCK, HOLDLOCK) WHERE BusinessID = @business`, [
        { name: "business", type: sql.UniqueIdentifier, value: candidate.BusinessID },
      ]);
      const row = (await trx.query<{
        BusinessID: string; PlanID: string; Code: string; DisplayName: string; CurrencyCode: string;
        MonthlyPriceAmount: number; BillingInterval: "MONTHLY" | "ANNUAL"; PeriodEndUtc: Date; UserID: string;
      }>(`SELECT s.BusinessID, s.PlanID, p.Code, p.DisplayName, p.CurrencyCode, p.MonthlyPriceAmount,
        s.BillingInterval, s.PeriodEndUtc, owner.UserID FROM TblSubscription s JOIN TblPlan p ON p.PlanID = s.PlanID
        CROSS APPLY (SELECT TOP (1) UserID FROM TblBusinessMember WHERE BusinessID = s.BusinessID AND Role = N'OWNER' AND Status = N'ACTIVE' ORDER BY CreatedAtUtc, UserID) owner
        WHERE s.SubscriptionID = @id AND s.Status = N'ACTIVE' AND p.Status = N'ACTIVE'
          AND s.PeriodEndUtc > SYSUTCDATETIME()
          AND NOT EXISTS (SELECT 1 FROM TblBillingInvoice WHERE RenewalSubscriptionID = s.SubscriptionID)
          AND NOT EXISTS (SELECT 1 FROM TblBillingScheduledChange WHERE BusinessID = s.BusinessID AND State = N'PENDING')`, [
        { name: "id", type: sql.UniqueIdentifier, value: candidate.SubscriptionID },
      ])).recordset[0];
      if (!row || !Number.isFinite(Number(row.MonthlyPriceAmount)) || Number(row.MonthlyPriceAmount) <= 0
        || await findOpenByBusinessId(row.BusinessID, trx)) return;
      const payment = await insertAwaitingTransfer({ businessId: row.BusinessID, requestedPlanId: row.PlanID,
        requestedPlanCode: row.Code, requestedPlanDisplayName: row.DisplayName, paymentMethod: "INSTAPAY",
        currencyCode: row.CurrencyCode, amount: Number((row.MonthlyPriceAmount * (row.BillingInterval === "ANNUAL" ? 12 : 1)).toFixed(2)),
        billingInterval: row.BillingInterval, paymentReference: generatePaymentReference(), createdByUserId: row.UserID,
      }, trx);
      await ensurePaymentInvoice(payment, trx);
      await trx.query(`UPDATE TblBillingInvoice SET RenewalSubscriptionID = @subscription,
        ValidUntilUtc = DATEADD(DAY, 5, @end), NoticeState = N'PENDING' WHERE PaymentRequestID = @payment`, [
        { name: "subscription", type: sql.UniqueIdentifier, value: candidate.SubscriptionID },
        { name: "end", type: sql.DateTime2, value: row.PeriodEndUtc },
        { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
      ]);
    });
  }
  // Delivery is explicitly enabled by deployment config, not by merely running migrations.
  if (process.env.BILLING_EMAIL_NOTICES_ENABLED !== "1" || !isEmailDeliveryEnabled()) return;
  const notices = await query<{ InvoiceID: string; InvoiceNumber: string; TotalMinor: number; CurrencyCode: string; Email: string }>(`
    ;WITH pending AS (SELECT TOP (20) * FROM TblBillingInvoice WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE NoticeState = N'PENDING' AND Status = N'OPEN' ORDER BY IssuedAtUtc)
    UPDATE pending SET NoticeState = N'SENDING' OUTPUT inserted.InvoiceID,
      CONVERT(VARCHAR(24), inserted.InvoiceNumber) AS InvoiceNumber, inserted.TotalMinor, inserted.CurrencyCode;
  `);
  for (const invoice of notices.recordset) {
    try {
      const owner = (await query<{ Email: string }>(`SELECT TOP (1) u.Email FROM TblUser u
        JOIN TblBusinessMember m ON m.UserID = u.UserID JOIN TblBillingInvoice i ON i.BusinessID = m.BusinessID
        WHERE i.InvoiceID = @id AND m.Role = N'OWNER' AND m.Status = N'ACTIVE' ORDER BY m.CreatedAtUtc, m.UserID`, [
        { name: "id", type: sql.UniqueIdentifier, value: invoice.InvoiceID },
      ])).recordset[0];
      if (!owner) throw new Error("BILLING_OWNER_NOT_FOUND");
      const result = await getEmailProvider().send({ to: owner.Email, subject: `فاتورة تجديد DRVO — INV-${invoice.InvoiceNumber}`,
        textBody: `فاتورة تجديد اشتراكك INV-${invoice.InvoiceNumber} بقيمة ${Number(invoice.TotalMinor) / 100} ${invoice.CurrencyCode} جاهزة. افتح صفحة الفوترة في حساب DRVO لمراجعتها والسداد. لديك فترة سماح 5 أيام بعد الانتهاء، ثم تنتقل إلى الخطة المجانية.` });
      await query(`UPDATE TblBillingInvoice SET NoticeState = @state WHERE InvoiceID = @id`, [
        { name: "id", type: sql.UniqueIdentifier, value: invoice.InvoiceID },
        { name: "state", type: sql.NVarChar(16), value: result.status === "SENT" ? "SENT" : "PENDING" },
      ]);
    } catch {
      // Ambiguous transport failure: do not automatically send a duplicate email.
      await query(`UPDATE TblBillingInvoice SET NoticeState = N'UNKNOWN' WHERE InvoiceID = @id`, [{ name: "id", type: sql.UniqueIdentifier, value: invoice.InvoiceID }]);
    }
  }
}
