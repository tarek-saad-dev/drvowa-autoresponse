"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type Turn = { role: "user" | "assistant"; text: string; at?: string };
type Proposal = {
  proposalId: string;
  action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT";
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
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
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
          if (data.session?.conversation?.length) {
            setTurns(data.session.conversation);
            if (data.session.status !== "APPLIED") {
              setSession(data.session);
              setProposals(data.proposals ?? []);
            }
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
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, proposals, busy]);

  const selected = proposals.filter((p) =>
    p.action !== "NOOP" && p.selected
    && (p.action !== "CONFLICT" || p.resolution === "USE_NEW" || p.resolution === "MANUAL")
  );
  const unresolved = proposals.some((p) => p.action === "CONFLICT" && p.selected
    && p.resolution !== "USE_NEW" && p.resolution !== "MANUAL");

  async function sendText(value: string) {
    const message = value.trim();
    if (!message || busy || recording || transcribing) return;
    if (proposals.length > 0 && session) {
      setError("راجع التغييرات المقترحة واعتمدها أو تجاهلها قبل ما تبعت معلومة تانية.");
      return;
    }
    setBusy(true);
    setError(null);
    setInput("");
    setTurns((previous) => [...previous, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message, sessionId: null }),
      });
      const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
      if (!response.ok || !data.session) {
        setError(mapUserFacingError(data, "مقدرتش أفهم المعلومة دلوقتي. حاول تاني."));
        setInput(message);
        return;
      }
      setSession(data.session);
      setProposals(data.proposals ?? []);
      window.localStorage.setItem(storageKey, data.session.sessionId);
      const reply = data.session.conversation?.filter((turn) => turn.role === "assistant").at(-1)?.text;
      const proposalsCount = (data.proposals ?? []).filter((p) => p.action !== "NOOP").length;
      setTurns((previous) => [
        ...previous,
        {
          role: "assistant",
          text: reply || (proposalsCount
            ? "فهمت المعلومة. راجع التغيير المقترح تحت وبعدين اعتمده عشان أفتكره."
            : "المعلومة دي عندي بالفعل، ومش محتاجة تتحفظ مرة تانية."),
        },
      ]);
    } catch {
      setError("في مشكلة في الاتصال. جرب تاني.");
      setInput(message);
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
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        applied?: { created: number; merged: number };
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(mapUserFacingError(data, "تعذر حفظ المعلومات."));
        return;
      }
      const created = data.applied?.created ?? 0;
      const merged = data.applied?.merged ?? 0;
      setCount((old) => old + created);
      setProposals([]);
      setSession(null);
      setTurns((old) => [...old, {
        role: "assistant",
        text: "تمام، حفظت " + created + " معلومة جديدة وحدّثت " + merged + " معلومة. تحب تعلّمني إيه كمان؟",
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
      setError("السماح بالميكروفون مطلوب للتسجيل. تقدر تكتب بدلًا منه.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <section aria-label="محادثة تعليم الموظف" className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-xl text-primary">✦</span>
          <div>
            <h2 className="text-sm font-black">علّم موظفك</h2>
            <p className="text-xs text-muted-foreground">اتكلم معاه براحتك، كتابة أو فويس</p>
          </div>
        </div>
        <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-muted-foreground">
          {count} معلومة
        </span>
      </header>

      <div role="log" aria-live="polite" className="flex min-h-[300px] max-h-[52vh] flex-col gap-3 overflow-y-auto bg-surface/35 p-4 sm:min-h-[350px] sm:p-5">
        {turns.map((turn, index) => (
          <div key={index} className={turn.role === "assistant" ? "flex justify-start" : "flex justify-end"}>
            <p className={
              "max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 " +
              (turn.role === "assistant"
                ? "border border-border bg-card text-foreground"
                : "bg-primary/10 text-foreground")
            }>
              {turn.text}
            </p>
          </div>
        ))}
        {busy ? <p className="text-xs text-muted-foreground">براجع المعلومات...</p> : null}
        <div ref={endRef} />
      </div>

      {proposals.length > 0 ? (
        <div className="space-y-3 border-t border-border bg-card p-4 sm:p-5">
          <div>
            <p className="text-sm font-black">راجع اللي فهمته قبل الحفظ</p>
            <p className="mt-1 text-xs text-muted-foreground">مش هغيّر معلومات نشاطك من غير موافقتك.</p>
          </div>
          {proposals.map((proposal) => (
            <div key={proposal.proposalId} className="rounded-xl border border-border bg-surface/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">{proposal.proposedTitle}</span>
                <span className="text-xs text-muted-foreground">
                  {proposal.action === "CREATE" ? "جديدة" : proposal.action === "MERGE" ? "تحديث"
                    : proposal.action === "CONFLICT" ? "محتاجة تأكيد" : "موجودة بالفعل"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{proposal.proposedContent}</p>
              {proposal.action === "CONFLICT" ? (
                <div className="mt-3 space-y-2">
                  {proposal.existingContent ? <p className="rounded-lg bg-card p-2 text-xs">الحالي: {proposal.existingContent}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy}
                      onClick={() => void updateConflict(proposal.proposalId, true)}>استخدم الجديدة</Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy}
                      onClick={() => void updateConflict(proposal.proposalId, false)}>احتفظ بالحالية</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !selected.length || unresolved}
              onClick={() => void applyChanges()}>
              {busy ? "بنحفظ..." : "احفظ " + selected.length + " تغيير"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={discardChanges}>تجاهل</Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="px-4 pt-3"><Alert variant="error">{error}</Alert></div> : null}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3 sm:p-4">
        <button type="button" aria-label={recording ? "إنهاء التسجيل" : "سجل رسالة صوتية"}
          title={recording ? "إنهاء التسجيل" : "رسالة صوتية"}
          disabled={busy || transcribing || Boolean(session && proposals.length)}
          onClick={() => void (recording ? stopRecording() : startRecording())}
          className={"grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-lg transition hover:bg-primary/5 disabled:opacity-40 " +
            (recording ? "bg-destructive-soft text-destructive" : "bg-card text-primary")}>
          {recording ? "■" : "🎙"}
        </button>
        <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
          aria-label="رسالتك للموظف" placeholder={transcribing ? "بحوّل الفويس لنص..." : recording ? "بيسجل صوتك..." : "علّمه حاجة جديدة..."}
          maxLength={12000} disabled={busy || recording || transcribing || Boolean(session && proposals.length)}
          className="min-h-11 max-h-32 flex-1 resize-none rounded-xl" />
        <Button type="submit" disabled={!input.trim() || busy || recording || transcribing || Boolean(session && proposals.length)}>
          إرسال
        </Button>
      </form>
      <div className="px-4 pb-3 text-end">
        <Link href="/dashboard/knowledge/manage" className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
          مراجعة المعلومات المحفوظة
        </Link>
      </div>
    </section>
  );
}
