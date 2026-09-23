import { describe, expect, it } from "vitest";

import {
  assertMaskedPhoneIsSafe,
  maskWhatsAppPhoneForDisplay,
} from "@/modules/channels/phone-mask";

describe("maskWhatsAppPhoneForDisplay", () => {
  it("masks Egypt local mobile like +20 10*** **899", () => {
    expect(maskWhatsAppPhoneForDisplay("01012345689")).toBe("+20 10*** **689");
    expect(maskWhatsAppPhoneForDisplay("201012345689")).toBe("+20 10*** **689");
  });

  it("never embeds accountKey or long digit runs", () => {
    const masked = maskWhatsAppPhoneForDisplay("01098765432");
    expect(masked).toBe("+20 10*** **432");
    expect(assertMaskedPhoneIsSafe(masked)).toBe(true);
    expect(masked).not.toMatch(/wa_/i);
    expect(assertMaskedPhoneIsSafe("wa_f09d54055f079b2624800b46")).toBe(false);
    expect(assertMaskedPhoneIsSafe("+20 10987654321")).toBe(false);
  });

  it("returns null for short/invalid input", () => {
    expect(maskWhatsAppPhoneForDisplay(null)).toBeNull();
    expect(maskWhatsAppPhoneForDisplay("123")).toBeNull();
  });
});
