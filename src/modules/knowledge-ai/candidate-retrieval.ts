import type { KnowledgeItem } from "@/types/domain";

import { KNOWLEDGE_INGEST_MAX_CANDIDATES } from "./constants";
import {
  extractPhones,
  extractUrls,
  jaccard,
  normalizeText,
  tokenize,
} from "./normalize";
import type { CandidateAlias, ExtractedFact } from "./types";

function scoreCandidate(fact: ExtractedFact, item: KnowledgeItem): number {
  if (item.category !== fact.category) {
    // Allow weak cross-category only for CUSTOM edges
    if (fact.category !== "CUSTOM" && item.category !== "CUSTOM") return 0;
  }
  const factTokens = tokenize(`${fact.subject} ${fact.title} ${fact.content}`);
  const itemTokens = tokenize(`${item.title} ${item.content}`);
  let score = jaccard(factTokens, itemTokens);

  const factUrls = new Set([
    ...(fact.urls ?? []),
    ...extractUrls(fact.content),
  ]);
  const itemUrls = extractUrls(item.content);
  for (const u of factUrls) {
    if (itemUrls.includes(u) || item.content.includes(u)) score += 0.35;
  }

  const factPhones = extractPhones(`${fact.title} ${fact.content}`);
  const itemPhones = extractPhones(`${item.title} ${item.content}`);
  for (const p of factPhones) {
    if (itemPhones.includes(p)) score += 0.25;
  }

  const titleOverlap =
    normalizeText(item.title).includes(normalizeText(fact.subject))
    || normalizeText(fact.subject).includes(normalizeText(item.title))
    || normalizeText(item.title) === normalizeText(fact.title);
  if (titleOverlap) score += 0.3;

  return score;
}

/**
 * Bound candidate retrieval — never send the full knowledge library to the model.
 */
export function findCandidatesForFact(
  fact: ExtractedFact,
  items: KnowledgeItem[],
  limit = KNOWLEDGE_INGEST_MAX_CANDIDATES,
): CandidateAlias[] {
  const ranked = items
    .map((item) => ({ item, score: scoreCandidate(fact, item) }))
    .filter((r) => r.score >= 0.22)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map((r, index) => ({
    alias: `K${index + 1}`,
    knowledgeItemId: r.item.knowledgeItemId,
    category: r.item.category,
    title: r.item.title,
    content: r.item.content,
    updatedAtUtc: r.item.updatedAtUtc,
  }));
}

export function buildCandidatesByFact(
  facts: ExtractedFact[],
  items: KnowledgeItem[],
): Record<string, CandidateAlias[]> {
  const map: Record<string, CandidateAlias[]> = {};
  for (const fact of facts) {
    map[fact.tempId] = findCandidatesForFact(fact, items);
  }
  return map;
}
