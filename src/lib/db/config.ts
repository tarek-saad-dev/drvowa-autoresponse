import sql from "mssql";

import { DbError } from "./errors";

export type DbConfig = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new DbError(
      `Missing required environment variable: ${name}`,
      { code: "DB_CONFIG" },
    );
  }
  return value;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new DbError(
    `Invalid ${name}: expected a boolean (true/false)`,
    { code: "DB_CONFIG" },
  );
}

/**
 * Reads DB_* environment variables.
 * Throws DbError with a clear message if required values are missing.
 * Never includes secret values in error messages.
 */
export function getDbConfig(): DbConfig {
  const portRaw = requireEnv("DB_PORT");
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new DbError(
      "Invalid DB_PORT: expected an integer between 1 and 65535",
      { code: "DB_CONFIG" },
    );
  }

  return {
    server: requireEnv("DB_SERVER"),
    port,
    database: requireEnv("DB_NAME"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    options: {
      encrypt: parseBoolEnv("DB_ENCRYPT", true),
      trustServerCertificate: parseBoolEnv(
        "DB_TRUST_SERVER_CERTIFICATE",
        false,
      ),
    },
  };
}

/** Builds an mssql config object from validated env (password never logged). */
export function toMssqlConfig(config: DbConfig): sql.config {
  return {
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.options.encrypt,
      trustServerCertificate: config.options.trustServerCertificate,
    },
  };
}
