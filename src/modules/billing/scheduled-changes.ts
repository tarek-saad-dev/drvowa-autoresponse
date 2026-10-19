import { randomUUID } from "node:crypto";
import { sql, type TransactionClient } from "@/lib/db";
import { ConflictError } from "@/lib/tenancy/errors";
import type { ManualPaymentRequest, Subscription } from "@/types/domain";
import * as repo from "./repository";
import { addCalendarMonths } from "./subscription-period";

const rank: Record<string, number> = { FREE: 0, STARTER: 1, PRO: 2, BUSINESS: 3 };
export function isDowngrade(from: string, to: string): boolean {
  if (!(from in rank) || !(to in rank)) throw new Error("Unknown plan rank");
  return rank[to] < rank[from];
}
export async function schedulePaidDowngrade(current: Subscription, payment: ManualPaymentRequest, trx: TransactionClient) {
  await trx.query(`INSERT INTO TblBillingScheduledChange
    (ChangeID, BusinessID, SubscriptionID, PaymentRequestID, TargetPlanID, BillingInterval, Kind, State, EffectiveAtUtc, Reason)
    VALUES (@id, @business, @subscription, @payment, @plan, @interval, N'DOWNGRADE', N'PENDING', @effective, N'Paid downgrade')`, [
    { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
    { name: "business", type: sql.UniqueIdentifier, value: current.businessId },
    { name: "subscription", type: sql.UniqueIdentifier, value: current.subscriptionId },
    { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
    { name: "plan", type: sql.UniqueIdentifier, value: payment.requestedPlanId },
    { name: "interval", type: sql.NVarChar(16), value: payment.billingInterval ?? "MONTHLY" },
    { name: "effective", type: sql.DateTime2, value: current.periodEndUtc },
  ]);
}
export async function assertNoScheduledChange(businessId: string, trx: TransactionClient) {
  const result = await trx.query(`SELECT ChangeID FROM TblBillingScheduledChange WITH (UPDLOCK, HOLDLOCK)
    WHERE BusinessID = @business AND State = N'PENDING'`, [{ name: "business", type: sql.UniqueIdentifier, value: businessId }]);
  if (result.recordset.length) throw new ConflictError("يوجد تغيير مجدول؛ راجعه قبل شراء اشتراك جديد");
}
export async function applyDueScheduledChange(current: Subscription, trx: TransactionClient): Promise<Subscription> {
  const { recordset } = await trx.query<{
    ChangeID: string; TargetPlanID: string | null; PaymentRequestID: string | null; Kind: string;
    BillingInterval: string; EffectiveAtUtc: Date;
  }>(`SELECT ChangeID, TargetPlanID, PaymentRequestID, Kind, BillingInterval, EffectiveAtUtc
    FROM TblBillingScheduledChange WITH (UPDLOCK, HOLDLOCK)
    WHERE SubscriptionID = @subscription AND State = N'PENDING' AND EffectiveAtUtc <= SYSUTCDATETIME()`, [
    { name: "subscription", type: sql.UniqueIdentifier, value: current.subscriptionId },
  ]);
  const change = recordset[0];
  if (!change) return current;
  const plan = change.Kind === "CANCEL" ? await repo.getPlanByCode("FREE", trx) : await repo.getPlanById(change.TargetPlanID!, trx);
  if (!plan || plan.status !== "ACTIVE") throw new Error("Scheduled plan unavailable");
  await repo.updateSubscriptionBillingFields({ subscriptionId: current.subscriptionId, status: "CANCELED" }, trx);
  const created = await repo.insertSubscription({ businessId: current.businessId, planId: plan.planId,
    periodStartUtc: change.EffectiveAtUtc,
    periodEndUtc: change.Kind === "CANCEL" ? null : addCalendarMonths(change.EffectiveAtUtc, change.BillingInterval === "ANNUAL" ? 12 : 1),
    providerName: change.Kind === "CANCEL" ? null : "INSTAPAY_MANUAL",
    billingInterval: change.BillingInterval === "ANNUAL" ? "ANNUAL" : "MONTHLY",
  }, trx);
  await trx.query(`UPDATE TblBillingScheduledChange SET State = N'APPLIED' WHERE ChangeID = @change;
    UPDATE TblManualPaymentRequest SET ApprovedSubscriptionID = @new WHERE PaymentRequestID = @payment;`, [
    { name: "change", type: sql.UniqueIdentifier, value: change.ChangeID },
    { name: "new", type: sql.UniqueIdentifier, value: created.subscriptionId },
    { name: "payment", type: sql.UniqueIdentifier, value: change.PaymentRequestID },
  ]);
  return created;
}
