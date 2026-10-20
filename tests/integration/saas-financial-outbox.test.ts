import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool, query, sql } from "@/lib/db";
import { signup } from "@/modules/auth/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { upsertPlatformAdmin } from "@/modules/platform-admin/service";
import {
  approveManualPayment,
  createManualPaymentIntent,
  rejectManualPayment,
  submitManualPaymentRequest,
} from "@/modules/billing/manual-payment-service";
import { getCurrentSubscription, getPlanByCode } from "@/modules/billing/entitlements";
import { eventIdForManualPaymentConfirmation } from "@/modules/billing/saas-financial-contract";
import { claimFinancialEvent, settleFinancialEvent } from "@/modules/billing/saas-financial-delivery-repository";
import { loadLocalEvidence } from "@/modules/billing/saas-financial-reconciliation-repository";
import { performBillingAdminAction } from "@/modules/billing/admin-operations";
import { eventIdForBillingRefund, sourceRefundIdForBillingRefund } from "@/modules/billing/saas-financial-contract";

// Opt in only after the operator has verified a disposable SQL Server database
// with migrations 029–031 applied. No test here executes migrations.
const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1"
  && /(?:test|isolated)/i.test(process.env.DB_NAME ?? "");

async function context() {
  const suffix = randomUUID().slice(0, 8);
  const user = await signup({
    fullName: "Financial Capture Tester",
    email: `finance_${suffix}@example.com`,
    password: "FinanceTest!23456",
  });
  const onboarding = await completeOnboarding({
    userId: user.user.userId,
    business: {
      name: `Finance ${suffix}`, category: "عام", countryCode: "SA",
      locale: "ar-SA", timezone: "Asia/Riyadh",
    },
    location: null,
    agent: {
      name: "Finance Agent", roleTitle: "Agent", language: "ar", dialect: null,
      tone: "مهني", instructions: null,
    },
    knowledgeItems: [{ category: "ABOUT", title: "About", content: "Test business" }],
  });
  const admin = await signup({
    fullName: "Financial Admin",
    email: `finance_admin_${suffix}@example.com`,
    password: "FinanceAdmin!23456",
  });
  await upsertPlatformAdmin({ userId: admin.user.userId, role: "SUPER_ADMIN" });
  return {
    businessId: onboarding.business.businessId,
    userId: user.user.userId,
    adminId: admin.user.userId,
  };
}

function captureConfig(cutoff: Date = new Date(Date.now() - 60_000)) {
  vi.stubEnv("MANUAL_INSTAPAY_ENABLED", "1");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_ENDPOINT", "https://hub.example.com/api/saas-financial/v1/events");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_KEY", "AUTORESPOND_ISOLATED_TEST");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_STATUS", "active");
  vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT",
    new Date(cutoff.getTime() - 60_000).toISOString());
  vi.stubEnv("DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT", cutoff.toISOString());
  vi.stubEnv("DRVO_SAAS_FINANCIAL_CAPTURE_ENABLED", "1");
}

async function rows(paymentRequestId: string) {
  const result = await query<{
    EventID: string; SourcePaymentID: string; Payload: string;
    OccurredAtText: string; AmountMinor: string; CurrencyCode: string;
  }>(
    `SELECT EventID, SourcePaymentID, Payload, CurrencyCode,
            CONVERT(varchar(27), OccurredAtUtc, 126) AS OccurredAtText,
            CONVERT(varchar(20), AmountMinor) AS AmountMinor
     FROM dbo.TblSaasFinancialOutbox WHERE PaymentRequestID = @id`,
    [{ name: "id", type: sql.UniqueIdentifier, value: paymentRequestId }],
  );
  return result.recordset;
}

