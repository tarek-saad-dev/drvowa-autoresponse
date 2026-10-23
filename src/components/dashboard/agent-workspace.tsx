"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AgentsManager } from "@/components/dashboard/agents-manager";
import { Alert } from "@/components/ui/alert";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { whatsappStatusLabel } from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { Agent } from "@/types/domain";

type AgentOption = {
  agentId: string;
  name: string;
  roleTitle: string;
  isActive: boolean;
  language?: string | null;
  dialect?: string | null;
  tone?: string | null;
};

type SettingView = {
  channelAiSettingId: string;
  channelConnectionId: string;
  agentId: string;
  autoReplyEnabled: boolean;
  enabledAtUtc: string | Date | null;
  debounceMs: number;
  humanTakeoverResumePolicy:
    | "AFTER_30_MIN"
    | "AFTER_60_MIN"
    | "AFTER_120_MIN"
    | "AFTER_240_MIN"
    | "END_OF_DAY"
    | "MANUAL";
} | null;

type WhatsAppReadiness = {
  uiState: string;
  maskedPhone?: string | null;
};

const TAKEOVER_OPTIONS = [
  {
    value: "AFTER_30_MIN" as const,
    label: "30 دقيقة",
    description:
      "يبدأ العد من آخر رد فعلي للموظف، مع استثناء التصعيد المفتوح وإيقاف الأمان.",
  },
];

type SectionId =
  | "setup"
  | "who-replies"
  | "knowledge"
  | "whatsapp"
  | "test"
  | "advanced";

function languageLabel(code: string | null | undefined): string {
  if (!code) return "العربية";
  if (code === "ar") return "العربية";
  if (code === "en") return "English";
  return code;
}

function agentSummary(agent: AgentOption | Agent | null | undefined): string {
  if (!agent) return "لسه مفيش شخصية جاهزة";
  const language =
    "language" in agent ? agent.language : null;
  const dialect = "dialect" in agent ? agent.dialect : null;
  const tone = "tone" in agent ? agent.tone : null;
  const parts = [
    agent.roleTitle || "موظف استقبال",
    languageLabel(language),
    dialect || null,
    tone || null,
  ].filter(Boolean);
  return parts.join(" • ");
}

function resolveDefaultOpen(params: {
  waReady: boolean;
  hasAgent: boolean;
}): SectionId {
  if (!params.waReady) return "whatsapp";
  if (!params.hasAgent) return "setup";
  return "who-replies";
}

type PrimaryAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "enable"; label: string }
  | { kind: "review"; label: string };

function primaryAction(params: {
  waReady: boolean;
  hasAgent: boolean;
  enabled: boolean;
  canEnable: boolean;
}): PrimaryAction | null {
  if (!params.waReady) {
    return { kind: "link", href: "/dashboard/whatsapp", label: "ربط واتساب" };
  }
  if (!params.hasAgent) {
    return { kind: "review", label: "جهّز الموظف" };
  }
  if (!params.enabled && params.canEnable) {
    return { kind: "enable", label: "تشغيل الرد التلقائي" };
  }
  if (!params.enabled) {
    return { kind: "review", label: "مراجعة المشكلة" };
  }
  return null;
}

