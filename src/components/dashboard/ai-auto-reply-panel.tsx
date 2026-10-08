"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { whatsappStatusLabel } from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type AgentOption = {
  agentId: string;
  name: string;
  roleTitle: string;
  isActive: boolean;
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
    value: "AFTER_30_MIN",
    label: "30 دقيقة",
    description: "للأنشطة السريعة والردود القصيرة.",
  },
  {
    value: "AFTER_60_MIN",
    label: "ساعة",
    description: "وقت كفاية لمتابعة سريعة من الفريق.",
  },
  {
    value: "AFTER_120_MIN",
    label: "ساعتين",
    description: "الاختيار المتوازن والمقترح لمعظم الأنشطة.",
  },
  {
    value: "AFTER_240_MIN",
    label: "4 ساعات",
    description: "للمحادثات اللي محتاجة متابعة أطول.",
  },
  {
    value: "END_OF_DAY",
    label: "لحد نهاية اليوم",
    description: "الـ AI يرجع من أول رسالة في يوم جديد.",
  },
  {
    value: "MANUAL",
    label: "يدوي فقط",
    description: "مش هيرجع إلا لما الفريق يفعّله بنفسه.",
  },
] as const;

type TakeoverPolicy = (typeof TAKEOVER_OPTIONS)[number]["value"];

function takeoverPolicyLabel(policy: TakeoverPolicy): string {
  return TAKEOVER_OPTIONS.find((option) => option.value === policy)?.label
    ?? "ساعتين";
}

