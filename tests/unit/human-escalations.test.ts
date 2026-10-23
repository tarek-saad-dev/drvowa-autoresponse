import { describe, expect, it } from "vitest";
import {
  escalationMessage,
  isOwnerNotifyEligible,
  normalizeOwnerPhone,
  requestsHumanAgent,
} from "@/modules/escalations/service";

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

  it("keeps wa.me deep-link only for bot-self mirrors, not owner alerts", () => {
    const ownerMsg = escalationMessage({
      businessId: "11111111-1111-1111-1111-111111111111",
      businessName: "Cut Salon",
      customerPhone: "201005536320",
      conversationId: "22222222-2222-2222-2222-222222222222",
      reason: "طلب متابعة",
      includeWhatsAppDeepLink: false,
    });
    expect(ownerMsg).not.toContain("افتح شات العميل");
    expect(ownerMsg).not.toContain("https://wa.me/");
    expect(ownerMsg).toContain("https://app.drvotech.com/dashboard/inbox?businessId=11111111-1111-1111-1111-111111111111&conversationId=22222222-2222-2222-2222-222222222222");

    const botSelfMsg = escalationMessage({
      businessId: "11111111-1111-1111-1111-111111111111",
      businessName: "Cut Salon",
      customerPhone: "201005536320",
      conversationId: "22222222-2222-2222-2222-222222222222",
      reason: "طلب متابعة",
      includeWhatsAppDeepLink: true,
    });
    expect(botSelfMsg).toContain("https://wa.me/201005536320");
    expect(botSelfMsg).not.toContain("متابعة المحادثة داخل DRVO");
    expect(botSelfMsg).not.toContain("dashboard/inbox?");
    expect(botSelfMsg.split("\n").length).toBeLessThanOrEqual(4);
  });

  it("keeps owner alerts eligible for opaque LID customers without a phone", () => {
    expect(isOwnerNotifyEligible({
      enabled: true,
      verified: true,
      ownerPhone: "201557994946",
      customerPhoneNormalized: null,
    })).toBe(true);
    expect(isOwnerNotifyEligible({
      enabled: true,
      verified: true,
      ownerPhone: "201557994946",
      customerPhoneNormalized: "201557994946",
    })).toBe(false);
  });

  it("builds compact bot-self alert with DRVO link when customer phone is unknown", () => {
    const msg = escalationMessage({
      businessId: "11111111-1111-1111-1111-111111111111",
      businessName: "Cut Salon",
      customerPhone: null,
      customerLabel: "208512156172288@lid",
      conversationId: "22222222-2222-2222-2222-222222222222",
      reason: "طلب متابعة",
      includeWhatsAppDeepLink: true,
    });
    expect(msg).toContain("208512156172288@lid");
    expect(msg).not.toContain("https://wa.me/");
    expect(msg).not.toContain("متابعة المحادثة داخل DRVO");
    expect(msg).toContain("dashboard/inbox?");
  });
});
