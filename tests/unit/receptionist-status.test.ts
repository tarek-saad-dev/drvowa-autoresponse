import { describe, expect, it } from "vitest";

import { deriveReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import type { ReceptionistOperationalHealth } from "@/modules/ai/operational-health";

function health(
  overrides: Partial<ReceptionistOperationalHealth>,
): ReceptionistOperationalHealth {
  return {
    overall: "healthy",
    attentionCode: null,
    whatsappLiveState: "READY",
    inboundHealth: "healthy",
    worker: {
      available: true,
      lastHeartbeatAtUtc: new Date(),
      ageMs: 1_000,
      workerId: "w1",
    },
    autoReplyEnabled: true,
    hasActiveAgent: true,
    hasActiveKnowledge: true,
    runtimeProbedAtUtc: new Date(),
    runtimeProbeCached: false,
    ...overrides,
  };
}

describe("deriveReceptionistStatus", () => {
  it("reports working only with live operational health", () => {
    const status = deriveReceptionistStatus({
      businessName: "شركة الاخوه للعقارات",
      health: health({}),
    });
    expect(status.kind).toBe("working");
    expect(status.headline).toBe("موظفك شغّال");
    expect(status.detail).toContain("شركة الاخوه للعقارات");
    expect(status.whatsappLine).toBe("واتساب متصل");
    expect(status.action).toBeNull();
  });

  it("never reports working from DB ACTIVE alone (legacy path → checking)", () => {
    const status = deriveReceptionistStatus({
      businessName: "Cut Salon",
      whatsappStatus: "ACTIVE",
      autoReplyEnabled: true,
      hasActiveAgent: true,
      hasActiveKnowledge: true,
    });
    expect(status.kind).toBe("checking");
    expect(status.headline).toBe("جاري التحقق من تشغيل الموظف");
  });

  it("surfaces inbound delivery problems", () => {
    const status = deriveReceptionistStatus({
      businessName: "Cut Salon",
      health: health({
        overall: "attention",
        attentionCode: "inbound_degraded",
        inboundHealth: "degraded",
      }),
    });
    expect(status.kind).toBe("attention");
    expect(status.detail).toContain("استقبال رسائل واتساب");
    expect(status.action?.href).toBe("/dashboard/whatsapp");
  });

  it("surfaces worker unavailable distinctly from WhatsApp", () => {
    const status = deriveReceptionistStatus({
      businessName: "Cut Salon",
      health: health({
        overall: "attention",
        attentionCode: "worker_unavailable",
        worker: {
          available: false,
          lastHeartbeatAtUtc: null,
          ageMs: null,
          workerId: null,
        },
      }),
    });
    expect(status.kind).toBe("attention");
    expect(status.detail).toContain("متوقفة مؤقتًا");
  });

  it("keeps AI pause actionable", () => {
    const status = deriveReceptionistStatus({
      businessName: "Cut Salon",
      health: health({
        overall: "attention",
        attentionCode: "ai_paused",
        autoReplyEnabled: false,
      }),
    });
    expect(status.kind).toBe("ai_paused");
    expect(status.action?.href).toBe("/dashboard/agent");
  });

  it("prioritizes live WhatsApp disconnection", () => {
    const status = deriveReceptionistStatus({
      businessName: "Cut Salon",
      health: health({
        overall: "attention",
        attentionCode: "whatsapp_disconnected",
        whatsappLiveState: "DISCONNECTED",
      }),
    });
    expect(status.kind).toBe("whatsapp_disconnected");
    expect(status.action?.href).toBe("/dashboard/whatsapp");
  });
});
