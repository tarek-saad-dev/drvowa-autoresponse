import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, query, sql } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/tenancy/errors";
import { signup } from "@/modules/auth/service";
import {
  approveManualPayment,
  confirmManualPaymentTransfer,
  createManualPaymentIntent,
  listPaymentsForAdmin,
  rejectManualPayment,
  submitManualPaymentRequest,
} from "@/modules/billing/manual-payment-service";
import {
  getCurrentSubscription,
  getEntitlementSnapshot,
  getPlanByCode,
  reserveQuota,
  withResourceLimitGate,
} from "@/modules/billing/entitlements";
import { PLAN_ERROR_CODES } from "@/modules/billing/errors";
import { USAGE_EVENT_AI_REPLY } from "@/modules/billing/period";
import * as billingRepo from "@/modules/billing/repository";
import { upsertPlatformAdmin } from "@/modules/platform-admin/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
import { clearTestCookies } from "../helpers/cookies";
import { performBillingAdminAction } from "@/modules/billing/admin-operations";
import { listBillingDocuments } from "@/modules/billing/documents";
import { listConfirmedRefundsForGroupFinance } from "@/modules/billing/group-finance-refunds";
import { eventIdForBillingRefund, eventIdForManualPaymentConfirmation,
  sourcePaymentIdForManualRequest, sourceRefundIdForBillingRefund } from "@/modules/billing/saas-financial-contract";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbEnvOk = dbEnvConfigured();
const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1"
  && /(?:test|isolated)/i.test(process.env.DB_NAME ?? "");

async function onboardUser(email: string) {
  const password = "ManualBill!23456";
  const signed = await signup({
    fullName: "Manual Billing Tester",
    email,
    password,
  });
  const onboarding = await completeOnboarding({
    userId: signed.user.userId,
    business: {
      name: `Biz ${email.slice(0, 12)}`,
      category: "عام",
      countryCode: "SA",
      locale: "ar-SA",
      timezone: "Asia/Riyadh",
    },
    location: null,
    agent: {
      name: "موظف الاستقبال",
      roleTitle: "موظف استقبال",
      language: "ar",
      dialect: null,
      tone: "مهني",
      instructions: null,
    },
    knowledgeItems: [
      {
        category: "ABOUT",
        title: "عن النشاط",
        content: "معرفة اختبار الفوترة",
      },
    ],
  });
  return {
    userId: signed.user.userId,
    businessId: onboarding.business.businessId,
    password,
  };
}

async function makeAdmin() {
  const admin = await signup({
    fullName: "Platform Admin",
    email: `mb_admin_${randomUUID().slice(0, 8)}@example.com`,
    password: "AdminBill!23456",
  });
  await upsertPlatformAdmin({
    userId: admin.user.userId,
    role: "SUPER_ADMIN",
  });
  return admin.user.userId;
}

