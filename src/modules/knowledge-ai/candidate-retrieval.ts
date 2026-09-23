import type { KnowledgeItem } from "@/types/domain";

import {
  KNOWLEDGE_INGEST_FALLBACK_CANDIDATES,
  KNOWLEDGE_INGEST_MAX_CANDIDATES,
} from "./constants";
import {
  extractPhones,
  extractUrls,
  jaccard,
  normalizeText,
  tokenize,
} from "./normalize";
import type { CandidateAlias, ExtractedFact } from "./types";

const STRONG_SCORE = 0.22;

function factTokenMaterial(fact: ExtractedFact): string {
  const aliases = (fact.aliases ?? []).join(" ");
  return `${fact.subject} ${fact.title} ${aliases} ${fact.content}`;
}

function itemTokenMaterial(item: KnowledgeItem): string {
  return `${item.title} ${item.content}`;
}

function scoreCandidate(fact: ExtractedFact, item: KnowledgeItem): number {
  if (item.category !== fact.category) {
    if (fact.category !== "CUSTOM" && item.category !== "CUSTOM") return 0;
  }

  const factTokens = tokenize(factTokenMaterial(fact));
  const itemTokens = tokenize(itemTokenMaterial(item));
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

  const factTitles = [
    fact.subject,
    fact.title,
    ...(fact.aliases ?? []),
  ].map(normalizeText);

  const itemTitle = normalizeText(item.title);
  const titleOverlap = factTitles.some(
    (t) =>
      t.length > 0
      && (itemTitle.includes(t) || t.includes(itemTitle) || itemTitle === t),
  );
  if (titleOverlap) score += 0.3;

  // Exact URL / phone already boosted; exact normalized title match
  if (factTitles.includes(itemTitle)) score += 0.15;

  return score;
}

function toAliases(
  ranked: Array<{ item: KnowledgeItem; score: number }>,
): CandidateAlias[] {
  return ranked.map((r, index) => ({
    alias: `K${index + 1}`,
    knowledgeItemId: r.item.knowledgeItemId,
    category: r.item.category,
    title: r.item.title,
    content: r.item.content,
    updatedAtUtc: r.item.updatedAtUtc,
  }));
}

/**
 * Bound candidate retrieval — never send the full knowledge library to the model.
 * Uses subject + title + aliases + content for scoring, with a bounded
 * same-category fallback when lexical recall is weak.
 */
export function findCandidatesForFact(
  fact: ExtractedFact,
  items: KnowledgeItem[],
  limit = KNOWLEDGE_INGEST_MAX_CANDIDATES,
): CandidateAlias[] {
  const scored = items
    .map((item) => ({ item, score: scoreCandidate(fact, item) }))
    .sort((a, b) => b.score - a.score);

  const strong = scored
    .filter((r) => r.score >= STRONG_SCORE)
    .slice(0, limit);

  if (strong.length > 0) {
    return toAliases(strong);
  }

  // Low lexical recall: bounded same-category fallback so the semantic resolver
  // can still decide MERGE/CONFLICT/CREATE — never dump the full library.
  const sameCategory = scored
    .filter((r) => r.item.category === fact.category)
    .slice(0, Math.min(KNOWLEDGE_INGEST_FALLBACK_CANDIDATES, limit));

  return toAliases(sameCategory);
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
