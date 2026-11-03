"use client";

import { useEffect, useState } from "react";

type Preview = {
  draftId: string;
  observedContacts: number;
  uniquePhones: number;
  invalidPhoneRows: number;
  duplicatePhoneRows: number;
  syncCoverage: "EVENT_DRIVEN_PARTIAL";
  labelStillActive: boolean;
  channelActive: boolean;
  audienceReady: false;
  sendingEnabled: false;
  sample: Array<{ maskedPhone: string; displayName: string | null }>;
};

export function LabelCampaignAudiencePreview({ draftId }: { draftId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          "/api/whatsapp/label-campaigns/" + draftId + "/audience",
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          audience?: Preview; sendingEnabled?: boolean;
        };
        if (!res.ok || !data.audience || data.audience.sendingEnabled !== false
          || data.audience.syncCoverage !== "EVENT_DRIVEN_PARTIAL"
          || data.sendingEnabled !== false) throw new Error("AUDIENCE_UNAVAILABLE");
        if (alive) setPreview(data.audience);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, [draftId]);

  if (error) return (
    <p role="alert" className="text-xs text-warning">
      مش قادرين نراجع جمهور القائمة دلوقتي.
    </p>
  );
  if (!preview) return <p role="status" className="text-xs text-muted-foreground">بنراجع الجمهور المرصود…</p>;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface/60 p-3">
      <p className="text-xs font-black">معاينة الجمهور المرصود — بدون إرسال</p>
      <p className="text-xs leading-6 text-muted-foreground">
        {preview.uniquePhones.toLocaleString("ar-EG")} رقم مختلف مرصود حاليًا
        {preview.duplicatePhoneRows > 0 ? ` • ${preview.duplicatePhoneRows.toLocaleString("ar-EG")} مكرر` : ""}
        {preview.invalidPhoneRows > 0 ? ` • ${preview.invalidPhoneRows.toLocaleString("ar-EG")} رقم غير صالح` : ""}
      </p>
      {!preview.labelStillActive || !preview.channelActive ? (
        <p className="text-xs font-semibold text-warning">
          القائمة أو اتصال واتساب غير نشط؛ لا يصلح لاستخدامه في حملة.
        </p>
      ) : null}
      <p className="text-[11px] leading-5 text-muted-foreground">
        البيانات جزئية، ولم يتم التحقق من موافقة الاستلام التسويقي. دي معاينة تقنية للأرقام اللي اتزامنت فقط.
      </p>
      {preview.sample.length ? (
        <ul className="space-y-1 border-t border-border pt-2">
          {preview.sample.map((contact, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-foreground">
                {contact.displayName || "عميل"}
              </span>
              <span className="shrink-0 font-mono text-muted-foreground" dir="ltr">
                {contact.maskedPhone}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">مفيش أرقام صالحة مرصودة حاليًا.</p>
      )}
      {preview.uniquePhones > preview.sample.length ? (
        <p className="text-[11px] text-muted-foreground">بنظهر أول 20 رقم بشكل مخفي فقط.</p>
      ) : null}
    </div>
  );
}
