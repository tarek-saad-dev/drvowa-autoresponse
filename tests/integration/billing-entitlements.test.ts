import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import { createAgent } from "@/modules/agents/service";
import {
  consumeQuotaReservation,
  getCurrentSubscription,
  getEntitlementSnapshot,
  markQuotaReservationUncertain,
  releaseQuotaReservation,
  reserveQuota,
  withResourceLimitGate,
} from "@/modules/billing/entitlements";
import {
  PLAN_ERROR_CODES,
  PlanEntitlementError,
  isPlanEntitlementError,
} from "@/modules/billing/errors";
import {
  USAGE_EVENT_AI_REPLY,
  USAGE_EVENT_WHATSAPP_OUTBOUND,
  aiReplyReservationKey,
  resolveUtcMonthPeriod,
  waOutboundReservationKey,
} from "@/modules/billing/period";
import { ensureDefaultSubscription } from "@/modules/billing/service";
import { ensureWhatsAppConnection } from "@/modules/channels/whatsapp-service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { signup } from "@/modules/auth/service";
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
const dbSkipReason: string | null = dbEnvOk
  ? null
  : "DB_* env not configured — billing entitlements suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) {
    skip(dbSkipReason);
  }
}

async function getCounter(
  businessId: string,
  eventType: string,
  periodStartUtc: Date,
): Promise<number> {
  const result = await query<{ Quantity: number }>(
    `SELECT Quantity FROM TblUsagePeriodCounter
     WHERE BusinessID = @businessId
       AND EventType = @eventType
       AND PeriodStartUtc = @periodStartUtc`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "eventType", type: sql.NVarChar(64), value: eventType },
      { name: "periodStartUtc", type: sql.DateTime2, value: periodStartUtc },
    ],
  );
  return Number(result.recordset[0]?.Quantity ?? 0);
}

