import { describe, expect, it } from "vitest";
import { aiDeliveryNotice } from "@/components/dashboard/inbox-panel";

function job(
  status: "PENDING" | "PROCESSING" | "SENT" | "SKIPPED" | "FAILED" | "COALESCED",
  errorCode: string | null = null,
  createdAtUtc = "2026-10-13T01:00:00.000Z",
) {
  return {
    jobId: "11111111-1111-1111-1111-111111111111",
    status, errorCode, createdAtUtc,
    notBeforeUtc: createdAtUtc,
    completedAtUtc: null,
    hasOutboundProviderMessage: status === "SENT",
  };
}

describe("resume AI delivery feedback", () => {
  const now = Date.parse("2026-10-13T01:00:10.000Z");
  it("never describes a pending job as sent", () => {
    expect(aiDeliveryNotice(job("PENDING"), now)).toContain("لم يُرسل بعد");
    expect(aiDeliveryNotice(job("PROCESSING"), now)).toContain("لم يتأكد الإرسال");
  });
  it("reports success only when the job is SENT", () => {
    expect(aiDeliveryNotice(job("SENT"), now)).toContain("تم إرسال");
  });
  it("shows explicit skip/failure reason for unexpected gates", () => {
    expect(aiDeliveryNotice(job("SKIPPED", "STALE_CONVERSATION_ACTIVATION"), now))
      .toContain("توقيت استئناف البوت");
    expect(aiDeliveryNotice(job("FAILED", "GEMINI_FAILED"), now))
      .toContain("توليد الرد فشل");
    expect(aiDeliveryNotice(job("FAILED", "NOT_READY"), now))
      .toContain("اتصال واتساب مش جاهز");
  });
  it("flags worker stalls without attempting to resend an uncertain job", () => {
    const old = "2026-10-13T00:55:00.000Z";
    expect(aiDeliveryNotice(job("PENDING", null, old), now)).toContain("الـAI Worker");
    expect(aiDeliveryNotice(job("PROCESSING", null, old), now)).toContain("الـAI Worker");
  });
  it("does not claim delivered when no job exists or status is ambiguous", () => {
    expect(aiDeliveryNotice(null, now)).toContain("مفيش محاولة");
    expect(aiDeliveryNotice(job("COALESCED"), now)).toContain("لم يتأكد");
    expect(aiDeliveryNotice(job("FAILED", "OUTBOUND_RESULT_UNKNOWN"), now)).toContain("غير مؤكدة");
  });
});
