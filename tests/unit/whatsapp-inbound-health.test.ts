import { describe, expect, it, vi, beforeEach } from "vitest";

const repoMocks = vi.hoisted(() => ({
  findWhatsAppConnection: vi.fn(),
  createChannelConnectionShell: vi.fn(),
  updateChannelConnection: vi.fn(),
  updateCompatibilityObservation: vi.fn(async (params) => ({
    channelConnectionId: params.channelConnectionId,
    businessId: params.businessId,
    locationId: null,
    channel: "WHATSAPP",
    provider: "BAILEYS",
    externalAccountKey: "wa_abc123def456abc123def456",
    displayName: "WhatsApp",
    maskedPhone: null,
    status: "ACTIVE",
    isActive: true,
    runtimeEngine: "BAILEYS_V6",
    compatibilityStatus: params.compatibilityStatus,
    compatibilityReason: params.compatibilityReason,
    compatibilityUpdatedAt: new Date(),
    recommendedRuntimeEngine: params.recommendedRuntimeEngine,
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
  })),
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
vi.mock("@/modules/locations/service", () => ({
  listLocations: vi.fn(async () => []),
}));
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,TEST_QR"),
  },
}));

import {
  assessInboundDeliveryHealth,
  diagnoseInboundDelivery,
  getWhatsAppConnectionView,
  inboundErrorCodeLabelAr,
} from "@/modules/channels/whatsapp-service";

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
    status: "ACTIVE",
    isActive: true,
    runtimeEngine: "BAILEYS_V6",
    compatibilityStatus: null,
    compatibilityReason: null,
    compatibilityUpdatedAt: null,
    recommendedRuntimeEngine: null,
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
    ...overrides,
  };
}

function readyStatus(inbound: Record<string, unknown> | null | undefined) {
  return {
    accountKey: "wa_abc123def456abc123def456",
    state: "READY",
    ready: true,
    qrAvailable: false,
    lastConnectedAt: new Date().toISOString(),
    lastDisconnectAt: null,
    lastDisconnectCode: null,
    lastErrorCode: null,
    reconnectAttempts: 0,
    inboundDelivery: inbound === undefined
      ? {
          running: true,
          pending: 0,
          delivered: 10,
          failed: 0,
          quarantined: 0,
          inFlight: false,
          lastDeliveryAt: new Date().toISOString(),
          lastErrorCode: null,
        }
      : inbound,
  };
}

describe("inbound delivery health assessment", () => {
  it("READY + healthy inbound → healthy", () => {
    expect(
      assessInboundDeliveryHealth({
        running: true,
        pending: 0,
        delivered: 5,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: "2026-09-23T05:00:00.000Z",
        lastErrorCode: null,
      }),
    ).toBe("healthy");
  });

  it("READY + delivery worker stopped → degraded", () => {
    expect(
      assessInboundDeliveryHealth({
        running: false,
        pending: 2,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: null,
      }),
    ).toBe("degraded");
  });

  it("READY + AUTH_CONFIG → degraded", () => {
    expect(
      assessInboundDeliveryHealth({
        running: true,
        pending: 1,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: "AUTH_CONFIG",
      }),
    ).toBe("degraded");
  });

  it("READY + MAPPING_CONFIG → degraded", () => {
    expect(
      assessInboundDeliveryHealth({
        running: true,
        pending: 1,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: "MAPPING_CONFIG",
      }),
    ).toBe("degraded");
  });

  it("missing inboundDelivery → unknown", () => {
    expect(assessInboundDeliveryHealth(null)).toBe("unknown");
    expect(assessInboundDeliveryHealth(undefined)).toBe("unknown");
  });

  it("historical quarantine counters do not keep recovered WhatsApp in warning forever", () => {
    expect(
      diagnoseInboundDelivery(
        {
          running: true, pending: 0, delivered: 10, failed: 0,
          quarantined: 3, inFlight: false, lastDeliveryAt: null, lastErrorCode: null,
        },
        {
          rawUpsert: 12, captured: 9, unresolvedLid: 3,
          decryptFailed: 2, emptyContent: 0, quarantined: 3,
          pendingLid: 0, listening: true, lastEventAt: "2026-10-24T03:00:00Z",
          lastDecryptFailureAt: "2026-10-24T02:30:00Z",
          lastPlaintextInboundAt: "2026-10-24T03:00:00Z",
          activeFailureStreak: 0,
        },
        new Date("2026-10-24T03:01:00Z"),
      ),
    ).toEqual({ health: "healthy", issue: null });
  });

  it("recent repeated active decryption failure produces an explicit diagnosis", () => {
    const result = diagnoseInboundDelivery(
      {
        running: true, pending: 0, delivered: 1, failed: 0,
        quarantined: 0, inFlight: false, lastDeliveryAt: null, lastErrorCode: null,
      },
      {
        rawUpsert: 4, captured: 1, unresolvedLid: 0,
        decryptFailed: 3, emptyContent: 0, quarantined: 0,
        pendingLid: 0, listening: true, lastEventAt: "2026-10-24T03:00:00Z",
        lastDecryptFailureAt: "2026-10-24T03:00:00Z",
        lastPlaintextInboundAt: "2026-10-24T02:50:00Z",
        activeFailureStreak: 3,
      },
      new Date("2026-10-24T03:01:00Z"),
    );
    expect(result).toEqual({ health: "degraded", issue: "decrypt_failures" });
  });

  it("does not keep an expired error episode in a permanent degraded state", () => {
    expect(diagnoseInboundDelivery(
      {
        running: true, pending: 0, delivered: 1, failed: 0,
        quarantined: 0, inFlight: false, lastDeliveryAt: null, lastErrorCode: null,
      },
      {
        rawUpsert: 3, captured: 1, unresolvedLid: 0,
        decryptFailed: 2, emptyContent: 0, quarantined: 0,
        pendingLid: 0, listening: true, lastEventAt: "2026-10-24T02:00:00Z",
        lastDecryptFailureAt: "2026-10-24T02:00:00Z",
        activeFailureStreak: 2,
      },
      new Date("2026-10-24T03:01:00Z"),
    )).toEqual({ health: "healthy", issue: null });
  });

  it("active stalled listener and stopped delivery worker have separate reasons", () => {
    const inbound = {
      running: true, pending: 1, delivered: 2, failed: 0, quarantined: 0,
      inFlight: false, lastDeliveryAt: null, lastErrorCode: null,
    };
    expect(diagnoseInboundDelivery({ ...inbound, running: false })).toEqual({
      health: "degraded", issue: "delivery_stopped",
    });
    expect(diagnoseInboundDelivery(inbound, {
      rawUpsert: 2, captured: 1, unresolvedLid: 1, decryptFailed: 0,
      emptyContent: 0, quarantined: 0, pendingLid: 1,
      listening: false, lastEventAt: null,
    })).toEqual({ health: "degraded", issue: "capture_listener_stopped" });
  });

  it("maps config codes to Arabic without leaking internals", () => {
    expect(inboundErrorCodeLabelAr("AUTH_CONFIG")).toMatch(/مصادقة/);
    expect(inboundErrorCodeLabelAr("MAPPING_CONFIG")).toMatch(/ربط/);
    expect(inboundErrorCodeLabelAr("CONFIG_MISSING")).toMatch(/إعدادات/);
  });
});

