import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, timingSafeEqual } from "node:crypto";

import {
  derivePhoneNormalized,
  inboundWhatsAppDtoSchema,
  normalizeInboundContent,
} from "@/modules/messaging/content";
import { ingestWhatsAppInbound } from "@/modules/messaging/service";
import {
  assertInboundBodySize,
  requireRuntimeBearer,
  RUNTIME_INBOUND_MAX_BODY_BYTES,
} from "@/lib/api/runtime-auth";
import { AuthError } from "@/lib/tenancy/errors";

describe("Phase 3A content normalization", () => {
  it("17a. string content becomes TEXT", () => {
    expect(normalizeInboundContent("مرحبا")).toEqual({
      contentType: "TEXT",
      textContent: "مرحبا",
    });
  });

  it("17b. structured content extracts safe text field", () => {
    expect(normalizeInboundContent({ text: "hi", raw: "IGNORE" })).toEqual({
      contentType: "TEXT",
      textContent: "hi",
    });
    expect(normalizeInboundContent({ caption: "cap" }).textContent).toBe("cap");
  });

  it("17c. unknown content handled safely", () => {
    expect(normalizeInboundContent({ media: { id: "x" } })).toEqual({
      contentType: "UNKNOWN",
      textContent: null,
    });
    expect(normalizeInboundContent(null)).toEqual({
      contentType: "UNKNOWN",
      textContent: null,
    });
  });

  it("does not guess phone from opaque LID", () => {
    expect(derivePhoneNormalized("123456789012345@lid")).toBeNull();
    expect(derivePhoneNormalized("201555123456@s.whatsapp.net")).toBe(
      "201555123456",
    );
  });
});

describe("Phase 3A inbound DTO validation", () => {
  const base = {
    accountKey: "wa_abc123def456abc123def456",
    provider: "baileys" as const,
    providerMessageId: "msg-1",
    externalContactKey: "201555@s.whatsapp.net",
    fromMe: false,
    isGroup: false,
    upsertType: "notify",
    content: "hello",
  };

  it("accepts valid DTO", () => {
    expect(inboundWhatsAppDtoSchema.parse(base).providerMessageId).toBe("msg-1");
  });

  it("6. runtime cannot inject BusinessID (strict schema)", () => {
    expect(() =>
      inboundWhatsAppDtoSchema.parse({
        ...base,
        BusinessID: "11111111-1111-1111-1111-111111111111",
      }),
    ).toThrow();
    expect(() =>
      inboundWhatsAppDtoSchema.parse({
        ...base,
        businessId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toThrow();
  });

  it("rejects non-baileys provider", () => {
    expect(() =>
      inboundWhatsAppDtoSchema.parse({ ...base, provider: "meta" }),
    ).toThrow();
  });
});

describe("Phase 3A runtime bearer auth", () => {
  const prev = process.env.DRVOWA_RUNTIME_TOKEN;

  beforeEach(() => {
    process.env.DRVOWA_RUNTIME_TOKEN = "phase3a-test-token";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.DRVOWA_RUNTIME_TOKEN;
    else process.env.DRVOWA_RUNTIME_TOKEN = prev;
  });

  it("1. valid runtime token accepted", () => {
    expect(() =>
      requireRuntimeBearer("Bearer phase3a-test-token"),
    ).not.toThrow();
  });

  it("2. missing token rejected", () => {
    expect(() => requireRuntimeBearer(null)).toThrow(AuthError);
    expect(() => requireRuntimeBearer("")).toThrow(AuthError);
  });

  it("3. wrong token rejected", () => {
    expect(() =>
      requireRuntimeBearer("Bearer wrong-token-value"),
    ).toThrow(AuthError);
  });

  it("uses constant-time comparison for equal-length tokens", () => {
    const a = Buffer.from("phase3a-test-token");
    const b = Buffer.from("phase3a-test-token");
    expect(timingSafeEqual(a, b)).toBe(true);
    expect(() =>
      requireRuntimeBearer(
        `Bearer ${createHash("sha256").update("x").digest("hex")}`,
      ),
    ).toThrow(AuthError);
  });

  it("rejects oversized Content-Length", () => {
    const req = new Request("http://localhost/api/runtime/whatsapp/inbound", {
      method: "POST",
      headers: {
        "content-length": String(RUNTIME_INBOUND_MAX_BODY_BYTES + 1),
      },
    });
    expect(() => assertInboundBodySize(req)).toThrow();
  });
});

describe("Phase 3A ingest pre-filters", () => {
  const base = {
    accountKey: "wa_abc123def456abc123def456",
    provider: "baileys" as const,
    providerMessageId: "m1",
    externalContactKey: "201@s.whatsapp.net",
    fromMe: false,
    isGroup: false,
    upsertType: "notify",
    content: "x",
  };

  it("14. fromMe ignored without DB access", async () => {
    expect(await ingestWhatsAppInbound({ ...base, fromMe: true })).toEqual({
      outcome: "ignored",
      reason: "from_me",
    });
  });

  it("15. group ignored without DB access", async () => {
    expect(await ingestWhatsAppInbound({ ...base, isGroup: true })).toEqual({
      outcome: "ignored",
      reason: "group",
    });
  });

  it("16. append/history ignored without DB access", async () => {
    expect(
      await ingestWhatsAppInbound({ ...base, upsertType: "append" }),
    ).toEqual({ outcome: "ignored", reason: "not_live_notify" });
    expect(
      await ingestWhatsAppInbound({ ...base, upsertType: "history" }),
    ).toEqual({ outcome: "ignored", reason: "not_live_notify" });
  });
});