describe.runIf(isolated)("financial outbox on verified isolated SQL Server", () => {
  beforeAll(async () => {
    const result = await query<{ Id: number | null }>(
      "SELECT OBJECT_ID(N'dbo.TblSaasFinancialOutbox', N'U') AS Id",
    );
    if (!result.recordset[0]?.Id) throw new Error("Apply migration 029 to the isolated test DB first");
    const hardening = await query<{ Version: string }>(
      "SELECT Version FROM dbo.TblSchemaMigration WHERE Version = N'031'");
    if (!hardening.recordset.length) throw new Error("Apply migration 031 to the isolated test DB first");
    const scales = await query<{ Name: string; Scale: number }>(
      `SELECT c.name AS Name, c.scale AS Scale
       FROM sys.columns c
       WHERE c.object_id IN (OBJECT_ID(N'dbo.TblManualPaymentRequest'),
                             OBJECT_ID(N'dbo.TblSaasFinancialOutbox'))
         AND c.name IN (N'ReviewedAtUtc', N'OccurredAtUtc')`,
    );
    expect(Object.fromEntries(scales.recordset.map(row => [row.Name, row.Scale])))
      .toEqual({ ReviewedAtUtc: 7, OccurredAtUtc: 3 });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await closePool(); });

  it("captures once across concurrent and repeated approvals with exact facts", async () => {
    captureConfig();
    const claimSource = `AUTORESPOND_LEASE_TEST_${randomUUID().slice(0, 12)}`;
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_KEY", claimSource);
    const ctx = await context();
    const payment = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId,
      planCode: "STARTER", payerName: "Capture",
    });
    const [a, b] = await Promise.all([
      approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId }),
      approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId }),
    ]);
    expect([a.alreadyApproved, b.alreadyApproved].sort()).toEqual([false, true]);
    await approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId });
    const captured = await rows(payment.paymentRequestId);
    expect(captured).toHaveLength(1);
    const event = JSON.parse(captured[0].Payload);
    expect(Object.keys(event)).toHaveLength(7);
    expect(event).toMatchObject({
      event_id: eventIdForManualPaymentConfirmation(payment.paymentRequestId),
      source_payment_id: `autorespond:manual-payment:${payment.paymentRequestId}`,
      amount_minor: 49_900, currency: "EGP",
    });
    expect(captured[0].AmountMinor).toBe("49900");
    expect(captured[0].OccurredAtText.slice(0, 23)).toBe(event.occurred_at.slice(0, 23));
    expect(event.occurred_at).toMatch(/\.\d{3}000Z$/);
    await expect(query(
      `UPDATE dbo.TblSaasFinancialOutbox SET Payload = N'{}' WHERE EventID = @eventId`,
      [{ name: "eventId", type: sql.NVarChar(150), value: event.event_id }],
    )).rejects.toThrow();

    const [first, concurrent] = await Promise.all([
      claimFinancialEvent(claimSource, 60), claimFinancialEvent(claimSource, 60),
    ]);
    expect([first, concurrent].filter(Boolean)).toHaveLength(1);
    const owned = first ?? concurrent!;
    expect(owned.eventId).toBe(event.event_id);
    await query(
      `UPDATE dbo.TblSaasFinancialOutbox SET LeaseUntilUtc = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE EventID = @eventId`,
      [{ name: "eventId", type: sql.NVarChar(150), value: event.event_id }],
    );
    const recovered = await claimFinancialEvent(claimSource, 60);
    expect(recovered?.leaseToken).not.toBe(owned.leaseToken);
    expect(recovered?.attemptCount).toBe(2);
    expect(await settleFinancialEvent(owned, { state: "ACCEPTED", errorCode: null })).toBe(false);
    expect(await settleFinancialEvent(recovered!, { state: "PENDING", errorCode: "UNCERTAIN_RESPONSE", delayMs: 0 })).toBe(true);
    const restartClaim = await claimFinancialEvent(claimSource, 60);
    expect(restartClaim?.eventId).toBe(event.event_id);
    expect(restartClaim?.attemptCount).toBe(3);
    expect(await settleFinancialEvent(restartClaim!, { state: "ACCEPTED", errorCode: null })).toBe(true);
    expect(await claimFinancialEvent(claimSource, 60)).toBeNull();
  });

  it("atomically captures one successful refund; failed refunds and duplicate confirmations add none", async () => {
    const migration = await query<{ Version: string }>(
      "SELECT Version FROM dbo.TblSchemaMigration WHERE Version=N'033'");
    if (!migration.recordset.length) throw new Error("Apply migration 033 to the isolated test DB first");
    captureConfig();
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_KEY", "drvo-autorespond");
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT", "2026-10-18T04:59:46.821598Z");
    vi.stubEnv("DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED", "1");
    const ctx = await context();
    const payment = await submitManualPaymentRequest({ businessId: ctx.businessId,
      userId: ctx.userId, planCode: "STARTER", payerName: "Refund capture" });
    await approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId });
    const base = { paymentRequestId: payment.paymentRequestId, actorUserId: ctx.adminId,
      reason: "Verified transfer" };
    await performBillingAdminAction({ ...base, action: "request_refund" });
    const confirmations = await Promise.all([
      performBillingAdminAction({ ...base, action: "confirm_refund", transferReference: "transfer-1" }),
      performBillingAdminAction({ ...base, action: "confirm_refund", transferReference: "transfer-1" }),
    ]);
    expect(confirmations.map(row => row.status).sort()).toEqual(["already_completed", "completed"]);
    const facts = await query<{ RefundID: string; AmountMinor: string; SourceRefundID: string;
      EventID: string; Payload: string }>(`SELECT o.RefundID,CONVERT(varchar(20),o.AmountMinor) AS AmountMinor,
      o.SourceRefundID,o.EventID,o.Payload FROM dbo.TblSaasFinancialOutbox o
      WHERE o.PaymentRequestID=@payment AND o.EventType=N'payment.refunded'`, [
      { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId }]);
    expect(facts.recordset).toHaveLength(1);
    const fact = facts.recordset[0];
    expect(fact.EventID).toBe(eventIdForBillingRefund(fact.RefundID));
    expect(fact.SourceRefundID).toBe(sourceRefundIdForBillingRefund(fact.RefundID));
    expect(JSON.parse(fact.Payload)).toMatchObject({ type: "payment.refunded",
      original_source_payment_id: `autorespond:manual-payment:${payment.paymentRequestId}`,
      amount_minor: Number(fact.AmountMinor) });
    const evidence = await loadLocalEvidence("drvo-autorespond",
      process.env.DRVO_SAAS_FINANCIAL_CAPTURE_CUTOFF_AT!);
    expect(evidence.refunds).toContainEqual(expect.objectContaining({ refundId: fact.RefundID,
      paymentRequestId: payment.paymentRequestId, amountMinor: fact.AmountMinor, state: "SUCCEEDED" }));
    expect(evidence.outbox).toContainEqual(expect.objectContaining({ eventId: fact.EventID,
      refundId: fact.RefundID, sourceRefundId: fact.SourceRefundID, eventType: "payment.refunded" }));
    const second = await context();
    const failedPayment = await submitManualPaymentRequest({ businessId: second.businessId,
      userId: second.userId, planCode: "STARTER", payerName: "Failed refund" });
    await approveManualPayment({ paymentRequestId: failedPayment.paymentRequestId, reviewerUserId: second.adminId });
    const failedBase = { paymentRequestId: failedPayment.paymentRequestId,
      actorUserId: second.adminId, reason: "Transfer failed" };
    await performBillingAdminAction({ ...failedBase, action: "request_refund" });
    await performBillingAdminAction({ ...failedBase, action: "fail_refund" });
    expect((await rows(failedPayment.paymentRequestId)).filter(row => JSON.parse(row.Payload).type === "payment.refunded"))
      .toHaveLength(0);
  });

  it("rolls back successful refund state when immutable outbox identity conflicts", async () => {
    const migration = await query<{ Version: string }>(
      "SELECT Version FROM dbo.TblSchemaMigration WHERE Version=N'033'");
    if (!migration.recordset.length) throw new Error("Apply migration 033 to the isolated test DB first");
    captureConfig();
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_KEY", "drvo-autorespond");
    vi.stubEnv("DRVO_SAAS_FINANCIAL_SOURCE_ACTIVATED_AT", "2026-10-18T04:59:46.821598Z");
    vi.stubEnv("DRVO_SAAS_FINANCIAL_REFUND_CAPTURE_ENABLED", "1");
    const ctx = await context();
    const payment = await submitManualPaymentRequest({ businessId: ctx.businessId,
      userId: ctx.userId, planCode: "STARTER", payerName: "Refund rollback" });
    await approveManualPayment({ paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId });
    const base = { paymentRequestId: payment.paymentRequestId, actorUserId: ctx.adminId,
      reason: "Conflict test" };
    await performBillingAdminAction({ ...base, action: "request_refund" });
    const pending = (await query<{ RefundID: string }>(
      "SELECT RefundID FROM dbo.TblBillingRefund WHERE PaymentRequestID=@payment", [
        { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId }])).recordset[0];
    await query(`INSERT dbo.TblSaasFinancialOutbox
      (EventID,SourcePaymentID,SourceRefundID,RefundID,PaymentRequestID,BusinessID,SourceKey,
       EventType,SchemaVersion,AmountMinor,CurrencyCode,OccurredAtUtc,Payload,NextAttemptAtUtc)
      VALUES (@event,@original,@refundSource,@refund,@payment,@business,N'drvo-autorespond',
       N'payment.refunded',1,1,N'EGP',SYSUTCDATETIME(),N'{}',SYSUTCDATETIME())`, [
      { name: "event", type: sql.NVarChar(150), value: eventIdForBillingRefund(pending.RefundID) },
      { name: "original", type: sql.NVarChar(150), value: `autorespond:manual-payment:${payment.paymentRequestId}` },
      { name: "refundSource", type: sql.NVarChar(150), value: sourceRefundIdForBillingRefund(pending.RefundID) },
      { name: "refund", type: sql.UniqueIdentifier, value: pending.RefundID },
      { name: "payment", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
      { name: "business", type: sql.UniqueIdentifier, value: ctx.businessId },
    ]);
    await expect(performBillingAdminAction({ ...base, action: "confirm_refund",
      transferReference: "transfer-conflict" })).rejects.toThrow();
    expect((await query<{ State: string }>(
      "SELECT State FROM dbo.TblBillingRefund WHERE RefundID=@refund", [
        { name: "refund", type: sql.UniqueIdentifier, value: pending.RefundID }])).recordset[0].State)
      .toBe("PENDING");
    expect((await getCurrentSubscription(ctx.businessId))?.planId).not.toBe((await getPlanByCode("FREE"))?.planId);
  });

  it("rolls back payment and subscription changes when outbox insert fails", async () => {
    captureConfig();
    const ctx = await context();
    const payment = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId,
      planCode: "STARTER", payerName: "Rollback",
    });
    const eventId = eventIdForManualPaymentConfirmation(payment.paymentRequestId);
    await query(
      `INSERT INTO dbo.TblSaasFinancialOutbox
       (EventID, SourcePaymentID, PaymentRequestID, BusinessID, SourceKey,
        EventType, SchemaVersion, AmountMinor, CurrencyCode, OccurredAtUtc,
        Payload, NextAttemptAtUtc)
       VALUES (@eventId, @sourcePaymentId, @id, @businessId, N'AUTORESPOND_ISOLATED_TEST',
         N'payment.confirmed', 1, 1, N'EGP', SYSUTCDATETIME(), N'{}', SYSUTCDATETIME())`,
      [
        { name: "eventId", type: sql.NVarChar(150), value: eventId },
        { name: "sourcePaymentId", type: sql.NVarChar(150), value: `autorespond:manual-payment:${payment.paymentRequestId}` },
        { name: "id", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        { name: "businessId", type: sql.UniqueIdentifier, value: ctx.businessId },
      ],
    );
    // The disposable database retains this evidence until the database is discarded.
    await expect(approveManualPayment({
      paymentRequestId: payment.paymentRequestId, reviewerUserId: ctx.adminId,
    })).rejects.toThrow();
    const status = await query<{ Status: string }>(
      "SELECT Status FROM dbo.TblManualPaymentRequest WHERE PaymentRequestID = @id",
      [{ name: "id", type: sql.UniqueIdentifier, value: payment.paymentRequestId }],
    );
    expect(status.recordset[0].Status).toBe("PENDING");
    const free = await getPlanByCode("FREE");
    expect((await getCurrentSubscription(ctx.businessId))?.planId).toBe(free?.planId);
  });

  it("keeps differently cased sources separate and rejects fact edits and deletion", async () => {
    const source = `OUTBOX_CASE_${randomUUID().slice(0, 12)}`;
    const sourcePaymentId = `payment:${randomUUID()}`;
    const insertFor = async (sourceKey: string) => {
      const ctx = await context();
      const payment = await submitManualPaymentRequest({
        businessId: ctx.businessId, userId: ctx.userId,
        planCode: "STARTER", payerName: "Source case",
      });
      const eventId = `event:${randomUUID()}`;
      await query(`INSERT dbo.TblSaasFinancialOutbox
        (EventID,SourcePaymentID,PaymentRequestID,BusinessID,SourceKey,
         EventType,SchemaVersion,AmountMinor,CurrencyCode,OccurredAtUtc,Payload,NextAttemptAtUtc)
        VALUES (@event,@payment,@request,@business,@source,N'payment.confirmed',
         1,100,N'EGP',SYSUTCDATETIME(),N'{}',SYSUTCDATETIME())`, [
        { name: "event", type: sql.NVarChar(150), value: eventId },
        { name: "payment", type: sql.NVarChar(150), value: sourcePaymentId },
        { name: "request", type: sql.UniqueIdentifier, value: payment.paymentRequestId },
        { name: "business", type: sql.UniqueIdentifier, value: ctx.businessId },
        { name: "source", type: sql.NVarChar(100), value: sourceKey },
      ]);
      return eventId;
    };
    const lowerEvent = await insertFor(source.toLowerCase());
    const upperEvent = await insertFor(source.toUpperCase());
    await expect(insertFor(source.toLowerCase())).rejects.toThrow();

    const exact = await query<{ EventID: string }>(
      "SELECT EventID FROM dbo.TblSaasFinancialOutbox WHERE SourceKey=@source AND SourcePaymentID=@payment",
      [{ name: "source", type: sql.NVarChar(100), value: source.toLowerCase() },
        { name: "payment", type: sql.NVarChar(150), value: sourcePaymentId }]);
    expect(exact.recordset.map(row => row.EventID)).toEqual([lowerEvent]);
    expect((await claimFinancialEvent(source.toLowerCase(), 60))?.eventId).toBe(lowerEvent);
    expect((await claimFinancialEvent(source.toUpperCase(), 60))?.eventId).toBe(upperEvent);

    const target = [{ name: "event", type: sql.NVarChar(150), value: lowerEvent }];
    await expect(query("UPDATE dbo.TblSaasFinancialOutbox SET AmountMinor=101 WHERE EventID=@event", target))
      .rejects.toThrow();
    await expect(query("DELETE FROM dbo.TblSaasFinancialOutbox WHERE EventID=@event", target))
      .rejects.toThrow();
    expect((await query<{ AmountMinor: string }>(
      "SELECT CONVERT(varchar(20),AmountMinor) AS AmountMinor FROM dbo.TblSaasFinancialOutbox WHERE EventID=@event",
      target)).recordset).toEqual([{ AmountMinor: "100" }]);
  });

  it("excludes open, canceled, rejected, and pre-cutoff requests; renewals and upgrades still work", async () => {
    captureConfig();
    const ctx = await context();
    const open = await createManualPaymentIntent({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "STARTER",
    });
    expect(await rows(open.paymentRequestId)).toHaveLength(0);
    const replacement = await createManualPaymentIntent({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "PRO",
    });
    expect(await rows(open.paymentRequestId)).toHaveLength(0);
    const pending = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "PRO", payerName: "Reject",
    });
    expect(pending.paymentRequestId).toBe(replacement.paymentRequestId);
    await rejectManualPayment({ paymentRequestId: pending.paymentRequestId, reviewerUserId: ctx.adminId });
    expect(await rows(pending.paymentRequestId)).toHaveLength(0);

    captureConfig(new Date(Date.now() + 60_000));
    const old = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "STARTER", payerName: "Precutoff",
    });
    await approveManualPayment({ paymentRequestId: old.paymentRequestId, reviewerUserId: ctx.adminId });
    expect(await rows(old.paymentRequestId)).toHaveLength(0);

    captureConfig();
    const renewal = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "STARTER", payerName: "Renewal",
    });
    const renewed = await approveManualPayment({
      paymentRequestId: renewal.paymentRequestId, reviewerUserId: ctx.adminId,
    });
    expect(renewed.subscription.periodStartUtc!.getTime())
      .toBeGreaterThan(old.createdAtUtc.getTime());
    expect(await rows(renewal.paymentRequestId)).toHaveLength(1);

    const upgrade = await submitManualPaymentRequest({
      businessId: ctx.businessId, userId: ctx.userId, planCode: "PRO", payerName: "Upgrade",
    });
    const upgraded = await approveManualPayment({
      paymentRequestId: upgrade.paymentRequestId, reviewerUserId: ctx.adminId,
    });
    expect(upgraded.subscription.planId).not.toBe(renewed.subscription.planId);
    expect(await rows(upgrade.paymentRequestId)).toHaveLength(1);
  });
});
