import { isPaidPlanCode } from "@/constants/billing";
import {
  isUniqueViolationError,
  sql,
  withTransaction,
} from "@/lib/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/tenancy/errors";
import { writeAuditEvent } from "@/modules/audit/service";
import type { ManualPaymentRequest, Plan, Subscription } from "@/types/domain";
import { normalizeUuid } from "@/lib/ids/uuid";

import {
  getCurrentSubscription,
  getPlanByCode,
  getPlanById,
} from "./entitlements";
import { getInstaPayDisplayConfig, isManualInstaPayEnabled } from "./instapay-config";
import * as paymentRepo from "./manual-payment-repository";
import { generatePaymentReference } from "./payment-reference";
import * as billingRepo from "./repository";
import {
  computePaidSubscriptionPeriod,
  isSubscriptionPeriodExpired,
} from "./subscription-period";
import { reconcileExpiredPaidSubscription } from "./subscription-entitlement-lifecycle";

function trimOrNull(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function assertManualBillingEnabled(): void {
  if (!isManualInstaPayEnabled()) {
    throw new ForbiddenError("الدفع اليدوي غير مفعّل حالياً");
  }
}

export async function getPaymentInstructions() {
  assertManualBillingEnabled();
  return getInstaPayDisplayConfig();
}

export async function getBusinessPaymentStatus(params: {
  businessId: string;
}): Promise<{
  latest: ManualPaymentRequest | null;
  pending: ManualPaymentRequest | null;
  open: ManualPaymentRequest | null;
  requestedPlan: Plan | null;
}> {
  const open = await paymentRepo.findOpenByBusinessId(params.businessId);
  const pending =
    open?.status === "PENDING"
      ? open
      : await paymentRepo.findPendingByBusinessId(params.businessId);
  const latest =
    open ?? pending ?? (await paymentRepo.getLatestByBusinessId(params.businessId));
  const requestedPlan = latest
    ? await getPlanById(latest.requestedPlanId)
    : null;
  return { latest, pending, open, requestedPlan };
}

/**
 * Create/reserve a payment intent BEFORE transfer.
 * Snapshots plan id/code/name + amount/currency server-side.
 * Returns existing open intent for the same plan (idempotent resume).
 */
export async function createManualPaymentIntent(params: {
  businessId: string;
  userId: string;
  planCode: string;
}): Promise<ManualPaymentRequest> {
  assertManualBillingEnabled();

  const code = params.planCode.trim().toUpperCase();
  if (!isPaidPlanCode(code)) {
    throw new ValidationError("لا يمكن طلب دفع لخطة غير مدفوعة");
  }

  const plan = await getPlanByCode(code);
  if (!plan || plan.status !== "ACTIVE") {
    throw new ValidationError("الخطة غير متاحة");
  }
  if (plan.monthlyPriceAmount == null || plan.monthlyPriceAmount <= 0) {
    throw new ValidationError("سعر الخطة غير مُعدّ");
  }

  const existingOpen = await paymentRepo.findOpenByBusinessId(params.businessId);
  if (existingOpen) {
    if (existingOpen.status === "PENDING") {
      throw new ConflictError(
        "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
      );
    }
    if (existingOpen.requestedPlanId === plan.planId) {
      return existingOpen;
    }
    // Different plan while AWAITING_TRANSFER — cancel then create new.
    await withTransaction(async (trx) => {
      const locked = await paymentRepo.lockPaymentRequest(
        existingOpen.paymentRequestId,
        trx,
      );
      if (locked?.status === "AWAITING_TRANSFER") {
        await paymentRepo.markPaymentCanceled(locked.paymentRequestId, trx);
      }
    });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const paymentReference = generatePaymentReference();
    try {
      return await withTransaction(async (trx) => {
        const raced = await paymentRepo.findOpenByBusinessId(
          params.businessId,
          trx,
        );
        if (raced) {
          if (raced.status === "PENDING") {
            throw new ConflictError(
              "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
            );
          }
          if (raced.requestedPlanId === plan.planId) {
            return raced;
          }
          throw new ConflictError(
            "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
          );
        }

        return paymentRepo.insertAwaitingTransfer(
          {
            businessId: params.businessId,
            requestedPlanId: plan.planId,
            requestedPlanCode: plan.code,
            requestedPlanDisplayName: plan.displayName,
            paymentMethod: "INSTAPAY",
            currencyCode: plan.currencyCode ?? "EGP",
            amount: plan.monthlyPriceAmount!,
            paymentReference,
            createdByUserId: params.userId,
          },
          trx,
        );
      });
    } catch (error) {
      lastError = error;
      if (isUniqueViolationError(error)) {
        const raced = await paymentRepo.findOpenByBusinessId(params.businessId);
        if (raced) {
          if (raced.status === "PENDING") {
            throw new ConflictError(
              "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
            );
          }
          if (raced.requestedPlanId === plan.planId) {
            return raced;
          }
          throw new ConflictError(
            "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
          );
        }
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("تعذر إنشاء طلب الدفع");
}

/**
 * Customer confirms transfer was sent. Moves AWAITING_TRANSFER → PENDING
 * with MANUAL_PAYMENT_SUBMITTED audit in the same transaction.
 */
export async function confirmManualPaymentTransfer(params: {
  businessId: string;
  userId: string;
  paymentRequestId: string;
  payerName?: string | null;
  transferReference?: string | null;
  customerNote?: string | null;
}): Promise<ManualPaymentRequest> {
  assertManualBillingEnabled();

  const payerName = trimOrNull(params.payerName, 160);
  if (!payerName) {
    throw new ValidationError("اسم المحوّل مطلوب");
  }

  return withTransaction(async (trx) => {
    const locked = await paymentRepo.lockPaymentRequest(
      params.paymentRequestId,
      trx,
    );
    if (!locked || locked.businessId !== params.businessId) {
      throw new NotFoundError("طلب الدفع غير موجود");
    }

    if (locked.status === "PENDING") {
      return locked;
    }
    if (locked.status !== "AWAITING_TRANSFER") {
      throw new ConflictError("لا يمكن تأكيد هذا الطلب");
    }

    await paymentRepo.markPaymentPending(
      {
        paymentRequestId: locked.paymentRequestId,
        submittedByUserId: params.userId,
        payerName,
        transferReference: trimOrNull(params.transferReference, 160),
        customerNote: trimOrNull(params.customerNote, 1000),
      },
      trx,
    );

    await writeAuditEvent(
      {
        businessId: locked.businessId,
        actorUserId: params.userId,
        action: "MANUAL_PAYMENT_SUBMITTED",
        entityType: "ManualPaymentRequest",
        entityId: locked.paymentRequestId,
        metadata: {
          paymentReference: locked.paymentReference,
          planCode: locked.requestedPlanCode,
          amount: locked.amount,
          currencyCode: locked.currencyCode,
        },
      },
      trx,
    );

    const updated =
      (await paymentRepo.getPaymentRequestById(locked.paymentRequestId, trx))
      ?? locked;
    return { ...updated, status: "PENDING" as const };
  });
}

/**
 * @deprecated Prefer createManualPaymentIntent + confirmManualPaymentTransfer.
 * Kept only for transitional callers — creates intent then immediately confirms.
 */
export async function submitManualPaymentRequest(params: {
  businessId: string;
  userId: string;
  planCode: string;
  payerName?: string | null;
  transferReference?: string | null;
  customerNote?: string | null;
}): Promise<ManualPaymentRequest> {
  const intent = await createManualPaymentIntent({
    businessId: params.businessId,
    userId: params.userId,
    planCode: params.planCode,
  });
  return confirmManualPaymentTransfer({
    businessId: params.businessId,
    userId: params.userId,
    paymentRequestId: intent.paymentRequestId,
    payerName: params.payerName,
    transferReference: params.transferReference,
    customerNote: params.customerNote,
  });
}

export type ApproveResult = {
  payment: ManualPaymentRequest;
  subscription: Subscription;
  alreadyApproved: boolean;
  priceChangedWarning: boolean;
};

/**
 * Idempotent approval with row lock.
 * Snapshotted Amount/Currency are authoritative — live plan price may differ.
 */
export async function approveManualPayment(params: {
  paymentRequestId: string;
  reviewerUserId: string;
  reviewNote?: string | null;
}): Promise<ApproveResult> {
  return withTransaction(async (trx) => {
    const locked = await paymentRepo.lockPaymentRequest(
      params.paymentRequestId,
      trx,
    );
    if (!locked) {
      throw new NotFoundError("طلب الدفع غير موجود");
    }

    if (locked.status === "APPROVED") {
      if (locked.approvedSubscriptionId) {
        const existingSub = (
          await trx.query<{
            SubscriptionID: string;
            BusinessID: string;
            PlanID: string;
            Status: string;
            PeriodStartUtc: Date | null;
            PeriodEndUtc: Date | null;
            CreatedAtUtc: Date;
            UpdatedAtUtc: Date;
          }>(
            `SELECT SubscriptionID, BusinessID, PlanID, Status,
                    PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
             FROM TblSubscription WHERE SubscriptionID = @id`,
            [
              {
                name: "id",
                type: sql.UniqueIdentifier,
                value: locked.approvedSubscriptionId,
              },
            ],
          )
        ).recordset[0];
        if (existingSub) {
          return {
            payment: locked,
            subscription: {
              subscriptionId: normalizeUuid(existingSub.SubscriptionID),
              businessId: normalizeUuid(existingSub.BusinessID),
              planId: normalizeUuid(existingSub.PlanID),
              status: existingSub.Status as Subscription["status"],
              periodStartUtc: existingSub.PeriodStartUtc,
              periodEndUtc: existingSub.PeriodEndUtc,
              createdAtUtc: existingSub.CreatedAtUtc,
              updatedAtUtc: existingSub.UpdatedAtUtc,
            },
            alreadyApproved: true,
            priceChangedWarning: false,
          };
        }
      }
      const fallback = await getCurrentSubscription(locked.businessId, trx);
      if (!fallback) {
        throw new ConflictError("طلب معتمد بدون اشتراك مرتبط");
      }
      return {
        payment: locked,
        subscription: fallback,
        alreadyApproved: true,
        priceChangedWarning: false,
      };
    }

    if (locked.status !== "PENDING") {
      throw new ConflictError("لا يمكن اعتماد طلب ليس قيد المراجعة");
    }

    const requestedPlan = await getPlanById(locked.requestedPlanId, trx);
    if (!requestedPlan) {
      throw new ValidationError("الخطة المطلوبة غير موجودة");
    }
    if (!isPaidPlanCode(requestedPlan.code)) {
      throw new ValidationError("لا يمكن اعتماد خطة غير مدفوعة");
    }

    const priceChangedWarning =
      requestedPlan.monthlyPriceAmount == null
      || Number(requestedPlan.monthlyPriceAmount) !== Number(locked.amount);

    const current = await getCurrentSubscription(locked.businessId, trx);
    let currentPlan: Plan | null = null;
    if (current) {
      currentPlan = await getPlanById(current.planId, trx);
    }

    const samePlanRenewal = Boolean(
      current
      && currentPlan
      && currentPlan.code === locked.requestedPlanCode
      && !isSubscriptionPeriodExpired({ periodEndUtc: current.periodEndUtc }),
    );

    const { periodStartUtc, periodEndUtc } = computePaidSubscriptionPeriod({
      samePlanRenewal,
      currentPeriodEndUtc: current?.periodEndUtc,
    });

    if (current) {
      await billingRepo.updateSubscriptionBillingFields(
        {
          subscriptionId: current.subscriptionId,
          status: "CANCELED",
          periodEndUtc: current.periodEndUtc ?? new Date(),
        },
        trx,
      );
    }

    const subscription = await billingRepo.insertSubscription(
      {
        businessId: locked.businessId,
        planId: locked.requestedPlanId,
        status: "ACTIVE",
        periodStartUtc,
        periodEndUtc,
        providerName: "INSTAPAY_MANUAL",
      },
      trx,
    );

    await paymentRepo.markPaymentApproved(
      {
        paymentRequestId: locked.paymentRequestId,
        reviewedByUserId: params.reviewerUserId,
        approvedSubscriptionId: subscription.subscriptionId,
        reviewNote: trimOrNull(params.reviewNote, 1000),
      },
      trx,
    );

    const approved =
      (await paymentRepo.getPaymentRequestById(
        locked.paymentRequestId,
        trx,
      )) ?? locked;

    await writeAuditEvent(
      {
        businessId: locked.businessId,
        actorUserId: params.reviewerUserId,
        action: "MANUAL_PAYMENT_APPROVED",
        entityType: "ManualPaymentRequest",
        entityId: locked.paymentRequestId,
        metadata: {
          paymentReference: locked.paymentReference,
          planCode: locked.requestedPlanCode,
          amount: locked.amount,
          currencyCode: locked.currencyCode,
          subscriptionId: subscription.subscriptionId,
          samePlanRenewal,
          priceChangedWarning,
          currentPlanPrice: requestedPlan.monthlyPriceAmount,
        },
      },
      trx,
    );

    await writeAuditEvent(
      {
        businessId: locked.businessId,
        actorUserId: params.reviewerUserId,
        action: "SUBSCRIPTION_MANUAL_ACTIVATED",
        entityType: "Subscription",
        entityId: subscription.subscriptionId,
        metadata: {
          planCode: locked.requestedPlanCode,
          periodStartUtc: periodStartUtc.toISOString(),
          periodEndUtc: periodEndUtc.toISOString(),
          paymentRequestId: locked.paymentRequestId,
          amount: locked.amount,
        },
      },
      trx,
    );

    return {
      payment: { ...approved, status: "APPROVED" },
      subscription,
      alreadyApproved: false,
      priceChangedWarning,
    };
  });
}

export async function rejectManualPayment(params: {
  paymentRequestId: string;
  reviewerUserId: string;
  reviewNote?: string | null;
}): Promise<ManualPaymentRequest> {
  return withTransaction(async (trx) => {
    const locked = await paymentRepo.lockPaymentRequest(
      params.paymentRequestId,
      trx,
    );
    if (!locked) {
      throw new NotFoundError("طلب الدفع غير موجود");
    }
    if (locked.status === "REJECTED") {
      return locked;
    }
    if (locked.status !== "PENDING") {
      throw new ConflictError("لا يمكن رفض طلب ليس قيد المراجعة");
    }

    await paymentRepo.markPaymentRejected(
      {
        paymentRequestId: locked.paymentRequestId,
        reviewedByUserId: params.reviewerUserId,
        reviewNote: trimOrNull(params.reviewNote, 1000),
      },
      trx,
    );

    await writeAuditEvent(
      {
        businessId: locked.businessId,
        actorUserId: params.reviewerUserId,
        action: "MANUAL_PAYMENT_REJECTED",
        entityType: "ManualPaymentRequest",
        entityId: locked.paymentRequestId,
        metadata: {
          paymentReference: locked.paymentReference,
          amount: locked.amount,
          hasCustomerNote: Boolean(trimOrNull(params.reviewNote, 1000)),
        },
      },
      trx,
    );

    return {
      ...locked,
      status: "REJECTED",
      reviewedByUserId: params.reviewerUserId,
      reviewedAtUtc: new Date(),
      reviewNote: trimOrNull(params.reviewNote, 1000),
    };
  });
}

export { reconcileExpiredPaidSubscription };

export {
  getAdminOverviewCounts,
  getPaymentRequestById,
  listPaymentsForAdmin,
} from "./manual-payment-repository";
