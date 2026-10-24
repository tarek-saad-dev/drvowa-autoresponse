/** Shared boundaries for the onboarding discovery interview. */
export const DISCOVERY_ANSWER_MAX_CHARS = 20_000;
export const DISCOVERY_QUESTION_MAX_CHARS = 700;
export const DISCOVERY_MAX_TURNS = 24;
/**
 * Bound only the question-generation prompt, not the saved customer answers.
 * Complete answers remain in the onboarding draft for final knowledge ingestion.
 */
export const DISCOVERY_TRANSCRIPT_BUDGET = 48_000;

export type DiscoveryPromptTurn = {
  question: string;
  answer: string;
  topic?: string;
};

/** Keep recent interview context while leaving original user answers untouched. */
export function formatDiscoveryTranscript(
  turns: readonly DiscoveryPromptTurn[],
  maxChars = DISCOVERY_TRANSCRIPT_BUDGET,
): string {
  const transcript = turns
    .map((turn, index) => String(index + 1) + ". س: " + turn.question + "\nج: " + turn.answer)
    .join("\n\n");
  if (transcript.length <= maxChars) return transcript;
  const prefix = "ملاحظة: الإجابات الأقدم محفوظة كاملة للتدريب النهائي، لكن عُرض جزء من السياق فقط للسؤال التالي.\n\n";
  return prefix + transcript.slice(-(maxChars - prefix.length));
}
