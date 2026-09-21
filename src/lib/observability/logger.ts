/**
 * Structured application logging without a vendor DSN
 * (EXTERNAL_GATE_ERROR_MONITORING). Never log secrets.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|token|authorization|cookie|phone|apikey|api_key|secret|credential)/i;

function scrubValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return scrubFields(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => scrubValue(String(index), item));
  }
  return value;
}

function scrubFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = scrubValue(key, value);
  }
  return out;
}

/**
 * Emit one JSON log line: { ts, scope, event, ...safeFields }.
 * Prefer stable event names documented in docs/OBSERVABILITY.md.
 */
export function structuredLog(
  scope: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = {
    ts: new Date().toISOString(),
    scope,
    event,
    ...scrubFields(fields),
  };
  console.info(JSON.stringify(line));
}
