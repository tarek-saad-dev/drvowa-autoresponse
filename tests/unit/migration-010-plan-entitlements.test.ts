'use strict';

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("migration 010 plan entitlements", () => {
  it("adds limits, counters, reservations, UsageKey without destructive drops", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "db/migrations/010_plan_entitlements_and_usage_counters.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/MaxWhatsAppConnections/);
    expect(sql).toMatch(/MaxAgents/);
    expect(sql).toMatch(/MaxActiveKnowledgeItems/);
    expect(sql).toMatch(/MonthlyAiReplies/);
    expect(sql).toMatch(/MonthlyWhatsAppOutbound/);
    expect(sql).toMatch(/TblUsagePeriodCounter/);
    expect(sql).toMatch(/TblUsageReservation/);
    expect(sql).toMatch(/UsageKey/);
    expect(sql).toMatch(/UQ_TblSubscription_Business_Current/);
    expect(sql).toMatch(/EXPIRED/);
    expect(sql).toMatch(/Code = N'FREE'/);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
