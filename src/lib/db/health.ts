import { query } from "./query";

/**
 * Lightweight readiness probe. Returns true if SELECT 1 succeeds.
 * Swallows connection/query details — never throws.
 */
export async function checkDbReady(): Promise<boolean> {
  try {
    await query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
