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
} | null;

type WhatsAppReadiness = {
  uiState: string;
  maskedPhone?: string | null;
};

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
    <Card>
      <CardHeader>
        <CardTitle>الرد الآلي عبر واتساب</CardTitle>
        <CardDescription>
          يعمل فقط على الرسائل الجديدة بعد التفعيل. الرسائل القديمة لن يُرد عليها.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border border-border bg-surface/60 px-3 py-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">واتساب</p>
            <p className="font-medium">{whatsappStatusLabel(whatsapp.uiState)}</p>
            {whatsapp.maskedPhone ? (
              <p className="text-xs text-muted-foreground">{whatsapp.maskedPhone}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">موظف الاستقبال</p>
            <p className="font-medium">
              {hasAgent
                ? agents.find((a) => a.agentId === agentId)?.name ?? "محدد"
                : "غير جاهز"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">الرد الآلي</p>
            <p className="font-medium">
              {enabled ? "مفعّل" : "متوقف"}
            </p>
          </div>
        </div>

        {!waReady ? (
          <Alert variant="warning" title="واتساب غير متصل">
            <p className="mb-2">
              يلزم ربط واتساب قبل تفعيل الرد الآلي.
            </p>
            <Link
              href="/dashboard/whatsapp"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              {waCta}
            </Link>
          </Alert>
        ) : null}

        {agents.length === 0 ? (
          <Alert variant="warning">
            أنشئ موظف استقبال نشطاً أولاً قبل تفعيل الرد الآلي.
          </Alert>
        ) : (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              موظف الاستقبال المرتبط بواتساب
            </span>
            <select
              className="w-full rounded-md border border-input bg-card px-3 py-2"
              value={agentId}
              disabled={busy}
              aria-label="موظف الاستقبال المرتبط بواتساب"
              onChange={(e) => setAgentId(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name} — {a.roleTitle}
                </option>
              ))}
            </select>
          </label>
        )}

        {waReady && hasAgent && knowledgeActiveCount === 0 ? (
          <Alert variant="info">
            لا توجد معرفة نشطة بعد. يُفضّل إضافة معلومات النشاط من قاعدة
            المعرفة قبل التفعيل لتحسين جودة الردود.
          </Alert>
        ) : null}

        <div className="rounded-md border border-border bg-surface/60 px-3 py-2 text-sm">
          <p>
            الحالة:{" "}
            <strong>{enabled ? "مفعّل" : "متوقف (افتراضي)"}</strong>
          </p>
          {enabled && enabledAtUtc ? (
            <p className="mt-1 text-xs text-muted-foreground">
              بدأ التفعيل: {new Date(enabledAtUtc).toLocaleString("ar-SA")}
            </p>
          ) : null}
        </div>

        {enabled ? (
          <Alert variant="warning">
            سيتم الرد تلقائيًا على الرسائل الجديدة فقط.
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !canEnable}
            onClick={() => void save(true)}
          >
            تفعيل الرد الآلي
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !enabled}
            onClick={() => void save(false)}
          >
            إيقاف الرد الآلي
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || agents.length === 0 || !waReady}
            onClick={() => void save(enabled)}
          >
            حفظ موظف الاستقبال
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
