import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  closePool,
  DbError,
  getPool,
  isMissingObjectError,
  toDbError,
} from "../src/lib/db";

type MigrationFile = {
  version: string;
  name: string;
  fileName: string;
};

const MIGRATIONS_DIR = resolve(process.cwd(), "db", "migrations");

function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function listMigrationFiles(): MigrationFile[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new DbError(`Migrations directory not found: ${MIGRATIONS_DIR}`, {
      code: "DB_STATUS",
    });
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((fileName) => {
      const match = /^(\d{3})_(.+)\.sql$/i.exec(fileName);
      if (!match) {
        throw new DbError(`Invalid migration file name: ${fileName}`, {
          code: "DB_STATUS",
        });
      }

      return {
        version: match[1],
        name: match[2],
        fileName,
      };
    });
}

async function getAppliedVersions(): Promise<Map<string, { name: string; appliedAtUtc: Date }>> {
  const pool = await getPool();
  try {
    const result = await pool.request().query<{
      Version: string;
      Name: string;
      AppliedAtUtc: Date;
    }>("SELECT Version, Name, AppliedAtUtc FROM TblSchemaMigration ORDER BY Version");

    const map = new Map<string, { name: string; appliedAtUtc: Date }>();
    for (const row of result.recordset) {
      map.set(String(row.Version), {
        name: row.Name,
        appliedAtUtc: row.AppliedAtUtc,
      });
    }
    return map;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return new Map();
    }
    throw toDbError(error, "Failed to read TblSchemaMigration");
  }
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const migrations = listMigrationFiles();
  const applied = await getAppliedVersions();

  console.log("Migration status");
  console.log("================");

  if (migrations.length === 0) {
    console.log("No migration files found.");
    return;
  }

  let pendingCount = 0;
  let appliedCount = 0;

  for (const migration of migrations) {
    const record = applied.get(migration.version);
    if (record) {
      appliedCount += 1;
      const when =
        record.appliedAtUtc instanceof Date
          ? record.appliedAtUtc.toISOString()
          : String(record.appliedAtUtc);
      console.log(`[applied] ${migration.fileName} @ ${when}`);
    } else {
      pendingCount += 1;
      console.log(`[pending] ${migration.fileName}`);
    }
  }

  for (const [version, record] of applied) {
    if (!migrations.some((m) => m.version === version)) {
      console.log(
        `[orphan ] ${version}_${record.name} (in DB, no local file)`,
      );
    }
  }

  console.log("----------------");
  console.log(`Applied: ${appliedCount}  Pending: ${pendingCount}`);
}

main()
  .catch((error: unknown) => {
    const dbError = toDbError(error, "db:status failed");
    console.error(`ERROR [${dbError.code}]: ${dbError.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch {
      // ignore close errors on shutdown
    }
  });
