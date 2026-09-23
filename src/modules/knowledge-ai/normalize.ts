import { createHash } from "node:crypto";

import type { KnowledgeCategory } from "@/constants/knowledge";
import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import {
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_TITLE_MAX,
} from "@/constants/field-limits";

import type { ExtractedFact } from "./types";

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;

export function hashInput(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, (url) => url.toLowerCase())
    .replace(/[^\p{L}\p{N}\s./:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length >= 2);
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[),.]+$/g, "")))];
}

export function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) ?? [];
  return [
    ...new Set(
      matches.map((p) => p.replace(/[^\d+]/g, "")).filter((p) => p.length >= 8),
    ),
  ];
}

export function subjectKey(fact: {
  category: string;
  subject?: string;
  title: string;
}): string {
  const base = normalizeText(fact.subject || fact.title);
  return `${fact.category}:${base}`.slice(0, 200);
}

export function clampTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= KNOWLEDGE_TITLE_MAX) return t;
  return t.slice(0, KNOWLEDGE_TITLE_MAX - 1).trimEnd() + "…";
}

export function clampContent(content: string): string {
  const c = content.trim();
  if (c.length <= KNOWLEDGE_CONTENT_MAX) return c;
  return c.slice(0, KNOWLEDGE_CONTENT_MAX - 1).trimEnd() + "…";
}

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (ALL_KNOWLEDGE_CATEGORIES as string[]).includes(value);
}

/** Collapse near-duplicate facts within the same import. */
export function dedupeExtractedFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  for (const fact of facts) {
    const tokens = tokenize(`${fact.title} ${fact.content}`);
    const urls = new Set([...(fact.urls ?? []), ...extractUrls(fact.content)]);
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      const existing = out[i]!;
      if (existing.category !== fact.category) continue;
      const existingTokens = tokenize(`${existing.title} ${existing.content}`);
      const score = jaccard(tokens, existingTokens);
      const urlOverlap = [...urls].some((u) =>
        (existing.urls ?? []).includes(u)
        || existing.content.includes(u),
      );
      const sameSubject =
        normalizeText(existing.subject || existing.title)
        === normalizeText(fact.subject || fact.title);
      if (score >= 0.72 || sameSubject || urlOverlap) {
        const combinedContent = mergeContents(existing.content, fact.content);
        out[i] = {
          ...existing,
          title: existing.title.length >= fact.title.length
            ? existing.title
            : fact.title,
          content: combinedContent,
          urls: [...new Set([...(existing.urls ?? []), ...urls])],
          aliases: [
            ...new Set([
              ...(existing.aliases ?? []),
              ...(fact.aliases ?? []),
              fact.title,
            ]),
          ],
        };
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...fact, urls: [...urls] });
  }
  return out;
}

export function mergeContents(existing: string, incoming: string): string {
  const a = existing.trim();
  const b = incoming.trim();
  if (!a) return b;
  if (!b) return a;
  if (normalizeText(a) === normalizeText(b)) return a;
  if (normalizeText(a).includes(normalizeText(b))) return a;
  if (normalizeText(b).includes(normalizeText(a))) return b;
  // Append unique lines from incoming
  const existingNorm = normalizeText(a);
  const extraLines = b
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !existingNorm.includes(normalizeText(l)));
  if (extraLines.length === 0) return a;
  return `${a}\n${extraLines.join("\n")}`;
}

export function looksLikePriceConflict(
  existing: string,
  incoming: string,
): boolean {
  const priceRe = /(\d+(?:[.,]\d+)?)\s*(?:جنيه|ج\.?م|egp|le|£|\$)?/gi;
  const a = [...existing.matchAll(priceRe)].map((m) => m[1]!.replace(",", "."));
  const b = [...incoming.matchAll(priceRe)].map((m) => m[1]!.replace(",", "."));
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  return b.some((n) => !setA.has(n));
}
