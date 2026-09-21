import { DEFAULT_BOOTSTRAP_PLAN_CODE, isPaidPlanCode } from "@/constants/billing";
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
  requestedPlan: Plan | null;
}> {
  const pending = await paymentRepo.findPendingByBusinessId(params.businessId);
  const latest =
    pending ?? (await paymentRepo.getLatestByBusinessId(params.businessId));
  const requestedPlan = latest
    ? await getPlanById(latest.requestedPlanId)
    : null;
  return { latest, pending, requestedPlan };
}

/**
 * Customer submits InstaPay confirmation for a paid plan.
 * Amount and plan are resolved server-side — never trust client amount.
 */
export async function submitManualPaymentRequest(params: {
  businessId: string;
  userId: string;
  planCode: string;
  payerName?: string | null;
  transferReference?: string | null;
  customerNote?: string | null;
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

  const existingPending = await paymentRepo.findPendingByBusinessId(
    params.businessId,
  );
  if (existingPending) {
    throw new ConflictError(
      "لديك طلب دفع قيد المراجعة بالفعل. انتظر النتيجة قبل إرسال طلب جديد.",
    );
  }

  const payerName = trimOrNull(params.payerName, 160);
  if (!payerName) {
    throw new ValidationError("اسم المحوّل مطلوب");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const paymentReference = generatePaymentReference();
    try {
      const created = await paymentRepo.insertPaymentRequest({
        businessId: params.businessId,
        requestedPlanId: plan.planId,
        paymentMethod: "INSTAPAY",
        currencyCode: plan.currencyCode ?? "EGP",
        amount: plan.monthlyPriceAmount,
        paymentReference,
        payerName,
        transferReference: trimOrNull(params.transferReference, 160),
        customerNote: trimOrNull(params.customerNote, 1000),
        submittedByUserId: params.userId,
      });

      await writeAuditEvent({
        businessId: params.businessId,
        actorUserId: params.userId,
        action: "MANUAL_PAYMENT_SUBMITTED",
        entityType: "ManualPaymentRequest",
        entityId: created.paymentRequestId,
        metadata: {
          paymentReference: created.paymentReference,
          planCode: plan.code,
          amount: created.amount,
          currencyCode: created.currencyCode,
        },
      });

      return created;
    } catch (error) {
      lastError = error;
      if (isUniqueViolationError(error)) {
        // Reference collision or duplicate pending — retry or re-check pending
        const raced = await paymentRepo.findPendingByBusinessId(
          params.businessId,
        );
        if (raced) {
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

export type ApproveResult = {
  payment: ManualPaymentRequest;
  subscription: Subscription;
  alreadyApproved: boolean;
};

/**
 * Idempotent approval with row lock.
 * Same-plan renewal extends from existing PeriodEndUtc when still active.
 * Different-plan upgrade starts a fresh month from approval time.
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
      };
    }

    if (locked.status !== "PENDING") {
      throw new ConflictError("لا يمكن اعتماد طلب ليس قيد المراجعة");
    }

    const requestedPlan = await getPlanById(locked.requestedPlanId, trx);
    if (!requestedPlan || requestedPlan.status !== "ACTIVE") {
      throw new ValidationError("الخطة المطلوبة غير متاحة");
    }
    if (!isPaidPlanCode(requestedPlan.code)) {
      throw new ValidationError("لا يمكن اعتماد خطة غير مدفوعة");
    }
    if (
      requestedPlan.monthlyPriceAmount == null
      || Number(requestedPlan.monthlyPriceAmount) !== Number(locked.amount)
    ) {
      throw new ConflictError(
        "مبلغ الطلب لا يطابق سعر الخطة الحالي — ارفض الطلب واطلب إعادة الإرسال",
      );
    }

    const current = await getCurrentSubscription(locked.businessId, trx);
    let currentPlan: Plan | null = null;
    if (current) {
      currentPlan = await getPlanById(current.planId, trx);
    }

    const samePlanRenewal = Boolean(
      current
      && currentPlan
      && currentPlan.code === requestedPlan.code
      && !isSubscriptionPeriodExpired({ periodEndUtc: current.periodEndUtc }),
    );

    const { periodStartUtc, periodEndUtc } = computePaidSubscriptionPeriod({
      samePlanRenewal,
      currentPeriodEndUtc: current?.periodEndUtc,
    });

    // Terminate previous current subscription to preserve unique invariant.
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
        planId: requestedPlan.planId,
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

    await writeAuditEvent({
      businessId: locked.businessId,
      actorUserId: params.reviewerUserId,
      action: "MANUAL_PAYMENT_APPROVED",
      entityType: "ManualPaymentRequest",
      entityId: locked.paymentRequestId,
      metadata: {
        paymentReference: locked.paymentReference,
        planCode: requestedPlan.code,
        amount: locked.amount,
        subscriptionId: subscription.subscriptionId,
        samePlanRenewal,
      },
    });

    await writeAuditEvent({
      businessId: locked.businessId,
      actorUserId: params.reviewerUserId,
      action: "SUBSCRIPTION_MANUAL_ACTIVATED",
      entityType: "Subscription",
      entityId: subscription.subscriptionId,
      metadata: {
        planCode: requestedPlan.code,
        periodStartUtc: periodStartUtc.toISOString(),
        periodEndUtc: periodEndUtc.toISOString(),
        paymentRequestId: locked.paymentRequestId,
      },
    });

    return {
      payment: { ...approved, status: "APPROVED" },
      subscription,
      alreadyApproved: false,
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

    await writeAuditEvent({
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
    });

    return {
      ...locked,
      status: "REJECTED",
      reviewedByUserId: params.reviewerUserId,
      reviewedAtUtc: new Date(),
      reviewNote: trimOrNull(params.reviewNote, 1000),
    };
  });
}

/**
 * When a paid subscription's PeriodEndUtc has passed, mark it EXPIRED and
 * ensure a FREE subscription is current. Does not delete excess resources.
 */
export async function reconcileExpiredPaidSubscription(
  businessId: string,
): Promise<Subscription | null> {
  const current = await getCurrentSubscription(businessId);
  if (!current) {
    return null;
  }
  if (!isSubscriptionPeriodExpired({ periodEndUtc: current.periodEndUtc })) {
    return current;
  }

  const plan = await getPlanById(current.planId);
  if (!plan || plan.code === DEFAULT_BOOTSTRAP_PLAN_CODE) {
    return current;
  }
  if (!isPaidPlanCode(plan.code)) {
    return current;
  }

  await withTransaction(async (trx) => {
    const locked = await getCurrentSubscription(businessId, trx);
    if (!locked) return;
    if (
      locked.subscriptionId !== current.subscriptionId
      || !isSubscriptionPeriodExpired({ periodEndUtc: locked.periodEndUtc })
    ) {
      return;
    }

    await billingRepo.updateSubscriptionBillingFields(
      {
        subscriptionId: locked.subscriptionId,
        status: "EXPIRED",
      },
      trx,
    );

    const freePlan = await getPlanByCode(DEFAULT_BOOTSTRAP_PLAN_CODE, trx);
    if (!freePlan) {
      throw new NotFoundError("FREE plan is not configured");
    }

    await billingRepo.insertSubscription(
      {
        businessId,
        planId: freePlan.planId,
        status: "ACTIVE",
        periodEndUtc: null,
      },
      trx,
    );
  });

  return getCurrentSubscription(businessId);
}

export {
  getAdminOverviewCounts,
  getPaymentRequestById,
  listPaymentsForAdmin,
} from "./manual-payment-repository";
