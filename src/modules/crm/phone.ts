/**
 * CRM phone normalization for Egyptian and international numbers.
 * Aligns with campaign list normalization while producing a stable join key.
 */

export function normalizeCrmPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate || !/^\+?[\d ()\-./]+$/.test(candidate)) return null;
  let digits = candidate.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Egyptian local mobile: 010/011/012/015 → 2010...
  if (/^01[0125]\d{8}$/.test(digits)) digits = "2" + digits;
  // Egyptian without country code but already 10 digits starting 1
  if (/^1[0125]\d{8}$/.test(digits)) digits = "20" + digits;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Last 10 digits used for ERP Mobile matching (EG local style). */
export function phoneMatchSuffix(phoneNormalized: string | null | undefined): string | null {
  if (!phoneNormalized) return null;
  const digits = phoneNormalized.replace(/[^0-9]/g, "");
  if (digits.length < 10) return digits.length >= 8 ? digits : null;
  return digits.slice(-10);
}

export function phonesLikelySame(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = phoneMatchSuffix(normalizeCrmPhone(a) ?? a ?? null);
  const sb = phoneMatchSuffix(normalizeCrmPhone(b) ?? b ?? null);
  return Boolean(sa && sb && sa === sb);
}
