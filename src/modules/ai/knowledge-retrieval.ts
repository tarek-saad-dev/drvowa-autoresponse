import type { KnowledgeItem, Message } from "@/types/domain";

import { normalizeText, tokenize } from "@/modules/knowledge-ai/normalize";

const DEFAULT_MAX_CHARS = 12_000;
const MAX_SEEDS = 4;

const STOP_WORDS = new Set([
  "انا", "انت", "هو", "هي", "في", "من", "على", "عن", "لو", "ولا", "او",
  "عاوز", "عايز", "محتاج", "ممكن", "ايه", "إيه", "ده", "دي", "دا", "هل",
  "the", "a", "an", "is", "are", "do", "does", "i", "you", "what", "how",
]);

const FALLBACK_CATEGORY_ORDER = [
  "ABOUT",
  "SERVICE",
  "FAQ",
  "POLICY",
  "LOCATION_INFO",
  "CUSTOM",
] as const;

function meaningfulTokens(input: string): string[] {
  return tokenize(input).filter((token) => !STOP_WORDS.has(token));
}

function overlapCount(query: Set<string>, text: string): number {
  let count = 0;
  for (const token of new Set(meaningfulTokens(text))) {
    if (query.has(token)) count += 1;
  }
  return count;
}

function latestCustomerQuery(
  messages: Array<Pick<Message, "direction" | "textContent" | "createdAtUtc">>,
): string {
  const recentInbound = messages
    .filter((message) => message.direction === "INBOUND" && message.textContent?.trim())
    .slice(-4)
    .map((message) => message.textContent!.trim());
  return recentInbound.join("\n");
}

function relevanceScore(item: KnowledgeItem, queryText: string): number {
  const tokens = new Set(meaningfulTokens(queryText));
  if (tokens.size === 0) return 0;

  const titleScore = overlapCount(tokens, item.title) * 5;
  const topicScore =
    overlapCount(tokens, `${item.topicTitle ?? ""} ${item.topicKey ?? ""}`) * 4;
  const contentScore = overlapCount(tokens, item.content);

  const normalizedQuery = normalizeText(queryText);
  const normalizedTitle = normalizeText(item.title);
  const normalizedTopic = normalizeText(item.topicTitle ?? "");
  const phraseBonus =
    normalizedQuery.length >= 4
    && (
      normalizedTitle.includes(normalizedQuery)
      || normalizedTopic.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedTitle)
    )
      ? 6
      : 0;

  return titleScore + topicScore + contentScore + phraseBonus;
}

function fallbackRank(category: string): number {
  const index = FALLBACK_CATEGORY_ORDER.indexOf(
    category as (typeof FALLBACK_CATEGORY_ORDER)[number],
  );
  return index < 0 ? 99 : index;
}

export function selectRelevantKnowledge(params: {
  items: KnowledgeItem[];
  recentMessages: Array<
    Pick<Message, "direction" | "textContent" | "createdAtUtc">
  >;
  maxChars?: number;
}): KnowledgeItem[] {
  const { items, recentMessages } = params;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  if (items.length === 0) return [];

  const queryText = latestCustomerQuery(recentMessages);
  const ranked = items
    .map((item) => ({ item, score: relevanceScore(item, queryText) }))
    .sort((a, b) => b.score - a.score || b.item.updatedAtUtc.getTime() - a.item.updatedAtUtc.getTime());

  const seeds = ranked.filter((entry) => entry.score > 0).slice(0, MAX_SEEDS);
  const seedIds = new Set(seeds.map((entry) => entry.item.knowledgeItemId));
  const topicKeys = new Set(
    seeds
      .map((entry) => entry.item.topicKey?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  let ordered: KnowledgeItem[];
  if (seeds.length > 0) {
    const expanded = ranked.filter(
      (entry) =>
        seedIds.has(entry.item.knowledgeItemId)
        || Boolean(entry.item.topicKey && topicKeys.has(entry.item.topicKey)),
    );

    const expandedIds = new Set(expanded.map((entry) => entry.item.knowledgeItemId));
    const safeguards = ranked
      .filter(
        (entry) =>
          !expandedIds.has(entry.item.knowledgeItemId)
          && (entry.item.category === "POLICY" || entry.item.category === "LOCATION_INFO"),
      )
      .slice(0, 2);

    ordered = [...expanded, ...safeguards].map((entry) => entry.item);
  } else {
    ordered = [...items].sort(
      (a, b) =>
        fallbackRank(a.category) - fallbackRank(b.category)
        || b.updatedAtUtc.getTime() - a.updatedAtUtc.getTime(),
    );
  }

  const selected: KnowledgeItem[] = [];
  let used = 0;
  for (const item of ordered) {
    const cost =
      item.title.length
      + item.content.length
      + (item.topicTitle?.length ?? 0)
      + 16;

    if (used + cost > maxChars) {
      continue;
    }
    selected.push(item);
    used += cost;
  }

  // If one relevant item alone exceeds the budget, do not return an empty context.
  if (selected.length === 0 && ordered[0]) {
    return [ordered[0]];
  }

  return selected;
}
