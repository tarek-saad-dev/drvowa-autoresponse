/**
 * Grant or revoke platform admin for an existing DRVOWA user.
 *
 * Usage:
 *   npx tsx scripts/grant-platform-admin.ts --email user@example.com
 *   npx tsx scripts/grant-platform-admin.ts --email user@example.com --role BILLING_ADMIN
 *   npx tsx scripts/grant-platform-admin.ts --email user@example.com --revoke
 *
 * Requires DB_* env (loads .env / .env.local if present).
 * Never hard-code emails in application source.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { closePool, query, sql } from "../src/lib/db";
import { upsertPlatformAdmin } from "../src/modules/platform-admin/service";
import type { PlatformAdminRole } from "../src/types/domain";

function loadDotEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/grant-platform-admin.ts --email <email> [--role SUPER_ADMIN|BILLING_ADMIN]
  npx tsx scripts/grant-platform-admin.ts --email <email> --revoke`);
  process.exit(1);
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  let email: string | null = null;
  let role: PlatformAdminRole = "SUPER_ADMIN";
  let revoke = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--email") {
      email = args[++i] ?? null;
    } else if (a === "--role") {
      const r = args[++i];
      if (r !== "SUPER_ADMIN" && r !== "BILLING_ADMIN") usage();
      role = r;
    } else if (a === "--revoke") {
      revoke = true;
    } else {
      usage();
    }
  }

  if (!email) usage();
  const normalized = email.trim().toLowerCase();

  const userResult = await query<{ UserID: string; Email: string }>(
    `SELECT TOP 1 UserID, Email FROM TblUser WHERE LOWER(Email) = @email`,
    [{ name: "email", type: sql.NVarChar(320), value: normalized }],
  );
  const user = userResult.recordset[0];
  if (!user) {
    console.error(`No user found for email: ${normalized}`);
    process.exit(2);
  }

  const admin = await upsertPlatformAdmin({
    userId: user.UserID,
    role,
    isActive: !revoke,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: user.Email,
        userId: admin.userId,
        role: admin.role,
        isActive: admin.isActive,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
  });
