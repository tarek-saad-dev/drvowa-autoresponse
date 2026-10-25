import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getIntegrationByType: vi.fn(),
  callIntegrationTool: vi.fn(),
  invokeDrvoErpTool: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));
vi.mock("@/modules/integrations/repository", () => ({
  INTEGRATION_TYPE_DRVO_ERP: "DRVO_ERP",
  getIntegrationByType: mocks.getIntegrationByType,
}));
vi.mock("@/modules/integrations/connector-client", () => ({
  callIntegrationTool: mocks.callIntegrationTool,
}));
vi.mock("@/modules/integrations/service", () => ({
  invokeDrvoErpTool: mocks.invokeDrvoErpTool,
}));

import { resolveLiveErpContext } from "@/modules/integrations/ai-live-context";

const tools = [
  { name: "booking.get_upcoming", mode: "READ", approval: "AUTO", description: "upcoming" },
  { name: "booking.get_by_code", mode: "READ", approval: "AUTO", description: "by code" },
  { name: "booking.reschedule", mode: "WRITE", approval: "CUSTOMER_CONFIRM", description: "reschedule" },
  { name: "booking.cancel", mode: "WRITE", approval: "CUSTOMER_CONFIRM", description: "cancel" },
];
const booking = (code: string, time: string) => ({
  code, workDate: "2026-10-25", time, status: "pending",
  branch: { branchCode: "GLEEM" },
  barber: { empId: 17 },
  services: [{ serviceId: 9 }],
});
const a = booking("BK-ABCD2", "23:00");
const b = booking("BK-BCDE3", "23:30");
const recentMessages = [
  {
    direction: "INBOUND" as const, messageId: "prev-msg", textContent: "أنا حجزت اتنين مع عمر",
    createdAtUtc: new Date("2026-10-25T18:00:00.000Z"),
  },
  {
    direction: "OUTBOUND" as const, messageId: "bot-msg",
    textContent: "تحب نلغي الحجزين ولا نأجلهم؟",
    createdAtUtc: new Date("2026-10-25T20:10:00.000Z"),
  },
  {
    direction: "INBOUND" as const, messageId: "msg-123",
    textContent: "الحزين يوم الاربع اللي جاي في نفس الميعاد",
    createdAtUtc: new Date("2026-10-25T20:14:00.000Z"),
  },
];
const originalGeminiKey = process.env.GEMINI_API_KEY;

const base = {
  businessId: "cut-business",
  customerPhoneHint: "201000000000",
  recentMessages,
};

