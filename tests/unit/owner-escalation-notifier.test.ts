import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  business: vi.fn(),
  conversation: vi.fn(),
  contact: vi.fn(),
  channel: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  sql: { UniqueIdentifier: "UUID", NVarChar: (n: number) => "NVARCHAR(" + n + ")" },
}));
vi.mock("@/modules/businesses/service", () => ({ getBusinessById: mocks.business }));
vi.mock("@/modules/channels/repository", () => ({ getChannelConnection: mocks.channel }));
vi.mock("@/modules/messaging/repository", () => ({
  getConversationForBusiness: mocks.conversation,
  getContactForBusiness: mocks.contact,
}));
vi.mock("@/modules/channels/runtime-client", () => ({
  sendAccountMessage: vi.fn(), WhatsAppRuntimeError: class extends Error {},
}));
import { deliverNextEscalationNotification } from "@/modules/escalations/notifier";

const id = "11111111-1111-1111-1111-111111111111";
describe("safe owner escalation delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE due")) return { recordset: [{
        EscalationID: id, BusinessID: id, ConversationID: id,
        ChannelConnectionID: id, ReasonText: "العميل محتاج متابعة",
      }] };
      if (sql.includes("FROM dbo.TblHumanEscalationSetting")) return { recordset: [{
        OwnerPhone: "201111111111", IsEnabled: true, PhoneVerifiedAtUtc: new Date(),
      }] };
      return { recordset: [] };
    });
    mocks.business.mockResolvedValue({ name: "Cut Salon" });
    mocks.conversation.mockResolvedValue({ contactId: id });
    mocks.contact.mockResolvedValue({ phoneNormalized: "201222222222" });
    mocks.channel.mockResolvedValue({ externalAccountKey: "cut", isActive: true });
  });
  it("sends both links with the same stable idempotency key and records SENT", async () => {
    const send = vi.fn().mockResolvedValue({ success: true, status: "sent", messageId: "wa-msg" });
    expect(await deliverNextEscalationNotification(send)).toBe("SENT");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      phone: "201111111111", idempotencyKey: "owner-escalation:" + id,
      message: expect.stringContaining("https://wa.me/201222222222"),
    }));
    const update = mocks.query.mock.calls.find(x => x[0].includes("NotificationStatus = @status"));
    expect(update?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "status", value: "SENT" }),
    ]));
  });
  it("quarantines ambiguous send results instead of retrying", async () => {
    const send = vi.fn().mockResolvedValue({ success: false, code: "OUTBOUND_RESULT_UNKNOWN" });
    expect(await deliverNextEscalationNotification(send)).toBe("UNKNOWN");
    const update = mocks.query.mock.calls.find(x => x[0].includes("NotificationStatus = @status"));
    expect(update?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "status", value: "UNKNOWN" }),
    ]));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("prevents sending unverified owner numbers or the customer's own number", async () => {
    mocks.contact.mockResolvedValue({ phoneNormalized: "201111111111" });
    const send = vi.fn();
    expect(await deliverNextEscalationNotification(send)).toBe("FAILED");
    expect(send).not.toHaveBeenCalled();
  });
});
