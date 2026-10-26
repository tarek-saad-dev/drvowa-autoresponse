import { normalizePulseText } from "./classifier";

/** Only unambiguous unanswered requests can reopen an already handled card.
 * Never treat generic acknowledgments or a clear resolution as another task.
 */
export function needsCustomerFollowUp(text:string|null|undefined):boolean {
 if(!text||text.length>500)return false;
 const v=normalizePulseText(text);
 if(!v || /^(?:تمام|شكرا|شكرا جدا|اوكي|ok|okay|thanks|thank you)[\s.!،]*$/i.test(v))return false;
 if(/(?:تم حل المشكله|المشكله اتحلت|الموضوع اتحل|problem resolved|issue fixed)/i.test(v))return false;
 return /(?:لسه (?:مستني|منتظر|المشكله|الموضوع)|محدش (?:رد|كلمني)|فين (?:الرد|التاكيد|المسؤول)|محتاج (?:رد|متابعه|حل)|مشكله لسه|مش اتحلت|متحلتش|still waiting|not resolved|any update|no response)/i.test(v);
}
