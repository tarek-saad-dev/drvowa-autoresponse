import { sanitizeDbMessage } from "@/lib/db";

/**
 * Programming/runtime errors must never be treated as "DB unavailable → skip".
 */
export function isProgrammingError(error: unknown): boolean {
  return (
    error instanceof ReferenceError ||
    error instanceof TypeError ||
    error instanceof SyntaxError ||
    error instanceof RangeError
  );
}

/**
 * Safe, secret-free summary for logging/failing on real DB connectivity issues.
 */
export function formatSafeDbBootstrapFailure(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name || "Error";
    const message = sanitizeDbMessage(error.message || "unknown error");
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return code
      ? `${name} [${code}]: ${message}`
      : `${name}: ${message}`;
  }

  return sanitizeDbMessage(String(error));
}

/**
 * When DB_* is configured, bootstrap failures must fail the suite.
 * Programming errors are rethrown unchanged so they are never mislabeled.
 */
export function rethrowDbBootstrapFailure(error: unknown): never {
  if (isProgrammingError(error)) {
    throw error;
  }

  throw new Error(
    `Database connection failed while DB_* is configured — failing tenant isolation suite (not skipped). ${formatSafeDbBootstrapFailure(error)}`,
  );
}
