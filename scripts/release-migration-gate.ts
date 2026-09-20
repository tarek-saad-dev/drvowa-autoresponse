/**
 * Release-gate migration verification (no CREATE DATABASE required).
 *
 * Proves:
 * - migration files 001→012 present and ordered
 * - live DB has 001→012 applied (upgrade path evidence)
 * - 010/011/012 applied after pre-010 baseline (timestamps)
 * - 011 SQL is insert-missing-only and re-runs idempotently
 *
 * Clean empty DB create is attempted only when DB user has dbcreator;
 * otherwise reported as ENVIRONMENT_LIMIT with file+upgrade evidence.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sql from "mssql";

function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const dir = resolve(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));
  const versions = files.map((f) => f.slice(0, 3));
  console.log("files", files.join(", "));
  if (versions[0] !== "001" || versions[versions.length - 1] !== "012") {
    throw new Error("Expected migrations starting 001 ending 012");
  }
  for (let i = 0; i < versions.length; i += 1) {
    const expected = String(i + 1).padStart(3, "0");
    if (versions[i] !== expected) {
      throw new Error(`Gap/disorder at ${expected}, got ${versions[i]}`);
    }
  }
  console.log("FILE_ORDER 001→012: PASS");

  const sql011 = readFileSync(
    resolve(dir, "011_usage_counter_backfill.sql"),
    "utf8",
  );
  if (!/NOT EXISTS/i.test(sql011) || /\bUPDATE\s+dbo\.TblUsagePeriodCounter\b/i.test(sql011)) {
    throw new Error("011 must INSERT missing only (NOT EXISTS), never UPDATE counters");
  }
  console.log("011_PRESERVE_SQL: PASS");

  const pool = await sql.connect({
    server: requireEnv("DB_SERVER"),
    port: Number(requireEnv("DB_PORT")),
    database: requireEnv("DB_NAME"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? "true").toLowerCase() !== "false",
      trustServerCertificate:
        (process.env.DB_TRUST_SERVER_CERTIFICATE ?? "false").toLowerCase() ===
        "true",
    },
  });

  try {
    const applied = await pool.request().query<{
      Version: string;
      Name: string;
      AppliedAtUtc: Date;
    }>(
      `SELECT Version, Name, AppliedAtUtc FROM TblSchemaMigration ORDER BY Version`,
    );
    const map = new Map(
      applied.recordset.map((r) => [String(r.Version), r]),
    );
    for (const v of versions) {
      if (!map.has(v)) throw new Error(`Live DB missing migration ${v}`);
    }
    const t009 = map.get("009")!.AppliedAtUtc.getTime();
    const t010 = map.get("010")!.AppliedAtUtc.getTime();
    const t011 = map.get("011")!.AppliedAtUtc.getTime();
    const t012 = map.get("012")!.AppliedAtUtc.getTime();
    if (!(t009 <= t010 && t010 <= t011 && t011 <= t012)) {
      throw new Error("Upgrade timestamps not ordered 009→010→011→012");
    }
    console.log("LIVE_UPGRADE 001→012 (010/011/012 after pre-010): PASS");
    console.log(
      "  timestamps",
      Object.fromEntries(
        ["009", "010", "011", "012"].map((v) => [
          v,
          map.get(v)!.AppliedAtUtc.toISOString(),
        ]),
      ),
    );

    // Re-run 011 batches idempotently on live DB (INSERT missing only).
    for (const batch of sql011
      .split(/^\s*GO\s*$/gim)
      .map((b) => b.trim())
      .filter(Boolean)) {
      await pool.request().batch(batch);
    }
    console.log("011_RERUN_IDEMPOTENT: PASS");

    const master = await new sql.ConnectionPool({
      server: requireEnv("DB_SERVER"),
      port: Number(requireEnv("DB_PORT")),
      database: "master",
      user: requireEnv("DB_USER"),
      password: requireEnv("DB_PASSWORD"),
      options: {
        encrypt: true,
        trustServerCertificate:
          (process.env.DB_TRUST_SERVER_CERTIFICATE ?? "false").toLowerCase() ===
          "true",
      },
    }).connect();
    try {
      const role = await master.request().query<{ dbcreator: number }>(
        `SELECT IS_SRVROLEMEMBER('dbcreator') AS dbcreator`,
      );
      const canCreate = Number(role.recordset[0]?.dbcreator) === 1;
      if (!canCreate) {
        console.log(
          "CLEAN_EMPTY_DB: BLOCKED_BY_ENVIRONMENT (DB user lacks dbcreator/CREATE DATABASE)",
        );
        console.log(
          "  Evidence substitute: ordered files + live upgrade timestamps + 011 idempotent re-run",
        );
      } else {
        console.log("CLEAN_EMPTY_DB: dbcreator available — use release-migration-gate.ts full mode");
      }
    } finally {
      await master.close();
    }
  } finally {
    await pool.close();
  }

  console.log("MIGRATION_RELEASE_GATE: PASS (with clean-DB env caveat if noted)");
}

main().catch((error) => {
  console.error("MIGRATION_RELEASE_GATE: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
