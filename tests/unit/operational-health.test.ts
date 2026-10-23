import { describe, expect, it } from "vitest";

import { evaluateOperationalHealth } from "@/modules/ai/operational-health";
import type { WhatsAppConnectionView } from "@/modules/channels/whatsapp-service";

function waView(
  uiState: WhatsAppConnectionView["uiState"],
  inbound: "healthy" | "degraded" | "unknown" | null = "healthy",
): WhatsAppConnectionView {
  return {
    connection: null,
    uiState,
    runtime: inbound
      ? {
          state: uiState === "READY" ? "READY" : "DISCONNECTED",
          ready: uiState === "READY",
          qrAvailable: false,
          lastConnectedAt: null,
          lastDisconnectAt: null,
          lastDisconnectCode: null,
          lastErrorCode: null,
          reconnectAttempts: 0,
          inboundDelivery: {
            running: inbound === "healthy",
            pending: 0,
            quarantined: 0,
            lastDeliveryAt: null,
            lastErrorCode: null,
            health: inbound,
            capture: null,
          },
        }
      : null,
    compatibility: {
      status: null,
      messageAr: null,
    },
  };
}

const workerOk = {
  available: true as const,
  lastHeartbeatAtUtc: new Date(),
  ageMs: 500,
  workerId: "w1",
};

const queueOk = {
  pending: 0,
  eligiblePending: 0,
  processing: 0,
  expiredProcessing: 0,
  processingUnknownOutbound: 0,
  recentFailed: 0,
  recentSent: 1,
  safetyPausedConversations: 0,
  oldestPendingAgeSeconds: null,
  oldestProcessingAgeSeconds: null,
};

describe("evaluateOperationalHealth", () => {
  const base = {
    businessName: "شركة الاخوه للعقارات",
    autoReplyEnabled: true,
    hasActiveAgent: true,
    hasActiveKnowledge: true,
    runtimeProbedAtUtc: new Date(),
    runtimeProbeCached: false,
  };

  it("1. DB ACTIVE is irrelevant — live DISCONNECTED is attention", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("DISCONNECTED"),
      worker: workerOk,
      queue: queueOk,
    });
    expect(result.overall).toBe("attention");
    expect(result.attentionCode).toBe("whatsapp_disconnected");
  });

  it("2. READY + inbound degraded → attention", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("READY", "degraded"),
      worker: workerOk,
      queue: queueOk,
    });
    expect(result.overall).toBe("attention");
    expect(result.attentionCode).toBe("inbound_degraded");
  });

  it("3. Worker stopped while auto-reply enabled → attention", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("READY"),
      worker: {
        available: false,
        lastHeartbeatAtUtc: new Date(Date.now() - 120_000),
        ageMs: 120_000,
        workerId: "w1",
      },
      queue: queueOk,
    });
    expect(result.overall).toBe("attention");
    expect(result.attentionCode).toBe("worker_unavailable");
  });

  it("4. Worker idle but healthy → healthy", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("READY"),
      worker: workerOk,
      queue: { ...queueOk, recentSent: 0, pending: 0 },
    });
    expect(result.overall).toBe("healthy");
    expect(result.attentionCode).toBeNull();
  });

  it("5. Inactive agent → setup attention", () => {
    const result = evaluateOperationalHealth({
      ...base,
      hasActiveAgent: false,
      whatsappView: waView("READY"),
      worker: workerOk,
      queue: queueOk,
    });
    expect(result.overall).toBe("attention");
    expect(result.attentionCode).toBe("setup_incomplete");
  });

  it("6. Missing knowledge or disabled AI", () => {
    expect(
      evaluateOperationalHealth({
        ...base,
        hasActiveKnowledge: false,
        whatsappView: waView("READY"),
        worker: workerOk,
        queue: queueOk,
      }).attentionCode,
    ).toBe("setup_incomplete");

    expect(
      evaluateOperationalHealth({
        ...base,
        autoReplyEnabled: false,
        whatsappView: waView("READY"),
        worker: workerOk,
        queue: queueOk,
      }).attentionCode,
    ).toBe("ai_paused");
  });

  it("7/8. Runtime unknown / missing view → checking", () => {
    expect(
      evaluateOperationalHealth({
        ...base,
        whatsappView: null,
        worker: workerOk,
        queue: queueOk,
      }).overall,
    ).toBe("checking");

    expect(
      evaluateOperationalHealth({
        ...base,
        whatsappView: waView("READY", "unknown"),
        worker: workerOk,
        queue: queueOk,
      }).overall,
    ).toBe("checking");
  });

  it("9. Failed outbound / backlog → attention", () => {
    expect(
      evaluateOperationalHealth({
        ...base,
        whatsappView: waView("READY"),
        worker: workerOk,
        queue: { ...queueOk, recentFailed: 5 },
      }).attentionCode,
    ).toBe("outbound_failures");

    expect(
      evaluateOperationalHealth({
        ...base,
        whatsappView: waView("READY"),
        worker: workerOk,
        queue: {
          ...queueOk,
          eligiblePending: 3,
          oldestPendingAgeSeconds: 300,
        },
      }).attentionCode,
    ).toBe("job_backlog");
  });

  it("10. Recovery path: all signals healthy → healthy", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("READY", "healthy"),
      worker: workerOk,
      queue: queueOk,
    });
    expect(result.overall).toBe("healthy");
  });

  it("worker available=null stays checking (unknown ≠ failure)", () => {
    const result = evaluateOperationalHealth({
      ...base,
      whatsappView: waView("READY"),
      worker: {
        available: null,
        lastHeartbeatAtUtc: null,
        ageMs: null,
        workerId: null,
      },
      queue: queueOk,
    });
    expect(result.overall).toBe("checking");
  });
});
