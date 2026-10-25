"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmployeeKnowledgeChat } from "@/components/dashboard/employee-knowledge-chat";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { Agent } from "@/types/domain";

type ActiveSetting = {
  agentId: string;
  autoReplyEnabled: boolean;
} | null;
type Identity = "ai" | "natural";
type Draft = {
  name: string;
  identity: Identity;
  tone: string;
  dialect: string;
  instructions: string;
  language: string;
};
const PRESETS = [
  { id: "friendly", label: "ودود وبشوش", hint: "قريب من العميل", tone: "ودود وبسيط", dialect: "مصرية", example: "أهلًا بيك! نورتنا 😊 تحب أساعدك في إيه؟" },
  { id: "professional", label: "رسمي واحترافي", hint: "مهني وواضح", tone: "رسمي وهادئ", dialect: "فصحى", example: "أهلًا بحضرتك، يسعدني مساعدتك. كيف يمكنني خدمتك؟" },
  { id: "short", label: "مختصر ومباشر", hint: "سريع وفي المفيد", tone: "مهني ومختصر", dialect: "بيضاء", example: "أهلًا بحضرتك. تحب تعرف إيه بالتحديد؟" },
  { id: "sales", label: "لبق في المبيعات", hint: "يسأل ويفهم الاحتياج", tone: "ودود ومقنع", dialect: "مصرية", example: "أهلًا بيك! قولي بتدور على إيه، وأنا هساعدك تختار الأنسب." },
] as const;

function draftFromAgent(agent?: Agent): Draft {
  return {
    name: agent?.name ?? "",
    identity: agent?.roleTitle === "مساعد ذكي" ? "ai" : "natural",
    tone: agent?.tone ?? PRESETS[0].tone,
    dialect: agent?.dialect ?? "مصرية",
    instructions: agent?.instructions ?? "",
    language: agent?.language ?? "ar",
  };
}

