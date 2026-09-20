import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import { USAGE_EVENT_AI_REPLY, USAGE_EVENT_WHATSAPP_OUTBOUND } from "@/modules/billing/period";
import { signup } from "@/modules/auth/service";
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

const dbSkipReason: string | null = dbEnvConfigured()
  ? null
  : "DB_* env not configured — migration 011 suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

async function insertUsageEvent(params: {
  businessId: string;
  eventType: string;
  quantity: number;
  occurredAtUtc: Date;
  usageKey?: string;
}) {
  await query(
    `INSERT INTO TblUsageEvent (
       UsageEventID, BusinessID, EventType, Quantity, OccurredAtUtc, MetadataJson, UsageKey
     ) VALUES (
       @id, @businessId, @eventType, @quantity, @occurredAtUtc, NULL, @usageKey
     )`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
      { name: "quantity", type: sql.Int, value: params.quantity },
      {
        name: "occurredAtUtc",
        type: sql.DateTime2,
        value: params.occurredAtUtc,
      },
      {
        name: "usageKey",
        type: sql.NVarChar(200),
        value: params.usageKey ?? null,
      },
    ],
  );
}

async function getCounter(
  businessId: string,
  eventType: string,
  periodStartUtc: Date,
): Promise<number | null> {
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
  const row = result.recordset[0];
  return row ? Number(row.Quantity) : null;
}

async function runBackfillSqlForBusiness(businessId: string) {
  // Same semantics as migration 011, scoped to one business so full-suite
  // history does not make the CTE scan prohibitively expensive.
  await query(
    `;WITH monthly AS (
       SELECT
         e.BusinessID,
         e.EventType,
         DATETIMEFROMPARTS(
           YEAR(e.OccurredAtUtc),
           MONTH(e.OccurredAtUtc),
           1, 0, 0, 0, 0
         ) AS PeriodStartUtc,
         SUM(CAST(e.Quantity AS INT)) AS Quantity
       FROM dbo.TblUsageEvent AS e
       WHERE e.BusinessID = @businessId
         AND e.EventType IN (N'AI_REPLY_GENERATED', N'WHATSAPP_OUTBOUND_MESSAGE')
       GROUP BY
         e.BusinessID,
         e.EventType,
         YEAR(e.OccurredAtUtc),
         MONTH(e.OccurredAtUtc)
     )
     INSERT INTO dbo.TblUsagePeriodCounter (
       BusinessID, EventType, PeriodStartUtc, Quantity, UpdatedAtUtc
     )
     SELECT
       m.BusinessID, m.EventType, m.PeriodStartUtc, m.Quantity, SYSUTCDATETIME()
     FROM monthly AS m
     WHERE NOT EXISTS (
       SELECT 1
       FROM dbo.TblUsagePeriodCounter AS c
       WHERE c.BusinessID = m.BusinessID
         AND c.EventType = m.EventType
         AND c.PeriodStartUtc = m.PeriodStartUtc
     )`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
  );
}

describe("migration 011 usage counter backfill (DB)", () => {
  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[migration-011] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }
  });

  afterAll(async () => {
    if (!dbSkipReason) await closePool().catch(() => undefined);
  });

  it("backfills missing months exactly, preserves existing, is idempotent", async ({
    skip,
  }) => {
    requireDb(skip);
    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `mig011-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Mig011",
    });
    const onboarded = await completeOnboarding({
      userId: auth.user.userId,
      business: {
        name: `Mig011 ${suffix}`,
        category: "retail",
        countryCode: "SA",
        locale: "ar",
        timezone: "Asia/Riyadh",
      },
      agent: { name: "Agent" },
    });
    const businessId = onboarded.business.businessId;

    const jan = new Date(Date.UTC(2025, 0, 1));
    const feb = new Date(Date.UTC(2025, 1, 1));
    const mar = new Date(Date.UTC(2025, 2, 1));

    // January AI: 2+3 = 5
    await insertUsageEvent({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      quantity: 2,
      occurredAtUtc: new Date(Date.UTC(2025, 0, 10, 12)),
      usageKey: `backfill-ai-jan-a-${suffix}`,
    });
    await insertUsageEvent({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      quantity: 3,
      occurredAtUtc: new Date(Date.UTC(2025, 0, 20, 12)),
      usageKey: `backfill-ai-jan-b-${suffix}`,
    });
    // February WA: 4
    await insertUsageEvent({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      quantity: 4,
      occurredAtUtc: new Date(Date.UTC(2025, 1, 5, 8)),
      usageKey: `backfill-wa-feb-${suffix}`,
    });
    // March AI: 1
    await insertUsageEvent({
      businessId,
      eventType: USAGE_EVENT_AI_REPLY,
      quantity: 1,
      occurredAtUtc: new Date(Date.UTC(2025, 2, 1, 1)),
      usageKey: `backfill-ai-mar-${suffix}`,
    });

    // Pre-existing counter for January AI with a different quantity (RESERVED-like).
    // Backfill must NOT overwrite.
    await query(
      `IF NOT EXISTS (
         SELECT 1 FROM TblUsagePeriodCounter
         WHERE BusinessID = @businessId
           AND EventType = @eventType
           AND PeriodStartUtc = @periodStartUtc
       )
       INSERT INTO TblUsagePeriodCounter (
         BusinessID, EventType, PeriodStartUtc, Quantity, UpdatedAtUtc
       ) VALUES (
         @businessId, @eventType, @periodStartUtc, 99, SYSUTCDATETIME()
       )
       ELSE
       UPDATE TblUsagePeriodCounter
       SET Quantity = 99, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND PeriodStartUtc = @periodStartUtc`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: USAGE_EVENT_AI_REPLY,
        },
        { name: "periodStartUtc", type: sql.DateTime2, value: jan },
      ],
    );

    await runBackfillSqlForBusiness(businessId);

    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, jan)).toBe(99);
    expect(await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, feb)).toBe(4);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, mar)).toBe(1);

    // Double execution must not change anything.
    await runBackfillSqlForBusiness(businessId);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, jan)).toBe(99);
    expect(await getCounter(businessId, USAGE_EVENT_WHATSAPP_OUTBOUND, feb)).toBe(4);
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, mar)).toBe(1);

    // February AI should still be missing (no events).
    expect(await getCounter(businessId, USAGE_EVENT_AI_REPLY, feb)).toBeNull();
  }, 60_000);
});
