import type { KnowledgeExtractProvider } from "./gemini-knowledge-provider";
import type { ExtractionResponse } from "./extract-schema";

/**
 * Deterministic extract/dedup provider for unit + e2e (no real Gemini).
 * Detects common Arabic salon/business phrases used in product examples.
 */
export function createMockKnowledgeProvider(): KnowledgeExtractProvider {
  return {
    model: "mock-knowledge-v1",
    async extractFacts(input: string): Promise<ExtractionResponse> {
      const facts: ExtractionResponse["facts"] = [];
      const text = input;

      if (/جليم|gleem/i.test(text)) {
        const urls = text.match(/https?:\/\/\S+/gi) ?? [];
        facts.push({
          tempId: "loc1",
          category: "LOCATION_INFO",
          title: "فرع جليم",
          content: [
            /سابا باشا/.test(text) ? "فرع جليم في سابا باشا." : "فرع جليم.",
            /11/.test(text) ? "المواعيد يومياً من 11 صباحاً إلى 2 صباحاً." : null,
            urls[0] ? `Google Maps: ${urls[0].replace(/[),.]+$/g, "")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          subject: "فرع جليم",
          urls: urls.map((u) => u.replace(/[),.]+$/g, "")),
          confidence: 0.9,
        });
      }

      if (/حلاق|شعر/.test(text) && /200|250/.test(text)) {
        const price = /250/.test(text) ? "250" : "200";
        facts.push({
          tempId: "svc1",
          category: "SERVICE",
          title: "حلاقة شعر",
          content: `الحلاقة ${price} جنيه.`,
          subject: "حلاقة شعر",
          confidence: 0.9,
        });
      }

      if (/شعر ودقن|ودقن/.test(text) && /300/.test(text)) {
        facts.push({
          tempId: "svc2",
          category: "SERVICE",
          title: "شعر ودقن",
          content: "شعر ودقن 300 جنيه.",
          subject: "شعر ودقن",
          confidence: 0.9,
        });
      }

      if (/حجز|ربع ساعة|15/.test(text)) {
        facts.push({
          tempId: "pol1",
          category: "POLICY",
          title: "سياسة الحجز",
          content: "الحجز لازم قبل الموعد بربع ساعة على الأقل.",
          subject: "سياسة الحجز",
          confidence: 0.85,
        });
      }

      if (facts.length === 0 && text.trim().length > 10) {
        facts.push({
          tempId: "c1",
          category: "CUSTOM",
          title: "معلومة عامة",
          content: text.trim().slice(0, 500),
          subject: "معلومة عامة",
          confidence: 0.5,
        });
      }

      return { facts, clarifications: [] };
    },

    async resolveDedup(params) {
      // Let server heuristic handle dedup for mock path
      const { heuristicResolveDedup } = await import("./resolve-dedup");
      return heuristicResolveDedup(params);
    },
  };
}
