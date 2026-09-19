import { describe, expect, it } from "vitest";

import { canonicalizeWhatsAppContactIdentity } from "@/modules/messaging/whatsapp-identity";

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
