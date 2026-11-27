"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
const endpoint = "/api/channels/whatsapp/privacy/contacts";
export function SettingsPrivateContacts() {
  const [phones, setPhones] = useState<string[] | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async res => {
      if (!active || res.status === 403) return;
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (active) setPhones(data.phones);
    }).catch(() => { if (active) setError("تعذر تحميل إعدادات الخصوصية."); });
    return () => { active = false; };
  }, []);
  async function change(value: string, add: boolean) {
    setBusy(true); setError("");
    try {
      const res = await fetch(endpoint, { method: add ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: value }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPhones(data.phones);
      if (add) setPhone("");
    } catch { setError("تعذر حفظ الاختيار. تأكد من الرقم وحاول مرة تانية."); }
    finally { setBusy(false); }
  }
  if (!phones && !error) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="خصوصية واتساب">
      <h2 className="text-sm font-black">الأرقام الشخصية</h2>
      <p className="text-xs text-muted-foreground">استبعد أرقامًا من استقبال الرسائل الجديدة ومعالجتها بواسطة الموظف الذكي. الاستثناء لا يحذف الرسائل الموجودة بالفعل في DRVO أو واتساب. الأرقام التي لا يمكن تحديد هويتها قد يتم تجاهلها أيضًا.</p>
      {phones && <>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void change(phone, true); }}>
          <input dir="ltr" type="tel" aria-label="رقم دولي" placeholder="+201XXXXXXXXX" required value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <Button type="submit" size="sm" disabled={busy || !phone.trim()}>استثناء الرقم</Button>
        </form>
        {phones.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أرقام مستثناة.</p>}
        {phones.map(value => <div key={value} className="flex items-center justify-between border-t border-border py-2">
          <span dir="ltr" className="text-sm">+{value}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("إلغاء الاستثناء يسمح بمعالجة رسائل هذا الرقم من جديد.")) void change(value, false); }}>إلغاء الاستثناء</Button>
        </div>)}
      </>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