export function AgentWorkspace({
  agents,
  initialSetting,
  activeAgents,
  whatsapp,
  knowledgeActiveCount,
}: {
  agents: Agent[];
  activeAgents: AgentOption[];
  initialSetting: SettingView;
  whatsapp: WhatsAppReadiness;
  knowledgeActiveCount: number;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(
    initialSetting?.agentId || activeAgents[0]?.agentId || "",
  );
  const [enabled, setEnabled] = useState(
    Boolean(initialSetting?.autoReplyEnabled),
  );
  const [enabledAtUtc, setEnabledAtUtc] = useState<string | null>(
    initialSetting?.enabledAtUtc
      ? new Date(initialSetting.enabledAtUtc).toISOString()
      : null,
  );
  const [humanTakeoverResumePolicy, setHumanTakeoverResumePolicy] = useState<
    (typeof TAKEOVER_OPTIONS)[number]["value"]
  >("AFTER_30_MIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const waReady =
    whatsapp.uiState === "READY" || whatsapp.uiState === "ACTIVE";
  const hasAgent = activeAgents.length > 0 && Boolean(agentId);
  const canEnable = waReady && hasAgent && !enabled;
  const selectedAgent =
    activeAgents.find((a) => a.agentId === agentId)
    ?? agents.find((a) => a.isActive)
    ?? agents[0]
    ?? null;

  const initialOpen = useMemo(
    () => resolveDefaultOpen({ waReady, hasAgent }),
    // Intentional: only seed once from first paint signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [openSectionId, setOpenSectionId] = useState<string | null>(initialOpen);

  async function save(nextEnabled: boolean) {
    if (nextEnabled && !waReady) {
      setError("اربط واتساب أولاً قبل تفعيل الرد الآلي.");
      return;
    }
    if (!agentId) {
      setError("اختر موظف استقبال نشطاً أولاً");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/channels/whatsapp/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          agentId,
          autoReplyEnabled: nextEnabled,
          humanTakeoverResumePolicy,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        warning?: string | null;
        setting?: {
          autoReplyEnabled: boolean;
          enabledAtUtc: string | null;
          agentId: string;
          humanTakeoverResumePolicy?: (typeof TAKEOVER_OPTIONS)[number]["value"];
        };
      };
      if (!res.ok) {
        setError(mapUserFacingError(data, "تعذر حفظ إعداد الرد الآلي."));
        return;
      }
      setEnabled(Boolean(data.setting?.autoReplyEnabled));
      setEnabledAtUtc(
        data.setting?.enabledAtUtc
          ? new Date(data.setting.enabledAtUtc).toISOString()
          : null,
      );
      if (data.setting?.agentId) setAgentId(data.setting.agentId);
      if (data.setting?.humanTakeoverResumePolicy) {
        setHumanTakeoverResumePolicy("AFTER_30_MIN");
      }
      setMessage(
        data.warning
          || (nextEnabled
            ? "تم تفعيل الرد الآلي للرسائل الجديدة."
            : "تم إيقاف الرد الآلي."),
      );
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }

  const action = primaryAction({ waReady, hasAgent, enabled, canEnable });
  const waLabel = whatsappStatusLabel(whatsapp.uiState);
  const healthLine = !waReady
    ? "يحتاج ربط واتساب"
    : !hasAgent
      ? "يحتاج إعداد الموظف"
      : enabled
        ? "جاهز للرد على الرسائل الجديدة"
        : "الرد التلقائي متوقف";

  const checkedAt = enabledAtUtc
    ? `شغال من ${new Date(enabledAtUtc).toLocaleString("ar-EG")}`
    : `آخر فحص: ${new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          الموظف الذكي
        </h1>
        <p className="text-sm leading-7 text-muted-foreground">
          نظرة سريعة على حالته، والتفاصيل تفتح عند الحاجة.
        </p>
      </header>

      {/* Always-visible status summary */}
      <section
        aria-live="polite"
        className={cn(
          "rounded-2xl border px-4 py-4 sm:px-5 sm:py-5",
          enabled && waReady
            ? "border-success/20 bg-success-soft/30"
            : "border-border/80 bg-card",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  enabled && waReady ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground/50",
                )}
                aria-hidden
              />
              <h2 className="text-lg font-black sm:text-xl">
                {enabled && waReady ? "الموظف شغّال" : "الموظف محتاج متابعة"}
              </h2>
            </div>
            <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
              {healthLine}
            </p>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-bold text-muted-foreground">الرد التلقائي</dt>
                <dd className="mt-0.5 font-black">
                  {enabled ? "مفعّل" : "متوقف"}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-muted-foreground">واتساب</dt>
                <dd className="mt-0.5 font-black">{waLabel}</dd>
              </div>
              <div>
                <dt className="font-bold text-muted-foreground">الصحة</dt>
                <dd className="mt-0.5 font-black text-muted-foreground">
                  {checkedAt}
                </dd>
              </div>
            </dl>
          </div>

          {action ? (
            action.kind === "link" ? (
              <Link href={action.href} className="shrink-0">
                <Button size="sm">{action.label}</Button>
              </Link>
            ) : action.kind === "enable" ? (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={busy || !canEnable}
                onClick={() => void save(true)}
              >
                {busy ? "جاري التشغيل..." : action.label}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setOpenSectionId(!hasAgent ? "setup" : !waReady ? "whatsapp" : "who-replies");
                  document
                    .getElementById("agent-accordion")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {action.label}
              </Button>
            )
          ) : enabled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={busy}
              onClick={() => void save(false)}
            >
              {busy ? "جاري الإيقاف..." : "وقف الرد التلقائي"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <div className="mt-3">
            <Alert variant="error" aria-live="polite">
              {error}
            </Alert>
          </div>
        ) : null}
        {message ? (
          <div className="mt-3">
            <Alert variant="success" aria-live="polite">
              {message}
            </Alert>
          </div>
        ) : null}
      </section>

      <div id="agent-accordion">
        <Accordion
          openId={openSectionId}
          onOpenChange={setOpenSectionId}
          items={[
            {
              id: "setup",
              title: "إعداد الموظف",
              summary: agentSummary(selectedAgent),
              children: <AgentsManager agents={agents} embedded />,
            },
            {
              id: "who-replies",
              title: "من يرد باسم الموظف؟",
              summary: hasAgent
                ? `${selectedAgent?.name ?? "الموظف"} هو النشط حالياً`
                : "اختار شخصية نشطة للرد على واتساب",
              children: (
                <div className="space-y-3">
                  {activeAgents.length === 0 ? (
                    <Alert variant="warning">
                      جهّز شخصية موظف أولاً من قسم «إعداد الموظف».
                    </Alert>
                  ) : (
                    <>
                      <label
                        className="block text-sm font-black"
                        htmlFor="active-agent"
                      >
                        الشخصية النشطة على واتساب
                      </label>
                      <select
                        id="active-agent"
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-bold"
                        value={agentId}
                        disabled={busy}
                        onChange={(e) => setAgentId(e.target.value)}
                      >
                        {activeAgents.map((a) => (
                          <option key={a.agentId} value={a.agentId}>
                            {a.name} — {a.roleTitle}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !agentId}
                          onClick={() => void save(enabled)}
                        >
                          {busy ? "جاري الحفظ..." : "حفظ الاختيار"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ),
            },
            {
              id: "knowledge",
              title: "معلومات الموظف",
              summary:
                knowledgeActiveCount > 0
                  ? `${knowledgeActiveCount} معلومات محفوظة`
                  : "مفيش معلومات محفوظة بعد",
              children: (
                <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>
                    المعلومات دي اللي بيرد بيها على أسئلة العملاء عن النشاط
                    والأسعار والسياسات.
                  </p>
                  <Link href="/dashboard/knowledge">
                    <Button type="button" size="sm">
                      {knowledgeActiveCount > 0
                        ? "إدارة المعلومات"
                        : "علّم الموظف"}
                    </Button>
                  </Link>
                </div>
              ),
            },
            {
              id: "whatsapp",
              title: "ربط واتساب",
              summary: waLabel,
              children: (
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-muted-foreground">
                    {waReady
                      ? "الرقم متصل. تقدر تشغّل أو توقف الرد التلقائي من البطاقة فوق."
                      : "من غير واتساب، الموظف مش هيستقبل رسائل العملاء."}
                  </p>
                  {whatsapp.maskedPhone ? (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {whatsapp.maskedPhone}
                    </p>
                  ) : null}
                  <Link href="/dashboard/whatsapp">
                    <Button type="button" size="sm" variant={waReady ? "outline" : "default"}>
                      {waReady ? "إدارة واتساب" : "ربط واتساب"}
                    </Button>
                  </Link>
                </div>
              ),
            },
            {
              id: "test",
              title: "اختبار الموظف",
              summary: "جرّب ردّه من المحادثات قبل الاعتماد عليه",
              children: (
                <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>
                    ابعت رسالة تجريبية من رقمك على واتساب المرتبط، وراجع الرد
                    من صندوق الوارد.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/dashboard/inbox">
                      <Button type="button" size="sm">
                        فتح المحادثات
                      </Button>
                    </Link>
                    {!enabled && canEnable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void save(true)}
                      >
                        شغّل الرد ثم اختبر
                      </Button>
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              id: "advanced",
              title: "إعدادات متقدمة",
              summary: "رجوع البوت بعد التدخل البشري",
              children: (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-black">
                      بعد تدخل موظف بشري، إمتى الـ AI يرجع يرد؟
                    </p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      المدة بتتحسب من آخر رد يدوي من فريقك على نفس المحادثة.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {TAKEOVER_OPTIONS.map((option) => {
                      const selected =
                        humanTakeoverResumePolicy === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setHumanTakeoverResumePolicy(option.value)
                          }
                          className={cn(
                            "rounded-xl border p-3 text-start transition",
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/70 hover:border-primary/25",
                          )}
                        >
                          <span className="text-sm font-black">
                            {option.label}
                          </span>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {waReady && hasAgent ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void save(enabled)}
                    >
                      حفظ الإعدادات المتقدمة
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
