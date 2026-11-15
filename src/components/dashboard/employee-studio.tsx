"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AGENT_AUTO_LANGUAGE, AGENT_FIXED_LANGUAGES, agentUsesCustomerLanguage } from "@/modules/agents/language-policy";
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
  canManageCampaigns = false,
  initialTab = "personality",
}: {
  initialAgents: Agent[];
  initialSetting: ActiveSetting;
  whatsappState: string;
  businessId: string;
  knowledgeCount: number;
  canManageCampaigns?: boolean;
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
  const [lastFixedLanguage, setLastFixedLanguage] = useState(() => {
    const current = initialAgents.find((agent) => agent.agentId === initialSetting?.agentId) ?? initialAgents[0];
    return current?.language && !agentUsesCustomerLanguage(current.language) ? current.language : "ar";
  });
  const [previewDemoLanguage, setPreviewDemoLanguage] = useState<"ar" | "en">("ar");
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
  const multilingual = agentUsesCustomerLanguage(draft.language);
  const previewLanguage = multilingual ? previewDemoLanguage : draft.language.trim().toLowerCase().split("-")[0];
  const languagePreviews: Record<string, { customer: string; reply: string }> = {
    ar: { customer: "مساء الخير، ممكن أعرف تفاصيل خدماتكم؟", reply: currentPreset.example },
    en: { customer: "Hi, can you tell me about your services?", reply: "Hi! Of course. Which service would you like to know more about?" },
    fr: { customer: "Bonjour, quels services proposez-vous ?", reply: "Bonjour ! Je peux vous renseigner. Quel service vous intéresse ?" },
    es: { customer: "Hola, ¿qué servicios ofrecen?", reply: "¡Hola! Con gusto te ayudo. ¿Qué servicio te interesa?" },
    de: { customer: "Hallo, welche Dienstleistungen bieten Sie an?", reply: "Hallo! Gerne helfe ich Ihnen. Für welchen Service interessieren Sie sich?" },
  };
  const languagePreview = languagePreviews[previewLanguage] ?? { customer: "Hi, can you tell me about your services?", reply: "Hello! How can I help you today?" };

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
    setLastFixedLanguage(nextAgent?.language && !agentUsesCustomerLanguage(nextAgent.language) ? nextAgent.language : "ar");
    setDirty(false);
    setError(null);
    setSuccess(null);
  }

  function createNew() {
    if (dirty && !window.confirm("التعديلات الحالية متحفظتش. تبدأ شخصية جديدة؟")) return;
    setSelectedId("");
    setDraft(draftFromAgent());
    setLastFixedLanguage("ar");
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
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col gap-3 overflow-hidden sm:gap-4" dir="rtl">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">الموظف الذكي</h1>
          <p className="mt-1 text-sm text-muted-foreground">اضبط شخصية الموظف وطريقة ردّه، وجرّب شكل المحادثة قبل الحفظ.</p>
        </div>
        {whatsappReady ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
            واتساب متصل
          </span>
        ) : (
          <Link href="/dashboard/whatsapp"
            className="inline-flex min-h-10 items-center rounded-full border border-warning/25 bg-warning-soft/40 px-3 text-xs font-bold text-foreground hover:bg-warning-soft/60">
            راجع اتصال واتساب ←
          </Link>
        )}
      </header>

      <div role="tablist" aria-label="إدارة الموظف الذكي"
        className="flex w-full shrink-0 items-center gap-1 overflow-x-auto border-b border-border sm:gap-3">
        <button type="button" role="tab" aria-selected={tab === "personality"} aria-controls="studio-personality"
          onClick={() => setTab("personality")}
          className={"shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5 " +
            (tab === "personality" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          شخصية الموظف
        </button>
        <button type="button" role="tab" aria-selected={tab === "knowledge"} aria-controls="studio-knowledge"
          onClick={() => setTab("knowledge")}
          className={"shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5 " +
            (tab === "knowledge" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          معلومات الموظف
        </button>
        {canManageCampaigns ? (
          <button type="button" role="tab" disabled aria-disabled="true" aria-selected={false}
            aria-label="حملات واتساب - قريبًا" title="قريبًا"
            className="flex min-h-10 shrink-0 cursor-not-allowed items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground/75 opacity-75 sm:text-sm">
            <span>حملات واتساب</span>
            <span className="rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">قريبًا</span>
          </button>
        ) : null}
      </div>

      <section role="tabpanel" id="studio-personality" aria-label="شخصية الموظف" hidden={tab !== "personality"}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 [&[hidden]]:hidden lg:overflow-hidden">
        <div className="shrink-0 rounded-2xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="studio-saved-profile" className="shrink-0 text-sm font-black">الشخصيات المحفوظة</label>
              <select id="studio-saved-profile" value={selectedId} disabled={busy}
                onChange={(e) => chooseProfile(e.target.value)}
                className="min-h-11 min-w-0 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground sm:max-w-xs">
                {!selectedId ? <option value="">شخصية جديدة</option> : null}
                {agents.map((agent) => (
                  <option key={agent.agentId} value={agent.agentId}>
                    {agent.name}{setting?.agentId === agent.agentId ? " — النشطة" : ""}
                  </option>
                ))}
                {!agents.length ? <option value="">مفيش شخصيات محفوظة</option> : null}
              </select>
              <Button type="button" variant="outline" className="shrink-0" onClick={createNew} disabled={busy}>
                + شخصية جديدة
              </Button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
              {chosen && isCurrent && setting ? (
                <>
                  <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold " +
                    (setting.autoReplyEnabled ? "bg-success-soft text-success" : "bg-surface text-muted-foreground")}>
                    <span aria-hidden="true" className={"h-2 w-2 rounded-full " +
                      (setting.autoReplyEnabled ? "bg-success" : "bg-muted-foreground/60")} />
                    {setting.autoReplyEnabled ? "الرد التلقائي مفعّل في الإعدادات" : "الرد التلقائي متوقف"}
                  </span>
                  <Button type="button" size="sm" variant="outline" disabled={busy || dirty}
                    onClick={() => void saveActiveAgent(chosen.agentId, !setting.autoReplyEnabled)}>
                    {setting.autoReplyEnabled ? "إيقاف الرد" : "تشغيل الرد"}
                  </Button>
                </>
              ) : chosen ? (
                <>
                  <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-muted-foreground">
                    الشخصية دي مش مستخدمة حاليًا
                  </span>
                  <Button type="button" size="sm" disabled={busy || dirty}
                    onClick={() => void saveActiveAgent(chosen.agentId, Boolean(setting?.autoReplyEnabled))}>
                    استخدم الشخصية دي
                  </Button>
                </>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">ابدأ بتجهيز شخصية جديدة ثم احفظها.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:items-stretch lg:gap-5">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="min-h-0 flex-1 space-y-6 p-4 sm:p-6 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]">
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(250px,320px)]">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-base font-black">هيقدّم نفسه إزاي؟</h2>
                    <p className="mt-1 text-xs text-muted-foreground">اختار الطريقة اللي هيعرّف بيها نفسه للعملاء.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" aria-pressed={draft.identity === "ai"}
                      onClick={() => update({ identity: "ai" })}
                      className={"rounded-2xl border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-ring " +
                        (draft.identity === "ai" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                      <span aria-hidden="true" className="text-base font-black text-primary">{draft.identity === "ai" ? "✓" : "✦"}</span>
                      <p className="mt-2 text-sm font-black">مساعد ذكاء اصطناعي</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">يعرّف نفسه كمساعد ذكي.</p>
                    </button>
                    <button type="button" aria-pressed={draft.identity === "natural"}
                      onClick={() => update({ identity: "natural" })}
                      className={"rounded-2xl border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-ring " +
                        (draft.identity === "natural" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                      <span aria-hidden="true" className="text-base font-black text-primary">{draft.identity === "natural" ? "✓" : "👤"}</span>
                      <p className="mt-2 text-sm font-black">أسلوب بشري طبيعي</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">يتكلم كموظف استقبال، ويكون واضح لو اتسأل عن طبيعته.</p>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studio-agent-name">اسم الموظف</Label>
                  <Input id="studio-agent-name" value={draft.name} maxLength={80}
                    onChange={(e) => update({ name: e.target.value })} placeholder="مثال: سارة" />
                  <p className="text-xs leading-6 text-muted-foreground">الاسم ده اللي هيظهر في معاينة الرد.</p>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/80 pt-5">
                <div>
                  <h2 className="text-base font-black">اختار شخصيته</h2>
                  <p className="mt-1 text-xs text-muted-foreground">الأسلوب اللي هيتكلم بيه مع عملاءك.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                  {PRESETS.map((preset) => {
                    const active = selectedPreset?.id === preset.id;
                    return (
                      <button key={preset.id} type="button" aria-pressed={active}
                        onClick={() => update({ tone: preset.tone, dialect: preset.dialect })}
                        className={"rounded-xl border p-3 text-start transition focus-visible:outline-2 focus-visible:outline-ring " +
                          (active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                        <p className="text-sm font-black">{preset.label} {active ? "✓" : ""}</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">{preset.hint}</p>
                      </button>
                    );
                  })}
                </div>
                {!selectedPreset ? <p className="text-xs text-muted-foreground">أسلوب مخصص محفوظ للشخصية الحالية.</p> : null}
              </div>

              <section aria-label="طريقة الرد حسب اللغة" className="space-y-3 border-t border-border/80 pt-5">
                <div>
                  <h2 className="text-base font-black">لغة رد الموظف</h2>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">اختار إذا كان الموظف يرد بلغة كل عميل، أو يلتزم بلغة واحدة.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" aria-pressed={multilingual}
                    onClick={() => {
                      if (!multilingual) setLastFixedLanguage(draft.language);
                      update({ language: AGENT_AUTO_LANGUAGE });
                    }}
                    className={"rounded-xl border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-ring " +
                      (multilingual ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                    <p className="text-sm font-black">🌐 متعدد اللغات {multilingual ? "✓" : ""}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">يرد بلغة العميل، ويغيّر اللغة لو العميل غيّرها.</p>
                  </button>
                  <button type="button" aria-pressed={!multilingual}
                    onClick={() => update({ language: lastFixedLanguage || "ar" })}
                    className={"rounded-xl border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-ring " +
                      (!multilingual ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                    <p className="text-sm font-black">لغة واحدة {!multilingual ? "✓" : ""}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">يلتزم باللغة اللي هتحددها حتى لو العميل كتب بلغة تانية.</p>
                  </button>
                </div>
                {!multilingual ? (
                  <div className="max-w-sm">
                    <Label htmlFor="studio-language">اللغة الثابتة للردود</Label>
                    <select id="studio-language" value={draft.language}
                      onChange={(e) => {
                        setLastFixedLanguage(e.target.value);
                        update({ language: e.target.value });
                      }}
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                      {!AGENT_FIXED_LANGUAGES.some(option => option.code === draft.language) ? (
                        <option value={draft.language}>{draft.language} (محفوظة سابقًا)</option>
                      ) : null}
                      {AGENT_FIXED_LANGUAGES.map(option => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs leading-6 text-muted-foreground">اللهجة المختارة بتتطبق على الردود العربية فقط.</p>
                )}
              </section>

              <details className="group border-t border-border/80 pt-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
                  تخصيص إضافي لطريقة الكلام (اختياري)
                  <span aria-hidden="true" className="text-muted-foreground transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <Label htmlFor="studio-dialect">اللهجة (للردود بالعربية)</Label>
                    <Input id="studio-dialect" maxLength={64} value={draft.dialect}
                      onChange={(e) => update({ dialect: e.target.value })} />
                    <p className="mt-1 text-xs text-muted-foreground">اللهجة بتتطبق لما الموظف يرد بالعربي فقط.</p>
                  </div>
                  <div>
                    <Label htmlFor="studio-instructions">تعليمات إضافية</Label>
                    <Textarea id="studio-instructions" rows={3} maxLength={2000}
                      value={draft.instructions} onChange={(e) => update({ instructions: e.target.value })}
                      placeholder="مثال: خلي الردود مختصرة واسأل سؤال واحد في كل مرة." />
                  </div>
                </div>
              </details>
            </div>

            <div className="shrink-0 border-t border-border bg-card/95 px-4 py-3 sm:px-6">
              {error ? <div className="mb-2"><Alert variant="error">{error}</Alert></div> : null}
              {success ? <div className="mb-2"><Alert variant="success">{success}</Alert></div> : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={"text-xs font-semibold " + (dirty ? "text-warning" : "text-muted-foreground")}>
                  {dirty ? "عندك تغييرات لسه متحفظتش" : "التعديلات بتتطبق بعد الحفظ"}
                </p>
                <Button type="button" disabled={busy || !draft.name.trim() || (!dirty && Boolean(chosen))}
                  onClick={() => void savePersonality()}>
                  {busy ? "جاري الحفظ..." : chosen ? "حفظ التغييرات" : "حفظ الشخصية الجديدة"}
                </Button>
              </div>
            </div>
          </div>

          <aside aria-label="معاينة رد الموظف"
            className="min-w-0 self-start rounded-2xl border border-border bg-card p-4 sm:p-5 lg:max-h-full lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black">معاينة المحادثة</h2>
                <p className="mt-1 text-xs text-muted-foreground">شوف شكل رد الموظف أثناء تعديل شخصيته.</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-muted-foreground">توضيحية</span>
            </div>
            <div className="mt-4 rounded-2xl bg-surface/65 p-3 sm:p-4">
              {multilingual ? (
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="me-auto text-xs font-bold text-muted-foreground">لغة المثال</span>
                  <button type="button" aria-pressed={previewDemoLanguage === "ar"}
                    onClick={() => setPreviewDemoLanguage("ar")}
                    className={"rounded-lg px-2.5 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-ring " +
                      (previewDemoLanguage === "ar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    عربي
                  </button>
                  <button type="button" aria-pressed={previewDemoLanguage === "en"}
                    onClick={() => setPreviewDemoLanguage("en")}
                    className={"rounded-lg px-2.5 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-ring " +
                      (previewDemoLanguage === "en" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    English
                  </button>
                </div>
              ) : null}
              <div className="flex justify-end">
                <p dir="auto" className="max-w-[90%] rounded-2xl bg-primary/10 px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]">{languagePreview.customer}</p>
              </div>
              <div className="mt-3 flex justify-start">
                <div className="max-w-[93%] rounded-2xl border border-border bg-card px-3 py-2.5">
                  <p className="mb-1 text-xs font-bold text-primary">{draft.name || "موظفك"} • {roleTitle}</p>
                  <p dir="auto" className="text-sm leading-7 [overflow-wrap:anywhere]">{languagePreview.reply}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">أسلوب الرد</p>
                <p className="mt-1 text-sm font-bold">{selectedPreset?.label ?? "أسلوب مخصص"}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">لغة الرد</p>
                <p className="mt-1 text-sm font-bold">
                  {multilingual ? "حسب لغة العميل" : (AGENT_FIXED_LANGUAGES.find(item => item.code === draft.language)?.label ?? draft.language)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              ده مثال توضيحي للأسلوب، مش رد مولّد من الـ AI. تقدر تغيّر لغة المثال من فوق من غير ما تغيّر إعدادات الموظف.
            </p>
          </aside>
        </div>
      </section>

      <div role="tabpanel" id="studio-knowledge" aria-label="معلومات الموظف" hidden={tab !== "knowledge"}
        className="flex min-h-0 min-w-0 flex-1 flex-col [&[hidden]]:hidden">
        <EmployeeKnowledgeChat businessId={businessId} initialCount={knowledgeCount} />
      </div>
    </div>
  );
}
