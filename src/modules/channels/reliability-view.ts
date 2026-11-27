// Allowlisted customer-facing diagnostics. No peer identifiers, message IDs or raw errors.
export type ReliabilityView = {
  evidence: "unknown" | "unverified" | "inbound" | "outbound" | "both";
  issue: "crypto" | "unresolved" | "reconnecting" | "review" | null;
};
type RuntimeSignals = {
  ready: boolean;
  state: string;
  deliveryEvidence?: unknown;
  peerCryptoHealth?: unknown;
  socketRecovery?: unknown;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function evidenceTime(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function buildReliabilityView(runtime: RuntimeSignals): ReliabilityView | null {
  const d = record(runtime.deliveryEvidence);
  const p = record(runtime.peerCryptoHealth);
  const r = record(runtime.socketRecovery);
  if (!Object.keys(d).length && !Object.keys(p).length && !Object.keys(r).length) return null;
  if (!runtime.ready || runtime.state !== "READY") {
    const issue = r.action === "RETRY_EXHAUSTED" || r.action === "OPERATOR_REVIEW" ? "review"
      : r.action === "RETRY_SCHEDULED" ? "reconnecting" : null;
    return { evidence: "unknown", issue };
  }
  const incoming = evidenceTime(d.lastLivePlaintextAt);
  const outgoing = evidenceTime(d.lastOutboundDeliveryAckAt);
  let evidence: ReliabilityView["evidence"] = "unknown";
  if (d.status === "BOTH_OBSERVED" && incoming && outgoing) evidence = "both";
  else if (d.status === "INBOUND_OBSERVED" && incoming) evidence = "inbound";
  else if (d.status === "OUTBOUND_DELIVERY_OBSERVED" && outgoing) evidence = "outbound";
  else if (d.status === "UNVERIFIED") evidence = "unverified";
  const issue = p.status === "DEGRADED" || p.status === "SUSPECT" ? "crypto"
    : p.status === "TRAFFIC_RESUMED_WITH_UNRESOLVED_MESSAGES" ? "unresolved" : null;
  return { evidence, issue };
}
export function reliabilityCopy(view: ReliabilityView | null | undefined): string | null {
  if (!view) return null;
  if (view.issue === "review") return "إعادة الاتصال التلقائية توقفت؛ الاتصال محتاج مراجعة.";
  if (view.issue === "reconnecting") return "بنحاول نرجّع الاتصال تلقائيًا.";
  if (view.issue === "crypto") return "رصدنا مشكلة في فك تشفير بعض الرسائل؛ الاتصال وحده مش ضمان وصولها.";
  if (view.issue === "unresolved") return "التواصل استأنف، لكن بعض الرسائل السابقة لسه استرجاعها غير مؤكد.";
  switch (view.evidence) {
    case "both": return "تم رصد استقبال رسالة وتأكيد تسليم رسالة صادرة في الاتصال الحالي.";
    case "inbound": return "تم رصد استقبال رسالة؛ تسليم الرسائل الصادرة لسه غير مؤكد.";
    case "outbound": return "تم رصد تسليم رسالة صادرة؛ استقبال الرسائل لسه غير مؤكد.";
    case "unverified": return "واتساب متصل، لكن لسه مفيش دليل على إرسال واستقبال فعلي.";
    default: return null;
  }
}
