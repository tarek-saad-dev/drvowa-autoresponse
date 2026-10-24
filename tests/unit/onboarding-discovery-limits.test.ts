import { describe, expect, it } from "vitest";

import {
  DISCOVERY_ANSWER_MAX_CHARS,
  DISCOVERY_TRANSCRIPT_BUDGET,
  formatDiscoveryTranscript,
} from "@/lib/onboarding/discovery-limits";

describe("onboarding training detailed answers", () => {
  it("accepts a detailed answer larger than the legacy 4000-char cap", () => {
    const answer = "خدماتنا وأسعارنا بالتفصيل " + "تفاصيل العملاء. ".repeat(420);
    expect(answer.length).toBeGreaterThan(4000);
    expect(answer.length).toBeLessThanOrEqual(DISCOVERY_ANSWER_MAX_CHARS);
    expect(formatDiscoveryTranscript([{ question: "بتقدموا إيه؟", answer }]))
      .toContain(answer);
  });

  it("keeps the most recent detailed answer within the model prompt budget", () => {
    const older = Array.from({ length: 10 }, (_, i) => ({
      question: "تفاصيل قديمة " + i,
      answer: "معلومات ".repeat(5000),
    }));
    const recent = { question: "إيه التفاصيل الجديدة؟", answer: "تفاصيل حديثة. ".repeat(1000) };
    const turns = [...older, recent];
    const transcript = formatDiscoveryTranscript(turns);
    expect(transcript.length).toBeLessThanOrEqual(DISCOVERY_TRANSCRIPT_BUDGET);
    expect(transcript).toContain(recent.answer);
    expect(turns[0].answer.length).toBe(older[0].answer.length);
    expect(transcript).toContain("محفوظة كاملة للتدريب النهائي");
  });

  it("preserves all answers when the question-generation context is small enough", () => {
    const turns = [
      { question: "بتشتغلوا إمتى؟", answer: "من 12 لـ 10." },
      { question: "فروعكم فين؟", answer: "في محسن." },
    ];
    const transcript = formatDiscoveryTranscript(turns);
    expect(transcript).toContain("من 12 لـ 10");
    expect(transcript).toContain("في محسن");
  });
});
