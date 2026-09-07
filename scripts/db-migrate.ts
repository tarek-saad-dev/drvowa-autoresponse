import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sql from "mssql";

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
  fullPath: string;
};

const MIGRATIONS_DIR = resolve(process.cwd(), "db", "migrations");

/**
 * Soft-load .env into process.env without overwriting existing values.
 * Does not log file contents.
 */
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
      code: "DB_MIGRATE",
    });
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));

  return files.map((fileName) => {
    const match = /^(\d{3})_(.+)\.sql$/i.exec(fileName);
    if (!match) {
      throw new DbError(`Invalid migration file name: ${fileName}`, {
        code: "DB_MIGRATE",
      });
    }

    return {
      version: match[1],
      name: match[2],
      fileName,
      fullPath: resolve(MIGRATIONS_DIR, fileName),
    };
  });
}

async function getAppliedVersions(): Promise<Set<string>> {
  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .query<{ Version: string }>(
        "SELECT Version FROM TblSchemaMigration",
      );
    return new Set(result.recordset.map((row) => String(row.Version)));
  } catch (error) {
    if (isMissingObjectError(error)) {
      return new Set();
    }
    throw toDbError(error, "Failed to read TblSchemaMigration");
  }
}

async function applyMigration(migration: MigrationFile): Promise<void> {
  const sqlText = readFileSync(migration.fullPath, "utf8");
  if (!sqlText.trim()) {
    throw new DbError(`Migration file is empty: ${migration.fileName}`, {
      code: "DB_MIGRATE",
    });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();
  try {
    const batchRequest = new sql.Request(transaction);
    await batchRequest.batch(sqlText);

    const recordRequest = new sql.Request(transaction);
    recordRequest.input("Version", sql.NVarChar(32), migration.version);
    recordRequest.input("Name", sql.NVarChar(256), migration.name);
    await recordRequest.query(`
      INSERT INTO TblSchemaMigration (Version, Name, AppliedAtUtc)
      VALUES (@Version, @Name, SYSUTCDATETIME())
    `);

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // ignore rollback failures; surface the original error
    }
    throw toDbError(
      error,
      `Migration failed: ${migration.fileName}`,
    );
  }
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const migrations = listMigrationFiles();
  if (migrations.length === 0) {
    console.log("No migration files found.");
    return;
  }

  const applied = await getAppliedVersions();
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log(`No pending migrations (${applied.size} already applied).`);
    return;
  }

  console.log(`Applying ${pending.length} pending migration(s)...`);

  for (const migration of pending) {
    console.log(`→ ${migration.fileName}`);
    await applyMigration(migration);
    console.log(`✓ Applied ${migration.version} (${migration.name})`);
  }

  console.log("Migrations complete.");
}

main()
  .catch((error: unknown) => {
    const dbError = toDbError(error, "db:migrate failed");
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
