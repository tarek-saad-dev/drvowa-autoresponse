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

  const proposalTree = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; title: string; items: Proposal[] }
    >();

    for (const proposal of proposals) {
      const key =
        proposal.topicKey?.trim()
        || `standalone:${proposal.proposalId}`;
      const title =
        proposal.topicTitle?.trim()
        || proposal.proposedTitle
        || "معلومة مستقلة";

      const current = groups.get(key);
      if (current) {
        current.items.push(proposal);
      } else {
        groups.set(key, { key, title, items: [proposal] });
      }
    }

    return [...groups.values()];
  }, [proposals]);

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
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-[26px] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">شجرة التغييرات قبل الاعتماد</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  كل Parent بيمثل موضوع، وتحته الـ Children المرتبطة بيه. راجع التغييرات قبل الحفظ.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-black">
                <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">● جديد</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">● تعديل</span>
                <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">● حذف</span>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-orange-700">● مراجعة</span>
              </div>
            </div>

            <div className="mt-7 space-y-8">
              {proposalTree.map((group) => (
                <section key={group.key} className="relative">
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-slate-800 bg-slate-900 text-lg font-black text-white shadow-sm">
                      ◉
                    </div>
                    <div className="min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="truncate text-sm font-black text-slate-900">{group.title}</div>
                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        Parent node · {group.items.length} {group.items.length === 1 ? "child" : "children"}
                      </div>
                    </div>
                  </div>

                  <div className="relative mr-6 mt-1 border-r-[3px] border-slate-200 pb-1 pr-8">
                    {group.items.map((p, itemIndex) => {
                      const isCreate = p.action === "CREATE";
                      const isMerge = p.action === "MERGE";
                      const isConflict = p.action === "CONFLICT";
                      const isNoop = p.action === "NOOP";

                      const nodeTone = isCreate
                        ? "border-green-200 bg-green-50/80"
                        : isMerge
                          ? "border-amber-200 bg-amber-50/80"
                          : isConflict
                            ? "border-orange-200 bg-orange-50/80"
                            : "border-slate-200 bg-slate-50";

                      const dotTone = isCreate
                        ? "bg-green-500 ring-green-100"
                        : isMerge
                          ? "bg-amber-500 ring-amber-100"
                          : isConflict
                            ? "bg-orange-500 ring-orange-100"
                            : "bg-slate-400 ring-slate-100";

                      const statusTone = isCreate
                        ? "border-green-200 bg-green-100 text-green-800"
                        : isMerge
                          ? "border-amber-200 bg-amber-100 text-amber-800"
                          : isConflict
                            ? "border-orange-200 bg-orange-100 text-orange-800"
                            : "border-slate-200 bg-slate-100 text-slate-600";

                      return (
                        <div key={p.proposalId} className="relative pt-5">
                          <span className="absolute -right-8 top-10 h-[3px] w-8 bg-slate-200" />
                          <span className={`absolute -right-[2.18rem] top-[2.18rem] h-4 w-4 rounded-full border-2 border-white ring-4 ${dotTone}`} />

                          <div className={`rounded-2xl border-2 px-4 py-4 shadow-[0_5px_16px_rgba(15,23,42,.04)] ${nodeTone}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500">
                                  <span>Child {itemIndex + 1}</span>
                                  <span className="text-slate-300">/</span>
                                  <span>{knowledgeCategoryLabel(p.category)}</span>
                                </div>
                                <h4 className="mt-1.5 text-sm font-black leading-6 text-slate-900">
                                  {p.proposedTitle}
                                </h4>
                              </div>

                              <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black ${statusTone}`}>
                                {actionLabel(p.action)}
                              </span>
                            </div>

                            {p.action === "MERGE" || p.action === "CONFLICT" ? (
                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl border border-white/70 bg-white/70 p-3">
                                  <p className="mb-1 text-[10px] font-black text-muted-foreground">
                                    المعلومة الحالية
                                  </p>
                                  <p className="whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                                    {p.existingContent || "—"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-white/70 bg-white/90 p-3">
                                  <p className="mb-1 text-[10px] font-black text-muted-foreground">
                                    المعلومة الجديدة
                                  </p>
                                  <p className="whitespace-pre-wrap text-xs leading-6">
                                    {p.proposedContent}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                                {p.proposedContent}
                              </p>
                            )}

                            {p.action === "CONFLICT" ? (
                              <div className="mt-4 flex flex-wrap gap-2">
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
                                  استخدم الجديدة
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
                            ) : !isNoop ? (
                              <label className="mt-4 flex items-center gap-2 text-xs font-bold">
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
                              <p className="mt-4 text-[11px] text-muted-foreground">
                                موجودة بالفعل — مش هتتضاف مرة تانية.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-6 text-slate-600">
              الأخضر = Node جديدة، الأصفر = Node موجودة اتعدلت، الأحمر = حذف صريح، والبرتقالي = تعارض محتاج قرار. الحذف الصريح لسه مش مفعّل في الـ backend الحالي، فمش هيظهر أحمر إلا بعد إضافة Delete action فعلية.
            </div>
          </div>

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
