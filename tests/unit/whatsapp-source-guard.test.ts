import { describe, expect, it, vi } from "vitest";

const dbCalls = vi.hoisted(() => ({
  transaction: vi.fn(),
  channelLookup: vi.fn(),
  scheduleAi: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ withTransaction: dbCalls.transaction }));
vi.mock("@/modules/messaging/repository", () => ({
  resolveChannelByExternalAccountKey: dbCalls.channelLookup,
}));
vi.mock("@/modules/ai/schedule", () => ({
  maybeScheduleAiReplyAfterInbound: dbCalls.scheduleAi,
}));
vi.mock("@/modules/ai/conversation-state-repository", () => ({ pauseConversationAi: vi.fn() }));
vi.mock("@/modules/escalations/service", () => ({
  createEscalation: vi.fn(),
  isEscalationOwnerPhone: vi.fn(),
  requestsHumanAgent: vi.fn(),
}));

import { inboundWhatsAppDtoSchema } from "@/modules/messaging/content";
import { ingestWhatsAppInbound } from "@/modules/messaging/service";
import { classifyBlockedWhatsAppSource } from "@/modules/messaging/whatsapp-source-guard";

const base = {
  accountKey: "test-account",
  provider: "baileys" as const,
  providerMessageId: "WA001",
  externalContactKey: "201555123456",
  fromMe: false,
  isGroup: false,
  upsertType: "notify",
  content: "test message",
};

describe("WhatsApp raw source safety", () => {
  it("accepts both legacy and source-aware DTOs during staged rollout", () => {
    expect(inboundWhatsAppDtoSchema.safeParse(base).success).toBe(true);
    expect(inboundWhatsAppDtoSchema.safeParse({
      ...base, sourceRemoteJid: "120363000000@g.us", sourceIsBroadcast: false,
    }).success).toBe(true);
  });

  it.each([
    ["120363000000@g.us", "group"],
    ["status@broadcast", "broadcast"],
    ["12345@broadcast", "broadcast"],
    ["12345@newsletter", "newsletter"],
    ["12345@call", "call"],
  ] as const)("blocks source JID %s even when sender was rewritten to a phone", async (jid, reason) => {
    vi.clearAllMocks();
    const dto = inboundWhatsAppDtoSchema.parse({ ...base, sourceRemoteJid: jid });
    expect(classifyBlockedWhatsAppSource(dto)).toBe(reason);
    expect(await ingestWhatsAppInbound(dto)).toEqual({ outcome: "ignored", reason });
    expect(dbCalls.channelLookup).not.toHaveBeenCalled();
    expect(dbCalls.transaction).not.toHaveBeenCalled();
    expect(dbCalls.scheduleAi).not.toHaveBeenCalled();
  });

  it("doesn't create AI work for broadcast flags or group externalContactKey", async () => {
    for (const dto of [
      { ...base, sourceIsBroadcast: true },
      { ...base, externalContactKey: "120363000000@g.us" },
    ]) {
      vi.clearAllMocks();
      expect((await ingestWhatsAppInbound(inboundWhatsAppDtoSchema.parse(dto))).outcome).toBe("ignored");
      expect(dbCalls.channelLookup).not.toHaveBeenCalled();
      expect(dbCalls.scheduleAi).not.toHaveBeenCalled();
    }
  });

  it.each(["201555123456@s.whatsapp.net", "123456789@lid"])(
    "does not treat private source %s as group, including replies to statuses",
    (jid) => {
      expect(classifyBlockedWhatsAppSource({
        externalContactKey: base.externalContactKey, sourceRemoteJid: jid,
      })).toBeNull();
    },
  );
});
