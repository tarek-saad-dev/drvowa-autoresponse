import { randomBytes } from "node:crypto";

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short human-readable payment reference, e.g. DRV-A82K4Q */
export function generatePaymentReference(): string {
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i += 1) {
    body += REF_ALPHABET[bytes[i]! % REF_ALPHABET.length];
  }
  return `DRV-${body}`;
}
