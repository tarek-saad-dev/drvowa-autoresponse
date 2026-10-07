import { describe, expect, it } from "vitest";

import type { KnowledgeItem } from "@/types/domain";

import { selectRelevantKnowledge } from "./knowledge-retrieval";

function item(
  id: string,
  title: string,
  content: string,
  topicKey?: string,
  topicTitle?: string,
): KnowledgeItem {
  return {
    knowledgeItemId: id,
    knowledgeBaseId: "00000000-0000-0000-0000-000000000001",
    businessId: "00000000-0000-0000-0000-000000000002",
    category: "SERVICE",
    title,
    content,
    topicKey: topicKey ?? null,
    topicTitle: topicTitle ?? null,
    isActive: true,
    createdAtUtc: new Date("2026-01-01T00:00:00Z"),
    updatedAtUtc: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("selectRelevantKnowledge", () => {
  it("expands all items in the matched topic", () => {
    const items = [
      item("1", "Signature Groom Package", "باكدج العريس Signature بـ1650 جنيه", "groom_packages", "باكدجات العريس"),
      item("2", "إضافات العريس", "Hair Detail Color بـ150 جنيه", "groom_packages", "باكدجات العريس"),
      item("3", "قص شعر عادي", "قص الشعر بـ200 جنيه", "haircut", "قص الشعر"),
    ];

    const selected = selectRelevantKnowledge({
      items,
      recentMessages: [{
        direction: "INBOUND",
        textContent: "عاوز اعرف باكدجات العريس",
        createdAtUtc: new Date(),
      }],
    });

    expect(selected.map((entry) => entry.knowledgeItemId)).toContain("1");
    expect(selected.map((entry) => entry.knowledgeItemId)).toContain("2");
    expect(selected.map((entry) => entry.knowledgeItemId)).not.toContain("3");
  });

  it("falls back to bounded general knowledge when query has no lexical match", () => {
    const items = [
      item("1", "خدمة أ", "تفاصيل أ"),
      item("2", "خدمة ب", "تفاصيل ب"),
    ];

    const selected = selectRelevantKnowledge({
      items,
      recentMessages: [{
        direction: "INBOUND",
        textContent: "السلام عليكم",
        createdAtUtc: new Date(),
      }],
      maxChars: 10_000,
    });

    expect(selected).toHaveLength(2);
  });
});
