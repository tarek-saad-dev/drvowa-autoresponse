import { ValidationError } from "@/lib/tenancy/errors";

export type LabelCampaignTarget = {
  channelConnectionId: string;
  id: string;
  name: string | null;
  deleted: boolean;
  observedContacts: number;
};

export type ParsedLabelCampaign = {
  label: LabelCampaignTarget & { name: string };
  messageText: string;
};

/**
 * Conservative, cost-free command recognition. No LLM decisions and no send.
 * The owner can edit every extracted message before approving its copy.
 */
export function parseLabelCampaignCommand(
  rawText: string,
  labels: LabelCampaignTarget[],
): ParsedLabelCampaign[] {
  const text = rawText.trim();
  if (text.length < 12 || text.length > 4000) {
    throw new ValidationError("اكتب طلب واضح مع اسم القائمة ونص الرسالة (حتى 4000 حرف).");
  }
  if (!/(?:ابعت|ابعث|إبعت|أبعت|ارسل|أرسل|إرسال|ارسال|بعت|رسل|send|message)/i.test(text)) {
    throw new ValidationError("ابدأ بطلب زي: ابعت للناس اللي في Coach إن فيه سيشن جديد الجمعة.");
  }

  const candidates = labels.filter(
    (label): label is LabelCampaignTarget & { name: string } =>
      !label.deleted && Boolean(label.name?.trim()),
  ).sort((a, b) => b.name.length - a.name.length);

  const occurrences: Array<{
    start: number; end: number; label: LabelCampaignTarget & { name: string };
  }> = [];
  for (const label of candidates) {
    const safe = label.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${safe})(?=$|[^\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1].length;
      const end = start + match[2].length;
      if (occurrences.some(o => start < o.end && end > o.start)) continue;
      occurrences.push({ start, end, label });
    }
  }

  occurrences.sort((a, b) => a.start - b.start);
  if (occurrences.length === 0) {
    throw new ValidationError(
      candidates.length
        ? `مش لاقي اسم قائمة واضح في طلبك. القوائم المرصودة: ${candidates.slice(0, 4).map(l => l.name).join("، ")}.`
        : "لسه مفيش Labels بأسماء معروفة متزامنة من واتساب. راجع قوائم واتساب في الإعدادات.",
    );
  }
  if (occurrences.length > 3 || new Set(
    occurrences.map(o => `${o.label.channelConnectionId}:${o.label.id}`),
  ).size !== occurrences.length) {
    throw new ValidationError("كل طلب يدعم لحد 3 قوائم مختلفة؛ اكتب رسالة واضحة لكل قائمة.");
  }

  const parsed: ParsedLabelCampaign[] = [];
  for (let index = 0; index < occurrences.length; index++) {
    const found = occurrences[index];
    const next = occurrences[index + 1];
    const prefix = text.slice(index === 0 ? 0 : occurrences[index - 1].end, found.start);
    if (index > 0 && !/(?:و\s*(?:ابعت|ارسل|أرسل|ابعث|رسالة|رساله|للناس|للعملاء|للي|لقائمة|لليست|لـ)|\n)/i.test(prefix)) {
      throw new ValidationError("لقيت أكتر من اسم قائمة. وضّح رسالة مستقلة لكل قائمة.");
    }

    let message = text.slice(found.end, next?.start ?? text.length);
    if (next) {
      message = message.replace(
        /(?:[,،؛;]\s*)?(?:و\s*(?:ابعت|ابعث|ارسل|أرسل|رسالة|رساله|للناس|للعملاء|للي|لقائمة|لليست)\b)[^,،؛;\n]*$/iu,
        "",
      );
    }
    message = message
      .replace(/^[\s:：,،؛;\-–]+/u, "")
      .replace(/^(?:(?:إن|ان|أن|انه|إنه|بأن|قولهم|قُلهم|الرسالة|الرساله|رسالة|رساله)\s*[:：,،-]?\s*)/iu, "")
      .replace(/[\s,،؛;]+$/u, "")
      .trim();

    if (message.length < 4 || message.length > 3000) {
      throw new ValidationError(`نص رسالة ${found.label.name} مش واضح؛ اكتب نص الرسالة بعد اسم القائمة.`);
    }
    parsed.push({ label: found.label, messageText: message });
  }
  return parsed;
}
