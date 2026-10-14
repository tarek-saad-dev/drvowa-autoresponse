import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Machine-to-machine read-only finance export. Fail closed until configured.
 *
 * The token must be random, >=32 characters, stored only in server-side env,
 * and different from any user/session/runtime credential.
 */
export function configuredFinanceExportToken(): string | null {
  const value = process.env.DRVO_GROUP_FINANCE_EXPORT_TOKEN;
  return value && value.length >= 32 ? value : null;
}

export function authorizeFinanceExport(
  authorization: string | null,
  configuredToken: string | null,
): boolean {
  if (!configuredToken || configuredToken.length < 32) return false;
  if (!authorization?.startsWith("Bearer ")) return false;

  const actual = authorization.slice(7);
  if (actual.length < 32 || actual.length > 512) return false;

  // Hash first to avoid variable-length comparisons and timing leaks.
  const expectedDigest = createHash("sha256").update(configuredToken).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}
