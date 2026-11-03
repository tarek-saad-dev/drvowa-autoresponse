"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

type LocalList = {
  id: string; name: string | null; observedContacts: number;
  source?: "DRVO" | "WHATSAPP";
};
type Member = { phone: string; name: string | null };
type TestResult = {
  inList: boolean; hasPermission: boolean; optedOut: boolean;
  eligibleForReview: boolean; businessName: string; optInText: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as T & {
    error?: string; message?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || data.message || "الطلب متنفذش. جرّب تاني.");
  }
  return data;
}
const json = (payload: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export function CampaignLocalListManager({
  labels, onChanged,
}: {
  labels: LocalList[];
  onChanged: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [phones, setPhones] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const localLists = labels.filter(label => label.source === "DRVO" && label.name);
  const selectedList = localLists.find(list => list.id === selected);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || newName.trim().length < 2) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await requestJson<{
        list: { id: string; name: string };
      }>("/api/whatsapp/lists", {
        method: "POST", ...json({ name: newName.trim() }),
      });
      setNewName(""); setCreating(false);
      setSelected(result.list.id);
      setMembers([]);
      setTestResult(null);
      setNotice("اتعملت القائمة في DRVO. ضيف أرقام العملاء من تحت.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء القائمة.");
    } finally { setBusy(false); }
  }
  async function loadMembers(listId: string) {
    if (busy) return;
    setSelected(listId);setError(null);setNotice(null);
    setTestResult(null);
    setPhones("");
    setBusy(true);
    try {
      const result = await requestJson<{members: Member[]}>(
        "/api/whatsapp/lists/" + encodeURIComponent(listId) + "/members",
      );
      setMembers(result.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر قراءة عملاء القائمة.");
    } finally { setBusy(false); }
  }
  async function importNumbers(event: FormEvent) {
    event.preventDefault();
    if (!selected || !phones.trim() || busy) return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const path = "/api/whatsapp/lists/" + encodeURIComponent(selected) + "/members";
      const result = await requestJson<{added: number; total: number}>(path, {
        method: "POST", ...json({text:phones}),
      });
      setPhones("");
      setTestResult(null);
      setNotice("اتضاف " + result.added.toLocaleString("ar-EG") + " عميل. إجمالي القائمة: "
        + result.total.toLocaleString("ar-EG") + ".");
      const next = await requestJson<{members: Member[]}>(path);
      setMembers(next.members);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الأرقام.");
    } finally { setBusy(false); }
  }
  async function remove(phone: string) {
    if (!selected || busy) return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const path = "/api/whatsapp/lists/" + encodeURIComponent(selected) + "/members";
      await requestJson(path, {method:"DELETE",...json({phone})});
      setMembers(previous => previous.filter(row => row.phone !== phone));
      setTestResult(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إزالة العميل.");
    } finally { setBusy(false); }
  }
  async function deleteList() {
    if (!selected || !selectedList || busy) return;
    if (!window.confirm("تحذف قائمة " + selectedList.name + " من DRVO؟ ده هيمنع إرسال أي رسائل جديدة لها.")) {
      return;
    }
    setBusy(true);setError(null);setNotice(null);
    try {
      await requestJson(
        "/api/whatsapp/lists/" + encodeURIComponent(selected),
        {method:"DELETE"},
      );
      setSelected(null);setMembers([]);setTestResult(null);
      await onChanged();
      setNotice("اتحذفت القائمة من DRVO.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حذف القائمة.");
    } finally {setBusy(false);}
  }

  async function checkTestNumber(event: FormEvent) {
    event.preventDefault();
    if (!selected || testing || !testPhone.trim()) return;
    setTesting(true); setError(null); setTestResult(null);
    try {
      const result = await requestJson<{ recipient: TestResult }>(
        "/api/whatsapp/lists/" + encodeURIComponent(selected) + "/test-recipient",
        { method: "POST", ...json({ phone: testPhone.trim() }) },
      );
      setTestResult(result.recipient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التحقق من الرقم.");
    } finally { setTesting(false); }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/45 p-3"
      aria-label="إدارة قوائم عملاء DRVO">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black">قوائم تعملها بنفسك في DRVO</p>
          <p className="mt-1 text-xs text-muted-foreground">
            بديل عملي لو قوائم واتساب القديمة مش ظاهرة عندك.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => {
          setCreating(value => !value);setSelected(null);
          setError(null);setNotice(null);
        }}>{creating ? "إلغاء" : "+ قائمة جديدة"}</Button>
      </div>
      {creating ? (
        <form onSubmit={event => void create(event)} className="flex flex-wrap gap-2">
          <input aria-label="اسم قائمة DRVO" value={newName} maxLength={80}
            placeholder="مثال: عملاء البروتين"
            onChange={event => setNewName(event.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"/>
          <Button size="sm" type="submit" disabled={busy || newName.trim().length < 2}>
            {busy ? "بنحفظ…" : "إنشاء"}
          </Button>
        </form>
      ) : null}
      {localLists.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {localLists.map(list => (
            <button key={list.id} type="button" disabled={busy}
              aria-pressed={selected === list.id}
              onClick={() => selected === list.id ? setSelected(null) : void loadMembers(list.id)}
              className={"rounded-lg border px-3 py-2 text-xs font-bold transition " +
                (selected === list.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50")}>
              إدارة {list.name} · {list.observedContacts.toLocaleString("ar-EG")}
            </button>
          ))}
        </div>
      ) : null}
      {selectedList ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-bold">إضافة عملاء إلى {selectedList.name}</p>
          <form onSubmit={event => void importNumbers(event)} className="space-y-2">
            <textarea aria-label="أرقام العملاء للقائمة" value={phones}
              maxLength={3000} rows={3}
              onChange={event => setPhones(event.target.value)}
              placeholder={"01012345678\n01112345678\n+201212345678"}
              className="w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"/>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                رقم في كل سطر، لحد 50 رقم مرة واحدة. المكرر مش هيتضاف مرتين.
              </span>
              <Button size="sm" type="submit" disabled={busy || !phones.trim()}>
                {busy ? "بنضيف…" : "إضافة العملاء"}
              </Button>
            </div>
          </form>
          {members.length ? (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold">
                عرض العملاء المسجلين ({members.length.toLocaleString("ar-EG")})
              </summary>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {members.map(member => (
                  <div key={member.phone} className="flex items-center justify-between gap-2 py-1 text-xs">
                    <span className="truncate">{member.name || member.phone}</span>
                    <button type="button" onClick={() => void remove(member.phone)}
                      disabled={busy} aria-label={"إزالة " + member.phone}
                      className="shrink-0 text-muted-foreground underline hover:text-foreground">
                      إزالة
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-black">اختبار إرسال على رقم واحد</p>
            <p className="text-xs leading-6 text-muted-foreground">
              ضيف رقم اختبار تملكه أو رقم شخص وافق على الاختبار، وبعدها ابعت رسالة الاشتراك
              من الرقم ده إلى واتساب النشاط المتصل. مش من نفس رقم واتساب النشاط.
            </p>
            <form onSubmit={event => void checkTestNumber(event)} className="flex flex-wrap gap-2">
              <input aria-label="رقم واتساب التجريبي" value={testPhone}
                onChange={event => {setTestPhone(event.target.value);setTestResult(null);}}
                placeholder="01012345678" inputMode="tel" maxLength={32}
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"/>
              <Button type="submit" size="sm" variant="outline"
                disabled={busy || testing || !testPhone.trim()}>
                {testing ? "بنتحقق…" : "تحقق من الجاهزية"}
              </Button>
            </form>
            {testResult ? <div role="status" className="space-y-2 text-xs leading-6">
              <p>{testResult.inList ? "✓ الرقم موجود في القائمة" : "الرقم مش موجود في القائمة؛ ضيفه أولًا."}</p>
              <p>{testResult.hasPermission && !testResult.optedOut
                ? "✓ الرقم وافق على عروض واتساب"
                : testResult.optedOut ? "الرقم طلب وقف العروض؛ مش مؤهل للإرسال."
                : "لسه مفيش موافقة واتساب صريحة من الرقم."}</p>
              {!testResult.hasPermission && !testResult.optedOut ? <div className="space-y-1">
                <p>انسخ النص ده وابعتْه من رقم الاختبار إلى واتساب النشاط، وبعدها اضغط تحقق تاني:</p>
                <p dir="auto" className="rounded-lg bg-surface p-2 select-all">{testResult.optInText}</p>
                <Button size="sm" variant="outline" type="button"
                  onClick={() => void navigator.clipboard.writeText(testResult.optInText)}>
                  نسخ نص الموافقة
                </Button>
              </div> : null}
              {testResult.eligibleForReview ? <p className="font-bold text-primary">
                الرقم جاهز للمراجعة. اختار القائمة من فوق، جهّز رسالة، اعتمدها، وبعدها أكد الإرسال.
                الوصول الفعلي بيتحدد بنتيجة واتساب والباقة والاتصال.
              </p> : null}
            </div> : null}
          </div>
          <button type="button" onClick={() => void deleteList()} disabled={busy}
            className="text-xs text-muted-foreground underline">
            حذف القائمة
          </button>
        </div>
      ) : null}
      {notice ? <p role="status" className="text-xs font-semibold text-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-xs text-warning">{error}</p> : null}
      <p className="text-[11px] leading-5 text-muted-foreground">
        قوائم DRVO داخل السيستم فقط، مش بتتضاف إلى Labels على الموبايل.
        إضافة رقم مش معناها موافقته على العروض؛ شروط الإرسال بتتراجع منفصلة قبل أي حملة.
      </p>
    </div>
  );
}
