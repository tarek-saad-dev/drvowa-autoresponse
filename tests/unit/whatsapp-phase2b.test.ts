import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  findWhatsAppConnection: vi.fn(),
  createChannelConnectionShell: vi.fn(),
  updateChannelConnection: vi.fn(),
  getChannelConnection: vi.fn(),
  listChannelConnections: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  startAccount: vi.fn(),
  stopAccount: vi.fn(),
  getAccountStatus: vi.fn(),
  getAccountQr: vi.fn(),
  WhatsAppRuntimeError: class WhatsAppRuntimeError extends Error {
    status: number;
    code: string;
    constructor(message: string, options: { status: number; code: string }) {
      super(message);
      this.name = "WhatsAppRuntimeError";
      this.status = options.status;
      this.code = options.code;
    }
  },
}));

vi.mock("@/modules/channels/repository", () => repoMocks);
vi.mock("@/modules/channels/runtime-client", () => runtimeMocks);
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,TEST_QR"),
  },
}));

import {
  generateWhatsAppAccountKey,
  isValidWhatsAppAccountKey,
} from "@/modules/channels/account-key";
import {
  ensureWhatsAppConnection,
  getTrustedAccountKey,
  getWhatsAppConnectionView,
  getWhatsAppQrForBusiness,
  startWhatsAppPairing,
} from "@/modules/channels/whatsapp-service";
import { getConnection } from "@/modules/channels/service";
import { NotFoundError } from "@/lib/tenancy/errors";

function connection(overrides: Record<string, unknown> = {}) {
  return {
    channelConnectionId: "11111111-1111-1111-1111-111111111111",
    businessId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    locationId: null,
    channel: "WHATSAPP",
    provider: "BAILEYS",
    externalAccountKey: "wa_abc123def456abc123def456",
    displayName: "WhatsApp",
    maskedPhone: null,
    status: "PENDING",
    isActive: false,
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
    ...overrides,
  };
}

