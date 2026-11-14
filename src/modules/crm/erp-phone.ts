import { normalizeCrmPhone } from "./phone";

/**
 * Cashier has legacy contact fields that can contain placeholders, malformed
 * prefixes and sometimes multiple unrelated phone fragments. Only import an
 * E.164-like phone when it survives the *repository's second normalization*
 * unchanged. Otherwise retain the ERP customer via ExternalErpClientId, with
 * phone NULL; an invalid phone should not halt customer/invoice cursor sync or
 * accidentally create a WhatsApp recipient.
 */
export function normalizeErpCustomerPhone(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const normalized = normalizeCrmPhone(raw);
    if (normalized && normalizeCrmPhone(normalized) === normalized) {
      return normalized;
    }
  }
  return null;
}
