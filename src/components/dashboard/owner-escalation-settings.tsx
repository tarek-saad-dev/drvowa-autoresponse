"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OwnerEscalationSettings({
  initial,
}: {
  initial: { phone: string | null; enabled: boolean; verified: boolean };
}) {
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [setting, setSetting] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function call(url: string, method: string, payload?: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(url, {
        method, credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "تعذر تنفيذ العملية");
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
      return null;
    } finally { setBusy(false); }
  }

  const base = "/api/escalations/settings";
  const savedNumber = phone.trim() === (setting.phone ?? "");

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="تنبيهات التصعيد البشري">
      <h2 className="text-lg font-black">تنبيهات التدخل البشري على واتساب</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">
        عند طلب تدخل بشري، هنبعت لصاحب البيزنس سبب الطلب ورابط العميل على واتساب ورابط المحادثة داخل DRVO.
        إرسال التنبيهات لا يبدأ قبل تأكيد رقم الاستقبال.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="escalation-owner-phone">رقم واتساب المسؤول</Label>
          <Input id="escalation-owner-phone" dir="ltr" inputMode="tel" value={phone}
            placeholder="2010XXXXXXXX" onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={busy || !phone.trim()}
            onClick={async () => {
              const data = await call(base, "PATCH", { phone, enabled: false });
              if (data?.setting) {
                setSetting(data.setting);
                setNotice("تم حفظ الرقم. اضغط إرسال كود التأكيد.");
              }
            }}>حفظ الرقم</Button>
          <span className={"text-xs font-bold " + (setting.verified ? "text-emerald-700" : "text-amber-600")}>
            {setting.verified && savedNumber ? "✓ الرقم مؤكد" : "الرقم محتاج تأكيد"}
          </span>
        </div>
        {savedNumber && !setting.verified ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Button type="button" variant="outline" disabled={busy || !setting.phone}
              onClick={async () => {
                const result = await call(base + "/verify", "POST");
                if (result?.sent) setNotice("الكود اتبعت على رقم المسؤول. صالح 10 دقائق.");
              }}>إرسال كود التأكيد إلى واتساب</Button>
            <div className="flex flex-wrap gap-2">
              <Input aria-label="كود التأكيد" inputMode="numeric" dir="ltr" maxLength={6}
                value={code} onChange={e => setCode(e.target.value)}
                placeholder="كود من 6 أرقام" className="max-w-44" />
              <Button type="button" disabled={busy || !/^\d{6}$/.test(code)}
                onClick={async () => {
                  const result = await call(base + "/verify", "PATCH", { code });
                  if (result?.verified) {
                    setSetting(s => ({ ...s, verified: true }));
                    setCode("");
                    setNotice("تم تأكيد الرقم. تقدر تفعّل الإشعارات.");
                  } else if (result) setError("الكود غير صحيح أو انتهت صلاحيته.");
                }}>تأكيد الرقم</Button>
            </div>
          </div>
        ) : null}
        <label className="flex items-center gap-3 rounded-xl bg-surface px-3 py-3 text-sm font-bold">
          <input type="checkbox" className="h-4 w-4" checked={setting.enabled}
            disabled={busy || !setting.verified || !savedNumber}
            onChange={async e => {
              const wanted = e.currentTarget.checked;
              const data = await call(base, "PATCH", { phone, enabled: wanted });
              if (data?.setting) {
                setSetting(data.setting);
                setNotice(wanted ? "تم تفعيل التنبيهات." : "تم إيقاف التنبيهات.");
              }
            }} />
          تفعيل إرسال إشعارات التدخل البشري
        </label>
        {error ? <p role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}
        {notice ? <p role="status" className="text-xs font-bold text-emerald-700">{notice}</p> : null}
        <p className="text-xs leading-6 text-muted-foreground">
          كل محادثة ليها تصعيد مفتوح واحد فقط. لو حالة إرسال الإشعار غير مؤكدة، النظام مش هيعيد إرسالها تلقائيًا.
          البيانات مرئية لمسؤولي النشاط فقط.
        </p>
      </div>
    </section>
  );
}
