import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "db/migrations");

describe("migration version integrity", () => {
  it("has only one file for each migration version", () => {
    const files = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name));
    const versions = files.map((name) => name.slice(0, 3));
    expect(new Set(versions).size).toBe(files.length);
  });

  it("reconciles both historical 022 schemas with an idempotent 025", () => {
    const file = readFileSync(resolve(migrationsDir, "025_reconcile_escalation_and_pairing.sql"), "utf8");
    expect(file).toMatch(/IF OBJECT_ID\(N'dbo\.TblHumanEscalationSetting', N'U'\) IS NULL/);
    expect(file).toMatch(/IF OBJECT_ID\(N'dbo\.TblHumanEscalation', N'U'\) IS NULL/);
    expect(file).toContain("-- @include: 022_integration_pairing.sql");
    const pairing = readFileSync(resolve(migrationsDir, "022_integration_pairing.sql"), "utf8");
    expect(pairing).toMatch(/IF OBJECT_ID\(N'dbo\.TblIntegrationPairing', N'U'\) IS NULL/);
  });
});
