import { describe, expect, it } from "vitest";

import { canonicalizeWhatsAppContactIdentity } from "@/modules/messaging/whatsapp-identity";
import { inboundWhatsAppDtoSchema } from "@/modules/messaging/content";
import { classifyBlockedWhatsAppSource } from "@/modules/messaging/whatsapp-source-guard";

describe("Phase 3B Part 2B.1 WhatsApp contact identity", () => {
  it("1/2/3. bare phone, JID, and plus-prefix canonicalize to digits", () => {
    expect(
      canonicalizeWhatsAppContactIdentity({
        externalContactKey: "201111962602",
      }),
    ).toEqual({
      canonicalExternalContactKey: "201111962602",
      phoneNormalized: "201111962602",
    });

    expect(
      canonicalizeWhatsAppContactIdentity({
        externalContactKey: "201111962602@s.whatsapp.net",
      }),
    ).toEqual({
      canonicalExternalContactKey: "201111962602",
      phoneNormalized: "201111962602",
    });

    expect(
      canonicalizeWhatsAppContactIdentity({
        externalContactKey: "+201111962602",
      }),
    ).toEqual({
      canonicalExternalContactKey: "201111962602",
      phoneNormalized: "201111962602",
    });

    expect(
      canonicalizeWhatsAppContactIdentity({
        phone: "201111962602",
        externalContactKey: "201111962602@s.whatsapp.net",
      }),
    ).toEqual({
      canonicalExternalContactKey: "201111962602",
      phoneNormalized: "201111962602",
    });
  });

  it("11. opaque unresolved LID remains separate", () => {
    const lid = "123456789012345@lid";
    expect(
      canonicalizeWhatsAppContactIdentity({
        externalContactKey: lid,
      }),
    ).toEqual({
      canonicalExternalContactKey: lid,
      phoneNormalized: null,
    });
  });
});

describe("Baileys original chat source admission", () => {
  const base = {
    accountKey: "wa_abc123def456abc123def456",
    provider: "baileys" as const,
    providerMessageId: "WA123",
    externalContactKey: "201555123456",
    fromMe: false,
    isGroup: false,
    upsertType: "notify",
    content: "hello",
  };

  it("accepts optional source metadata without breaking old spooled DTOs", () => {
    expect(inboundWhatsAppDtoSchema.safeParse(base).success).toBe(true);
    expect(inboundWhatsAppDtoSchema.safeParse({
      ...base, sourceRemoteJid: "120363111111@g.us", sourceIsBroadcast: false,
    }).success).toBe(true);
  });

  it("rejects group authors even after they were mapped to a private phone", () => {
    expect(classifyBlockedWhatsAppSource({
      externalContactKey: base.externalContactKey, sourceRemoteJid: "120363111111@g.us",
    })).toBe("group");
    expect(classifyBlockedWhatsAppSource({
      externalContactKey: "120363111111@g.us",
    })).toBe("group");
  });

  it("rejects stories, other broadcast lists and broadcast flag", () => {
    for (const jid of ["status@broadcast", "123456@broadcast"]) {
      expect(classifyBlockedWhatsAppSource({
        externalContactKey: base.externalContactKey, sourceRemoteJid: jid,
      })).toBe("broadcast");
    }
    expect(classifyBlockedWhatsAppSource({
      externalContactKey: base.externalContactKey,
      sourceRemoteJid: "201555123456@s.whatsapp.net",
      sourceIsBroadcast: true,
    })).toBe("broadcast");
  });

  it("rejects newsletter/call but accepts direct PN/LID and private story replies", () => {
    expect(classifyBlockedWhatsAppSource({
      externalContactKey: base.externalContactKey, sourceRemoteJid: "123@newsletter",
    })).toBe("newsletter");
    expect(classifyBlockedWhatsAppSource({
      externalContactKey: base.externalContactKey, sourceRemoteJid: "123@call",
    })).toBe("call");
    for (const jid of ["201555123456@s.whatsapp.net", "123456789@lid"]) {
      expect(classifyBlockedWhatsAppSource({
        externalContactKey: base.externalContactKey, sourceRemoteJid: jid,
      })).toBeNull();
    }
  });
});
