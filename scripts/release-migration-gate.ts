/**
 * Read-only release checks for migrations 001–031.
 *
 * --files-only validates the repository without connecting to SQL Server.
 * --verified-isolated-db additionally checks an operator-verified test database.
 * Neither mode applies or re-runs a migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sql from "mssql";

const lastVersion = 31;
const mode = process.argv[2];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function checkFiles(): Map<string, string> {
  const dir = resolve(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((file) => /^\d{3}_.+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, "en"));
  if (files.length !== lastVersion) {
    throw new Error(`Expected ${lastVersion} migrations, found ${files.length}`);
  }
  const names = new Map<string, string>();
  files.forEach((file, index) => {
    const version = String(index + 1).padStart(3, "0");
    if (!file.startsWith(`${version}_`)) {
      throw new Error(`Migration gap, duplicate, or disorder at ${version}: ${file}`);
    }
    if (!readFileSync(resolve(dir, file), "utf8").trim()) {
      throw new Error(`Empty migration: ${file}`);
    }
    names.set(version, file.slice(4, -4));
  });

  const sql011 = readFileSync(resolve(dir, "011_usage_counter_backfill.sql"), "utf8");
  if (!/NOT EXISTS/i.test(sql011) || /\bUPDATE\s+dbo\.TblUsagePeriodCounter\b/i.test(sql011)) {
    throw new Error("011 must INSERT missing rows only, never UPDATE counters");
  }
  console.log("FILE_ORDER 001→031: PASS");
  console.log("011_PRESERVE_SQL: PASS");
  return names;
}

async function checkIsolatedDatabase(names: Map<string, string>): Promise<void> {
  const server = requireEnv("DB_SERVER");
  const database = requireEnv("DB_NAME");
  if (process.env.DRVO_TEST_ISOLATED_DB !== "1" || !/(?:test|isolated)/i.test(database)) {
    throw new Error("DB check requires DRVO_TEST_ISOLATED_DB=1 and an isolated test DB_NAME");
  }
  const port = Number(requireEnv("DB_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid DB_PORT");
  // An operator must independently verify server identity, data, and object permissions first.
  console.log(`READ_ONLY_DB_TARGET server=${server} port=${port} database=${database}`);
  const pool = await new sql.ConnectionPool({
    server, port, database,
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? "true").toLowerCase() !== "false",
      trustServerCertificate:
        (process.env.DB_TRUST_SERVER_CERTIFICATE ?? "false").toLowerCase() === "true",
    },
  }).connect();
  try {
    const identity = await pool.request().query<{ DatabaseName: string }>(
      "SELECT DB_NAME() AS DatabaseName",
    );
    if (identity.recordset[0]?.DatabaseName !== database) {
      throw new Error("Connected database differs from DB_NAME");
    }
    const applied = await pool.request().query<{
      Version: string; Name: string; AppliedAtUtc: Date;
    }>("SELECT Version, Name, AppliedAtUtc FROM dbo.TblSchemaMigration ORDER BY Version");
    const byVersion = new Map(applied.recordset.map((row) => [String(row.Version), row]));
    let previous = -Infinity;
    for (const [version, name] of names) {
      const row = byVersion.get(version);
      if (!row || row.Name !== name) throw new Error(`Missing or mismatched applied migration ${version}`);
      const appliedAt = row.AppliedAtUtc?.getTime();
      if (appliedAt === undefined || !Number.isFinite(appliedAt) || appliedAt < previous) {
        throw new Error(`Applied migration timestamps out of order at ${version}`);
      }
      previous = appliedAt;
    }
    console.log("ISOLATED_DB_APPLIED 001→031: PASS (read-only)");
  } finally {
    await pool.close();
  }
}

async function main(): Promise<void> {
  if ((mode !== "--files-only" && mode !== "--verified-isolated-db") || process.argv.length !== 3) {
    throw new Error("Use --files-only or --verified-isolated-db after operator verification");
  }
  const names = checkFiles();
  if (mode === "--files-only") {
    console.log("DATABASE_VALIDATION: NOT_RUN");
    return;
  }
  await checkIsolatedDatabase(names);
}

main().catch((error) => {
  console.error("MIGRATION_RELEASE_GATE: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