async function countUsageEvents(
  businessId: string,
  eventType: string,
  usageKey: string,
): Promise<number> {
  const result = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblUsageEvent
     WHERE BusinessID = @businessId
       AND EventType = @eventType
       AND UsageKey = @usageKey`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "eventType", type: sql.NVarChar(64), value: eventType },
      { name: "usageKey", type: sql.NVarChar(200), value: usageKey },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

async function getReservationState(
  businessId: string,
  eventType: string,
  reservationKey: string,
): Promise<string | null> {
  const result = await query<{ State: string }>(
    `SELECT State FROM TblUsageReservation
     WHERE BusinessID = @businessId
       AND EventType = @eventType
       AND ReservationKey = @reservationKey`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "eventType", type: sql.NVarChar(64), value: eventType },
      { name: "reservationKey", type: sql.NVarChar(200), value: reservationKey },
    ],
  );
  return result.recordset[0]?.State ?? null;
}

async function onboardBillingBiz(suffix: string, label: string) {
  clearTestCookies();
  const auth = await signup({
    email: `bill-${label}-${suffix}@example.com`,
    password: "Password123!",
    fullName: label,
  });
  return completeOnboarding({
    userId: auth.user.userId,
    business: {
      name: `${label}Biz ${suffix}`,
      category: "retail",
      countryCode: "SA",
      locale: "ar",
      timezone: "Asia/Riyadh",
    },
    agent: { name: "Agent" },
  });
}

describe("billing entitlements foundation", () => {
  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[billing-entitlements] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }
  });

  afterAll(async () => {
    if (!dbSkipReason) {
      await closePool().catch(() => undefined);
    }
  });

  it("1/2. onboarding completes with FREE sub before agent/knowledge", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-onboard-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Billing Onboard",
    });
    const result = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `BillBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    expect(result.subscription.status).toBe("ACTIVE");
    const current = await getCurrentSubscription(result.business.businessId);
    expect(current?.subscriptionId).toBe(result.subscription.subscriptionId);
    expect(result.agent.agentId).toBeTruthy();
    expect(result.knowledgeItems.length).toBeGreaterThan(0);
  });

  it("3. concurrent ensureDefaultSubscription yields one current sub", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-conc-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Conc Sub",
    });
    // createBusiness already ensures sub; create a bare business via onboarding path
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `ConcBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const results = await Promise.all([
      ensureDefaultSubscription({ businessId }),
      ensureDefaultSubscription({ businessId }),
      ensureDefaultSubscription({ businessId }),
    ]);
    const ids = new Set(results.map((r) => r.subscriptionId));
    expect(ids.size).toBe(1);
    const currents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblSubscription
       WHERE BusinessID = @businessId
         AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
    expect(Number(currents.recordset[0]?.Cnt)).toBe(1);
  });

  it("4/5/6/7/8/9/10. reserve idempotency, release, consume once", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-quota-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Quota",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `QuotaBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const jobId = randomUUID();
    const key = aiReplyReservationKey(jobId);
    const period = resolveUtcMonthPeriod();

    const first = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(first.idempotent).toBe(false);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);

    const retry = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(retry.idempotent).toBe(true);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);

    const reclaim = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(reclaim.idempotent).toBe(true);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);

    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(0);

    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(0);

    const again = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    expect(again.idempotent).toBe(false);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);

    await consumeQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
      metadata: { jobId },
    });
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(await countUsageEvents(businessId, USAGE_EVENT_AI_REPLY, key)).toBe(1);

    await consumeQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
      metadata: { jobId },
    });
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(await countUsageEvents(businessId, USAGE_EVENT_AI_REPLY, key)).toBe(1);
  });

  it("4b. concurrent final-unit AI reserves: one wins", async ({ skip }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-race-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Race",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `RaceBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const period = resolveUtcMonthPeriod();

    // Cap AI replies at 1 for this business via counter fill to limit-1
    const snap = await getEntitlementSnapshot(businessId);
    const limit = snap.plan?.monthlyAiReplies;
    expect(limit).toBeTypeOf("number");
    const used = await getCounter(
      businessId,
      USAGE_EVENT_AI_REPLY,
      period.usagePeriodStartUtc,
    );
    // Fill to limit-1 with a disposable reservation
    const fillKey = aiReplyReservationKey(`fill-${randomUUID()}`);
    if (used < (limit as number) - 1) {
      // Directly set counter near limit by reserving until limit-1 is awkward;
      // instead bump counter with a single reservation then update quantity.
      await reserveQuota({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: fillKey,
      });
      await query(
        `UPDATE TblUsagePeriodCounter
         SET Quantity = @qty
         WHERE BusinessID = @businessId
           AND EventType = @eventType
           AND PeriodStartUtc = @periodStartUtc`,
        [
          {
            name: "businessId",
            type: sql.UniqueIdentifier,
            value: businessId,
          },
          {
            name: "eventType",
            type: sql.NVarChar(64),
            value: USAGE_EVENT_AI_REPLY,
          },
          {
            name: "periodStartUtc",
            type: sql.DateTime2,
            value: period.usagePeriodStartUtc,
          },
          { name: "qty", type: sql.Int, value: (limit as number) - 1 },
        ],
      );
    } else {
      await query(
        `UPDATE TblUsagePeriodCounter
         SET Quantity = @qty
         WHERE BusinessID = @businessId
           AND EventType = @eventType
           AND PeriodStartUtc = @periodStartUtc`,
        [
          {
            name: "businessId",
            type: sql.UniqueIdentifier,
            value: businessId,
          },
          {
            name: "eventType",
            type: sql.NVarChar(64),
            value: USAGE_EVENT_AI_REPLY,
          },
          {
            name: "periodStartUtc",
            type: sql.DateTime2,
            value: period.usagePeriodStartUtc,
          },
          { name: "qty", type: sql.Int, value: (limit as number) - 1 },
        ],
      );
    }

    const keyA = aiReplyReservationKey(randomUUID());
    const keyB = aiReplyReservationKey(randomUUID());
    const outcomes = await Promise.allSettled([
      reserveQuota({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: keyA,
      }),
      reserveQuota({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: keyB,
      }),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(isPlanEntitlementError(err)).toBe(true);
    expect((err as PlanEntitlementError).code).toBe(
      PLAN_ERROR_CODES.AI_QUOTA_EXCEEDED,
    );
  });

  it("11/12. ambiguous keeps commitment; retry reuses key", async ({ skip }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-amb-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Amb",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `AmbBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const jobId = randomUUID();
    const aiKey = aiReplyReservationKey(jobId);
    const waKey = waOutboundReservationKey(jobId);
    const period = resolveUtcMonthPeriod();

    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });
    // Simulate ambiguous: leave RESERVED (do not release)
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, period.usagePeriodStartUtc)).toBe(1);

    const retryAi = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    const retryWa = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });
    expect(retryAi.idempotent).toBe(true);
    expect(retryWa.idempotent).toBe(true);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, period.usagePeriodStartUtc)).toBe(1);
  });

  it("release states: RESERVED/RELEASED/UNCERTAIN/CONSUMED", async ({
    skip,
  }) => {
    requireDb(skip);
    const suffix = randomUUID().slice(0, 8);
    const onboarded = await onboardBillingBiz(suffix, "relstate");
    const businessId = onboarded.business.businessId;
    const period = resolveUtcMonthPeriod();

    // 1. RESERVED → release → RELEASED, counter -1
    const reservedKey = aiReplyReservationKey(randomUUID());
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: reservedKey,
    });
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: reservedKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, reservedKey)).toBe(
      "RELEASED",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(0);

    // 2. duplicate release — still RELEASED, counter unchanged
    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: reservedKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, reservedKey)).toBe(
      "RELEASED",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(0);

    // 3. UNCERTAIN → release attempt — remains UNCERTAIN, counter unchanged
    const uncertainKey = aiReplyReservationKey(randomUUID());
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: uncertainKey,
    });
    await markQuotaReservationUncertain({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: uncertainKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, uncertainKey)).toBe(
      "UNCERTAIN",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: uncertainKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, uncertainKey)).toBe(
      "UNCERTAIN",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);

    // 4. CONSUMED → release attempt — remains CONSUMED, counter unchanged, one usage event
    const consumedKey = aiReplyReservationKey(randomUUID());
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: consumedKey,
    });
    await consumeQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: consumedKey,
      metadata: { test: true },
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, consumedKey)).toBe(
      "CONSUMED",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(2);
    expect(await countUsageEvents(businessId, USAGE_EVENT_AI_REPLY, consumedKey)).toBe(1);
    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: consumedKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, consumedKey)).toBe(
      "CONSUMED",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(2);
    expect(await countUsageEvents(businessId, USAGE_EVENT_AI_REPLY, consumedKey)).toBe(1);
  });

  it("ambiguous then definitive release preserves UNCERTAIN commitments", async ({
    skip,
  }) => {
    requireDb(skip);
    const suffix = randomUUID().slice(0, 8);
    const onboarded = await onboardBillingBiz(suffix, "ambdef");
    const businessId = onboarded.business.businessId;
    const jobId = randomUUID();
    const aiKey = aiReplyReservationKey(jobId);
    const waKey = waOutboundReservationKey(jobId);
    const period = resolveUtcMonthPeriod();

    // Attempt A: reserve + mark UNCERTAIN (ambiguous outbound)
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });
    await markQuotaReservationUncertain({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    await markQuotaReservationUncertain({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });
    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, aiKey)).toBe("UNCERTAIN");
    expect(await getReservationState(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, waKey)).toBe(
      "UNCERTAIN",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(
      await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, period.usagePeriodStartUtc),
    ).toBe(1);

    // Attempt B: same keys — idempotent UNCERTAIN, then accidental release path
    const retryAi = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    const retryWa = await reserveQuota({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });
    expect(retryAi.state).toBe("UNCERTAIN");
    expect(retryAi.idempotent).toBe(true);
    expect(retryWa.state).toBe("UNCERTAIN");
    expect(retryWa.idempotent).toBe(true);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(
      await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, period.usagePeriodStartUtc),
    ).toBe(1);

    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: aiKey,
    });
    await releaseQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey: waKey,
    });

    expect(await getReservationState(businessId, USAGE_EVENT_AI_REPLY, aiKey)).toBe("UNCERTAIN");
    expect(await getReservationState(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, waKey)).toBe(
      "UNCERTAIN",
    );
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, period.usagePeriodStartUtc)).toBe(1);
    expect(
      await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, period.usagePeriodStartUtc),
    ).toBe(1);
  });

  it("13/14/15. agent / knowledge / whatsapp cannot exceed FREE limits", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-lim-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Limits",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `LimBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
      knowledgeItems: Array.from({ length: 2 }, (_, i) => ({
        title: `Item ${i}`,
        content: `Content ${i}`,
      })),
    });
    const businessId = onboarded.business.businessId;

    await expect(
      createAgent({
        businessId,
        name: "Second",
        roleTitle: "r",
        language: "ar",
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.AGENT_LIMIT });

    // Knowledge: seed 2; FREE allows 50 — fill remaining to 50 then one more fails.
    // Faster: set MaxActiveKnowledgeItems temporarily via SQL for this plan? Prefer
    // concurrent activate race with temporary low limit via direct SQL on plan is shared.
    // Instead test withResourceLimitGate directly with delta that exceeds.
    await expect(
      withResourceLimitGate({
        businessId,
        kind: "knowledge_active",
        delta: 1000,
        createFn: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.KNOWLEDGE_LIMIT });

    await ensureWhatsAppConnection({ businessId });
    await expect(
      withResourceLimitGate({
        businessId,
        kind: "whatsapp_connection",
        createFn: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.WHATSAPP_CONNECTION_LIMIT });
  });

  it("16. UTC month period keys differ across months", () => {
    const jan = resolveUtcMonthPeriod(new Date(Date.UTC(2026, 0, 15)));
    const feb = resolveUtcMonthPeriod(new Date(Date.UTC(2026, 1, 1)));
    expect(jan.usagePeriodStartUtc.getTime()).not.toBe(
      feb.usagePeriodStartUtc.getTime(),
    );
    expect(jan.usagePeriodEndUtc.getTime()).toBe(feb.usagePeriodStartUtc.getTime());
  });

  it("NULL plan limits are unlimited", async ({ skip }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-unlim-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Unlim",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `UnlimBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const planId = randomUUID();
    await query(
      `INSERT INTO TblPlan (
         PlanID, Code, DisplayName, Status,
         MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
         MonthlyAiReplies, MonthlyWhatsAppOutbound,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @planId, @code, N'Unlimited', N'ACTIVE',
         NULL, NULL, NULL, NULL, NULL,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        { name: "code", type: sql.NVarChar(64), value: `UL_${suffix}` },
      ],
    );
    await query(
      `UPDATE TblSubscription SET PlanID = @planId, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @subId`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        {
          name: "subId",
          type: sql.UniqueIdentifier,
          value: onboarded.subscription.subscriptionId,
        },
      ],
    );

    await createAgent({
      businessId,
      name: "Second",
      roleTitle: "r",
      language: "ar",
    });
    await createAgent({
      businessId,
      name: "Third",
      roleTitle: "r",
      language: "ar",
    });

    const period = resolveUtcMonthPeriod();
    for (let i = 0; i < 3; i += 1) {
      await reserveQuota({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: aiReplyReservationKey(randomUUID()),
      });
    }
    expect(
      await getCounter(
        businessId,
        USAGE_EVENT_AI_REPLY,
        period.usagePeriodStartUtc,
      ),
    ).toBe(3);
  });

  it("concurrent agent creates at limit: exactly one succeeds", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-agconc-${suffix}@example.com`,
      password: "Password123!",
      fullName: "AgConc",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `AgConcBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const planId = randomUUID();
    await query(
      `INSERT INTO TblPlan (
         PlanID, Code, DisplayName, Status,
         MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
         MonthlyAiReplies, MonthlyWhatsAppOutbound,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @planId, @code, N'TwoAgents', N'ACTIVE',
         1, 2, 50, 500, 500,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        { name: "code", type: sql.NVarChar(64), value: `TA_${suffix}` },
      ],
    );
    await query(
      `UPDATE TblSubscription SET PlanID = @planId, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @subId`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        {
          name: "subId",
          type: sql.UniqueIdentifier,
          value: onboarded.subscription.subscriptionId,
        },
      ],
    );

    const outcomes = await Promise.allSettled([
      createAgent({
        businessId,
        name: "RaceA",
        roleTitle: "r",
        language: "ar",
      }),
      createAgent({
        businessId,
        name: "RaceB",
        roleTitle: "r",
        language: "ar",
      }),
    ]);
    const ok = outcomes.filter((o) => o.status === "fulfilled");
    const bad = outcomes.filter((o) => o.status === "rejected");
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
    expect(isPlanEntitlementError((bad[0] as PromiseRejectedResult).reason)).toBe(
      true,
    );
  });

  it("downgrade keeps existing agents but blocks new creates", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-down-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Down",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `DownBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const agentId = onboarded.agent.agentId;
    const planId = randomUUID();
    await query(
      `INSERT INTO TblPlan (
         PlanID, Code, DisplayName, Status,
         MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
         MonthlyAiReplies, MonthlyWhatsAppOutbound,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @planId, @code, N'TwoAgents', N'ACTIVE',
         1, 2, 50, 500, 500,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        { name: "code", type: sql.NVarChar(64), value: `TD_${suffix}` },
      ],
    );
    await query(
      `UPDATE TblSubscription SET PlanID = @planId, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @subId`,
      [
        { name: "planId", type: sql.UniqueIdentifier, value: planId },
        {
          name: "subId",
          type: sql.UniqueIdentifier,
          value: onboarded.subscription.subscriptionId,
        },
      ],
    );
    await createAgent({
      businessId,
      name: "Second",
      roleTitle: "r",
      language: "ar",
    });

    // Downgrade back to FREE (MaxAgents=1) without deleting existing agents.
    const free = await query<{ PlanID: string }>(
      `SELECT PlanID FROM TblPlan WHERE Code = N'FREE'`,
    );
    await query(
      `UPDATE TblSubscription SET PlanID = @planId, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @subId`,
      [
        {
          name: "planId",
          type: sql.UniqueIdentifier,
          value: free.recordset[0]!.PlanID,
        },
        {
          name: "subId",
          type: sql.UniqueIdentifier,
          value: onboarded.subscription.subscriptionId,
        },
      ],
    );

    const agents = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblAgent WHERE BusinessID = @businessId`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
    expect(Number(agents.recordset[0]?.Cnt)).toBe(2);
    expect(agentId).toBeTruthy();

    await expect(
      createAgent({
        businessId,
        name: "Blocked",
        roleTitle: "r",
        language: "ar",
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.AGENT_LIMIT });
  });

  it("17. tenant A cannot see B counters via snapshot isolation of businessId", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const a = await signup({
      email: `bill-ta-${suffix}@example.com`,
      password: "Password123!",
      fullName: "A",
    });
    const b = await signup({
      email: `bill-tb-${suffix}@example.com`,
      password: "Password123!",
      fullName: "B",
    });
    const oa = await completeOnboarding({
      userId: a.user.userId,
      business: {
        name: `A ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const ob = await completeOnboarding({
      userId: b.user.userId,
      business: {
        name: `B ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const key = aiReplyReservationKey(randomUUID());
    await reserveQuota({
      businessId: oa.business.businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      reservationKey: key,
    });
    const snapB = await getEntitlementSnapshot(ob.business.businessId);
    expect(snapB.aiUsed).toBe(0);
    await expect(
      reserveQuota({
        businessId: ob.business.businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: key,
      }),
    ).resolves.toBeTruthy();
  });

  it("18/19/20. inactive / PAST_DUE / CANCELED block actions", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `bill-status-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Status",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `StatusBiz ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;
    const subId = onboarded.subscription.subscriptionId;

    await query(
      `UPDATE TblSubscription SET Status = N'PAST_DUE', UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @id`,
      [{ name: "id", type: sql.UniqueIdentifier, value: subId }],
    );
    const pastDueSnap = await getEntitlementSnapshot(businessId);
    expect(pastDueSnap.plan?.code).toBe("FREE");
    expect(pastDueSnap.canAct).toBe(false);
    await expect(
      reserveQuota({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        reservationKey: aiReplyReservationKey(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE });

    await query(
      `UPDATE TblSubscription SET Status = N'CANCELED', UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @id`,
      [{ name: "id", type: sql.UniqueIdentifier, value: subId }],
    );
    await expect(
      createAgent({
        businessId,
        name: "Blocked",
        roleTitle: "r",
        language: "ar",
      }),
    ).rejects.toMatchObject({ code: PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE });

    await query(
      `UPDATE TblSubscription SET Status = N'EXPIRED', UpdatedAtUtc = SYSUTCDATETIME()
       WHERE SubscriptionID = @id`,
      [{ name: "id", type: sql.UniqueIdentifier, value: subId }],
    );
    const expiredSnap = await getEntitlementSnapshot(businessId);
    expect(expiredSnap.canAct).toBe(false);
    expect(expiredSnap.subscription?.status).toBe("EXPIRED");
  });
});