function modelPlan(confirmed = true) {
  mocks.generateContent
    .mockResolvedValueOnce({ text: JSON.stringify({ action: "RESCHEDULE", tool: null, input: {} }) })
    .mockResolvedValueOnce({ text: JSON.stringify({
      confirmed, expectedCount: 2, bookingCodes: [a.code, b.code],
      workDate: "2026-10-28", sameTime: true, newTime: null,
    }) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T20:14:00.000Z"));
  vi.resetAllMocks();
  process.env.GEMINI_API_KEY = "test-key";
  mocks.getIntegrationByType.mockResolvedValue({
    integrationId: "integration-1", businessId: "cut-business",
    status: "ACTIVE", capabilitiesJson: JSON.stringify({
      contractVersion: "drvowa-erp-v1", provider: "DRVOERP", capabilities: [], tools,
    }),
  });
  mocks.callIntegrationTool.mockImplementation(async ({ tool, input }: {
    tool: string; input: { code?: string; phone?: string };
  }) => {
    if (tool === "booking.get_upcoming") {
      return { ok: true, tool, data: { bookings: [a, b] } };
    }
    if (tool === "booking.get_by_code") {
      if (input.phone !== base.customerPhoneHint) throw Error("wrong phone");
      return { ok: true, tool, data: {
        ownership: "owner", booking: [a, b].find((item) => item.code === input.code),
      } };
    }
    throw Error("unexpected read tool: " + tool);
  });
  mocks.invokeDrvoErpTool.mockImplementation(async ({ input }: {
    input: { code: string; desired: { workDate: string; time: string } };
  }) => ({
    ok: true,
    data: { ok: true, bookingCode: input.code,
      new: { workDate: input.desired.workDate, time: input.desired.time },
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

describe("WhatsApp ERP booking write path", () => {
  it("executes both reschedules after verified ownership and fresh job authorization", async () => {
    modelPlan();
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(result.status).toBe("USED");
    expect(result.replyText).toContain("23:00");
    expect(result.replyText).toContain("23:30");
    expect(result.replyText).toContain("2026-10-28");
    expect(mocks.invokeDrvoErpTool).toHaveBeenCalledTimes(2);
    const calls = mocks.invokeDrvoErpTool.mock.calls.map(([params]) => params);
    expect(calls.map((item) => item.input.desired.time)).toEqual(["23:00", "23:30"]);
    expect(calls.every((item) =>
      item.customerConfirmed === true && item.input.phone === base.customerPhoneHint,
    )).toBe(true);
    expect(calls[0].input.idempotencyKey).not.toBe(calls[1].input.idempotencyKey);
  });

  it("cancels both explicitly confirmed phone-owned bookings with confirmed ERP results", async () => {
    mocks.generateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ action: "CANCEL", tool: null, input: {} }) })
      .mockResolvedValueOnce({ text: JSON.stringify({
        confirmed: true, expectedCount: 2, bookingCodes: [a.code, b.code],
        workDate: null, sameTime: false, newTime: null,
      }) });
    mocks.invokeDrvoErpTool.mockImplementation(async () => ({
      ok: true, data: { ok: true, cancellation: { status: "cancelled" } },
    }));
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(result.replyText).toContain("BK-ABCD2 اتلغى");
    expect(result.replyText).toContain("BK-BCDE3 اتلغى");
    expect(mocks.invokeDrvoErpTool).toHaveBeenCalledTimes(2);
    expect(mocks.invokeDrvoErpTool.mock.calls.every(([item]) =>
      item.tool === "booking.cancel" && item.customerConfirmed === true,
    )).toBe(true);
  });

  it("blocks bulk mutations if more bookings are on the phone than the customer identified", async () => {
    modelPlan();
    mocks.callIntegrationTool.mockImplementationOnce(async () => ({
      ok: true, data: { bookings: [a, b, booking("BK-CDEF4", "23:45")] },
    }));
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(result.replyText).toContain("أكتر من حجز");
    expect(mocks.invokeDrvoErpTool).not.toHaveBeenCalled();
  });

  it("never calls WRITE without an explicit confirmation", async () => {
    modelPlan(false);
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(result.replyText).toContain("محتاج أتأكد");
    expect(mocks.invokeDrvoErpTool).not.toHaveBeenCalled();
  });

  it("does not mutate after a human takeover or lost lease", async () => {
    modelPlan();
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => false });
    expect(mocks.invokeDrvoErpTool).not.toHaveBeenCalled();
    expect(result.replyText).toContain("ماقدرتش أؤكد");
  });

  it("does not claim both bookings succeeded if the second ERP call fails", async () => {
    modelPlan();
    mocks.invokeDrvoErpTool
      .mockImplementationOnce(async ({ input }) => ({
        ok: true, data: { ok: true, new: input.desired },
      }))
      .mockImplementationOnce(async () => ({
        ok: false, error: { code: "SCHEDULE_CONFLICT", message: "conflict" },
      }));
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(result.replyText).toContain("BK-ABCD2 اتنقل");
    expect(result.replyText).toContain("BK-BCDE3");
    expect(result.replyText).toContain("بلاش تعتبر التعديل تم");
  });

  it("does not write when the phone-owned lookup cannot verify a booking", async () => {
    modelPlan();
    mocks.callIntegrationTool.mockImplementationOnce(async () => ({
      ok: true, data: { bookings: [a, b] },
    })).mockImplementationOnce(async () => ({
      ok: true, data: { booking: a, ownership: "minimal" },
    }));
    const result = await resolveLiveErpContext({ ...base, beforeWrite: async () => true });
    expect(mocks.invokeDrvoErpTool).not.toHaveBeenCalled();
    expect(result.replyText).toContain("مفيش أي حجز اتغير");
  });
});
