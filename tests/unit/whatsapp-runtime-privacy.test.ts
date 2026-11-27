import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ resolve: vi.fn() }));
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
    vi.stubEnv("DRVOWA_RUNTIME_TOKEN", "test-runtime-privacy-token");
    mock.resolve.mockResolvedValue({ whatsappHistoryImportEnabled: false });
  });
  it("returns only the DB-owned policy for a known account", async () => {
    const res = await POST(request({ accountKey: "account-one" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ historyImportEnabled: false });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mock.resolve).toHaveBeenCalledWith("account-one");
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
      expect(await (await POST(request({ accountKey: "account-one" }))).json()).toEqual({ historyImportEnabled: true });
    }
  });
});