describe("Phase 2B WhatsApp control plane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates safe unique account keys compatible with runtime validation", () => {
    const a = generateWhatsAppAccountKey();
    const b = generateWhatsAppAccountKey();
    expect(a).toMatch(/^wa_[a-f0-9]{24}$/);
    expect(a).not.toBe(b);
    expect(isValidWhatsAppAccountKey(a)).toBe(true);
    expect(isValidWhatsAppAccountKey("../etc")).toBe(false);
    expect(isValidWhatsAppAccountKey("a/b")).toBe(false);
  });

  it("persists accountKey in ExternalAccountKey and reuses existing connection", async () => {
    const existing = connection({ externalAccountKey: null });
    repoMocks.findWhatsAppConnection
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        externalAccountKey: "wa_fixedkeyfixedkeyfixedkey12",
      });
    repoMocks.updateChannelConnection.mockResolvedValue({
      ...existing,
      externalAccountKey: "wa_fixedkeyfixedkeyfixedkey12",
    });

    const first = await ensureWhatsAppConnection({
      businessId: existing.businessId,
    });
    expect(first.externalAccountKey).toMatch(/^wa_/);
    expect(repoMocks.updateChannelConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: existing.businessId,
        channelConnectionId: existing.channelConnectionId,
        externalAccountKey: expect.stringMatching(/^wa_/),
      }),
    );

    repoMocks.findWhatsAppConnection.mockResolvedValue(first);
    const second = await ensureWhatsAppConnection({
      businessId: existing.businessId,
    });
    expect(second.channelConnectionId).toBe(first.channelConnectionId);
    expect(repoMocks.createChannelConnectionShell).not.toHaveBeenCalled();
  });

  it("duplicate connect does not create duplicate ChannelConnection", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.startAccount.mockResolvedValue({
      accountKey: existing.externalAccountKey,
      state: "QR_REQUIRED",
      ready: false,
      qrAvailable: true,
      lastConnectedAt: null,
      lastDisconnectAt: null,
      lastDisconnectCode: null,
      lastErrorCode: null,
      reconnectAttempts: 0,
    });
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    await startWhatsAppPairing({ businessId: existing.businessId });
    await startWhatsAppPairing({ businessId: existing.businessId });

    expect(repoMocks.createChannelConnectionShell).not.toHaveBeenCalled();
    expect(runtimeMocks.startAccount).toHaveBeenCalledWith(
      existing.externalAccountKey,
    );
    expect(runtimeMocks.startAccount).toHaveBeenCalledTimes(2);
  });

  it("start uses DB-owned accountKey only", async () => {
    const existing = connection({
      externalAccountKey: "wa_dbowneddbowneddbowneddb01",
    });
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.startAccount.mockResolvedValue({
      accountKey: "wa_dbowneddbowneddbowneddb01",
      state: "STARTING",
      ready: false,
      qrAvailable: false,
      lastConnectedAt: null,
      lastDisconnectAt: null,
      lastDisconnectCode: null,
      lastErrorCode: null,
      reconnectAttempts: 0,
    });
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    await startWhatsAppPairing({ businessId: existing.businessId });
    expect(runtimeMocks.startAccount).toHaveBeenCalledWith(
      "wa_dbowneddbowneddbowneddb01",
    );
  });

  it("Business A cannot read Business B connection via scoped getConnection", async () => {
    repoMocks.getChannelConnection.mockResolvedValue(null);
    await expect(
      getConnection({
        businessId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        channelConnectionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Business A cannot fetch B QR because lookup is business-scoped", async () => {
    repoMocks.findWhatsAppConnection.mockResolvedValue(null);
    const qr = await getWhatsAppQrForBusiness({
      businessId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(qr.qrAvailable).toBe(false);
    expect(qr.qrImageDataUrl).toBeNull();
    expect(runtimeMocks.getAccountQr).not.toHaveBeenCalled();
  });

  it("handles runtime-disabled 503 without corrupting connection", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.startAccount.mockRejectedValue(
      new runtimeMocks.WhatsAppRuntimeError("disabled", {
        status: 503,
        code: "MULTI_ACCOUNT_DISABLED",
      }),
    );

    const view = await startWhatsAppPairing({ businessId: existing.businessId });
    expect(view.uiState).toBe("RUNTIME_DISABLED");
    expect(view.connection?.channelConnectionId).toBe(
      existing.channelConnectionId,
    );
    expect(view.connection?.externalAccountKey).toBe(
      existing.externalAccountKey,
    );
    expect(repoMocks.updateChannelConnection).not.toHaveBeenCalled();
  });

  it("READY hides QR", async () => {
    const existing = connection({ status: "ACTIVE", isActive: true });
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue({
      accountKey: existing.externalAccountKey,
      state: "READY",
      ready: true,
      qrAvailable: false,
      lastConnectedAt: new Date().toISOString(),
      lastDisconnectAt: null,
      lastDisconnectCode: null,
      lastErrorCode: null,
      reconnectAttempts: 0,
    });
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const qr = await getWhatsAppQrForBusiness({
      businessId: existing.businessId,
    });
    expect(qr.uiState).toBe("READY");
    expect(qr.qrImageDataUrl).toBeNull();
    expect(runtimeMocks.getAccountQr).not.toHaveBeenCalled();
  });

  it("LOGGED_OUT requires explicit pairing (no auto reconnect side effect)", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue({
      accountKey: existing.externalAccountKey,
      state: "LOGGED_OUT",
      ready: false,
      qrAvailable: false,
      lastConnectedAt: null,
      lastDisconnectAt: new Date().toISOString(),
      lastDisconnectCode: 401,
      lastErrorCode: "LOGGED_OUT",
      reconnectAttempts: 0,
    });
    repoMocks.updateChannelConnection.mockResolvedValue({
      ...existing,
      status: "DISCONNECTED",
      isActive: false,
    });

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    expect(view.uiState).toBe("LOGGED_OUT");
    expect(runtimeMocks.startAccount).not.toHaveBeenCalled();
  });

  it("trusted account key comes from DB and browser cannot override via service API", async () => {
    const existing = connection({
      externalAccountKey: "wa_onlyfromdbonlyfromdbonly01",
    });
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    const key = await getTrustedAccountKey({
      businessId: existing.businessId,
    });
    expect(key).toBe("wa_onlyfromdbonlyfromdbonly01");
  });

  it("client view path never returns runtime token fields", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue({
      accountKey: existing.externalAccountKey,
      state: "QR_REQUIRED",
      ready: false,
      qrAvailable: true,
      lastConnectedAt: null,
      lastDisconnectAt: null,
      lastDisconnectCode: null,
      lastErrorCode: null,
      reconnectAttempts: 0,
    });
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/Bearer/i);
    expect(serialized).not.toMatch(/DRVOWA_RUNTIME_TOKEN/);
    expect(view.runtime).not.toHaveProperty("token");
  });
});
