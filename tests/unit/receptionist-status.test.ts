import { describe, expect, it } from "vitest";

import { deriveReceptionistStatus } from "@/lib/dashboard/receptionist-status";

describe("deriveReceptionistStatus", () => {
  const base = {
    businessName: "Cut Salon",
    whatsappStatus: "ACTIVE",
    autoReplyEnabled: true,
    hasActiveAgent: true,
    hasActiveKnowledge: true,
  };

  it("reports working only when WhatsApp, AI, agent, and knowledge are ready", () => {
    const status = deriveReceptionistStatus(base);
    expect(status.kind).toBe("working");
    expect(status.headline).toBe("موظفك شغّال");
    expect(status.detail).toContain("Cut Salon");
    expect(status.whatsappLine).toBe("واتساب متصل");
    expect(status.action).toBeNull();
  });

  it("does not treat WhatsApp alone as operational", () => {
    const status = deriveReceptionistStatus({
      ...base,
      autoReplyEnabled: false,
    });
    expect(status.kind).toBe("ai_paused");
    expect(status.action?.href).toBe("/dashboard/agent");
  });

  it("prioritizes WhatsApp disconnection over AI pause", () => {
    const status = deriveReceptionistStatus({
      ...base,
      whatsappStatus: "DISCONNECTED",
      autoReplyEnabled: false,
    });
    expect(status.kind).toBe("whatsapp_disconnected");
    expect(status.action?.href).toBe("/dashboard/whatsapp");
  });

  it("surfaces WhatsApp errors distinctly", () => {
    const status = deriveReceptionistStatus({
      ...base,
      whatsappStatus: "ERROR",
    });
    expect(status.kind).toBe("error");
    expect(status.tone).toBe("danger");
  });

  it("asks for setup when knowledge is missing", () => {
    const status = deriveReceptionistStatus({
      ...base,
      hasActiveKnowledge: false,
    });
    expect(status.kind).toBe("setup_incomplete");
    expect(status.action?.href).toBe("/dashboard/knowledge");
  });
});