export function EmployeeStudio({
  initialAgents,
  initialSetting,
  whatsappState,
  businessId,
  knowledgeCount,
  initialTab = "personality",
}: {
  initialAgents: Agent[];
  initialSetting: ActiveSetting;
  whatsappState: string;
  businessId: string;
  knowledgeCount: number;
  initialTab?: "personality" | "knowledge";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"personality" | "knowledge">(initialTab);
  const [agents, setAgents] = useState(initialAgents);
  const [setting, setSetting] = useState(initialSetting);
  const [selectedId, setSelectedId] = useState(initialSetting?.agentId ?? initialAgents[0]?.agentId ?? "");
  const [draft, setDraft] = useState<Draft>(() => draftFromAgent(
    initialAgents.find((agent) => agent.agentId === initialSetting?.agentId) ?? initialAgents[0],
  ));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const chosen = agents.find((agent) => agent.agentId === selectedId);
  const selectedPreset = PRESETS.find((preset) =>
    preset.tone === draft.tone && preset.dialect === draft.dialect
  );
  const whatsappReady = whatsappState === "READY";
  const isCurrent = Boolean(chosen && setting?.agentId === chosen.agentId);
  const currentPreset = selectedPreset ?? PRESETS[0];
  const roleTitle = draft.identity === "ai" ? "مساعد ذكي" : "موظف استقبال";

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(patch: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setError(null);
    setSuccess(null);
  }

  function chooseProfile(agentId: string) {
    if (dirty && !window.confirm("عندك تعديلات لسه متحفظتش. تحب تسيبها؟")) return;
    const nextAgent = agents.find((a) => a.agentId === agentId);
    setSelectedId(agentId);
    setDraft(draftFromAgent(nextAgent));
    setDirty(false);
    setError(null);
    setSuccess(null);
  }

  function createNew() {
    if (dirty && !window.confirm("التعديلات الحالية متحفظتش. تبدأ شخصية جديدة؟")) return;
    setSelectedId("");
    setDraft(draftFromAgent());
    setDirty(false);
    setSuccess(null);
    setError(null);
  }

  async function savePersonality() {
    if (!draft.name.trim()) {
      setError("اكتب اسم الموظف الأول.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const path = chosen ? "/api/agents/" + chosen.agentId : "/api/agents";
      const response = await fetch(path, {
        method: chosen ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          roleTitle,
          language: draft.language,
          dialect: draft.dialect,
          tone: draft.tone,
          instructions: draft.instructions || null,
          isActive: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        agent?: Agent;
        code?: string;
        error?: string;
      };
      if (!response.ok || !data.agent) {
        setError(mapUserFacingError(data, "تعذر حفظ الشخصية. حاول مرة تانية."));
        return;
      }
      const saved = data.agent;
      setAgents((previous) => {
        const exists = previous.some((a) => a.agentId === saved.agentId);
        return exists ? previous.map((a) => a.agentId === saved.agentId ? saved : a) : [...previous, saved];
      });
      setSelectedId(saved.agentId);
      setDirty(false);
      setSuccess(isCurrent ? "اتحفظت التعديلات وبدأ تطبيقها على الردود الجديدة." : "اتحفظت الشخصية. اضغط «استخدم الشخصية دي» عشان تخليها النشطة.");
      router.refresh();
    } catch {
      setError("في مشكلة في الاتصال، التعديلات متحفظتش.");
    } finally {
      setBusy(false);
    }
  }

  async function saveActiveAgent(agentId: string, nextEnabled: boolean) {
    if (dirty) {
      setError("احفظ تعديلات الشخصية الأول، وبعدها فعّلها.");
      return;
    }
    if (nextEnabled && !whatsappReady) {
      setError("واتساب مش متصل حاليًا. لازم الاتصال يرجع قبل تشغيل الرد التلقائي أو تغيير الشخصية النشطة أثناء تشغيله.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/channels/whatsapp/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          autoReplyEnabled: nextEnabled,
          humanTakeoverResumePolicy: "AFTER_30_MIN",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        setting?: { agentId: string; autoReplyEnabled: boolean };
        code?: string;
        error?: string;
      };
      if (!response.ok || !data.setting) {
        setError(mapUserFacingError(data, "تعذر تحديث الموظف النشط."));
        return;
      }
      setSetting({ agentId: data.setting.agentId, autoReplyEnabled: data.setting.autoReplyEnabled });
      setSuccess(nextEnabled
        ? "تم تفعيل الشخصية والرد التلقائي في الإعدادات. التشغيل الفعلي يعتمد على حالة واتساب والـ Worker."
        : "تم حفظ الشخصية النشطة والرد التلقائي متوقف.");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالسيرفر. التغيير لم يُفعّل.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-3 overflow-hidden" dir="rtl">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">الموظف الذكي</h1>
          <p className="mt-1 text-sm text-muted-foreground">اختار شخصيته وعلّمه كل حاجة عن شغلك.</p>
        </div>
        {!whatsappReady ? (
          <Link href="/dashboard/whatsapp"
            className="rounded-full border border-warning/25 bg-warning-soft/30 px-3 py-2 text-xs font-bold text-foreground hover:bg-warning-soft/50">
            واتساب محتاج مراجعة ←
          </Link>
        ) : null}
      </div>

      <div role="tablist" aria-label="إدارة الموظف الذكي"
        className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1">
        <button type="button" role="tab" aria-selected={tab === "personality"} aria-controls="studio-personality"
          onClick={() => setTab("personality")}
          className={"rounded-xl px-3 py-3 text-sm font-black transition " +
            (tab === "personality" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          شخصية الموظف
        </button>
        <button type="button" role="tab" aria-selected={tab === "knowledge"} aria-controls="studio-knowledge"
          onClick={() => setTab("knowledge")}
          className={"rounded-xl px-3 py-3 text-sm font-black transition " +
            (tab === "knowledge" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          معلومات الموظف
        </button>
      </div>

      <section role="tabpanel" id="studio-personality" aria-label="شخصية الموظف" hidden={tab !== "personality"}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-5">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black">الشخصيات المحفوظة</h2>
            {isCurrent ? <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">المستخدمة حاليًا</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="اختار شخصية محفوظة" value={selectedId}
              onChange={(e) => chooseProfile(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground">
              {!selectedId ? <option value="">شخصية جديدة</option> : null}
              {agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name}{setting?.agentId === agent.agentId ? " — النشطة" : ""}
                </option>
              ))}
              {!agents.length ? <option value="">مفيش شخصيات محفوظة</option> : null}
            </select>
            <Button type="button" variant="outline" onClick={createNew} disabled={busy}>+ شخصية جديدة</Button>
          </div>
          {chosen && !isCurrent ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">الشخصية دي محفوظة، لكن مش بترد على العملاء حاليًا.</p>
              <Button type="button" size="sm" disabled={busy || dirty}
                onClick={() => void saveActiveAgent(chosen.agentId, Boolean(setting?.autoReplyEnabled))}>
                استخدم الشخصية دي
              </Button>
            </div>
          ) : null}
          {setting && isCurrent ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                الرد التلقائي: <strong className="text-foreground">{setting.autoReplyEnabled ? "مفعّل في الإعدادات" : "متوقف"}</strong>
              </p>
              <Button type="button" size="sm" variant="outline" disabled={busy || dirty}
                onClick={() => void saveActiveAgent(chosen!.agentId, !setting.autoReplyEnabled)}>
                {setting.autoReplyEnabled ? "إيقاف الرد" : "تشغيل الرد"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="space-y-2">
            <h2 className="text-sm font-black">هيقدّم نفسه إزاي؟</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={draft.identity === "ai"}
                onClick={() => update({ identity: "ai" })}
                className={"rounded-2xl border p-4 text-start transition " +
                  (draft.identity === "ai" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <span className="text-xl" aria-hidden="true">✦</span>
                <p className="mt-2 text-sm font-black">مساعد ذكاء اصطناعي</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">يعرّف نفسه كمساعد ذكي.</p>
              </button>
              <button type="button" aria-pressed={draft.identity === "natural"}
                onClick={() => update({ identity: "natural" })}
                className={"rounded-2xl border p-4 text-start transition " +
                  (draft.identity === "natural" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <span className="text-xl" aria-hidden="true">◉</span>
                <p className="mt-2 text-sm font-black">أسلوب بشري طبيعي</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">يتكلم كموظف استقبال، ويكون واضح لو اتسأل عن طبيعته.</p>
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="studio-agent-name">اسم الموظف</Label>
            <Input id="studio-agent-name" value={draft.name} maxLength={80}
              onChange={(e) => update({ name: e.target.value })} placeholder="مثال: سارة" />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-black">اختار شخصيته</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => {
                const active = selectedPreset?.id === preset.id;
                return (
                  <button key={preset.id} type="button" aria-pressed={active}
                    onClick={() => update({ tone: preset.tone, dialect: preset.dialect })}
                    className={"rounded-xl border p-3 text-start transition " +
                      (active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                    <p className="text-sm font-black">{preset.label} {active ? "✓" : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{preset.hint}</p>
                  </button>
                );
              })}
            </div>
            {!selectedPreset ? <p className="text-xs text-muted-foreground">أسلوب مخصص محفوظ للشخصية الحالية.</p> : null}
          </div>

          <details className="group border-t border-border pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
              خصّص طريقة كلامه (اختياري)
              <span aria-hidden="true" className="text-muted-foreground transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="studio-language">اللغة</Label>
                  <select id="studio-language" value={draft.language}
                    onChange={(e) => update({ language: e.target.value })}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="studio-dialect">اللهجة</Label>
                  <Input id="studio-dialect" maxLength={64} value={draft.dialect}
                    onChange={(e) => update({ dialect: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="studio-instructions">تعليمات إضافية</Label>
                <Textarea id="studio-instructions" rows={3} maxLength={2000}
                  value={draft.instructions} onChange={(e) => update({ instructions: e.target.value })}
                  placeholder="مثال: خلي الردود مختصرة واسأل سؤال واحد في كل مرة." />
              </div>
            </div>
          </details>

          <div className="rounded-2xl bg-surface/65 p-4">
            <p className="mb-3 text-xs font-bold text-muted-foreground">مثال لطريقة كلامه</p>
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-primary/10 px-3 py-2 text-sm">مساء الخير، ممكن أعرف تفاصيل خدماتكم؟</p>
            </div>
            <div className="mt-2 flex justify-start">
              <div className="max-w-[88%] rounded-2xl border border-border bg-card px-3 py-2">
                <p className="mb-1 text-[11px] font-bold text-primary">{draft.name || "موظفك"} • {roleTitle}</p>
                <p className="text-sm leading-7">{currentPreset.example}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">مثال توضيحي للأسلوب، مش رد مولّد من الـ AI.</p>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}
          {success ? <Alert variant="success">{success}</Alert> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{dirty ? "في تعديلات لسه متحفظتش" : "كل تغيير لازم يتحفظ عشان يتطبق"}</p>
            <Button type="button" disabled={busy || !draft.name.trim() || !dirty && Boolean(chosen)}
              onClick={() => void savePersonality()}>
              {busy ? "جاري الحفظ..." : chosen ? "حفظ التغييرات" : "حفظ الشخصية الجديدة"}
            </Button>
          </div>
        </div>
      </section>

      <div role="tabpanel" id="studio-knowledge" aria-label="معلومات الموظف" hidden={tab !== "knowledge"}
        className="min-h-0 flex-1 flex-col data-[hidden=false]:flex [&[hidden]]:hidden">
        <EmployeeKnowledgeChat businessId={businessId} initialCount={knowledgeCount} />
      </div>
    </main>
  );
}
