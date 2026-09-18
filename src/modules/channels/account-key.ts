/**
 * Safe WhatsApp runtime accountKey helpers.
 * Must match whatsapp-bot validation: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
 */
import { randomBytes } from "node:crypto";

const ACCOUNT_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export function generateWhatsAppAccountKey(): string {
  // wa_ + 24 hex chars = 27 chars total, immutable and non-user-controlled
  return `wa_${randomBytes(12).toString("hex")}`;
}

export function isValidWhatsAppAccountKey(value: string): boolean {
  return ACCOUNT_KEY_RE.test(value);
}
