/** A customer must explicitly confirm resolution; "تمام" and thanks alone are
 * not sufficient and can never close a complaint. Keep this deterministic,
 * conservative and negation-aware. Never let AI guess a successful resolution.
 */
export function explicitlyConfirmedResolved(text: string | null | undefined): boolean {
  if (!text || text.length > 900) return false;
  const normalized = text.toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[.,!؟?؛:،\-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 160) return false;
  // A conditional, a question, or a new recurrence can never be considered
  // explicit proof that the customer's CURRENT issue was resolved.
  if (/(?:^|\\s)(?:لو|اذا|لوكان|لو كانت|if|when|هل|ممكن|ولا|رجعت|رجع|تاني|لكن|بس رجعت)(?:\\s|$)/iu.test(normalized)) return false;
  // Do not interpret negations, complaints or hypothetical statements as success.
  if (/(?:مش|ما|لم|لسه|بعده|مازالت|مازال|not|isn't|isnt|still|never|اذا|لو)\s+(?:اتحل|اتحلت|انحل|انحلت|تحل|حلت|حلينا|resolved|fixed)/iu.test(normalized)) return false;
  if (/(?:لسه|مازال|مازالت|لم|مش|ما|not|still)\s+(?:في|عندي|المشكله|المشكلة|issue|problem)/iu.test(normalized)) return false;
  if (/(?:متحلتش|ما اتحلتش|مش محلول|not resolved|not fixed|unresolved|مفيش حل|مفيش فايده|لسه موجوده|لسه موجودة)/iu.test(normalized)) return false;
  return /(?:المشكله|المشكلة|مشكلتي|الموضوع)\s+(?:اتحلت|انحلت|اتحل|اتحلّت)|(?:تم|اتم)\s+حل\s+(?:المشكله|المشكلة|مشكلتي|الموضوع)|(?:خلاص\s+)?اتحلت\s+(?:المشكله|المشكلة|مشكلتي)|(?:my\s+)?(?:issue|problem)\s+(?:is\s+)?(?:resolved|fixed)|(?:it's|it is)\s+(?:resolved|fixed)\s+now/iu.test(normalized);
}
/** Strong signal that a *previously resolved* complaint came back.
 * Only used together with a recently resolved case for the same conversation.
 */
export function explicitlyReportedRecurrence(text: string | null | undefined): boolean {
  if (!text || text.length > 220) return false;
  const value = text.toLowerCase().replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي").replace(/[\u064b-\u065f\u0670\u0640]/g, "").trim();
  return /(?:نفس\s+المشكله\s+(?:رجعت|موجوده|لسه)|المشكله\s+رجعت\s+تاني|لسه\s+نفس\s+المشكله|same\s+(?:issue|problem)\s+(?:again|returned))/iu.test(value);
}

export type FollowUpPhase = "NEEDS_ATTENTION" | "IN_PROGRESS" | "WAITING_CUSTOMER";
export function followUpPhaseLabel(phase: FollowUpPhase): string {
  switch (phase) {
    case "IN_PROGRESS": return "جاري التعامل";
    case "WAITING_CUSTOMER": return "بانتظار العميل";
    default: return "تحتاج متابعة";
  }
}
