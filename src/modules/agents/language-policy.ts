/**
 * Agent language preference, stored in the existing TblAgent.Language NVARCHAR(32).
 * "auto" means match the customer's language on each turn.
 * Legacy fixed-language values remain readable; no database migration is needed.
 */
export const AGENT_AUTO_LANGUAGE = "auto" as const;

export const AGENT_FIXED_LANGUAGES = [
  { code: "ar", label: "العربية", englishName: "Arabic" },
  { code: "en", label: "English", englishName: "English" },
  { code: "fr", label: "Français", englishName: "French" },
  { code: "es", label: "Español", englishName: "Spanish" },
  { code: "de", label: "Deutsch", englishName: "German" },
] as const;

const languageNames: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  tr: "Turkish",
  ru: "Russian",
  ur: "Urdu",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

export function agentUsesCustomerLanguage(code: string | null | undefined): boolean {
  return code?.trim().toLowerCase() === AGENT_AUTO_LANGUAGE;
}

/** Safely interpret legacy language values without interpolating arbitrary user text into instructions. */
export function fixedAgentLanguageName(raw: string | null | undefined): string {
  const code = (raw ?? "ar").trim().toLowerCase();
  if (code === "arabic") return "Arabic";
  if (code === "english") return "English";
  const normalized = code.split("-")[0] || "ar";
  return languageNames[normalized] ?? "Arabic";
}

export function agentLanguagePolicyInstruction(language: string | null | undefined, dialect: string | null | undefined): string[] {
  const dialectName = (dialect ?? "").trim().slice(0, 64).replace(/[\r\n]+/g, " ");
  if (agentUsesCustomerLanguage(language)) {
    return [
      "- LANGUAGE POLICY (required): This agent is MULTILINGUAL. Identify the language of the customer's most recent meaningful inbound message on every turn and reply naturally in that SAME language.",
      "- When the customer explicitly asks to change languages, honor that request. When a short message (emoji, numbers, names, or an ambiguous phrase) has no clear language, follow the most recent unambiguous CUSTOMER language in the conversation. If the message uses multiple languages, prefer the language used for the main question.",
      "- Do not choose the reply language from older receptionist/AI messages or the language of the business knowledge. Do not translate the user's text unless requested; just answer their question in the appropriate language.",
      dialectName
        ? \`- When replying in Arabic, prefer the following Arabic dialect/style: \${dialectName}. For any non-Arabic reply, use natural wording in that language; never force an Arabic dialect on it.\`
        : "- Use a natural regional style in the language selected from the customer message.",
    ];
  }

  const name = fixedAgentLanguageName(language);
  return [
    \`- LANGUAGE POLICY (required): This agent uses ONE FIXED language: \${name}. Write the entire final customer-facing reply in \${name}, even when the customer writes in another language. Understand other languages when necessary, but do not switch the final reply language.\`,
    \`- If the customer asks to switch languages, politely explain in \${name} that you can continue in \${name}. Never override this fixed-language setting based on chat history, customer wording, or tenant instructions.\`,
    dialectName && name === "Arabic"
      ? \`- Use this Arabic dialect/style when appropriate: \${dialectName}.\`
      : \`- Write naturally in \${name}; do not apply an unrelated Arabic dialect.\`,
  ];
}
