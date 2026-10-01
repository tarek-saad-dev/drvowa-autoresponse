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

const QUICK_STARTS = [
  {
    label: "الخدمات والأسعار",
    text: "دي الخدمات والأسعار عندنا:\n",
  },
  {
    label: "الفروع والمواعيد",
    text: "دي الفروع ومواعيد العمل:\n",
  },
  {
    label: "الحجز والإلغاء",
    text: "سياسة الحجز والإلغاء والتأخير:\n",
  },
  {
    label: "أسئلة العملاء",
    text: "أكتر أسئلة العملاء وإجاباتها:\n",
  },
] as const;

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
      <div className="mx-auto max-w-3xl rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
        <p className="text-sm font-black">اكتبها بطريقتك، مش لازم ترتب حاجة</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          مثال: الأسعار، المواعيد، الخدمات، الفروع، سياسة الحجز أو أي معلومة الموظف لازم يعرفها.
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
        className="mx-auto max-w-3xl space-y-4 rounded-[24px] border border-border bg-card p-4 shadow-sm sm:p-6"
      >
        <div>
          <p className="text-xs font-black text-muted-foreground">ابدأ بحاجة جاهزة أو اكتب بطريقتك</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {QUICK_STARTS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  setText((current) =>
                    current.trim()
                      ? `${current.trimEnd()}\n\n${item.text}`
                      : item.text,
                  )
                }
                className="shrink-0 rounded-full border border-border bg-surface px-3 py-2 text-[11px] font-black text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="min-h-[170px] resize-y rounded-2xl border-2 bg-surface/30 p-4 text-sm leading-7 focus:border-primary"
          disabled={pending}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {session
              ? "يمكنك إضافة توضيح أو معلومة جديدة لنفس المسودة."
              : "الصق نصاً طويلاً دفعة واحدة — سنرتّبه لك."}
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "بفهم المعلومات..." : "علّم الموظف"}
          </Button>
        </div>
      </form>

      {session?.summary ? (
        <Card className="mx-auto max-w-3xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">فهمت المعلومات دي</CardTitle>
            <CardDescription>
              راجع بسرعة قبل ما نعتمد أي تغيير.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["جديدة", session.summary.create, "bg-success-soft text-success"],
                ["تحديث", session.summary.merge, "bg-primary/10 text-primary"],
                ["موجودة", session.summary.noop, "bg-secondary text-muted-foreground"],
                ["مراجعة", session.summary.conflict, "bg-warning-soft text-warning"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-surface/40 p-3">
                  <div className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${tone}`}>
                    {label}
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          </CardContent>
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

          <div className="sticky bottom-20 z-10 rounded-[22px] border border-border bg-card/95 p-3 shadow-[0_16px_50px_rgba(15,28,36,.14)] backdrop-blur md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black">
                  {selectedCount > 0
                    ? `${selectedCount} تغيير جاهز للاعتماد`
                    : "اختار التغييرات اللي عايز تعتمدها"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  مفيش حاجة هتتحفظ غير بعد ما تضغط اعتماد.
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                disabled={pending || selectedCount === 0}
                onClick={applySelected}
                className="shrink-0"
              >
                {pending ? "بنحفظ..." : `اعتماد ${selectedCount} تغيير`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
