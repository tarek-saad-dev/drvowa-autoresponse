import { describe, expect, it, vi } from "vitest";
import {
  isCampaignOptOutRequest, recordCampaignOptOut,
} from "@/modules/messaging/campaign-optout";

describe("customer campaign opt-out", () => {
  it.each([
    "STOP", "unsubscribe", "إلغاء الاشتراك", "وقف العروض",
    "مش عايز عروض", "متبعتوش عروض", "ماتبعتليش عروض",
  ])("recognizes explicit STOP: %s", text => {
    expect(isCampaignOptOutRequest(text)).toBe(true);
  });

  it.each([
    "عايز ألغي حجزي", "إلغاء الحجز", "stop here after the price",
    "العروض إيه؟", "ابعتلي عروض", "", "STOP عرض النهاردة",
    "إيه معنى إلغاء الاشتراك؟",
  ])("does not infer STOP from unrelated messages: %s", text => {
    expect(isCampaignOptOutRequest(text)).toBe(false);
  });

  it("stores an explicit STOP for a resolved direct customer phone only", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const trx = { execute } as never;
    const data = {
      businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channelConnectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      phoneNormalized: "201001234567",
      providerMessageId: "wamid.abc",
    };
    await expect(recordCampaignOptOut(data, trx)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    const [statement, params] = execute.mock.calls[0];
    expect(statement).toContain("TblWhatsAppCampaignOptOut");
    expect(statement).toContain("WITH (HOLDLOCK)");
    expect(params.map((p: {value: unknown}) => p.value)).toContain(data.phoneNormalized);
  });

  it("does not store unresolved IDs or groups", async () => {
    const execute = vi.fn();
    const trx = { execute } as never;
    for (const phoneNormalized of [null, "123@lid", "120363@g.us"]) {
      await expect(recordCampaignOptOut({
        businessId: "a", channelConnectionId: "b",
        phoneNormalized, providerMessageId: "c",
      }, trx)).resolves.toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
