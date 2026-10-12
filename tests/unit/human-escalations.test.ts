import { describe, expect, it } from "vitest";
import { escalationMessage, normalizeOwnerPhone, requestsHumanAgent } from "@/modules/escalations/service";

describe("human escalations", () => {
  it("normalizes Egyptian and international WhatsApp owner numbers", () => {
    expect(normalizeOwnerPhone("010 1234 5678")).toBe("201012345678");
    expect(normalizeOwnerPhone("+20 1012345678")).toBe("201012345678");
    expect(() => normalizeOwnerPhone("abc@evil.example")).toThrow();
  });

  it("triggers only on clear human handoff requests, not ordinary customer questions", () => {
    expect(requestsHumanAgent("عاوز اكلم المدير")).toBe(true);
    expect(requestsHumanAgent("ممكن اتكلم مع موظف")).toBe(true);
    expect(requestsHumanAgent("I want to talk to a real person")).toBe(true);
    expect(requestsHumanAgent("فين فرع جليم؟")).toBe(false);
    expect(requestsHumanAgent("محتاج عنوان الفرع")).toBe(false);
  });

  it("provides both WhatsApp and tenant-authorized DRVO deep links", () => {
    const msg = escalationMessage({
      businessId: "11111111-1111-1111-1111-111111111111",
      businessName: "Cut Salon",
      customerPhone: "201005536320",
      conversationId: "22222222-2222-2222-2222-222222222222",
      reason: "طلب متابعة",
    });
    expect(msg).toContain("https://wa.me/201005536320");
    expect(msg).toContain("https://app.drvotech.com/dashboard/inbox?businessId=11111111-1111-1111-1111-111111111111&conversationId=22222222-2222-2222-2222-222222222222");
    expect(msg).not.toContain("Authorization");
  });
});
