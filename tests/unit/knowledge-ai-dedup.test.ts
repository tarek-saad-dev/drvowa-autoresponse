import { describe, expect, it } from "vitest";

import { chunkText } from "@/modules/knowledge-ai/chunk";
import {
  dedupeExtractedFacts,
  hashInput,
  looksLikePriceConflict,
  mergeContents,
  normalizeText,
} from "@/modules/knowledge-ai/normalize";
import { heuristicResolveDedup } from "@/modules/knowledge-ai/resolve-dedup";
import { findCandidatesForFact } from "@/modules/knowledge-ai/candidate-retrieval";
import type { KnowledgeItem } from "@/types/domain";

describe("knowledge-ai normalize", () => {
  it("preserves urls and merges complementary content", () => {
    const merged = mergeContents(
      "فرع جليم في سابا باشا.\nالمواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
      "Google Maps: https://maps.example/gleem",
    );
    expect(merged).toContain("سابا باشا");
    expect(merged).toContain("https://maps.example/gleem");
  });

  it("detects price conflicts", () => {
    expect(looksLikePriceConflict("الحلاقة 200 جنيه", "الحلاقة 250 جنيه")).toBe(
      true,
    );
    expect(looksLikePriceConflict("الحلاقة 200 جنيه", "الحلاقة سعرها 200")).toBe(
      false,
    );
  });

  it("collapses duplicate facts in same import", () => {
    const facts = dedupeExtractedFacts([
      {
        tempId: "1",
        category: "LOCATION_INFO",
        title: "فرع جليم",
        content: "بنفتح 11 صباحاً",
        subject: "فرع جليم",
      },
      {
        tempId: "2",
        category: "LOCATION_INFO",
        title: "فرع جليم",
        content: "مواعيدنا من الساعة 11",
        subject: "فرع جليم",
      },
    ]);
    expect(facts).toHaveLength(1);
  });

  it("hashes input stably", () => {
    expect(hashInput("abc")).toBe(hashInput("abc"));
    expect(hashInput("abc")).not.toBe(hashInput("abd"));
  });

  it("normalizes arabic letters", () => {
    expect(normalizeText("إسكندرية")).toContain("اسكندريه");
  });
});

describe("knowledge-ai chunk", () => {
  it("returns single chunk for small text", () => {
    expect(chunkText("hello world", 100)).toEqual(["hello world"]);
  });

  it("splits large text", () => {
    const text = "A".repeat(30_000);
    const chunks = chunkText(text, 10_000, 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join("").length).toBeGreaterThan(20_000);
  });
});

describe("knowledge-ai dedup", () => {
  const now = new Date();
  const existing: KnowledgeItem = {
    knowledgeItemId: "11111111-1111-4111-8111-111111111111",
    knowledgeBaseId: "22222222-2222-4222-8222-222222222222",
    businessId: "33333333-3333-4333-8333-333333333333",
    category: "SERVICE",
    title: "Hair Cut",
    content: "Hair Cut — 200 EGP",
    isActive: true,
    createdAtUtc: now,
    updatedAtUtc: now,
  };

  it("NOOP for paraphrase duplicate", () => {
    const fact = {
      tempId: "F1",
      category: "SERVICE" as const,
      title: "حلاقة",
      content: "الحلاقة سعرها 200",
      subject: "حلاقة شعر",
    };
    const candidates = findCandidatesForFact(fact, [
      {
        ...existing,
        title: "حلاقة شعر",
        content: "الحلاقة 200 جنيه",
      },
    ]);
    const result = heuristicResolveDedup({
      facts: [fact],
      candidatesByFact: { F1: candidates },
    });
    expect(result.decisions[0]?.action).toBe("NOOP");
  });

  it("CONFLICT for price change", () => {
    const fact = {
      tempId: "F1",
      category: "SERVICE" as const,
      title: "حلاقة",
      content: "الحلاقة بقت 250 جنيه",
      subject: "حلاقة شعر",
    };
    const candidates = findCandidatesForFact(fact, [
      {
        ...existing,
        title: "حلاقة شعر",
        content: "الحلاقة 200 جنيه",
      },
    ]);
    expect(candidates.length).toBeGreaterThan(0);
    const result = heuristicResolveDedup({
      facts: [fact],
      candidatesByFact: { F1: candidates },
    });
    expect(result.decisions[0]?.action).toBe("CONFLICT");
  });

  it("MERGE complementary location link", () => {
    const loc: KnowledgeItem = {
      ...existing,
      knowledgeItemId: "44444444-4444-4444-8444-444444444444",
      category: "LOCATION_INFO",
      title: "فرع جليم",
      content: "فرع جليم في سابا باشا.\nالمواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
    };
    const fact = {
      tempId: "F1",
      category: "LOCATION_INFO" as const,
      title: "فرع جليم",
      content: "Google Maps: https://maps.example/gleem",
      subject: "فرع جليم",
      urls: ["https://maps.example/gleem"],
    };
    const candidates = findCandidatesForFact(fact, [loc]);
    const result = heuristicResolveDedup({
      facts: [fact],
      candidatesByFact: { F1: candidates },
    });
    expect(result.decisions[0]?.action).toBe("MERGE");
    expect(result.decisions[0]?.proposedContent).toContain(
      "https://maps.example/gleem",
    );
    expect(result.decisions[0]?.proposedContent).toContain("سابا باشا");
  });

  it("CREATE when no candidates", () => {
    const fact = {
      tempId: "F1",
      category: "POLICY" as const,
      title: "سياسة الحجز",
      content: "الحجز قبلها بربع ساعة",
      subject: "سياسة الحجز",
    };
    const result = heuristicResolveDedup({
      facts: [fact],
      candidatesByFact: { F1: [] },
    });
    expect(result.decisions[0]?.action).toBe("CREATE");
  });
});
