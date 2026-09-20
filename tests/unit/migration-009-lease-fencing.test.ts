'use strict';

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("migration 009 ai worker lease fencing", () => {
  it("is additive and does not drop constraints/data", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "db/migrations/009_ai_worker_lease_fencing.sql"),
      "utf8",
    );
    expect(sql).toMatch(/LeaseToken/);
    expect(sql).toMatch(/LeaseOwner/);
    expect(sql).toMatch(/LeaseVersion/);
    expect(sql).toMatch(/OutboundUnknownCount/);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).toMatch(/IF COL_LENGTH/);
  });
});
