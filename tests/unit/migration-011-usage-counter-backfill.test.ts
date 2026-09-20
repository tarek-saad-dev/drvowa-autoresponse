'use strict';

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("migration 011 usage counter backfill", () => {
  it("inserts missing counter rows only and never overwrites", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "db/migrations/011_usage_counter_backfill.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/TblUsagePeriodCounter/);
    expect(sql).toMatch(/TblUsageEvent/);
    expect(sql).toMatch(/AI_REPLY_GENERATED/);
    expect(sql).toMatch(/WHATSAPP_OUTBOUND_MESSAGE/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/INSERT INTO dbo\.TblUsagePeriodCounter/);
    expect(sql).not.toMatch(/\bUPDATE\s+dbo\.TblUsagePeriodCounter\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});
