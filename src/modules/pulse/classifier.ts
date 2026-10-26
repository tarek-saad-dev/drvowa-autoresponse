/** Conservative, explainable intent detection. No AI cost, no fabricated outcomes.
 * Categories describe customer INQUIRIES, not confirmed orders or successful sales.
 * Every signal must be supported by a literal substring from a customer message.
 */
export type PulseIntent = "BOOKING" | "PRICE" | "COMPLAINT" | "HUMAN" | "REFUND" | "PURCHASE" | "LOCATION" | "HOURS";
export type PulseActionType = "REVIEW" | "OPPORTUNITY" | null;
export type ClassifiedSignal = {
  intent: PulseIntent; priority: "URGENT" | "NORMAL"; actionType: PulseActionType;
  confidence: number; evidence: string;
};
const rules: Array<{ intent: PulseIntent; priority: "URGENT" | "NORMAL"; actionType: PulseActionType; confidence: number; terms: RegExp[] }> = [
  {intent:"REFUND",priority:"URGENT",actionType:"REVIEW",confidence:93,terms:[/استرجاع\s+(?:فلوس|مبلغ|الفلوس)/u,/عايز\s+(?:فلوسي|فلوسى)\s+(?:ترجع|تاني)/u,/رد\s+(?:الفلوس|المبلغ)/u,/refund\b/i,/استرداد/u]},
  {intent:"HUMAN",priority:"URGENT",actionType:"REVIEW",confidence:94,terms:[/عايز\s+(?:اكلم|اتكلم\s+مع)\s+(?:المدير|المسؤول|موظف)/u,/كلموني\s+من\s+الاداره/u,/حد\s+من\s+الاداره/u,/human\s+agent/i,/talk\s+to\s+(?:manager|person)/i]},
  {intent:"COMPLAINT",priority:"URGENT",actionType:"REVIEW",confidence:88,terms:[/اشتكي|شكوى|شكوي/u,/اسو[اأ]ء\s+(?:خدمه|تجربه)/u,/محدش\s+(?:رد|كلمني|اهتم)/u,/اتاخرت\s+(?:كتير|جدا)/u,/خدمه\s+وحشه/u,/complaint|terrible\s+service/i]},
  {intent:"BOOKING",priority:"NORMAL",actionType:null,confidence:91,terms:[/عايز\s+احجز/u,/احجزلي|احجزلى/u,/ممكن\s+احجز/u,/عندي\s+حجز/u,/booking|appointment|reserve\s+(?:a|my)/i]},
  {intent:"PRICE",priority:"NORMAL",actionType:null,confidence:87,terms:[/بكام|بكام؟/u,/السعر\s+(?:كام|ايه)/u,/اسعار|السعر|التكلفه/u,/كم\s+(?:السعر|تكلفه)/u,/how\s+much|price\s+list|pricing/i]},
  {intent:"PURCHASE",priority:"NORMAL",actionType:"OPPORTUNITY",confidence:84,terms:[/عايز\s+اشترك/u,/ازاي\s+اشترك/u,/عايز\s+اشتري/u,/محتاج\s+الباقه/u,/عايز\s+ادفع/u,/ready\s+to\s+(?:buy|subscribe)/i]},
  {intent:"LOCATION",priority:"NORMAL",actionType:null,confidence:90,terms:[/العنوان\s+(?:فين|ايه)/u,/مكانكم\s+فين/u,/الفرع\s+فين/u,/location|address|where\s+are\s+you/i]},
  {intent:"HOURS",priority:"NORMAL",actionType:null,confidence:88,terms:[/بتفتحوا\s+امتي/u,/بتقفلوا\s+امتي/u,/مواعيد\s+(?:العمل|الفتح)/u,/opening\s+hours|working\s+hours/i]},
];
export function normalizePulseText(text: string): string {
  return text.toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/\s+/g," ").trim().slice(0,3000);
}
export function classifyCustomerText(text: string | null | undefined): ClassifiedSignal[] {
  if (!text || text.trim().length < 5) return [];
  const normalized = normalizePulseText(text);
  if (!normalized) return [];
  // Recognize first-person complaints, not questions about whether others complained.
  return rules.flatMap(rule => {
    const match = rule.terms.map(term => term.exec(normalized)).find(Boolean);
    if (!match) return [];
    // Explicit mention of a refund request is reviewable; do not infer money actually refunded.
    const idx = match.index;
    const evidence = normalized.slice(Math.max(0,idx-40),Math.min(normalized.length,idx+match[0].length+95))
      .replace(/(?:\+?\d[\d\s-]{7,}\d)/g,"[رقم مخفي]")
      .replace(/https?:\/\/\S+/g,"[رابط]");
    return [{intent:rule.intent,priority:rule.priority,actionType:rule.actionType,confidence:rule.confidence,evidence:evidence.slice(0,280)}];
  }).slice(0,4);
}
export const PULSE_INTENT_LABELS: Record<PulseIntent,string> = {
  BOOKING:"استفسارات حجز", PRICE:"الأسعار", COMPLAINT:"شكاوى", HUMAN:"طلب مسؤول",
  REFUND:"استرداد مبالغ", PURCHASE:"اهتمام بالاشتراك", LOCATION:"العناوين", HOURS:"مواعيد العمل",
};
