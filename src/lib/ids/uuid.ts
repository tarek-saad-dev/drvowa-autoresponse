/**
 * Canonical TypeScript/domain UUID representation: lowercase UUID strings.
 * Node crypto.randomUUID() already returns lowercase; mssql UNIQUEIDENTIFIER
 * reads may surface uppercase, so normalize at the DB → domain boundary.
 */

export function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

export function normalizeNullableUuid(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return normalizeUuid(value);
}
