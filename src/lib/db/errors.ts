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

  if (isUniqueViolationError(error)) {
    return new DbError("Unique constraint violation", {
      code: "DB_UNIQUE_VIOLATION",
    });
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

/** SQL Server unique/PK violations: 2627 (constraint) or 2601 (duplicate key index). */
export function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (error instanceof DbError && error.code === "DB_UNIQUE_VIOLATION") {
    return true;
  }

  const withNumber = error as { number?: number; cause?: unknown };
  if (withNumber.number === 2627 || withNumber.number === 2601) {
    return true;
  }

  if (withNumber.cause) {
    return isUniqueViolationError(withNumber.cause);
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    /Violation of UNIQUE KEY constraint/i.test(message)
    || /Cannot insert duplicate key/i.test(message)
    || /duplicate key/i.test(message)
  );
}
