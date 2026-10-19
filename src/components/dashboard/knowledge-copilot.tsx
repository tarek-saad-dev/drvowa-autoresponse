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
  topicKey?: string | null;
  topicTitle?: string | null;
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
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-[26px] border border-border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-black">راجع المعلومات قبل الاعتماد</h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              كل معلومة تظهر مرة واحدة. افتح أي كارت لمراجعة محتواه والتغيير المقترح قبل الحفظ.
            </p>
            <div className="mt-5 space-y-3">
              {proposals.map((p) => {
                const isConflict = p.action === "CONFLICT";
                const isNoop = p.action === "NOOP";
                const tone = p.action === "CREATE"
                  ? "border-success/30"
                  : p.action === "MERGE"
                    ? "border-primary/30"
                    : isConflict
                      ? "border-warning/40"
                      : "border-border";
                return (
                  <details key={p.proposalId} className={`group rounded-2xl border bg-card ${tone}`}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 marker:hidden [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant={actionVariant(p.action)}>{actionLabel(p.action)}</Badge>
                          <span className="text-[11px] text-muted-foreground">{knowledgeCategoryLabel(p.category)}</span>
                        </div>
                        <h4 className="text-sm font-black leading-6 text-foreground">{p.proposedTitle}</h4>
                      </div>
                      <span aria-hidden="true" className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      {p.action === "MERGE" || isConflict ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-border bg-surface p-3">
                            <p className="mb-2 text-xs font-bold text-muted-foreground">المعلومة الحالية</p>
                            <p className="whitespace-pre-wrap text-xs leading-6 text-foreground">{p.existingContent || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-surface p-3">
                            <p className="mb-2 text-xs font-bold text-muted-foreground">المعلومة المقترحة</p>
                            <p className="whitespace-pre-wrap text-xs leading-6 text-foreground">{p.proposedContent}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-border bg-surface p-3">
                          <p className="mb-2 text-xs font-bold text-muted-foreground">
                            {isNoop ? "المعلومة الموجودة بالفعل" : "المحتوى اللي هيتضاف"}
                          </p>
                          <p className="whitespace-pre-wrap text-xs leading-6 text-foreground">{p.proposedContent}</p>
                        </div>
                      )}
                      {isConflict ? (
                        <div className="mt-4">
                          <p className="mb-2 text-xs text-muted-foreground">فيه تعارض مع معلومة محفوظة. اختار النسخة الصحيحة:</p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={pending}
                              variant={p.resolution === "USE_NEW" && p.selected ? "default" : "outline"}
                              onClick={() => patchProposal(p.proposalId, { resolution: "USE_NEW", selected: true })}>
                              استخدم الجديدة
                            </Button>
                            <Button type="button" size="sm" disabled={pending} variant="outline"
                              onClick={() => patchProposal(p.proposalId, { resolution: "KEEP_EXISTING", selected: false })}>
                              احتفظ بالحالية
                            </Button>
                          </div>
                        </div>
                      ) : !isNoop ? (
                        <label className="mt-4 flex items-center gap-2 text-xs font-bold text-foreground">
                          <input type="checkbox" checked={p.selected} disabled={pending}
                            onChange={(event) => patchProposal(p.proposalId, { selected: event.target.checked })} />
                          تضمين في الاعتماد
                        </label>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">المعلومة محفوظة بالفعل، ومش هتتضاف مرة تانية.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              الإضافة والتحديثات المحددة بس هي اللي هتتحفظ بعد الاعتماد. حذف المعلومات مش متاح في الخطوة دي.
            </p>
          </div>

          <div className="sticky bottom-20 z-10 rounded-[22px] border border-border bg-card/95 p-3 shadow-[0_16px_50px_rgba(7,19,25,.14)] backdrop-blur md:bottom-4">
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
