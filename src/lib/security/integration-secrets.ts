import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey(): Buffer {
  const raw = process.env.INTEGRATION_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error("INTEGRATION_SECRET_KEY is not configured");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function generateIntegrationApiKey(): string {
  return `drvowa_${randomBytes(32).toString("base64url")}`;
}

export function hashIntegrationApiKey(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex");
}

export function encryptIntegrationSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptIntegrationSecret(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid integration secret payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
