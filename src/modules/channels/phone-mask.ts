/**
 * Display-only WhatsApp phone masking. Never use for auth or routing.
 * Example: 01012345689 → +20 10*** **689
 */
export function maskWhatsAppPhoneForDisplay(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;

  let intl = digits;
  if (intl.startsWith("00")) intl = intl.slice(2);
  // Egypt local mobile 01xxxxxxxxx → 201xxxxxxxxx
  if (intl.length === 11 && intl.startsWith("01")) {
    intl = `20${intl.slice(1)}`;
  }
  // Egypt without leading 0: 1xxxxxxxxx (10 digits) rare — leave as-is

  if (intl.length < 10) return null;

  let cc: string;
  let national: string;
  if (intl.startsWith("20") && intl.length >= 12) {
    cc = "20";
    national = intl.slice(2);
  } else if (intl.startsWith("966") && intl.length >= 12) {
    cc = "966";
    national = intl.slice(3);
  } else {
    // Fallback: last 9 as national, rest as country code
    national = intl.slice(-9);
    cc = intl.slice(0, intl.length - 9) || "";
    if (!cc) {
      return `***${intl.slice(-4)}`;
    }
  }

  if (national.length < 6) return `+${cc} ***${national.slice(-4)}`;

  const head = national.slice(0, 2);
  const tail = national.slice(-3);
  // +20 10*** **899
  return `+${cc} ${head}*** **${tail}`;
}

export function assertMaskedPhoneIsSafe(masked: string | null | undefined): boolean {
  if (!masked) return true;
  if (/wa_[a-f0-9]/i.test(masked)) return false;
  if (/accountKey/i.test(masked)) return false;
  if (/Bearer/i.test(masked)) return false;
  // Must not contain a long contiguous digit run (raw number leak)
  if (/\d{8,}/.test(masked.replace(/\s/g, ""))) return false;
  return true;
}
