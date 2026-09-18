"use client";

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

export function AiAutoReplyPanel({
  initialSetting,
  agents,
}: {
  initialSetting: SettingView;
  agents: AgentOption[];
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

  async function save(nextEnabled: boolean) {
    if (!agentId) {
      setError("اختر وكيلاً نشطاً أولاً");
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
        warning?: string | null;
        setting?: {
          autoReplyEnabled: boolean;
          enabledAtUtc: string | null;
          agentId: string;
        };
      };
      if (!res.ok) {
        throw new Error(data.error || "تعذر حفظ الإعداد");
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
          || (nextEnabled ? "تم تفعيل الرد الآلي للرسائل الجديدة." : "تم إيقاف الرد الآلي."),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الإعداد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الرد الآلي عبر واتساب</CardTitle>
        <CardDescription>
          يعمل فقط على الرسائل الجديدة بعد التفعيل. الرسائل القديمة لن يُرد عليها.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {agents.length === 0 ? (
          <Alert variant="warning">
            أنشئ وكيلاً نشطاً أولاً قبل تفعيل الرد الآلي.
          </Alert>
        ) : (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الوكيل المرتبط بواتساب</span>
            <select
              className="w-full rounded-md border border-input bg-card px-3 py-2"
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
          </label>
        )}

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

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || agents.length === 0 || enabled}
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
            disabled={busy || agents.length === 0}
            onClick={() => void save(enabled)}
          >
            حفظ الوكيل
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
