import { describe, expect, it, vi } from "vitest";
import {
  isExplicitCampaignOptIn, recordExplicitCampaignOptIn,
} from "@/modules/messaging/campaign-permission";

describe("business-scoped marketing permission", () => {
  it.each([
    "أوافق على استقبال عروض Cut Salon على واتساب",
    "اشترك في عروض Cut Salon على واتساب",
    "I agree to receive WhatsApp offers from Cut Salon",
  ])("accepts a specific opt-in message %s", text => {
    expect(isExplicitCampaignOptIn(text, "Cut Salon")).toBe(true);
  });

  it.each([
    "", "yes", "حجزت معاكم قبل كده", "أوافق على استقبال عروض محل ثاني على واتساب",
    "اشترك في عروض", "STOP", "ابعتلي عروض", "موافق",
    "اشترك في عروض Cut Salon على انستجرام",
  ])("rejects unrelated or ambiguous marketing consent %s", text => {
    expect(isExplicitCampaignOptIn(text, "Cut Salon")).toBe(false);
  });

  it("saves the real message ID and removes an earlier STOP atomically", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const trx = { execute } as never;
    const params = {
      businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channelConnectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      phoneNormalized: "201001234567",
      providerMessageId: "wamid.abc",
      evidenceText: "أوافق على استقبال عروض Cut Salon على واتساب",
    };
    expect(await recordExplicitCampaignOptIn(params, trx)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toContain("TblWhatsAppCampaignPermission");
    expect(execute.mock.calls[1][0]).toContain("TblWhatsAppCampaignOptOut");
    expect(execute.mock.calls[0][1].map((v: {value: unknown}) => v.value))
      .toContain(params.providerMessageId);
  });

  it("rejects LID-only, groups and missing phones", async () => {
    const execute = vi.fn();
    for (const phoneNormalized of [null, "123@lid", "120363@g.us"]) {
      expect(await recordExplicitCampaignOptIn({
        businessId: "a", channelConnectionId: "b", phoneNormalized,
        providerMessageId: "c", evidenceText: "d",
      }, { execute } as never)).toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
