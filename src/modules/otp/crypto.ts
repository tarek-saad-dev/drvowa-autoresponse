import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Required server-side secret; independent of integration bearer keys. */
function getOtpSecret(): string {
  const value = process.env.OTP_HMAC_SECRET?.trim();
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("OTP_HMAC_SECRET must be configured with at least 32 bytes");
  }
  return value;
}

export function createOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function normalizeOtpPhone(raw: string): string | null {
  const normalized = raw.replace(/[\s\-().]/g, "");
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (!/^\d+$/.test(digits)) return null;
  // Local Egyptian mobile numbers are common on CUT CLUB registration.
  const international = /^01[0125]\d{8}$/.test(digits) ? "20" + digits.slice(1) : digits;
  return /^[1-9]\d{7,14}$/.test(international) ? international : null;
}

export function hashOtpCode(input: {
  businessId: string;
  challengeId: string;
  phone: string;
  purpose: string;
  code: string;
}): string {
  return createHmac("sha256", getOtpSecret())
    .update([input.businessId, input.challengeId, input.phone, input.purpose, input.code].join(":"))
    .digest("hex");
}

export function matchesOtpCode(expectedHash: string, input: Parameters<typeof hashOtpCode>[0]): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashOtpCode(input), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;
