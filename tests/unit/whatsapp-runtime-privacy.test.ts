import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/messaging/privacy-mode-service", () => ({ getPrivacyMode: vi.fn(async () => ({ mode: "ALL", approved: [] })) }));
const mock = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), removed:vi.fn() }));
vi.mock("@/modules/messaging/private-contact-service", () => ({ listBlockedContactPhones: mock.list,listRemovedContactPhones:mock.removed }));
vi.mock("@/modules/messaging/repository", () => ({
  resolveChannelByExternalAccountKey: mock.resolve,
}));
import { POST } from "@/app/api/runtime/whatsapp/privacy/route";

function request(body: object, token = "test-runtime-privacy-token") {
  return new Request("http://localhost/api/runtime/whatsapp/privacy", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("runtime WhatsApp privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.list.mockResolvedValue([]);mock.removed.mockResolvedValue([]);
    vi.stubEnv("DRVOWA_RUNTIME_TOKEN", "test-runtime-privacy-token");
    mock.resolve.mockResolvedValue({ whatsappHistoryImportEnabled: false });
  });
  it("returns only the DB-owned policy for a known account", async () => {
    const res = await POST(request({ accountKey: "account-one" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ historyImportEnabled: false, resetAtUtc: null, privateContactPhones: [], removedContactPhones:[], mode: "ALL", approvedContactPhones: [] });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mock.resolve).toHaveBeenCalledWith("account-one");
  });
  it("distinguishes reversible exclusion from removal",async()=>{
    mock.list.mockResolvedValue(["201001234567","201001234568"]);mock.removed.mockResolvedValue(["201001234568"]);
    expect(await(await POST(request({accountKey:"account-one"}))).json()).toMatchObject({privateContactPhones:["201001234567","201001234568"],removedContactPhones:["201001234568"]});
  });
  it("reset overrides history consent",async()=>{
    mock.resolve.mockResolvedValue({whatsappHistoryImportEnabled:true,whatsappResetAtUtc:new Date("2026-11-27T00:00:00Z")});
    expect(await(await POST(request({accountKey:"account-one"}))).json()).toMatchObject({historyImportEnabled:false,resetAtUtc:"2026-11-27T00:00:00.000Z"});
  });
  it("does not expose policy to an unauthenticated caller", async () => {
    expect((await POST(request({ accountKey: "account-one" }, "bad"))).status).toBe(401);
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it("rejects tenant overrides and unknown accounts", async () => {
    expect((await POST(request({ accountKey: "account-one", businessId: "other" }))).status).toBe(400);
    mock.resolve.mockResolvedValue(null);
    expect((await POST(request({ accountKey: "account-two" }))).status).toBe(404);
  });
  it("keeps legacy opt-in behavior and supports explicit import", async () => {
    for (const value of [null, true]) {
      mock.resolve.mockResolvedValue({ whatsappHistoryImportEnabled: value });
      expect(await (await POST(request({ accountKey: "account-one" }))).json()).toEqual({ historyImportEnabled: true, resetAtUtc: null, privateContactPhones: [], removedContactPhones:[], mode: "ALL", approvedContactPhones: [] });
    }
  });
});
