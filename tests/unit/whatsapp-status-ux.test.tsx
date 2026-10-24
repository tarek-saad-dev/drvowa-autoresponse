import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { WhatsAppConnectionPanel } from "@/components/dashboard/whatsapp-panel";

function view(inbound: {
  health: "healthy" | "degraded" | "unknown";
  issue?: "delivery_stopped" | "decrypt_failures" | null;
}) {
  return {
    uiState: "READY" as const,
    connection: { channelConnectionId: "id", status: "ACTIVE", isActive: true, maskedPhone: "+20 **899" },
    runtime: {
      state: "READY", ready: true, qrAvailable: false, lastErrorCode: null,
      inboundDelivery: {
        running: inbound.issue !== "delivery_stopped",
        pending: 0,
        quarantined: 0,
        lastDeliveryAt: null,
        lastErrorCode: null,
        health: inbound.health,
        issue: inbound.issue ?? null,
      },
    },
    compatibility: null,
  };
}

describe("WhatsApp connection issue UX", () => {
  it("names a confirmed server-side delivery fault and tells the user what to do", () => {
    const markup = renderToStaticMarkup(
      <WhatsAppConnectionPanel initial={view({ health: "degraded", issue: "delivery_stopped" })} />,
    );
    expect(markup).toContain("خدمة توصيل الرسائل متوقفة");
    expect(markup).toContain("الدعم الفني");
    expect(markup).toContain("إعادة فحص الاستقبال");
    expect(markup).not.toContain("استقبال الرسائل محتاج مراجعة.");
  });

  it("does not invent an active failure when diagnostics are unknown", () => {
    const markup = renderToStaticMarkup(
      <WhatsAppConnectionPanel initial={view({ health: "unknown" })} />,
    );
    expect(markup).toContain("غير مؤكد");
    expect(markup).not.toContain("استقبال الرسائل محتاج مراجعة.");
    expect(markup).not.toContain("كل شيء جاهز");
  });

  it("shows healthy reception for a recovered connection", () => {
    const markup = renderToStaticMarkup(
      <WhatsAppConnectionPanel initial={view({ health: "healthy" })} />,
    );
    expect(markup).toContain("واتساب شغال وجاهز");
    expect(markup).not.toContain("إعادة فحص الاستقبال");
  });
});
