"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeCategoryLabel } from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type ConversationTurn = { role: "user" | "assistant"; text: string; at: string };

type Proposal = {
  proposalId: string;
  sequence: number;
  action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT";
  category: string;
  proposedTitle: string;
  proposedContent: string;
  existingKnowledgeItemId: string | null;
  existingTitle: string | null;
  existingContent: string | null;
  resolution: "USE_NEW" | "KEEP_EXISTING" | "MANUAL" | null;
  selected: boolean;
  status: string;
};

type Session = {
  sessionId: string;
  status: string;
  conversation: ConversationTurn[];
  summary: {
    total: number;
    create: number;
    merge: number;
    noop: number;
    conflict: number;
    clarifications: string[];
  } | null;
};

function actionLabel(action: Proposal["action"]): string {
  switch (action) {
    case "CREATE":
      return "معلومة جديدة";
    case "MERGE":
      return "تحديث معلومة موجودة";
    case "NOOP":
      return "موجودة بالفعل";
    case "CONFLICT":
      return "تحتاج مراجعة";
  }
}

function actionVariant(
  action: Proposal["action"],
): "default" | "success" | "warning" | "muted" {
  switch (action) {
    case "CREATE":
      return "success";
    case "MERGE":
      return "default";
    case "NOOP":
      return "muted";
    case "CONFLICT":
      return "warning";
  }
}

const PLACEHOLDER = `مثال:
عندنا فرعين، فرع جليم شغال يوميًا من 11 صباحًا لـ2 صباحًا،
الحلاقة بـ200 جنيه، شعر ودقن بـ300 جنيه، والحجز متاح من الموقع...
https://maps.example/gleem`;

export function KnowledgeCopilot() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [collapsedUser, setCollapsedUser] = useState<Record<number, boolean>>(
    {},
  );

  const selectedCount = useMemo(
    () =>
      proposals.filter((p) => {
        if (p.action === "NOOP") return false;
        if (p.action === "CONFLICT") {
          return (
            p.selected
            && (p.resolution === "USE_NEW" || p.resolution === "MANUAL")
          );
        }
        return p.selected;
      }).length,
    [proposals],
  );

  async function analyze(event?: FormEvent) {
    event?.preventDefault();
    const payload = text.trim();
    if (!payload) {
      setError("اكتب أو الصق معلومات النشاط أولاً.");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    setProgress("بفهم المعلومات...");
    try {
      await new Promise((r) => setTimeout(r, 200));
      setProgress("براجع المعرفة الحالية...");
      const response = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload,
          sessionId: session?.sessionId ?? null,
        }),
      });
      setProgress("بجهز التغييرات...");
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        session?: Session;
        proposals?: Proposal[];
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر تحليل المعلومات. حاول مرة أخرى."));
        return;
      }
      setSession(data.session ?? null);
      setProposals(data.proposals ?? []);
      setText("");
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function patchProposal(
    proposalId: string,
    body: Record<string, unknown>,
  ) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/knowledge/ingest/proposals/${proposalId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        proposal?: Proposal;
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر تحديث الاقتراح."));
        return;
      }
      if (data.proposal) {
        setProposals((prev) =>
          prev.map((p) =>
            p.proposalId === proposalId ? { ...p, ...data.proposal! } : p,
          ),
        );
      }
    } catch {
      setError("حدث خطأ في الاتصال.");
    } finally {
      setPending(false);
    }
  }

  async function applySelected() {
    if (!session) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/knowledge/ingest/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        applied?: {
          created: number;
          merged: number;
          skipped: number;
          conflictsResolved: number;
        };
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر اعتماد التغييرات."));
        return;
      }
      const a = data.applied;
      setSuccess(
        a
          ? `تم الاعتماد: ${a.created} جديدة، ${a.merged} تحديثات.`
          : "تم اعتماد التغييرات.",
      );
      setSession(null);
      setProposals([]);
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          علّم موظف الاستقبال
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          اكتب أي معلومات عن نشاطك: الخدمات، الأسعار، الفروع، المواعيد، السياسات
          أو الروابط… وأنا هرتبها وأضيف الجديد من غير تكرار.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}
      {progress ? (
        <Alert variant="info">{progress}</Alert>
      ) : null}

      {session?.conversation?.length ? (
        <div className="mx-auto max-w-3xl space-y-3">
          {session.conversation.map((turn, index) => (
            <div
              key={`${turn.at}-${index}`}
              className={
                turn.role === "user"
                  ? "rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
                  : "rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
              }
            >
              {turn.role === "user" ? (
                <>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary"
                    onClick={() =>
                      setCollapsedUser((prev) => ({
                        ...prev,
                        [index]: !prev[index],
                      }))
                    }
                  >
                    {collapsedUser[index] ? "إظهار رسالتك" : "طيّ رسالتك"}
                  </button>
                  {!collapsedUser[index] ? (
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {turn.text}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="whitespace-pre-wrap">{turn.text}</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={analyze}
        className="mx-auto max-w-3xl space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={10}
          className="min-h-[180px] resize-y text-sm leading-7"
          disabled={pending}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {session
              ? "يمكنك إضافة توضيح أو معلومة جديدة لنفس المسودة."
              : "الصق نصاً طويلاً دفعة واحدة — سنرتّبه لك."}
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ التحليل..." : "حلّل المعلومات"}
          </Button>
        </div>
      </form>

      {session?.summary ? (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle className="text-lg">ملخص التحليل</CardTitle>
            <CardDescription>
              {session.summary.create} جديدة · {session.summary.merge} تحديثات ·{" "}
              {session.summary.noop} موجودة · {session.summary.conflict} تحتاج
              مراجعة
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {proposals.length > 0 ? (
        <div className="mx-auto max-w-3xl space-y-3">
          {proposals.map((p) => (
            <Card key={p.proposalId}>
              <CardHeader className="space-y-2 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={actionVariant(p.action)}>
                    {actionLabel(p.action)}
                  </Badge>
                  <Badge variant="muted">
                    {knowledgeCategoryLabel(p.category)}
                  </Badge>
                </div>
                <CardTitle className="text-base">{p.proposedTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.action === "MERGE" || p.action === "CONFLICT" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        المعلومة الحالية
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {p.existingContent || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        المعلومة الجديدة
                      </p>
                      <p className="whitespace-pre-wrap">
                        {p.proposedContent}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {p.proposedContent}
                  </p>
                )}

                {p.action === "CONFLICT" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        patchProposal(p.proposalId, {
                          resolution: "USE_NEW",
                          selected: true,
                        })
                      }
                    >
                      استخدم المعلومة الجديدة
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        patchProposal(p.proposalId, {
                          resolution: "KEEP_EXISTING",
                          selected: false,
                        })
                      }
                    >
                      احتفظ بالحالية
                    </Button>
                  </div>
                ) : p.action !== "NOOP" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      disabled={pending}
                      onChange={(e) =>
                        patchProposal(p.proposalId, {
                          selected: e.target.checked,
                        })
                      }
                    />
                    تضمين في الاعتماد
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    لن تُضاف مرة أخرى — موجودة بالفعل.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={pending || selectedCount === 0}
              onClick={applySelected}
            >
              اعتماد {selectedCount} تغيير
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
