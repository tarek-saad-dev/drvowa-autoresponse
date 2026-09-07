/**
 * Database error boundary. Messages must never include secrets
 * (passwords, connection strings, tokens, or raw env values).
 */

const SECRET_PATTERNS: RegExp[] = [
  /password\s*[:=]\s*\S+/gi,
  /pwd\s*[:=]\s*\S+/gi,
  /Password=[^;]+/gi,
  /User ID=[^;]+/gi,
  /UID=[^;]+/gi,
  /PWD=[^;]+/gi,
  /Bearer\s+\S+/gi,
];

export function sanitizeDbMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export class DbError extends Error {
  readonly code: string;

  constructor(
    message: string,
    options?: { code?: string; cause?: unknown },
  ) {
    super(sanitizeDbMessage(message), {
      cause: undefined,
    });
    this.name = "DbError";
    this.code = options?.code ?? "DB_ERROR";
    // Intentionally do not attach raw cause — it may contain secrets.
    void options?.cause;
  }
}

export function toDbError(
  error: unknown,
  fallbackMessage = "Database operation failed",
): DbError {
  if (error instanceof DbError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return new DbError(sanitizeDbMessage(error.message), {
      code: "DB_ERROR",
    });
  }

  return new DbError(fallbackMessage, { code: "DB_ERROR" });
}

/** SQL Server error 208: Invalid object name */
export function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const withNumber = error as { number?: number; cause?: unknown };
  if (withNumber.number === 208) {
    return true;
  }

  const message =
    error instanceof Error ? error.message : String(error);
  return /Invalid object name/i.test(message);
}
