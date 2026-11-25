import { randomUUID } from "node:crypto";
import { DEFAULT_BOOTSTRAP_PLAN_CODE, PRIVATE_UNLIMITED_PLAN_CODE } from "@/constants/billing";
import { sql, withTransaction } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/tenancy/errors";
import { writeAuditEvent } from "@/modules/audit/service";
import { getCurrentSubscription, getPlanById } from "./entitlements";
import * as repo from "./repository";
import { assertNoScheduledChange } from "./scheduled-changes";
import { markPaymentCanceled } from "./manual-payment-repository";
import { voidPaymentInvoice } from "./documents";

/** Only called from the platform SUPER_ADMIN endpoint. No payment or invoice is created. */
export async function setPrivateUnlimited(input: {
  businessId: string;
  actorUserId: string;
  action: "assign" | "revoke";
  reason: string;
}) {
  return withTransaction(async trx => {
    const business = await trx.query<{ Status: string }>(
      "SELECT Status FROM TblBusiness WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@business",
      [{ name: "business", type: sql.UniqueIdentifier, value: input.businessId }],
    );
    if (!business.recordset[0]) throw new NotFoundError("النشاط غير موجود");
    if (input.action === "assign" && business.recordset[0].Status !== "ACTIVE") {
      throw new ConflictError("لا يمكن تفعيل الباقة لنشاط غير نشط");
    }

    const current = await getCurrentSubscription(input.businessId, trx);
    const previous = current ? await getPlanById(current.planId, trx) : null;
    if (current && !previous) throw new ConflictError("الباقة الحالية غير معروفة");
    if (input.action === "assign" && previous?.code === PRIVATE_UNLIMITED_PLAN_CODE && current?.status === "ACTIVE") {
      return { status: "ASSIGNED" as const, subscriptionId: current.subscriptionId };
    }
    if (input.action === "revoke" && previous?.code !== PRIVATE_UNLIMITED_PLAN_CODE) {
      throw new ConflictError("النشاط لا يملك الباقة الخاصة");
    }
    // An explicit SUPER_ADMIN grant supersedes the existing entitlement immediately.
    // Keep the old subscription dates, approved payments, invoices and receipts intact.
    // A simple scheduled cancellation is superseded; a paid future downgrade
    // still requires separate settlement, as it represents an additional purchase.
    if (input.action === "assign") {
      await trx.query(
        "UPDATE TblBillingScheduledChange SET State=N'CANCELED' WHERE BusinessID=@business AND State=N'PENDING' AND Kind=N'CANCEL' AND PaymentRequestID IS NULL",
        [{ name: "business", type: sql.UniqueIdentifier, value: input.businessId }],
      );
    }
    await assertNoScheduledChange(input.businessId, trx);
    // Billing review is independent of the grant. An unsubmitted intent can
    // be canceled using the normal checkout cancellation path. A declared
    // transfer must remain in the financial review queue, never auto-rejected.
    const open = await trx.query<{ PaymentRequestID: string; Status: string }>(
      "SELECT PaymentRequestID, Status FROM TblManualPaymentRequest WITH (UPDLOCK,HOLDLOCK) WHERE BusinessID=@business AND Status IN (N'AWAITING_TRANSFER',N'PENDING')",
      [{ name: "business", type: sql.UniqueIdentifier, value: input.businessId }],
    );
    const canceledIntentIds: string[] = [];
    const pendingReviewIds: string[] = [];
    for (const payment of open.recordset) {
      if (input.action === "assign" && payment.Status === "AWAITING_TRANSFER") {
        await markPaymentCanceled(payment.PaymentRequestID, trx);
        await voidPaymentInvoice(payment.PaymentRequestID, trx);
        canceledIntentIds.push(payment.PaymentRequestID);
      } else if (payment.Status === "PENDING") {
        pendingReviewIds.push(payment.PaymentRequestID);
      }
    }

    if (input.action === "assign") {
      // Serialized lazy provisioning: never overwrite an existing plan's settings.
      await trx.query(`
        IF NOT EXISTS (SELECT 1 FROM TblPlan WITH (UPDLOCK,HOLDLOCK) WHERE Code=@code)
          INSERT INTO TblPlan (PlanID,Code,DisplayName,Status,MaxWhatsAppConnections,MaxAgents,
            MaxActiveKnowledgeItems,MonthlyAiReplies,MonthlyWhatsAppOutbound,MonthlyPriceAmount,
            CurrencyCode,BillingInterval,CreatedAtUtc,UpdatedAtUtc)
          VALUES (@id,@code,N'DRVO Unlimited',N'ACTIVE',NULL,NULL,NULL,NULL,NULL,0,N'EGP',N'MONTHLY',SYSUTCDATETIME(),SYSUTCDATETIME())
      `, [
        { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
        { name: "code", type: sql.NVarChar(64), value: PRIVATE_UNLIMITED_PLAN_CODE },
      ]);
    }
    const target = await repo.getPlanByCode(input.action === "assign" ? PRIVATE_UNLIMITED_PLAN_CODE : DEFAULT_BOOTSTRAP_PLAN_CODE, trx);
    if (!target || target.status !== "ACTIVE") throw new ConflictError("الباقة المطلوبة غير متاحة");
    if (input.action === "assign" && (
      target.maxWhatsAppConnections != null || target.maxAgents != null ||
      target.maxActiveKnowledgeItems != null || target.monthlyAiReplies != null ||
      target.monthlyWhatsAppOutbound != null || target.monthlyPriceAmount !== 0
    )) throw new ConflictError("إعداد الباقة الخاصة غير مطابق");

    if (current) await repo.updateSubscriptionBillingFields({ subscriptionId: current.subscriptionId, status: "CANCELED" }, trx);
    const created = await repo.insertSubscription({ businessId: input.businessId, planId: target.planId, status: "ACTIVE", periodEndUtc: null }, trx);
    await writeAuditEvent({
      businessId: input.businessId, actorUserId: input.actorUserId,
      action: input.action === "assign" ? "PRIVATE_UNLIMITED_ASSIGNED" : "PRIVATE_UNLIMITED_REVOKED",
      entityType: "Subscription", entityId: created.subscriptionId,
      metadata: { reason: input.reason, previousSubscriptionId: current?.subscriptionId ?? null, previousPlan: previous?.code ?? null, previousPeriodEndUtc: current?.periodEndUtc?.toISOString() ?? null, targetPlan: target.code, canceledIntentIds, pendingReviewIds },
    }, trx);
    return { status: input.action === "assign" ? "ASSIGNED" as const : "REVOKED" as const, subscriptionId: created.subscriptionId, canceledIntentCount: canceledIntentIds.length, pendingReviewCount: pendingReviewIds.length };
  });
}
