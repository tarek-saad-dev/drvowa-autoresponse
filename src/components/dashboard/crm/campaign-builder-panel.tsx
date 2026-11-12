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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function CampaignBuilderPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "صف الجمهور المطلوب بالعربي (مثلاً: عملاء زاروا الفرع آخر 30 يوم وأنفقوا أكثر من 500). لن يتم إرسال أي رسالة تلقائياً.",
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const eligible = preview?.eligibleMarketing ?? 0;
  const canLaunch = Boolean(filter && preview && messageDraft.trim().length >= 4 && eligible > 0);

  const previewCounts = useMemo(() => {
    if (!preview) return null;
    return [
      { label: "مطابق", value: preview.totalMatched },
      { label: "برقم", value: preview.withPhone },
      { label: "مؤهل", value: preview.eligibleMarketing },
      { label: "بدون إذن", value: preview.withoutPermission },
      { label: "مكرر محذوف", value: preview.duplicatesRemoved },
    ];
  }, [preview]);

  async function sendTurn(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (busy || text.length < 2) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);

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

  async function confirmCreateDraftCampaign() {
    if (!canLaunch || !preview || !filter) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const listName = (confirmName.trim() || preview.name || "حملة CRM").slice(0, 80);

      // 1) Freeze + materialize the complete audience first (never from preview page).
      const freezeRes = await fetch("/api/crm/audience/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter,
          name: listName,
          naturalLanguage: messages.filter((m) => m.role === "user").at(-1)?.text ?? null,
        }),
      });
      const freezeData = await readApiJson<{
        snapshotId?: string;
        preview?: CrmAudiencePreview;
      }>(freezeRes);
      if (!freezeRes.ok || !freezeData.snapshotId || !freezeData.preview) {
        throw new Error(mapUserFacingError(freezeData, "تعذر تثبيت لقطة الجمهور قبل إنشاء المسودة."));
      }

      // 2) Revalidate eligibility for the frozen snapshot on the active channel.
      const revalidateRes = await fetch("/api/crm/audience/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: freezeData.snapshotId }),
      });
      const revalidateData = await readApiJson<{
        eligiblePhones?: string[];
        eligibleMarketing?: number;
      }>(revalidateRes);
      if (!revalidateRes.ok || !Array.isArray(revalidateData.eligiblePhones)) {
        throw new Error(mapUserFacingError(revalidateData, "تعذر إعادة التحقق من أهلية التسويق قبل الإنشاء."));
      }
      if (revalidateData.eligiblePhones.length === 0) {
        throw new Error("لا يوجد مستلمون مؤهلون بعد إعادة التحقق من الإذن/الإيقاف. احفظ الشريحة بدون إرسال.");
      }

      // 3) Create WhatsApp list from the revalidated snapshot phones only.
      const listRes = await fetch("/api/whatsapp/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName }),
      });
      const listData = await readApiJson<{
        list?: { id: string; name: string; channelConnectionId: string };
      }>(listRes);
      if (!listRes.ok || !listData.list) {
        throw new Error(mapUserFacingError(listData, "تعذر إنشاء قائمة DRVO."));
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

      // 4) Create campaign draft from that exact list (still never auto-sends).
      const draftRes = await fetch("/api/whatsapp/label-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelConnectionId: listData.list.channelConnectionId,
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

      setPreview(freezeData.preview);
      setCreatedListId(listData.list.id);
      setCreatedDraftId(draftData.drafts[0].draftId);
      setStep("done");
      setNotice(
        `تم تثبيت الجمهور (${freezeData.snapshotId.slice(0, 8)}…) وإنشاء قائمة/مسودة فقط — لم يتم إرسال أي رسالة. المؤهلون بعد إعادة التحقق: ${revalidateData.eligiblePhones.length}.`,
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
            حدّد الجمهور وصِغ الرسالة، ثم أكّد إنشاء مسودة فقط. لا يوجد إرسال تلقائي مطلقاً.
          </p>
        </div>
        <Link href="/dashboard/campaigns">
          <Button type="button" variant="outline">مركز الحملات</Button>
        </Link>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

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
                disabled={busy || step === "done"}
                onChange={(event) => setInput(event.target.value)}
                placeholder="مثال: عملاء آخر 30 يوم أنفقوا أكثر من 1000 جنيه"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || input.trim().length < 2 || step === "done"}>
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
                onChange={(event) => setMessageDraft(event.target.value)}
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
                  description="اكتب وصفاً للجمهور في المحادثة لعرض الأعداد والأهلية."
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-muted-foreground">{preview.explanationAr}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {previewCounts?.map((item) => (
                      <div key={item.label} className="rounded-xl border border-border bg-surface/40 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-lg font-black">{item.value.toLocaleString("ar-EG")}</p>
                      </div>
                    ))}
                  </div>
                  {eligible === 0 ? (
                    <Alert variant="warning">
                      لا يوجد مستلمون مؤهلون للتسويق حالياً. يمكنك حفظ الشريحة كمسودة فقط — بدون إنشاء حملة إرسال.
                    </Alert>
                  ) : null}
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
                    disabled={busy || !canLaunch}
                    onClick={() => setStep("confirm")}
                  >
                    مراجعة قبل إنشاء المسودة
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

              {step === "confirm" ? (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                  <p className="text-sm leading-7">
                    سيتم إنشاء قائمة DRVO ومسودة حملة واتساب لـ{" "}
                    <strong>{eligible.toLocaleString("ar-EG")}</strong> مستلم مؤهل.
                    لن يتم إرسال أي رسالة الآن.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy} onClick={() => void confirmCreateDraftCampaign()}>
                      {busy ? "جاري الإنشاء…" : "تأكيد إنشاء المسودة"}
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setStep("compose")}>
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

              {!canLaunch && eligible === 0 && filter ? (
                <p className="text-xs leading-6 text-muted-foreground">
                  لأن عدد المؤهلين = 0، خيار إنشاء مسودة الإرسال متوقف. احفظ الشريحة فقط أو عدّل شروط الجمهور.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
