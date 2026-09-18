import { z } from "zod";

const MAX_TEXT = 8_000;

export const inboundWhatsAppDtoSchema = z
  .object({
    accountKey: z.string().trim().min(1).max(64),
    provider: z.literal("baileys"),
    providerMessageId: z.string().trim().min(1).max(256),
    externalContactKey: z.string().trim().min(1).max(256),
    fromMe: z.boolean(),
    isGroup: z.boolean(),
    messageTimestamp: z.union([z.string(), z.number(), z.null()]).optional(),
    receivedAt: z.union([z.string(), z.number(), z.null()]).optional(),
    upsertType: z.string().trim().min(1).max(32),
    content: z.unknown().optional(),
  })
  .strict();

export type InboundWhatsAppDto = z.infer<typeof inboundWhatsAppDtoSchema>;

export type NormalizedContent = {
  contentType: "TEXT" | "UNKNOWN";
  textContent: string | null;
};

const SAFE_TEXT_KEYS = ["text", "body", "caption", "conversation"] as const;

/**
 * V1 content normalizer — never persists raw provider blobs.
 */
export function normalizeInboundContent(content: unknown): NormalizedContent {
  if (typeof content === "string") {
    const text = content.slice(0, MAX_TEXT);
    return { contentType: "TEXT", textContent: text };
  }

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    for (const key of SAFE_TEXT_KEYS) {
      const value = obj[key];
      if (typeof value === "string") {
        return {
          contentType: "TEXT",
          textContent: value.slice(0, MAX_TEXT),
        };
      }
    }
  }

  return { contentType: "UNKNOWN", textContent: null };
}

/**
 * Derive PhoneNormalized only when confidently available.
 * Never guess from opaque LID identifiers.
 */
export function derivePhoneNormalized(
  externalContactKey: string,
): string | null {
  const key = externalContactKey.trim();
  const jid = /^(\d{8,15})@s\.whatsapp\.net$/i.exec(key);
  if (jid) return jid[1];
  if (/^\+?\d{8,15}$/.test(key)) {
    return key.replace(/^\+/, "");
  }
  return null;
}

export function parseOptionalUtc(
  value: string | number | null | undefined,
): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Baileys often uses unix seconds
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(value.trim())) {
      return parseOptionalUtc(asNum);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
