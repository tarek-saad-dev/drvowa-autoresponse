/**
 * Canonical WhatsApp/Baileys contact identity.
 * When a trustworthy phone is available, digits are the durable identity key.
 * Opaque LID / unresolved keys are preserved — never guessed.
 */

import { derivePhoneNormalized } from "./content";

export type WhatsAppContactIdentity = {
  canonicalExternalContactKey: string;
  phoneNormalized: string | null;
};

/**
 * Normalize inbound/outbound WhatsApp contact identity to a single form.
 *
 * Trustworthy phone → canonicalExternalContactKey = digits only.
 * Opaque key without phone → preserve opaque external key, phoneNormalized null.
 */
export function canonicalizeWhatsAppContactIdentity(params: {
  externalContactKey?: string | null;
  phoneNormalized?: string | null;
  phone?: string | null;
}): WhatsAppContactIdentity {
  const rawKey = params.externalContactKey?.trim() || null;
  const fromPhoneField = params.phone?.trim()
    ? derivePhoneNormalized(params.phone.trim())
    : null;
  const fromExplicit =
    params.phoneNormalized?.trim()
      ? derivePhoneNormalized(params.phoneNormalized.trim())
        ?? (/^\d{8,15}$/.test(params.phoneNormalized.trim())
          ? params.phoneNormalized.trim()
          : null)
      : null;
  const fromKey = rawKey ? derivePhoneNormalized(rawKey) : null;

  const phoneNormalized = fromExplicit ?? fromPhoneField ?? fromKey;

  if (phoneNormalized) {
    return {
      canonicalExternalContactKey: phoneNormalized,
      phoneNormalized,
    };
  }

  if (rawKey) {
    return {
      canonicalExternalContactKey: rawKey,
      phoneNormalized: null,
    };
  }

  throw new Error("WhatsApp contact identity requires externalContactKey or phone");
}