export function AiAutoReplyPanel({
  initialSetting,
  agents,
  whatsapp,
  knowledgeActiveCount,
}: {
  initialSetting: SettingView;
  agents: AgentOption[];
  whatsapp: WhatsAppReadiness;
  knowledgeActiveCount: number;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(
    initialSetting?.agentId || agents[0]?.agentId || "",
  );
  const [enabled, setEnabled] = useState(
    Boolean(initialSetting?.autoReplyEnabled),
  );
  const [enabledAtUtc, setEnabledAtUtc] = useState<string | null>(
    initialSetting?.enabledAtUtc
      ? new Date(initialSetting.enabledAtUtc).toISOString()
      : null,
  );
  const [humanTakeoverResumePolicy, setHumanTakeoverResumePolicy] =
    useState<TakeoverPolicy>(
      initialSetting?.humanTakeoverResumePolicy ?? "AFTER_120_MIN",
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const waReady =
    whatsapp.uiState === "READY"
    || whatsapp.uiState === "ACTIVE";
  const hasAgent = agents.length > 0 && Boolean(agentId);
  const canEnable = waReady && hasAgent && !enabled;

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
          humanTakeoverResumePolicy?: TakeoverPolicy;
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
        setHumanTakeoverResumePolicy(data.setting.humanTakeoverResumePolicy);
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

  const waCta =
    whatsapp.uiState === "LOGGED_OUT" || whatsapp.uiState === "DISCONNECTED"
      ? "إعادة ربط واتساب"
      : "ربط واتساب";

  return (
    <Card className={enabled ? "border-success/20 bg-success-soft/20" : ""}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black text-primary">تشغيل الموظف</p>
            <CardTitle className="mt-1 text-xl">الرد التلقائي على واتساب</CardTitle>
            <CardDescription className="mt-2 max-w-xl leading-6">
              لما يكون شغال، الموظف يرد على الرسائل الجديدة. ولو حد من فريقك رد يدويًا، يسيب المحادثة ليكم مؤقتًا ويرجع حسب المدة اللي تختارها.
            </CardDescription>
          </div>
          <div
            className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-xs font-black ${
              enabled
                ? "bg-success-soft text-success"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-success" : "bg-muted-foreground/40"}`} />
            {enabled ? "شغال" : "متوقف"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-bold text-muted-foreground">واتساب</p>
            <p className="mt-1 text-sm font-black">{whatsappStatusLabel(whatsapp.uiState)}</p>
            {whatsapp.maskedPhone ? (
              <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
                {whatsapp.maskedPhone}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-bold text-muted-foreground">الموظف</p>
            <p className="mt-1 text-sm font-black">
              {hasAgent
                ? agents.find((a) => a.agentId === agentId)?.name ?? "جاهز"
                : "لسه مش جاهز"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-bold text-muted-foreground">المعرفة</p>
            <p className="mt-1 text-sm font-black">
              {knowledgeActiveCount > 0 ? `${knowledgeActiveCount} معلومة` : "مفيش معلومات"}
            </p>
          </div>
        </div>

        {!waReady ? (
          <Alert variant="warning" title="ناقص ربط واتساب">
            <p className="mb-3">
              وصل رقم واتساب الأول، وبعدها تقدر تشغل الموظف.
            </p>
            <Link
              href="/dashboard/whatsapp"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-sm font-black text-primary-foreground"
            >
              {waCta}
            </Link>
          </Alert>
        ) : null}

        {agents.length === 0 ? (
          <Alert variant="warning">
            اعمل شخصية لموظف الاستقبال الأول قبل التشغيل.
          </Alert>
        ) : (
          <div className="rounded-2xl border border-border bg-surface/45 p-4">
            <label className="block text-sm font-black" htmlFor="active-agent">
              مين الموظف اللي يرد؟
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              لو عندك أكتر من شخصية، اختار اللي هتشتغل على واتساب.
            </p>
            <select
              id="active-agent"
              className="mt-3 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm font-bold"
              value={agentId}
              disabled={busy}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name} — {a.roleTitle}
                </option>
              ))}
            </select>
          </div>
        )}

        {waReady && hasAgent ? (
          <div className="rounded-2xl border border-border bg-surface/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <label className="block text-sm font-black">
                  بعد تدخل موظف بشري، إمتى الـ AI يرجع يرد؟
                </label>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  المدة بتتحسب من آخر رد يدوي من فريقك على نفس المحادثة.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-black text-primary">
                الحالي: {takeoverPolicyLabel(humanTakeoverResumePolicy)}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TAKEOVER_OPTIONS.map((option) => {
                const selected = humanTakeoverResumePolicy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={busy}
                    onClick={() => setHumanTakeoverResumePolicy(option.value)}
                    className={`rounded-2xl border-2 p-3 text-start transition ${selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-black ${selected ? "text-primary" : "text-foreground"}`}>
                        {option.label}
                      </span>
                      <span className={`h-3 w-3 rounded-full border-2 ${selected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30 bg-transparent"
                      }`} />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              لو اخترت نهاية اليوم، بنستخدم المنطقة الزمنية المسجلة للبيزنس.
            </p>
          </div>
        ) : null}

        {waReady && hasAgent && knowledgeActiveCount === 0 ? (
          <Alert variant="info">
            الموظف ممكن يشتغل، بس الأفضل تعلّمه معلومات البيزنس الأول عشان ردوده تبقى أدق.
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="error" aria-live="polite">
            {error}
          </Alert>
        ) : null}
        {message ? (
          <Alert variant="success" aria-live="polite">
            {message}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
          {!enabled ? (
            <Button
              type="button"
              size="lg"
              disabled={busy || !canEnable}
              onClick={() => void save(true)}
              className="sm:min-w-48"
            >
              {busy ? "جاري التشغيل..." : "شغّل موظف الاستقبال"}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => void save(false)}
              className="sm:min-w-48"
            >
              {busy ? "جاري الإيقاف..." : "وقف الرد التلقائي"}
            </Button>
          )}

          {agents.length > 0 && waReady ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void save(enabled)}
            >
              حفظ الإعدادات
            </Button>
          ) : null}

          {enabled && enabledAtUtc ? (
            <span className="text-[11px] text-muted-foreground sm:ms-auto">
              شغال من {new Date(enabledAtUtc).toLocaleString("ar-SA")}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