describe.runIf(dbEnvOk && isolated)("manual instapay billing lifecycle", () => {
  beforeAll(async () => {
    try {
      await getDbConfig();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }
  });

  afterAll(async () => {
    clearTestCookies();
    await closePool().catch(() => undefined);
  });

  it("V2: invoices precede payment; annual approval issues exactly one receipt", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`v2_year_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const intent = await createManualPaymentIntent({ ...ctx, planCode: "STARTER", billingInterval: "ANNUAL" });
    expect(intent.amount).toBe(499 * 12);
    const before = await listBillingDocuments(ctx.businessId);
    expect(before).toHaveLength(1);
    expect(before[0].Status).toBe("OPEN");
    expect(before[0].ReceiptNumber).toBeNull();
    await confirmManualPaymentTransfer({ ...ctx, paymentRequestId: intent.paymentRequestId, payerName: "Annual" });
    const results = await Promise.all([1, 2].map(() => approveManualPayment({ paymentRequestId: intent.paymentRequestId, reviewerUserId: admin })));
    expect(results.filter(r => !r.alreadyApproved)).toHaveLength(1);
    const sub = results[0].subscription;
    expect(sub.periodEndUtc!.getTime() - sub.periodStartUtc!.getTime()).toBeGreaterThan(364 * 86400000);
    const after = await listBillingDocuments(ctx.businessId);
    expect(after).toHaveLength(1);
    expect(after[0].Status).toBe("PAID");
    expect(after[0].ReceiptNumber).not.toBeNull();
    expect(Number(after[0].TotalMinor)).toBe(499 * 12 * 100);
  });

  it("V2: full discount settles as waived and never issues a cash receipt", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`v2_waive_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const intent = await createManualPaymentIntent({ ...ctx, planCode: "PRO" });
    await performBillingAdminAction({ paymentRequestId: intent.paymentRequestId, actorUserId: admin,
      action: "discount", discountPercent: 100, reason: "Approved complimentary subscription" });
    await approveManualPayment({ paymentRequestId: intent.paymentRequestId, reviewerUserId: admin });
    const docs = await listBillingDocuments(ctx.businessId);
    expect(docs[0].Status).toBe("WAIVED");
    expect(docs[0].ReceiptNumber).toBeNull();
    expect(Number(docs[0].TotalMinor)).toBe(0);
    expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("PRO");
  });

  it("V2: grace retains paid access until five days have elapsed", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`v2_grace_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const payment = await submitManualPaymentRequest({ ...ctx, planCode: "PRO", payerName: "Grace" });
    const result = await approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: admin });
    await billingRepo.updateSubscriptionBillingFields({ subscriptionId: result.subscription.subscriptionId, periodEndUtc: new Date(Date.now() - 4 * 86400000) });
    expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("PRO");
    await billingRepo.updateSubscriptionBillingFields({ subscriptionId: result.subscription.subscriptionId, periodEndUtc: new Date(Date.now() - 6 * 86400000) });
    expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("FREE");
  });

  it("V2: a paid downgrade preserves the higher plan until the effective date", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`v2_down_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const high = await submitManualPaymentRequest({ ...ctx, planCode: "PRO", payerName: "High" });
    await approveManualPayment({ paymentRequestId: high.paymentRequestId, reviewerUserId: admin });
    const low = await submitManualPaymentRequest({ ...ctx, planCode: "STARTER", payerName: "Low" });
    await approveManualPayment({ paymentRequestId: low.paymentRequestId, reviewerUserId: admin });
    expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("PRO");
    await query(`UPDATE TblBillingScheduledChange SET EffectiveAtUtc = DATEADD(SECOND, -1, SYSUTCDATETIME()) WHERE BusinessID = @b AND State = N'PENDING'`, [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }]);
    expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("STARTER");
  });

  it("V2: refund confirmation is idempotent, preserves receipt and cancels its subscription", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const financialNames = [
      "DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED", "DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED",
      "DRVO_SAAS_FINANCIAL_DELIVERY_ENABLED", "DRVO_SAAS_FINANCIAL_RECONCILIATION_ENABLED",
      "DRVO_SAAS_FINANCIAL_ENDPOINT", "DRVO_SAAS_FINANCIAL_SOURCE_KEY",
      "DRVO_SAAS_FINANCIAL_SOURCE_STATUS", "DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT",
      "DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT", "DRVO_GROUP_FINANCE_EXPORT_TOKEN",
      "DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY",
    ] as const;
    const originalEnv = financialNames.map(name => [name, process.env[name]] as const);
    process.env.DRVO_SAAS_FINANCIAL_ENDPOINT = "https://hub.example.com/api/saas-financial/v1/events";
    process.env.DRVO_SAAS_FINANCIAL_SOURCE_KEY = "drvo-autorespond";
    process.env.DRVO_SAAS_FINANCIAL_SOURCE_STATUS = "active";
    process.env.DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT = "2026-10-18T04:59:46.821598Z";
    process.env.DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT = "2026-10-18T04:59:46.821598Z";
    process.env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED = "1";
    process.env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED = "1";
    process.env.DRVO_SAAS_FINANCIAL_DELIVERY_ENABLED = "0";
    process.env.DRVO_SAAS_FINANCIAL_RECONCILIATION_ENABLED = "0";
    delete process.env.DRVO_GROUP_FINANCE_EXPORT_TOKEN;
    try {
      const ctx = await onboardUser(`v2_refund_${randomUUID().slice(0, 8)}@example.com`);
      const admin = await makeAdmin();
      const payment = await submitManualPaymentRequest({ ...ctx, planCode: "PRO", payerName: "Refund" });
      await approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: admin });
      const originalPaymentId = sourcePaymentIdForManualRequest(payment.paymentRequestId);
      const paymentEvents = (await query<{ EventID: string; SourcePaymentID: string; SourceKey: string }>(
        `SELECT EventID, SourcePaymentID, SourceKey FROM dbo.TblSaasFinancialOutbox
         WHERE PaymentRequestID=@payment AND EventType=N'payment.confirmed'`, [
          { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        ])).recordset;
      expect(paymentEvents).toHaveLength(1);
      expect(paymentEvents[0]).toMatchObject({
        EventID: eventIdForManualPaymentConfirmation(payment.paymentRequestId),
        SourcePaymentID: originalPaymentId, SourceKey: "drvo-autorespond",
      });
      const base = { paymentRequestId: payment.paymentRequestId, actorUserId: admin, reason: "Customer cancellation" };
      process.env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED = "0";
      await expect(performBillingAdminAction({ ...base, action: "request_refund" }))
        .rejects.toThrow("يلزم تفعيل دعم الاسترداد");
      process.env.DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED = "1";
      process.env.DRVO_GROUP_FINANCE_EXPORT_TOKEN = "A".repeat(64);
      process.env.DRVO_GROUP_FINANCE_REFUNDS_CONSUMER_READY = "0";
      await expect(performBillingAdminAction({ ...base, action: "request_refund" }))
        .rejects.toThrow("يلزم تفعيل دعم الاسترداد");
      delete process.env.DRVO_GROUP_FINANCE_EXPORT_TOKEN;
      await performBillingAdminAction({ ...base, action: "request_refund" });
      expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("PRO");
      process.env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED = "0";
      await expect(performBillingAdminAction({ ...base, action: "confirm_refund",
        transferReference: "test-transfer" })).rejects.toThrow("يلزم تفعيل دعم الاسترداد");
      const pending = (await query<{ State: string }>(
        "SELECT State FROM dbo.TblBillingRefund WHERE PaymentRequestID=@payment", [
          { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        ])).recordset;
      expect(pending).toHaveLength(1);
      expect(pending[0].State).toBe("PENDING");
      expect((await query(
        `SELECT EventID FROM dbo.TblSaasFinancialOutbox
         WHERE PaymentRequestID=@payment AND EventType=N'payment.refunded'`, [
          { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        ])).recordset).toHaveLength(0);
      expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("PRO");
      process.env.DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED = "1";
      await performBillingAdminAction({ ...base, action: "confirm_refund", transferReference: "test-transfer" });
      expect((await performBillingAdminAction({ ...base, action: "confirm_refund", transferReference: "test-transfer" })).status).toBe("already_completed");
      expect((await getEntitlementSnapshot(ctx.businessId)).plan?.code).toBe("FREE");
      const docs = await listBillingDocuments(ctx.businessId);
      expect(docs[0].Status).toBe("PAID");
      expect(docs[0].RefundState).toBe("SUCCEEDED");
      expect(docs[0].ReceiptNumber).not.toBeNull();
      const refundEvents = (await query<{ RefundID: string; EventID: string; SourceRefundID: string;
        SourcePaymentID: string; SourceKey: string; Payload: string }>(
        `SELECT RefundID, EventID, SourceRefundID, SourcePaymentID, SourceKey, Payload
         FROM dbo.TblSaasFinancialOutbox
         WHERE PaymentRequestID=@payment AND EventType=N'payment.refunded'`, [
          { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        ])).recordset;
      expect(refundEvents).toHaveLength(1);
      expect(refundEvents[0]).toMatchObject({
        EventID: eventIdForBillingRefund(refundEvents[0].RefundID),
        SourceRefundID: sourceRefundIdForBillingRefund(refundEvents[0].RefundID),
        SourcePaymentID: originalPaymentId, SourceKey: "drvo-autorespond",
      });
      expect(JSON.parse(refundEvents[0].Payload)).toMatchObject({
        type: "payment.refunded", original_source_payment_id: originalPaymentId,
        source_refund_id: refundEvents[0].SourceRefundID,
        amount_minor: Number(docs[0].TotalMinor), currency: "EGP",
      });
      const refunds = await listConfirmedRefundsForGroupFinance({ limit: "250" });
      const matching = refunds.events.filter(event => event.originalPaymentRequestId === payment.paymentRequestId.toLowerCase());
      expect(matching).toHaveLength(1);
      expect(matching[0]).toMatchObject({
        eventType: "REFUND_CONFIRMED", sourceEntity: "BILLING_REFUND",
        amountMinor: Number(docs[0].TotalMinor), currency: "EGP",
      });
      expect(refunds.nextCursor).toBeTruthy();
    } finally {
      for (const [name, value] of originalEnv) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("seeds exact V1 pricing and limits", async () => {
    const starter = await getPlanByCode("STARTER");
    const pro = await getPlanByCode("PRO");
    const business = await getPlanByCode("BUSINESS");
    const free = await getPlanByCode("FREE");
    expect(free?.displayName).toBe("مجاني");
    expect(free?.monthlyPriceAmount).toBe(0);
    expect(starter?.displayName).toBe("بداية");
    expect(starter?.monthlyPriceAmount).toBe(499);
    expect(starter?.maxActiveKnowledgeItems).toBe(200);
    expect(starter?.monthlyAiReplies).toBe(3000);
    expect(pro?.displayName).toBe("احترافي");
    expect(pro?.monthlyPriceAmount).toBe(999);
    expect(pro?.maxWhatsAppConnections).toBe(2);
    expect(business?.displayName).toBe("أعمال");
    expect(business?.monthlyPriceAmount).toBe(1999);
    expect(business?.monthlyAiReplies).toBe(30000);
    expect(business?.maxAgents).toBe(15);
  });

  it("rejects FREE payment", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_free_${randomUUID().slice(0, 8)}@example.com`);
    await expect(
      createManualPaymentIntent({
        businessId: ctx.businessId,
        userId: ctx.userId,
        planCode: "FREE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("REFERENCE FLOW: DRV exists before transfer; abandoned is not admin pending", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_ref_${randomUUID().slice(0, 8)}@example.com`);

    const intent = await createManualPaymentIntent({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
    });
    expect(intent.status).toBe("AWAITING_TRANSFER");
    expect(intent.paymentReference).toMatch(/^DRV-[A-Z2-9]{6}$/);
    expect(intent.amount).toBe(499);
    expect(intent.requestedPlanCode).toBe("STARTER");
    expect(intent.payerName).toBeNull();

    const resumed = await createManualPaymentIntent({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
    });
    expect(resumed.paymentRequestId).toBe(intent.paymentRequestId);
    expect(resumed.paymentReference).toBe(intent.paymentReference);

    const adminPending = await listPaymentsForAdmin({ status: "PENDING" });
    expect(
      adminPending.some((p) => p.paymentRequestId === intent.paymentRequestId),
    ).toBe(false);

    const overview = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblManualPaymentRequest
       WHERE PaymentRequestID = @id AND Status = N'PENDING'`,
      [
        {
          name: "id",
          type: sql.UniqueIdentifier,
          value: intent.paymentRequestId,
        },
      ],
    );
    expect(Number(overview.recordset[0]?.Cnt)).toBe(0);
  });

  it("confirm → PENDING; double confirm idempotent; duplicate open protected", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_ok_${randomUUID().slice(0, 8)}@example.com`);

    const intent = await createManualPaymentIntent({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
    });
    const first = await confirmManualPaymentTransfer({
      businessId: ctx.businessId,
      userId: ctx.userId,
      paymentRequestId: intent.paymentRequestId,
      payerName: "أحمد",
      transferReference: "TX-1",
    });
    expect(first.status).toBe("PENDING");
    expect(first.paymentReference).toBe(intent.paymentReference);
    expect(first.amount).toBe(499);

    const again = await confirmManualPaymentTransfer({
      businessId: ctx.businessId,
      userId: ctx.userId,
      paymentRequestId: intent.paymentRequestId,
      payerName: "أحمد",
    });
    expect(again.paymentRequestId).toBe(first.paymentRequestId);
    expect(again.status).toBe("PENDING");

    await expect(
      createManualPaymentIntent({
        businessId: ctx.businessId,
        userId: ctx.userId,
        planCode: "PRO",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const admin = await makeAdmin();
    const approved = await approveManualPayment({
      paymentRequestId: first.paymentRequestId,
      reviewerUserId: admin,
    });
    expect(approved.alreadyApproved).toBe(false);
    expect(approved.subscription.status).toBe("ACTIVE");

    const idempotent = await approveManualPayment({
      paymentRequestId: first.paymentRequestId,
      reviewerUserId: admin,
    });
    expect(idempotent.alreadyApproved).toBe(true);
    expect(idempotent.subscription.subscriptionId).toBe(
      approved.subscription.subscriptionId,
    );

    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("STARTER");
    expect(snap.plan?.monthlyAiReplies).toBe(3000);

    const currents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblSubscription
       WHERE BusinessID = @b AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(currents.recordset[0]?.Cnt)).toBe(1);
  });

  it("PRICE SNAPSHOT: approve at locked 999 after live price becomes 1199", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_snap_${randomUUID().slice(0, 8)}@example.com`);
    const pro = await getPlanByCode("PRO");
    expect(pro).toBeTruthy();

    const intent = await createManualPaymentIntent({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
    });
    expect(intent.amount).toBe(999);

    await confirmManualPaymentTransfer({
      businessId: ctx.businessId,
      userId: ctx.userId,
      paymentRequestId: intent.paymentRequestId,
      payerName: "Snapshot",
    });

    await query(
      `UPDATE TblPlan SET MonthlyPriceAmount = 1199, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE PlanID = @planId`,
      [
        {
          name: "planId",
          type: sql.UniqueIdentifier,
          value: pro!.planId,
        },
      ],
    );

    try {
      const admin = await makeAdmin();
      const approved = await approveManualPayment({
        paymentRequestId: intent.paymentRequestId,
        reviewerUserId: admin,
      });
      expect(approved.alreadyApproved).toBe(false);
      expect(approved.priceChangedWarning).toBe(true);
      expect(approved.payment.amount).toBe(999);

      const snap = await getEntitlementSnapshot(ctx.businessId);
      expect(snap.plan?.code).toBe("PRO");
    } finally {
      await query(
        `UPDATE TblPlan SET MonthlyPriceAmount = 999, UpdatedAtUtc = SYSUTCDATETIME()
         WHERE PlanID = @planId`,
        [
          {
            name: "planId",
            type: sql.UniqueIdentifier,
            value: pro!.planId,
          },
        ],
      );
    }
  });

  it("AUDIT: approval/rejection/submit roll back when audit fails", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_aud_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();

    const intent = await createManualPaymentIntent({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
    });

    process.env.DRVOWA_TEST_AUDIT_FAIL = "1";
    try {
      await expect(
        confirmManualPaymentTransfer({
          businessId: ctx.businessId,
          userId: ctx.userId,
          paymentRequestId: intent.paymentRequestId,
          payerName: "AuditFail",
        }),
      ).rejects.toThrow(/forced audit failure/);

      const afterFail = await query<{ Status: string }>(
        `SELECT Status FROM TblManualPaymentRequest WHERE PaymentRequestID = @id`,
        [
          {
            name: "id",
            type: sql.UniqueIdentifier,
            value: intent.paymentRequestId,
          },
        ],
      );
      expect(afterFail.recordset[0]?.Status).toBe("AWAITING_TRANSFER");
    } finally {
      delete process.env.DRVOWA_TEST_AUDIT_FAIL;
    }

    const pending = await confirmManualPaymentTransfer({
      businessId: ctx.businessId,
      userId: ctx.userId,
      paymentRequestId: intent.paymentRequestId,
      payerName: "AuditOk",
    });
    expect(pending.status).toBe("PENDING");

    process.env.DRVOWA_TEST_AUDIT_FAIL = "1";
    try {
      await expect(
        approveManualPayment({
          paymentRequestId: pending.paymentRequestId,
          reviewerUserId: admin,
        }),
      ).rejects.toThrow(/forced audit failure/);

      const stillPending = await query<{ Status: string }>(
        `SELECT Status FROM TblManualPaymentRequest WHERE PaymentRequestID = @id`,
        [
          {
            name: "id",
            type: sql.UniqueIdentifier,
            value: pending.paymentRequestId,
          },
        ],
      );
      expect(stillPending.recordset[0]?.Status).toBe("PENDING");

      const snap = await getEntitlementSnapshot(ctx.businessId);
      expect(snap.plan?.code).toBe("FREE");
    } finally {
      delete process.env.DRVOWA_TEST_AUDIT_FAIL;
    }

    process.env.DRVOWA_TEST_AUDIT_FAIL = "1";
    try {
      await expect(
        rejectManualPayment({
          paymentRequestId: pending.paymentRequestId,
          reviewerUserId: admin,
          reviewNote: "should roll back",
        }),
      ).rejects.toThrow(/forced audit failure/);

      const stillPending2 = await query<{ Status: string }>(
        `SELECT Status FROM TblManualPaymentRequest WHERE PaymentRequestID = @id`,
        [
          {
            name: "id",
            type: sql.UniqueIdentifier,
            value: pending.paymentRequestId,
          },
        ],
      );
      expect(stillPending2.recordset[0]?.Status).toBe("PENDING");
    } finally {
      delete process.env.DRVOWA_TEST_AUDIT_FAIL;
    }
  });

  it("rejects without activating plan", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_rej_${randomUUID().slice(0, 8)}@example.com`);
    const req = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
      payerName: "سارة",
    });
    const admin = await makeAdmin();
    const rejected = await rejectManualPayment({
      paymentRequestId: req.paymentRequestId,
      reviewerUserId: admin,
      reviewNote: "لم يصل التحويل",
    });
    expect(rejected.status).toBe("REJECTED");
    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("FREE");
  });

  it("same-plan renewal extends expiry; upgrade starts new month", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_ren_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();

    const firstReq = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "Renew",
    });
    const first = await approveManualPayment({
      paymentRequestId: firstReq.paymentRequestId,
      reviewerUserId: admin,
    });

    const farEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await billingRepo.updateSubscriptionBillingFields({
      subscriptionId: first.subscription.subscriptionId,
      periodEndUtc: farEnd,
    });

    const renewReq = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "Renew",
    });
    const renewed = await approveManualPayment({
      paymentRequestId: renewReq.paymentRequestId,
      reviewerUserId: admin,
    });
    expect(renewed.subscription.periodStartUtc?.getTime()).toBe(farEnd.getTime());
    expect(
      renewed.subscription.periodEndUtc!.getTime(),
    ).toBeGreaterThan(farEnd.getTime());

    const upgradeReq = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
      payerName: "Upgrade",
    });
    const beforeUpgrade = Date.now();
    const upgraded = await approveManualPayment({
      paymentRequestId: upgradeReq.paymentRequestId,
      reviewerUserId: admin,
    });
    expect(upgraded.subscription.planId).not.toBe(renewed.subscription.planId);
    expect(
      upgraded.subscription.periodStartUtc!.getTime(),
    ).toBeGreaterThanOrEqual(beforeUpgrade - 5000);
    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("PRO");
  });

  it("EXPIRY: reserveQuota + resource gate use FREE immediately without dashboard", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_exp_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const req = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "Exp",
    });
    const approved = await approveManualPayment({
      paymentRequestId: req.paymentRequestId,
      reviewerUserId: admin,
    });
    await billingRepo.updateSubscriptionBillingFields({
      subscriptionId: approved.subscription.subscriptionId,
      periodEndUtc: new Date("2020-01-01T00:00:00.000Z"),
    });

    // Do NOT call getEntitlementSnapshot first — hit quota gate directly.
    await reserveQuota({
      businessId: ctx.businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: `exp-ai-${randomUUID()}`,
    });

    const current = await getCurrentSubscription(ctx.businessId);
    const free = await getPlanByCode("FREE");
    expect(current?.planId).toBe(free?.planId);
    expect(free?.monthlyAiReplies).toBe(500);

    await expect(
      withResourceLimitGate({
        businessId: ctx.businessId,
        kind: "agent",
        createFn: async () => {
          throw new Error("should not create — FREE agent limit already at 1");
        },
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.AGENT_LIMIT });

    const currents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblSubscription
       WHERE BusinessID = @b AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(currents.recordset[0]?.Cnt)).toBe(1);

    const agents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblAgent WHERE BusinessID = @b`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(agents.recordset[0]?.Cnt)).toBeGreaterThanOrEqual(1);
  });

  it("EXPIRY concurrency: parallel reconciles leave one current FREE", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const ctx = await onboardUser(`mb_conc_${randomUUID().slice(0, 8)}@example.com`);
    const admin = await makeAdmin();
    const req = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
      payerName: "Conc",
    });
    const approved = await approveManualPayment({
      paymentRequestId: req.paymentRequestId,
      reviewerUserId: admin,
    });
    await billingRepo.updateSubscriptionBillingFields({
      subscriptionId: approved.subscription.subscriptionId,
      periodEndUtc: new Date("2019-06-01T00:00:00.000Z"),
    });

    const { ensureCurrentSubscriptionEntitlements } = await import(
      "@/modules/billing/subscription-entitlement-lifecycle"
    );

    await Promise.all([
      ensureCurrentSubscriptionEntitlements(ctx.businessId),
      ensureCurrentSubscriptionEntitlements(ctx.businessId),
      ensureCurrentSubscriptionEntitlements(ctx.businessId),
      reserveQuota({
        businessId: ctx.businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: `conc-a-${randomUUID()}`,
      }),
      reserveQuota({
        businessId: ctx.businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: `conc-b-${randomUUID()}`,
      }),
    ]);

    const currents = await query<{ Cnt: number; PlanCode: string }>(
      `SELECT COUNT(1) AS Cnt, MAX(p.Code) AS PlanCode
       FROM TblSubscription s
       INNER JOIN TblPlan p ON p.PlanID = s.PlanID
       WHERE s.BusinessID = @b
         AND s.Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(currents.recordset[0]?.Cnt)).toBe(1);
    expect(currents.recordset[0]?.PlanCode).toBe("FREE");
  });
});