describe("WhatsApp connection view exposes safe inboundDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("READY + healthy inbound → fully healthy view", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue(readyStatus(undefined));
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    expect(view.uiState).toBe("READY");
    expect(view.runtime?.inboundDelivery?.health).toBe("healthy");
    expect(view.runtime?.inboundDelivery?.running).toBe(true);
    expect(JSON.stringify(view.runtime)).not.toMatch(/Bearer|DRVOWA_RUNTIME_TOKEN/i);
    expect(view.runtime).not.toHaveProperty("token");
    expect(view.runtime).not.toHaveProperty("accountKey");
    expect(view.runtime?.inboundDelivery).not.toHaveProperty("authDir");
  });

  it("READY + worker stopped → degraded inbound health", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue(
      readyStatus({
        running: false,
        pending: 3,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: null,
      }),
    );
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    expect(view.uiState).toBe("READY");
    expect(view.runtime?.inboundDelivery?.health).toBe("degraded");
    expect(view.runtime?.inboundDelivery?.running).toBe(false);
    expect(view.runtime?.inboundDelivery?.issue).toBe("delivery_stopped");
    expect(view.runtime?.inboundDelivery?.pending).toBe(3);
  });

  it("READY + AUTH_CONFIG → degraded", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue(
      readyStatus({
        running: true,
        pending: 1,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: "AUTH_CONFIG",
      }),
    );
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    expect(view.uiState).toBe("READY");
    expect(view.runtime?.inboundDelivery?.health).toBe("degraded");
    expect(view.runtime?.inboundDelivery?.lastErrorCode).toBe("AUTH_CONFIG");
  });

  it("READY + MAPPING_CONFIG → degraded", async () => {
    const existing = connection();
    repoMocks.findWhatsAppConnection.mockResolvedValue(existing);
    runtimeMocks.getAccountStatus.mockResolvedValue(
      readyStatus({
        running: true,
        pending: 1,
        delivered: 0,
        failed: 0,
        quarantined: 0,
        inFlight: false,
        lastDeliveryAt: null,
        lastErrorCode: "MAPPING_CONFIG",
      }),
    );
    repoMocks.updateChannelConnection.mockResolvedValue(existing);

    const view = await getWhatsAppConnectionView({
      businessId: existing.businessId,
    });
    expect(view.runtime?.inboundDelivery?.health).toBe("degraded");
    expect(view.runtime?.inboundDelivery?.lastErrorCode).toBe("MAPPING_CONFIG");
  });
});
