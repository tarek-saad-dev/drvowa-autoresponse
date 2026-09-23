import type { DedupDecisionResponse } from "./extract-schema";
import {
  jaccard,
  looksLikePriceConflict,
  mergeContents,
  normalizeText,
  tokenize,
} from "./normalize";
import type { CandidateAlias, ExtractedFact } from "./types";

/**
 * Deterministic server-side dedup resolver (also used when Gemini is mocked).
 * Prefer MERGE/NOOP/CONFLICT over blind CREATE when candidates are strong.
 */
export function heuristicResolveDedup(params: {
  facts: ExtractedFact[];
  candidatesByFact: Record<string, CandidateAlias[]>;
}): DedupDecisionResponse {
  const decisions = params.facts.map((fact) => {
    const candidates = params.candidatesByFact[fact.tempId] ?? [];
    if (candidates.length === 0) {
      return {
        tempId: fact.tempId,
        action: "CREATE" as const,
        candidateAlias: null,
        proposedTitle: fact.title,
        proposedContent: fact.content,
        reason: "no_candidates",
      };
    }

    let best: { candidate: CandidateAlias; score: number } | null = null;
    for (const candidate of candidates) {
      const score = jaccard(
        tokenize(`${fact.subject} ${fact.title} ${fact.content}`),
        tokenize(`${candidate.title} ${candidate.content}`),
      );
      const subjectHit =
        normalizeText(candidate.title).includes(normalizeText(fact.subject))
        || normalizeText(fact.subject).includes(normalizeText(candidate.title));
      const adjusted = score + (subjectHit ? 0.25 : 0);
      if (!best || adjusted > best.score) {
        best = { candidate, score: adjusted };
      }
    }

    if (!best || best.score < 0.35) {
      return {
        tempId: fact.tempId,
        action: "CREATE" as const,
        candidateAlias: null,
        proposedTitle: fact.title,
        proposedContent: fact.content,
        reason: "weak_match",
      };
    }

    const existing = best.candidate;
    const incomingNorm = normalizeText(fact.content);
    const existingNorm = normalizeText(existing.content);
    if (
      incomingNorm === existingNorm
      || existingNorm.includes(incomingNorm)
      || incomingNorm.includes(existingNorm)
      || jaccard(tokenize(fact.content), tokenize(existing.content)) >= 0.72
    ) {
      return {
        tempId: fact.tempId,
        action: "NOOP" as const,
        candidateAlias: existing.alias,
        proposedTitle: existing.title,
        proposedContent: existing.content,
        reason: "already_present",
      };
    }

    if (looksLikePriceConflict(existing.content, fact.content)) {
      return {
        tempId: fact.tempId,
        action: "CONFLICT" as const,
        candidateAlias: existing.alias,
        proposedTitle: fact.title || existing.title,
        proposedContent: fact.content,
        reason: "price_conflict",
      };
    }

    // Same subject + same numeric facts → treat paraphrase as NOOP
    const priceRe = /(\d+(?:[.,]\d+)?)/g;
    const pricesA = [...existing.content.matchAll(priceRe)].map((m) => m[1]);
    const pricesB = [...fact.content.matchAll(priceRe)].map((m) => m[1]);
    const pricesEqual =
      pricesA.length > 0
      && pricesB.length > 0
      && pricesA.length === pricesB.length
      && pricesA.every((p) => pricesB.includes(p));
    if (pricesEqual && best.score >= 0.4) {
      return {
        tempId: fact.tempId,
        action: "NOOP" as const,
        candidateAlias: existing.alias,
        proposedTitle: existing.title,
        proposedContent: existing.content,
        reason: "paraphrase_same_values",
      };
    }

    const merged = mergeContents(existing.content, fact.content);
    if (normalizeText(merged) === existingNorm) {
      return {
        tempId: fact.tempId,
        action: "NOOP" as const,
        candidateAlias: existing.alias,
        proposedTitle: existing.title,
        proposedContent: existing.content,
        reason: "no_new_info",
      };
    }

    return {
      tempId: fact.tempId,
      action: "MERGE" as const,
      candidateAlias: existing.alias,
      proposedTitle: existing.title,
      proposedContent: merged,
      reason: "complementary",
    };
  });

  return { decisions };
}
