"use client";

import Link from "next/link";
import { EmployeeLocationSuggestion } from "@/components/dashboard/employee-location-suggestion";
import { locationSuggestionFromFact, type LocationSuggestion } from "@/lib/knowledge/location-from-fact";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import { trainingReplyForAnalysis } from "@/lib/ui/knowledge-chat-replies";

type Turn = { role: "user" | "assistant"; text: string; at?: string };
type Proposal = {
  proposalId: string;
  action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT";
  category: string;
  proposedTitle: string;
  proposedContent: string;
  existingContent: string | null;
  selected: boolean;
  resolution: "USE_NEW" | "KEEP_EXISTING" | "MANUAL" | null;
};
type Session = {
  sessionId: string;
  status: string;
  conversation?: Turn[];
  summary?: { clarifications?: string[] } | null;
};
type AnalyzeResponse = {
  session?: Session;
  proposals?: Proposal[];
  code?: string;
  error?: string;
};

const VOICE_LIMIT_MS = 90_000;

export function EmployeeKnowledgeChat({
  businessId,
  initialCount,
}: {
  businessId: string;
  initialCount: number;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", text: "أهلًا بيك 👋 احكيلي أي معلومة جديدة عن شغلك، أو قولي عايز تعدّل إيه من اللي اتعلمته." },
  ]);
  const [session, setSession] = useState<Session | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [count, setCount] = useState(initialCount);
  const [locationsToReview, setLocationsToReview] = useState<Array<{ key: string; value: LocationSuggestion }>>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const storageKey = "drvo-knowledge-session:" + businessId;

  useEffect(() => {
    let cancelled = false;
    const lastSessionId = window.localStorage.getItem(storageKey);
    if (lastSessionId) {
      void (async () => {
        try {
          const response = await fetch(
            "/api/knowledge/ingest/analyze?sessionId=" + encodeURIComponent(lastSessionId),
            { cache: "no-store" },
          );
          const data = (await response.json()) as AnalyzeResponse;
          if (!response.ok || cancelled) return;
          if (data.session?.conversation?.length && data.session.status !== "APPLIED") {
            const restored = data.session.conversation.map((turn) =>
              turn.role === "assistant" && turn.text.startsWith("حللت المعلومات ووجدت")
                ? { ...turn, text: trainingReplyForAnalysis(data.proposals ?? []) }
                : turn
            );
            setTurns(restored);
            setSession(data.session);
            setProposals(data.proposals ?? []);
          } else if (data.session?.status === "APPLIED") {
            window.localStorage.removeItem(storageKey);
          }
        } catch {
          // A previous session may have expired; teaching must remain usable.
        }
      })();
    }
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [storageKey]);

  useEffect(() => {
    // Only the chat timeline scrolls; never drag the surrounding dashboard.
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [turns, proposals, busy, locationsToReview]);

  const selected = proposals.filter((p) =>
    p.action !== "NOOP" && p.selected
    && (p.action !== "CONFLICT" || p.resolution === "USE_NEW" || p.resolution === "MANUAL")
  );
  const unresolved = proposals.some((p) => p.action === "CONFLICT" && !p.resolution);
  const actionable = proposals.filter((p) => p.action !== "NOOP");

  async function sendText(value: string) {
    const message = value.trim();
    if (!message || busy || recording || transcribing) return;
    setBusy(true);
    setError(null);
    setInput("");
    setTurns((previous) => [...previous, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message, sessionId: session?.sessionId ?? null }),
      });
      const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
      if (!response.ok || !data.session) {
        setError(mapUserFacingError(data, "مقدرتش أفهم المعلومة دلوقتي. حاول تاني."));
        setInput(message);
        setTurns((previous) => previous.slice(0, -1));
        return;
      }
      setSession(data.session);
      setProposals(data.proposals ?? []);
      window.localStorage.setItem(storageKey, data.session.sessionId);
      setTurns((previous) => [
        ...previous,
        { role: "assistant", text: trainingReplyForAnalysis(data.proposals ?? [], {
          clarification: data.session?.summary?.clarifications?.[0],
          sourceText: message,
        }) },
      ]);
    } catch {
      setError("في مشكلة في الاتصال. جرب تاني.");
      setInput(message);
      setTurns((previous) => previous.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendText(input);
  }

  async function updateConflict(proposalId: string, acceptNew: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/knowledge/ingest/proposals/" + proposalId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: acceptNew ? "USE_NEW" : "KEEP_EXISTING",
          selected: acceptNew,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        proposal?: Proposal;
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر تحديث الاختيار."));
        return;
      }
      setProposals((previous) =>
        previous.map((p) => p.proposalId === proposalId ? { ...p, ...data.proposal } : p)
      );
    } catch {
      setError("تعذر الاتصال بالسيرفر.");
    } finally {
      setBusy(false);
    }
  }

  async function applyChanges() {
    if (!session || busy || unresolved || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/knowledge/ingest/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          proposalIds: selected.map((proposal) => proposal.proposalId),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        applied?: { created: number; merged: number; conflictsResolved?: number };
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر حفظ المعلومات."));
        return;
      }
      const created = data.applied?.created ?? 0;
      const merged = data.applied?.merged ?? 0;
      const resolved = data.applied?.conflictsResolved ?? 0;
      const savedTotal = created + merged + resolved;
      setCount((old) => old + created);
      setProposals([]);
      setSession(null);
      window.localStorage.removeItem(storageKey);
      setLocationsToReview(selected.map((proposal) => ({
        key: proposal.proposalId,
        value: locationSuggestionFromFact(proposal),
      })).filter((item): item is { key: string; value: LocationSuggestion } => Boolean(item.value)));
      setTurns((old) => [...old, {
        role: "assistant",
        text: savedTotal > 0
          ? "تمام، حفظت اللي اتفقنا عليه ✅ تقدر تعدّله معايا في أي وقت. تحب تعلّمني إيه تاني؟"
          : "المعلومات دي كانت محفوظة بالفعل. قولّي تحب نغيّر إيه.",
      }]);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالسيرفر. المعلومات لسه ما اتحفظتش.");
    } finally {
      setBusy(false);
    }
  }

  function discardChanges() {
    window.localStorage.removeItem(storageKey);
    setProposals([]);
    setSession(null);
    setTurns((old) => [...old, {
      role: "assistant",
      text: "تمام، مش هعتمد التغييرات دي. قولّي نبدأ بإيه تاني.",
    }]);
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("التسجيل الصوتي مش متاح في المتصفح ده.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        const blob = new Blob(parts, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("file", blob, blob.type.includes("mp4") ? "training.m4a" : "training.webm");
          const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!response.ok || !data.text?.trim()) {
            throw new Error(data.error || "مقدرتش أحوّل التسجيل لكلام.");
          }
          // Put the transcript in the composer for review before it changes stored knowledge.
          setInput((previous) => previous.trim() ? previous.trim() + "\n" + data.text!.trim() : data.text!.trim());
        } catch (e) {
          setError(e instanceof Error ? e.message : "تعذر تحويل الصوت إلى نص.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, VOICE_LIMIT_MS);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      // The browser owns the mic permission prompt; keep the composer usable.
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <section aria-label="محادثة تعليم الموظف" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xl text-primary">✦</span>
          <div className="min-w-0">
            <h2 className="text-sm font-black">علّم موظفك</h2>
            <p className="text-xs text-muted-foreground">اتكلم بطريقتك، وأنا هفهمك</p>
          </div>
        </div>
        <Link href="/dashboard/knowledge/manage"
          className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/30 hover:text-primary">
          المعلومات المحفوظة <span className="ms-1 font-normal">({count})</span>
        </Link>
      </header>

      <div ref={logRef} role="log" aria-label="رسائل تعليم الموظف" aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-surface/30 px-3 py-5 sm:px-6">
        {turns.map((turn, index) => (
          <div key={index} className={turn.role === "assistant" ? "flex justify-start" : "flex justify-end"}>
            {turn.role === "user" && turn.text.length > 420 ? (
              <details className="group max-w-[90%] rounded-2xl rounded-tr-md bg-primary/10 px-4 py-3 text-sm leading-7 text-foreground sm:max-w-[78%]">
                <summary className="cursor-pointer list-none text-start marker:hidden [&::-webkit-details-marker]:hidden">
                  {turn.text.slice(0, 230)}…
                  <span className="mt-1 block text-xs font-bold text-primary group-open:hidden">اقرأ باقي رسالتي</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{turn.text.slice(230)}</p>
              </details>
            ) : (
              <p dir="auto" className={
                "max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 [overflow-wrap:anywhere] sm:max-w-[78%] " +
                (turn.role === "assistant"
                  ? "rounded-tl-md border border-border bg-card text-foreground shadow-sm"
                  : "rounded-tr-md bg-primary/10 text-foreground")
              }>
                {turn.text}
              </p>
            )}
          </div>
        ))}

        {busy ? (
          <div className="flex justify-start" role="status" aria-label="الموظف بيفكر">
            <span className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card px-4 py-3 text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
              <span className="sr-only">بيفهم كلامك...</span>
            </span>
          </div>
        ) : null}

        {proposals.length > 0 && !busy ? (
          <div className="flex justify-start">
            <div className="w-full max-w-[96%] space-y-3 rounded-2xl rounded-tl-md border border-border bg-card p-3 shadow-sm sm:max-w-[83%] sm:p-4">
              {actionable.length ? (
                <>
                  <div>
                    <p className="text-sm font-black">ده اللي فهمته من كلامك</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      راجع التفاصيل لو حابب، ومش هيتحفظ أي تغيير قبل موافقتك.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {actionable.map((proposal) => (
                      <details key={proposal.proposalId} className="group rounded-xl border border-border bg-surface/45">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-start [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1 break-words text-xs font-bold leading-6">{proposal.proposedTitle}</span>
                          <span className={
                            "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " +
                            (proposal.action === "CONFLICT" ? "bg-warning-soft text-warning" : "bg-primary/5 text-muted-foreground")
                          }>
                            {proposal.action === "CONFLICT"
                              ? proposal.resolution === "USE_NEW" ? "اخترت الجديدة" : proposal.resolution === "KEEP_EXISTING" ? "الاحتفاظ بالقديمة" : "محتاجة قرار"
                              : proposal.action === "MERGE" ? "تحديث" : "جديدة"}
                          </span>
                          <span className="text-muted-foreground transition group-open:rotate-180" aria-hidden="true">⌄</span>
                        </summary>
                        <div className="space-y-3 border-t border-border px-3 py-3">
                          <p className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground [overflow-wrap:anywhere]">{proposal.proposedContent}</p>
                          {proposal.action === "CONFLICT" ? (
                            <div className="space-y-2">
                              {proposal.existingContent ? (
                                <p className="whitespace-pre-wrap rounded-lg bg-card p-2 text-xs leading-6 text-muted-foreground">المحفوظ حاليًا: {proposal.existingContent}</p>
                              ) : null}
                              <p className="text-xs font-bold">أنهي واحدة نعتمد؟</p>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" size="sm" disabled={busy}
                                  variant={proposal.resolution === "USE_NEW" ? "default" : "outline"}
                                  onClick={() => void updateConflict(proposal.proposalId, true)}>الجديدة</Button>
                                <Button type="button" size="sm" disabled={busy}
                                  variant={proposal.resolution === "KEEP_EXISTING" ? "default" : "outline"}
                                  onClick={() => void updateConflict(proposal.proposalId, false)}>خلي القديمة</Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              {proposal.action === "MERGE" ? "هنحدّث المعلومة الحالية لما توافق." : "هضيف المعلومة دي لما توافق."}
                            </p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                  {unresolved ? (
                    <p className="text-xs font-semibold text-warning" role="status">
                      فيه معلومة متعارضة. افتحها واختار الصح الأول.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button type="button" size="sm" disabled={busy || selected.length === 0 || unresolved}
                      onClick={() => void applyChanges()}>
                      {busy ? "بحفظ..." : "تمام، احفظ اللي فهمته"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={discardChanges}>
                      تجاهل
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs leading-6 text-muted-foreground">مفيش تغييرات جديدة للحفظ. كمل كلامك عادي.</p>
                  <Button type="button" size="sm" variant="ghost" onClick={discardChanges}>تمام</Button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {locationsToReview.length ? (
          <details className="max-w-[96%] rounded-xl border border-border bg-card p-3 sm:max-w-[83%]">
            <summary className="cursor-pointer text-xs font-bold">فيه بيانات فروع تقدر تراجعها كمان (اختياري)</summary>
            <div className="mt-3 space-y-2">
              {locationsToReview.map((item) => (
                <EmployeeLocationSuggestion key={item.key} suggestion={item.value} />
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {error ? <div className="shrink-0 border-t border-border px-3 pt-3"><Alert variant="error">{error}</Alert></div> : null}
      <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-border bg-card p-3 sm:p-4">
        <button type="button" aria-label={recording ? "إنهاء التسجيل" : "سجل رسالة صوتية"}
          title={recording ? "إنهاء التسجيل" : "رسالة صوتية"}
          disabled={busy || transcribing}
          onClick={() => void (recording ? stopRecording() : startRecording())}
          className={"grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-lg transition hover:bg-primary/5 disabled:opacity-40 " +
            (recording ? "border-destructive bg-destructive-soft text-destructive" : "bg-card text-primary")}>
          {recording ? "■" : "🎙"}
        </button>
        <Textarea rows={1} value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void sendText(input);
            }
          }}
          aria-label="رسالتك للموظف"
          placeholder={transcribing ? "بحوّل الفويس لنص..." : recording ? "جاري تسجيل صوتك..." : "قولي عايز تعلّمني إيه..."}
          maxLength={12000} disabled={busy || recording || transcribing}
          className="min-h-11 max-h-32 flex-1 resize-none rounded-2xl text-sm leading-6" />
        <Button type="submit" disabled={!input.trim() || busy || recording || transcribing} className="h-11 shrink-0 rounded-xl">
          إرسال
        </Button>
      </form>
    </section>
  );
}
