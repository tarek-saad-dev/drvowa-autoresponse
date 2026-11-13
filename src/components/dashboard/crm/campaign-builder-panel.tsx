"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { formatCrmDate, formatCrmMoney, readApiJson } from "@/components/dashboard/crm/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type {
  AudienceFilterAst,
  CrmAudiencePreview,
  CampaignAiTurnResult,
} from "@/modules/crm";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type LaunchStep = "compose" | "confirm" | "done";

type CrmChannelOption = {
  channelConnectionId: string;
  displayName: string | null;
  externalAccountKey: string | null;
  status: string;
  isActive: boolean;
};

type FinalAudienceReady = {
  snapshotId: string;
  channelConnectionId: string;
  channelDisplayName: string | null;
  eligibleMarketing: number;
  withoutPermission: number;
  totalMatched: number;
  preview: CrmAudiencePreview;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function channelLabel(channel: CrmChannelOption): string {
  return (
    channel.displayName?.trim() ||
    channel.externalAccountKey?.trim() ||
    channel.channelConnectionId.slice(0, 8)
  );
}

export function CampaignBuilderPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "اختر قناة واتساب أولاً، ثم صف الجمهور بالعربي. لن يتم إرسال أي رسالة تلقائياً.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<AudienceFilterAst | null>(null);
  const [preview, setPreview] = useState<CrmAudiencePreview | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<LaunchStep>("compose");
  const [confirmName, setConfirmName] = useState("");
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null);
  const [createdListId, setCreatedListId] = useState<string | null>(null);
  const [channels, setChannels] = useState<CrmChannelOption[]>([]);
  const [requiresExplicitSelection, setRequiresExplicitSelection] = useState(false);
  const [channelConnectionId, setChannelConnectionId] = useState<string>("");
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [finalAudience, setFinalAudience] = useState<FinalAudienceReady | null>(null);
  const [confirmedFinalCount, setConfirmedFinalCount] = useState(false);
  const [confirmedChannel, setConfirmedChannel] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/crm/channels");
        const data = await readApiJson<{
          activeChannels?: CrmChannelOption[];
          channels?: CrmChannelOption[];
          requiresExplicitSelection?: boolean;
        }>(response);
        if (!response.ok) {
          throw new Error(mapUserFacingError(data, "تعذر تحميل قنوات واتساب."));
        }
        if (cancelled) return;
        const active = (data.activeChannels ?? []).filter(
          (c) => c.isActive && c.status === "ACTIVE",
        );
        setChannels(active);
        setRequiresExplicitSelection(Boolean(data.requiresExplicitSelection) || active.length !== 1);
        if (active.length === 1) {
          setChannelConnectionId(active[0].channelConnectionId);
        }
        setChannelsLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "تعذر تحميل قنوات واتساب.");
        setChannelsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.channelConnectionId === channelConnectionId) ?? null,
    [channels, channelConnectionId],
  );

  const previewPageEligible = preview?.countsScope === "preview_page" ? preview.eligibleMarketing : null;
  const canPrepareFinal =
    Boolean(filter && preview && messageDraft.trim().length >= 4 && channelConnectionId) &&
    channels.length > 0;

  const canCreateDraft =
    Boolean(finalAudience) &&
    confirmedFinalCount &&
    confirmedChannel &&
    (finalAudience?.eligibleMarketing ?? 0) > 0 &&
    finalAudience?.channelConnectionId === channelConnectionId;

  const previewCounts = useMemo(() => {
    if (!preview) return null;
    const scopeLabel =
      preview.countsScope === "full_audience" ? "الجمهور الكامل" : "صفحة المعاينة";
    return [
      { label: "مطابق (كامل)", value: preview.totalMatched },
      { label: `برقم (${scopeLabel})`, value: preview.withPhone },
      { label: `مؤهل (${scopeLabel})`, value: preview.eligibleMarketing },
      { label: `بدون إذن (${scopeLabel})`, value: preview.withoutPermission },
      { label: "مكرر محذوف", value: preview.duplicatesRemoved },
    ];
  }, [preview]);

  function resetFinalConfirmation() {
    setFinalAudience(null);
    setConfirmedFinalCount(false);
    setConfirmedChannel(false);
    if (step === "confirm") setStep("compose");
  }

  function onChannelChange(nextId: string) {
    setChannelConnectionId(nextId);
    setPreview(null);
    resetFinalConfirmation();
  }

  async function sendTurn(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (busy || text.length < 2) return;
    if (!channelConnectionId) {
      setError("اختر قناة واتساب نشطة قبل بناء الجمهور.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    resetFinalConfirmation();

    try {
      const mode = messageDraft && filter ? "refine" : filter ? "refine" : "filter";
      const response = await fetch("/api/crm/campaigns/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: mode === "refine" && /رسالة|اكتب|صياغة|draft/i.test(text) ? "draft_message" : mode,
          priorFilter: filter ?? undefined,
          sessionId,
          channelConnectionId,
        }),
      });
      const data = await readApiJson<{ turn?: CampaignAiTurnResult; autoLaunch?: boolean }>(response);
      if (!response.ok || !data.turn || data.autoLaunch !== false) {
        throw new Error(mapUserFacingError(data, "تعذر معالجة طلب الحملة."));
      }
      const turn = data.turn;
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: turn.assistantMessage },
      ]);
      if (turn.filter) setFilter(turn.filter);
      if (turn.preview) {
        setPreview(turn.preview);
        if (turn.preview.channelConnectionId && turn.preview.channelConnectionId !== channelConnectionId) {
          throw new Error("تغيرت قناة الأهلية. أعد اختيار القناة ثم أعد المعاينة.");
        }
        if (!confirmName.trim()) setConfirmName(turn.preview.name || "حملة CRM");
      }
      if (turn.messageDraftAr) setMessageDraft(turn.messageDraftAr);
      if (!sessionId) setSessionId(crypto.randomUUID());
      setStep("compose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر معالجة طلب الحملة.");
    } finally {
      setBusy(false);
    }
  }

  async function draftMessageOnly() {
    if (!filter || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/campaigns/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "اكتب رسالة واتساب تسويقية قصيرة ومهذبة للجمهور الحالي",
          mode: "draft_message",
          priorFilter: filter,
          sessionId,
          channelConnectionId: channelConnectionId || undefined,
        }),
      });
      const data = await readApiJson<{ turn?: CampaignAiTurnResult; autoLaunch?: boolean }>(response);
      if (!response.ok || !data.turn || data.autoLaunch !== false) {
        throw new Error(mapUserFacingError(data, "تعذر إنشاء مسودة الرسالة."));
      }
      if (data.turn.messageDraftAr) setMessageDraft(data.turn.messageDraftAr);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: data.turn!.assistantMessage },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء مسودة الرسالة.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSegmentDraft() {
    if (!filter || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/crm/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: (confirmName.trim() || preview?.name || "شريحة CRM").slice(0, 160),
          description: preview?.explanationAr ?? null,
          filter,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر حفظ الشريحة."));
      setNotice("تم حفظ الشريحة كمسودة جمهور فقط — بدون إرسال.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الشريحة.");
    } finally {
      setBusy(false);
    }
  }

  /** Freeze + revalidate full audience, then show final eligible count for confirmation. */
  async function prepareFinalAudience() {
    if (!canPrepareFinal || !preview || !filter || !channelConnectionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmedFinalCount(false);
    setConfirmedChannel(false);
    try {
      const listName = (confirmName.trim() || preview.name || "حملة CRM").slice(0, 80);

      const freezeRes = await fetch("/api/crm/audience/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter,
          name: listName,
          naturalLanguage: messages.filter((m) => m.role === "user").at(-1)?.text ?? null,
          channelConnectionId,
        }),
      });
      const freezeData = await readApiJson<{
        snapshotId?: string;
        preview?: CrmAudiencePreview;
      }>(freezeRes);
      if (!freezeRes.ok || !freezeData.snapshotId || !freezeData.preview) {
        throw new Error(mapUserFacingError(freezeData, "تعذر تثبيت لقطة الجمهور قبل التأكيد."));
      }
      if (freezeData.preview.channelConnectionId !== channelConnectionId) {
        throw new Error("قناة التثبيت لا تطابق القناة المختارة. أعد المحاولة.");
      }

      const revalidateRes = await fetch("/api/crm/audience/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: freezeData.snapshotId,
          channelConnectionId,
        }),
      });
      const revalidateData = await readApiJson<{
        channelConnectionId?: string;
        eligiblePhones?: string[];
        eligibleMarketing?: number;
        withoutPermission?: number;
      }>(revalidateRes);
      if (
        !revalidateRes.ok ||
        !Array.isArray(revalidateData.eligiblePhones) ||
        revalidateData.channelConnectionId !== channelConnectionId
      ) {
        throw new Error(mapUserFacingError(revalidateData, "تعذر إعادة التحقق من أهلية التسويق."));
      }

      const eligibleMarketing = revalidateData.eligiblePhones.length;
      setPreview(freezeData.preview);
      setFinalAudience({
        snapshotId: freezeData.snapshotId,
        channelConnectionId,
        channelDisplayName: selectedChannel
          ? channelLabel(selectedChannel)
          : freezeData.preview.channelDisplayName ?? null,
        eligibleMarketing,
        withoutPermission: revalidateData.withoutPermission ?? 0,
        totalMatched: freezeData.preview.totalMatched,
        preview: freezeData.preview,
      });
      setStep("confirm");
      if (eligibleMarketing === 0) {
        setNotice("لا يوجد مستلمون مؤهلون بعد إعادة التحقق على هذه القناة. احفظ الشريحة بدون إنشاء مسودة إرسال.");
      }
    } catch (err) {
      setFinalAudience(null);
      setError(err instanceof Error ? err.message : "تعذر تجهيز العدد النهائي للجمهور.");
      setStep("compose");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCreateDraftCampaign() {
    if (!canCreateDraft || !finalAudience || !filter) return;
    if (finalAudience.channelConnectionId !== channelConnectionId) {
      setError("تغيرت القناة بعد التثبيت. أعد تثبيت الجمهور على القناة الحالية.");
      resetFinalConfirmation();
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const listName = (confirmName.trim() || finalAudience.preview.name || "حملة CRM").slice(0, 80);

      // Re-revalidate immediately before list/draft so channel/consent cannot drift.
      const revalidateRes = await fetch("/api/crm/audience/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: finalAudience.snapshotId,
          channelConnectionId: finalAudience.channelConnectionId,
        }),
      });
      const revalidateData = await readApiJson<{
        channelConnectionId?: string;
        eligiblePhones?: string[];
      }>(revalidateRes);
      if (
        !revalidateRes.ok ||
        !Array.isArray(revalidateData.eligiblePhones) ||
        revalidateData.channelConnectionId !== finalAudience.channelConnectionId
      ) {
        throw new Error(mapUserFacingError(revalidateData, "تعذر إعادة التحقق النهائية قبل إنشاء المسودة."));
      }
      if (revalidateData.eligiblePhones.length === 0) {
        throw new Error("لا يوجد مستلمون مؤهلون بعد إعادة التحقق من الإذن/الإيقاف. احفظ الشريحة بدون إرسال.");
      }
      if (revalidateData.eligiblePhones.length !== finalAudience.eligibleMarketing) {
        throw new Error(
          `تغير العدد النهائي من ${finalAudience.eligibleMarketing} إلى ${revalidateData.eligiblePhones.length}. أعد التأكيد على العدد الجديد.`,
        );
      }

      const listRes = await fetch("/api/whatsapp/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName,
          channelConnectionId: finalAudience.channelConnectionId,
        }),
      });
      const listData = await readApiJson<{
        list?: { id: string; name: string; channelConnectionId: string };
      }>(listRes);
      if (!listRes.ok || !listData.list) {
        throw new Error(mapUserFacingError(listData, "تعذر إنشاء قائمة DRVO."));
      }
      if (listData.list.channelConnectionId !== finalAudience.channelConnectionId) {
        throw new Error("قائمة واتساب أُنشئت على قناة مختلفة. تم إيقاف الإنشاء.");
      }

      const phones = revalidateData.eligiblePhones.slice(0, 5000);
      for (const batch of chunk(phones, 50)) {
        const membersRes = await fetch(`/api/whatsapp/lists/${encodeURIComponent(listData.list.id)}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: batch.join("\n") }),
        });
        const membersData = await readApiJson(membersRes);
        if (!membersRes.ok) {
          throw new Error(mapUserFacingError(membersData, "تعذر إضافة أرقام القائمة من لقطة الجمهور."));
        }
      }

      const draftRes = await fetch("/api/whatsapp/label-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelConnectionId: finalAudience.channelConnectionId,
          labelId: listData.list.id,
          messageText: messageDraft.trim(),
        }),
      });
      const draftData = await readApiJson<{
        drafts?: Array<{ draftId: string }>;
        sendingEnabled?: boolean;
      }>(draftRes);
      if (!draftRes.ok || !Array.isArray(draftData.drafts) || draftData.drafts.length === 0 || draftData.sendingEnabled !== false) {
        throw new Error(mapUserFacingError(draftData, "تعذر إنشاء مسودة حملة واتساب."));
      }

      setCreatedListId(listData.list.id);
      setCreatedDraftId(draftData.drafts[0].draftId);
      setStep("done");
      setNotice(
        `تم إنشاء قائمة/مسودة فقط على القناة المحددة — لم يُرسل شيء. المستلمون المؤهلون: ${revalidateData.eligiblePhones.length}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تجهيز مسودة الحملة.");
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-primary">الحملات</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">منشئ الحملات بالذكاء الاصطناعي</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            الأهلية مربوطة بقناة واتساب واحدة. حدّد الجمهور وصِغ الرسالة، ثم أكّد العدد النهائي والقناة قبل إنشاء المسودة فقط.
          </p>
        </div>
        <Link href="/dashboard/campaigns">
          <Button type="button" variant="outline">مركز الحملات</Button>
        </Link>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-black">قناة واتساب للحملة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!channelsLoaded ? (
            <DrvoLoading variant="inline" label="جاري تحميل القنوات…" />
          ) : channels.length === 0 ? (
            <Alert variant="error">
              لا توجد قناة واتساب نشطة. اربط رقماً نشطاً قبل معاينة الجمهور أو إنشاء المسودة.
            </Alert>
          ) : (
            <>
              <Label htmlFor="crm-campaign-channel">القناة المستخدمة للأهلية والقائمة والمسودة</Label>
              <select
                id="crm-campaign-channel"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={channelConnectionId}
                disabled={busy || step === "done"}
                onChange={(event) => onChannelChange(event.target.value)}
              >
                {requiresExplicitSelection ? (
                  <option value="">— اختر قناة صراحة —</option>
                ) : null}
                {channels.map((channel) => (
                  <option key={channel.channelConnectionId} value={channel.channelConnectionId}>
                    {channelLabel(channel)}
                  </option>
                ))}
              </select>
              {requiresExplicitSelection && !channelConnectionId ? (
                <Alert variant="warning">يوجد أكثر من قناة نشطة — يجب الاختيار صراحة. لا يوجد اختيار افتراضي.</Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="font-black">محادثة الجمهور والرسالة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl bg-surface/40 p-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-7 " +
                    (message.role === "user"
                      ? "ms-auto bg-primary text-primary-foreground"
                      : "me-auto border border-border bg-card")
                  }
                >
                  {message.text}
                </div>
              ))}
              {busy ? <DrvoLoading variant="inline" label="الذكاء الاصطناعي يفكر…" /> : null}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={sendTurn} className="space-y-2">
              <Label htmlFor="crm-campaign-chat">اكتب طلبك</Label>
              <Textarea
                id="crm-campaign-chat"
                rows={3}
                maxLength={2000}
                value={input}
                disabled={busy || step === "done" || !channelConnectionId}
                onChange={(event) => setInput(event.target.value)}
                placeholder="مثال: هات العملاء اللي عملوا بروتين آخر 30 يوم"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={busy || input.trim().length < 2 || step === "done" || !channelConnectionId}
                >
                  إرسال
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !filter || step === "done"}
                  onClick={() => void draftMessageOnly()}
                >
                  صياغة رسالة
                </Button>
              </div>
            </form>

            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="crm-campaign-message">مسودة الرسالة (قابلة للتعديل)</Label>
              <Textarea
                id="crm-campaign-message"
                rows={5}
                maxLength={3000}
                value={messageDraft}
                disabled={step === "done"}
                onChange={(event) => {
                  setMessageDraft(event.target.value);
                  if (finalAudience) resetFinalConfirmation();
                }}
                placeholder="ستظهر هنا مسودة الرسالة قبل أي إرسال…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="font-black">معاينة الجمهور</CardTitle>
            </CardHeader>
            <CardContent>
              {!preview ? (
                <EmptyState
                  title="لا توجد معاينة بعد"
                  description="اختر القناة ثم صف الجمهور في المحادثة. أعداد الأهلية هنا لصفحة المعاينة فقط حتى التثبيت."
                />
              ) : (
                <div className="space-y-4">
                  {preview.countsScope === "preview_page" ? (
                    <Alert variant="warning">
                      أعداد «مؤهل / بدون إذن» أدناه من صفحة المعاينة فقط
                      {previewPageEligible != null
                        ? ` (${previewPageEligible.toLocaleString("ar-EG")} من ${preview.customers.length.toLocaleString("ar-EG")} ظاهرين)`
                        : ""}
                      . العدد النهائي للمستلمين يظهر بعد تثبيت الجمهور الكامل وإعادة التحقق على القناة.
                    </Alert>
                  ) : (
                    <Alert variant="success">أعداد الأهلية أدناه للجمهور الكامل المثبّت على القناة المحددة.</Alert>
                  )}
                  <p className="text-sm leading-7 text-muted-foreground">{preview.explanationAr}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {previewCounts?.map((item) => (
                      <div key={item.label} className="rounded-xl border border-border bg-surface/40 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-lg font-black">{item.value.toLocaleString("ar-EG")}</p>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {preview.customers.slice(0, 50).map((customer) => (
                      <div
                        key={customer.customerId}
                        className="rounded-xl border border-border px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{customer.fullName}</strong>
                          <Badge variant={customer.marketingEligible ? "success" : "warning"}>
                            {customer.marketingEligible ? "مؤهل" : "غير مؤهل"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground" dir="ltr">
                          {customer.primaryPhoneNormalized || "بدون رقم"}
                        </p>
                        {!customer.marketingEligible && customer.exclusionReason ? (
                          <p className="mt-1 text-warning">{customer.exclusionReason}</p>
                        ) : null}
                        <p className="mt-1 text-muted-foreground">
                          إنفاق: {formatCrmMoney(customer.totalSpend)} · آخر زيارة: {formatCrmDate(customer.lastVisitAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-black">تأكيد الإنشاء (بدون إرسال)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="crm-campaign-name">اسم الحملة / القائمة</Label>
                <Input
                  id="crm-campaign-name"
                  value={confirmName}
                  maxLength={80}
                  disabled={step === "done"}
                  onChange={(event) => setConfirmName(event.target.value)}
                />
              </div>

              {step === "compose" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy || !canPrepareFinal}
                    onClick={() => void prepareFinalAudience()}
                  >
                    {busy ? "جاري التثبيت…" : "تثبيت الجمهور وعرض العدد النهائي"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !filter}
                    onClick={() => void saveSegmentDraft()}
                  >
                    حفظ شريحة فقط
                  </Button>
                </div>
              ) : null}

              {step === "confirm" && finalAudience ? (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                  <p className="text-sm leading-7">
                    العدد النهائي للمستلمين المؤهلين بعد تثبيت الجمهور الكامل وإعادة التحقق على القناة{" "}
                    <strong>{finalAudience.channelDisplayName || finalAudience.channelConnectionId.slice(0, 8)}</strong>
                    :{" "}
                    <strong>{finalAudience.eligibleMarketing.toLocaleString("ar-EG")}</strong>
                    {" "}من أصل{" "}
                    <strong>{finalAudience.totalMatched.toLocaleString("ar-EG")}</strong>
                    {" "}مطابق.
                    لن يتم إرسال أي رسالة الآن. الإذن والإيقاف يُراجعان مجدداً عند الإطلاق الفعلي.
                  </p>
                  <label className="flex items-start gap-2 text-sm leading-6">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmedFinalCount}
                      disabled={busy || finalAudience.eligibleMarketing === 0}
                      onChange={(event) => setConfirmedFinalCount(event.target.checked)}
                    />
                    <span>
                      أؤكد أن العدد النهائي للمستلمين المؤهلين هو{" "}
                      {finalAudience.eligibleMarketing.toLocaleString("ar-EG")}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm leading-6">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmedChannel}
                      disabled={busy || finalAudience.eligibleMarketing === 0}
                      onChange={(event) => setConfirmedChannel(event.target.checked)}
                    />
                    <span>
                      أؤكد إرسال المسودة عبر القناة{" "}
                      {finalAudience.channelDisplayName || finalAudience.channelConnectionId.slice(0, 8)}
                      {" "}فقط (بدون تبديل قناة)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy || !canCreateDraft}
                      onClick={() => void confirmCreateDraftCampaign()}
                    >
                      {busy ? "جاري الإنشاء…" : "تأكيد إنشاء المسودة"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        resetFinalConfirmation();
                        setStep("compose");
                      }}
                    >
                      رجوع
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === "done" ? (
                <div className="space-y-3 rounded-xl border border-success/25 bg-success-soft/30 p-4 text-sm">
                  <p className="font-bold text-success">تم إنشاء المسودة بنجاح بدون إرسال.</p>
                  {createdDraftId ? (
                    <p className="text-xs text-muted-foreground" dir="ltr">Draft: {createdDraftId}</p>
                  ) : null}
                  {createdListId ? (
                    <p className="text-xs text-muted-foreground" dir="ltr">List: {createdListId}</p>
                  ) : null}
                  <Link href="/dashboard/agent?tab=campaigns" className="inline-block font-bold text-primary hover:underline">
                    فتح مسودات حملات الموظف
                  </Link>
                </div>
              ) : null}

              {!channelConnectionId && channelsLoaded ? (
                <p className="text-xs leading-6 text-muted-foreground">
                  اختر قناة واتساب صالحة قبل المعاينة أو التثبيت. لا يُسمح بالتحقق عبر قنوات متعددة.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
