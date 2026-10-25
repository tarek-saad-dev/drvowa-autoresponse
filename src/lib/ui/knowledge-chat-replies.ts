/**
 * Copy for the owner-facing training chat. The ingestion engine still owns
 * extraction, conflict resolution and persistence; this is presentation only.
 */
export type TrainingProposal = {
  action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT";
  proposedTitle: string;
};

export function trainingReplyForAnalysis(
  proposals: TrainingProposal[],
  options: { clarification?: string | null; sourceText?: string } = {},
): string {
  const pending = proposals.filter((item) => item.action !== "NOOP");
  const conflicts = pending.filter((item) => item.action === "CONFLICT");
  if (!pending.length) {
    if (proposals.length) return "المعلومات دي عندي بالفعل 😊 تحب تعدّل فيها حاجة؟";
    return options.clarification
      ? "محتاج أتأكد من حاجة: " + options.clarification
      : "ممكن توضحلي قصدك أكتر؟ علشان أحفظ المعلومة صح.";
  }

  const titles = pending.slice(0, 2).map((item) => item.proposedTitle).filter(Boolean);
  const summary = titles.length ? "فهمت منك: " + titles.join("، ") + (pending.length > 2 ? "، وفيه تفاصيل تانية." : ".") : "فهمت المعلومات اللي قلتها.";
  const next = conflicts.length
    ? "فيه جزء محتاج اختيارك علشان ما أغيرش معلومة عندي بالغلط. راجعه تحت الأول."
    : "راجع اللي فهمته تحت، ولو تمام هحفظه.";
  const automationPattern = /(?:لما|عندما|بعد ما|بعد انتهاء)[\s\S]{0,180}(?:ابعت|يبعت|نبعت|نرسل|إرسال|يرسل)/i;
  const caution = options.sourceText && automationPattern.test(options.sourceText)
    ? "\nملحوظة: حفظ تعليمات الرد مش معناه تشغيل إرسال تلقائي بعد انتهاء المحادثة."
    : "";
  return "تمام، فهمتك 👌\n" + summary + "\n" + next + caution;
}
