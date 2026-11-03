"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LabelCampaignLaunch } from "@/components/dashboard/label-campaign-launch";

type Preflight = {
  preflightId: string;
  observedMemberships: number;
  uniqueValidPhones: number;
  invalidPhones: number;
  duplicatePhones: number;
  optedOutPhones: number;
  blockedUnverifiedPermission: number;
  verifiedSendable: 0;
  status: "REVIEW_ONLY";
  isCurrentCopy: boolean;
  sendEnabled: false;
  syncCoverage: "EVENT_DRIVEN_PARTIAL";
};
type Result = {
  preflights?: Preflight[];
  preflight?: Preflight;
  error?: string;
  sendingEnabled?: boolean;
};

export function LabelCampaignPreflight({ draftId, messageText }: { draftId: string; messageText: string }) {
  const [opened, setOpened] = useState(false);
  const [plan, setPlan] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          "/api/whatsapp/label-campaigns/" + draftId + "/preflight",
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as Result;
        if (!res.ok || data.sendingEnabled !== false || !Array.isArray(data.preflights)) {
          throw new Error("تعذر تحميل خطة مراجعة الجمهور.");
        }
        if (alive) setPlan(data.preflights.find(item => item.isCurrentCopy) ?? null);
      } catch {
        if (alive) setError("تعذر تحميل خطة المراجعة.");
      }
    })();
    return () => { alive = false; };
  }, [opened, draftId]);

  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/whatsapp/label-campaigns/" + draftId + "/preflight",
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as Result;
      if (!res.ok || !data.preflight || data.preflight.sendEnabled !== false
        || data.sendingEnabled !== false) {
        throw new Error(data.error || "تعذر تجهيز الخطة.");
      }
      setPlan(data.preflight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تجهيز الخطة.");
    } finally {
      setBusy(false);
    }
  }

  if (!opened) return (
    <Button size="sm" variant="outline" disabled={busy}
      onClick={() => setOpened(true)}>فحص الجمهور قبل الإرسال</Button>
  );

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface/55 p-3">
      <p className="text-xs font-black">خطة مراجعة المستلمين</p>
      {!plan ? (
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => void prepare()}>
          {busy ? "جاري التجهيز…" : "حفظ قائمة مستلمين بدون إرسال"}
        </Button>
      ) : (
        <>
          <p className="text-xs leading-6 text-muted-foreground">
            {plan.observedMemberships.toLocaleString("ar-EG")} عضوية مرصودة،
            {" "}{plan.uniqueValidPhones.toLocaleString("ar-EG")} رقم مختلف،
            {" "}{plan.duplicatePhones.toLocaleString("ar-EG")} مكرر،
            {" "}{plan.invalidPhones.toLocaleString("ar-EG")} غير صالح
            {plan.optedOutPhones > 0
              ? ` • ${plan.optedOutPhones.toLocaleString("ar-EG")} أوقفوا العروض`
              : ""}
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            اتسجّلت الأرقام بدون تكرار في خطة مراجعة غير قابلة للإرسال،
            ولسه مزامنة القوائم القديمة مش مؤكدة بالكامل.
          </p>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        تجهيز القائمة لا يرسل رسائل، ولا يحوّل العملاء إلى موافقين على العروض.
      </p>
      {plan?.isCurrentCopy ? <LabelCampaignLaunch
        draftId={draftId} preflightId={plan.preflightId} messageText={messageText} /> : null}
      {error ? <p role="alert" className="text-xs text-warning">{error}</p> : null}
      <button type="button" onClick={() => setOpened(false)}
        className="text-xs font-semibold text-muted-foreground underline">إغلاق</button>
    </div>
  );
}
