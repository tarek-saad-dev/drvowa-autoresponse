import sql, { type ConnectionPool } from "mssql";

import { getDbConfig, toMssqlConfig } from "./config";
import { DbError, toDbError } from "./errors";

let pool: ConnectionPool | null = null;
let connecting: Promise<ConnectionPool> | null = null;

/**
 * Returns a singleton mssql connection pool.
 * Validates DB_* env on first connect and fails clearly if misconfigured.
 */
export async function getPool(): Promise<ConnectionPool> {
  if (pool?.connected) {
    return pool;
  }

  if (connecting) {
    return connecting;
  }

  connecting = createPool();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function createPool(): Promise<ConnectionPool> {
  try {
    const config = getDbConfig();
    const next = new sql.ConnectionPool(toMssqlConfig(config));
    await next.connect();
    pool = next;
    return next;
  } catch (error) {
    pool = null;
    if (error instanceof DbError) {
      throw error;
    }
    throw toDbError(error, "Failed to connect to the database");
  }
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  try {
    await pool.close();
  } catch (error) {
    throw toDbError(error, "Failed to close the database pool");
  } finally {
    pool = null;
  }
}

export function getPoolIfConnected(): ConnectionPool | null {
  return pool?.connected ? pool : null;
}
