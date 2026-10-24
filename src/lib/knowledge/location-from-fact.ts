export type LocationSuggestion = {
  name: string;
  addressLine: string;
  phone: string;
};

export type KnowledgeLocationFact = {
  category: string;
  proposedTitle: string;
  proposedContent: string;
};

/**
 * Only confirmed LOCATION_INFO knowledge can offer a structured location.
 * Do not guess city, timezone, or structured address from free-form business prose.
 * The owner reviews this suggestion before any write to TblLocation.
 */
export function locationSuggestionFromFact(fact: KnowledgeLocationFact): LocationSuggestion | null {
  if (fact.category !== "LOCATION_INFO") return null;
  const title = fact.proposedTitle.trim().replace(/[.،:]+$/g, "").slice(0, 200);
  const text = fact.proposedContent.trim();
  const embeddedBranch = text.match(/(?:فرع|مكتب)\s+([^\n،,.؛:]{2,70})/);
  const namedTitle = /(?:فرع|مكتب|مقر|الموقع)\s+\S/.test(title);
  const name = namedTitle ? title : embeddedBranch ? "فرع " + embeddedBranch[1].trim() : "";
  if (!name || /^(?:الفروع|المواقع|العناوين|معلومات الفروع|أماكننا)$/i.test(name)) return null;
  const phone = text.match(/(?:الهاتف|التليفون|الرقم|التواصل)\s*[:：-]?\s*(\+?\d[\d\s-]{8,16}\d)/)?.[1]?.replace(/[\s-]+/g, "") ?? "";
  const addressLine = text.match(/(?:العنوان|عنوان الفرع|الموقع)\s*[:：]\s*([^\n]{3,300})/)?.[1]?.trim() ?? "";
  return { name, addressLine: addressLine.slice(0, 300), phone: phone.slice(0, 32) };
}

export function normalizedLocationName(name: string): string {
  return name
    .trim()
    .replace(/^(?:فرع|مكتب|مقر)\s+/i, "")
    .replace(/[\s\u064B-\u065F]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .toLowerCase();
}
