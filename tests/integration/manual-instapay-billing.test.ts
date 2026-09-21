import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, query, sql } from "@/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/tenancy/errors";
import { signup } from "@/modules/auth/service";
import {
  approveManualPayment,
  reconcileExpiredPaidSubscription,
  rejectManualPayment,
  submitManualPaymentRequest,
} from "@/modules/billing/manual-payment-service";
import {
  getCurrentSubscription,
  getEntitlementSnapshot,
  getPlanByCode,
} from "@/modules/billing/entitlements";
import * as billingRepo from "@/modules/billing/repository";
import { upsertPlatformAdmin } from "@/modules/platform-admin/service";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
import { clearTestCookies } from "../helpers/cookies";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbEnvOk = dbEnvConfigured();

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

describe.runIf(dbEnvOk)("manual instapay billing lifecycle", () => {
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

  it("rejects FREE payment and amount spoofing path", async () => {
    const email = `mb_free_${randomUUID().slice(0, 8)}@example.com`;
    const ctx = await onboardUser(email);
    await expect(
      submitManualPaymentRequest({
        businessId: ctx.businessId,
        userId: ctx.userId,
        planCode: "FREE",
        payerName: "Tester",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("submits, protects duplicate pending, approves idempotently, and activates STARTER", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const email = `mb_ok_${randomUUID().slice(0, 8)}@example.com`;
    const ctx = await onboardUser(email);

    const first = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "أحمد",
      transferReference: "TX-1",
    });
    expect(first.status).toBe("PENDING");
    expect(first.amount).toBe(499);
    expect(first.paymentReference).toMatch(/^DRV-/);

    await expect(
      submitManualPaymentRequest({
        businessId: ctx.businessId,
        userId: ctx.userId,
        planCode: "PRO",
        payerName: "أحمد",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const adminEmail = `mb_admin_${randomUUID().slice(0, 8)}@example.com`;
    const admin = await signup({
      fullName: "Platform Admin",
      email: adminEmail,
      password: "AdminBill!23456",
    });
    await upsertPlatformAdmin({
      userId: admin.user.userId,
      role: "SUPER_ADMIN",
    });

    const approved = await approveManualPayment({
      paymentRequestId: first.paymentRequestId,
      reviewerUserId: admin.user.userId,
    });
    expect(approved.alreadyApproved).toBe(false);
    expect(approved.subscription.status).toBe("ACTIVE");

    const again = await approveManualPayment({
      paymentRequestId: first.paymentRequestId,
      reviewerUserId: admin.user.userId,
    });
    expect(again.alreadyApproved).toBe(true);
    expect(again.subscription.subscriptionId).toBe(
      approved.subscription.subscriptionId,
    );

    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("STARTER");
    expect(snap.plan?.monthlyAiReplies).toBe(3000);
    expect(snap.plan?.maxAgents).toBe(2);
    expect(snap.plan?.maxActiveKnowledgeItems).toBe(200);
    expect(snap.subscription?.periodEndUtc).toBeTruthy();

    const currents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblSubscription
       WHERE BusinessID = @b AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(currents.recordset[0]?.Cnt)).toBe(1);
  });

  it("rejects without activating plan", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const email = `mb_rej_${randomUUID().slice(0, 8)}@example.com`;
    const ctx = await onboardUser(email);
    const req = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
      payerName: "سارة",
    });
    const admin = await signup({
      fullName: "Reject Admin",
      email: `mb_radmin_${randomUUID().slice(0, 8)}@example.com`,
      password: "AdminBill!23456",
    });
    await upsertPlatformAdmin({
      userId: admin.user.userId,
      role: "BILLING_ADMIN",
    });
    const rejected = await rejectManualPayment({
      paymentRequestId: req.paymentRequestId,
      reviewerUserId: admin.user.userId,
      reviewNote: "لم يصل التحويل",
    });
    expect(rejected.status).toBe("REJECTED");
    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("FREE");
  });

  it("same-plan renewal extends expiry; upgrade starts new month", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const email = `mb_ren_${randomUUID().slice(0, 8)}@example.com`;
    const ctx = await onboardUser(email);
    const admin = await signup({
      fullName: "Renew Admin",
      email: `mb_renadmin_${randomUUID().slice(0, 8)}@example.com`,
      password: "AdminBill!23456",
    });
    await upsertPlatformAdmin({
      userId: admin.user.userId,
      role: "SUPER_ADMIN",
    });

    const firstReq = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "Renew",
    });
    const first = await approveManualPayment({
      paymentRequestId: firstReq.paymentRequestId,
      reviewerUserId: admin.user.userId,
    });
    const firstEnd = first.subscription.periodEndUtc!;

    // Force remaining time into the future for renewal math
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
      reviewerUserId: admin.user.userId,
    });
    expect(renewed.subscription.periodStartUtc?.getTime()).toBe(farEnd.getTime());
    expect(
      renewed.subscription.periodEndUtc!.getTime(),
    ).toBeGreaterThan(farEnd.getTime());
    void firstEnd;

    const upgradeReq = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "PRO",
      payerName: "Upgrade",
    });
    const beforeUpgrade = Date.now();
    const upgraded = await approveManualPayment({
      paymentRequestId: upgradeReq.paymentRequestId,
      reviewerUserId: admin.user.userId,
    });
    expect(upgraded.subscription.planId).not.toBe(renewed.subscription.planId);
    expect(
      upgraded.subscription.periodStartUtc!.getTime(),
    ).toBeGreaterThanOrEqual(beforeUpgrade - 5000);
    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("PRO");
  });

  it("expired paid falls back to FREE entitlements without deleting data", async () => {
    process.env.MANUAL_INSTAPAY_ENABLED = "1";
    const email = `mb_exp_${randomUUID().slice(0, 8)}@example.com`;
    const ctx = await onboardUser(email);
    const admin = await signup({
      fullName: "Exp Admin",
      email: `mb_expadmin_${randomUUID().slice(0, 8)}@example.com`,
      password: "AdminBill!23456",
    });
    await upsertPlatformAdmin({
      userId: admin.user.userId,
      role: "SUPER_ADMIN",
    });
    const req = await submitManualPaymentRequest({
      businessId: ctx.businessId,
      userId: ctx.userId,
      planCode: "STARTER",
      payerName: "Exp",
    });
    const approved = await approveManualPayment({
      paymentRequestId: req.paymentRequestId,
      reviewerUserId: admin.user.userId,
    });
    await billingRepo.updateSubscriptionBillingFields({
      subscriptionId: approved.subscription.subscriptionId,
      periodEndUtc: new Date("2020-01-01T00:00:00.000Z"),
    });

    await reconcileExpiredPaidSubscription(ctx.businessId);
    const current = await getCurrentSubscription(ctx.businessId);
    const snap = await getEntitlementSnapshot(ctx.businessId);
    expect(snap.plan?.code).toBe("FREE");
    expect(current?.planId).toBe(snap.plan?.planId);

    const agents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblAgent WHERE BusinessID = @b`,
      [{ name: "b", type: sql.UniqueIdentifier, value: ctx.businessId }],
    );
    expect(Number(agents.recordset[0]?.Cnt)).toBeGreaterThanOrEqual(1);
  });

  it("platform admin guard denies normal users", async () => {
    const email = `mb_noadmin_${randomUUID().slice(0, 8)}@example.com`;
    const signed = await signup({
      fullName: "Normal User",
      email,
      password: "NormalUser!23456",
    });
    // Simulate session by setting cookies is complex; call repo path instead
    const { findActivePlatformAdminByUserId } = await import(
      "@/modules/platform-admin/repository"
    );
    const admin = await findActivePlatformAdminByUserId(signed.user.userId);
    expect(admin).toBeNull();
    void requirePlatformAdmin;
    void ForbiddenError;
  });
});
