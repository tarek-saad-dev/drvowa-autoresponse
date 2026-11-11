"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import {
  CRM_STATUS_LABELS,
  formatCrmDate,
  formatCrmMoney,
  readApiJson,
} from "@/components/dashboard/crm/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { CrmCustomer, CrmFollowUp, CrmNote } from "@/modules/crm/types";

type InboxCrmPanelData = {
  conversationId: string;
  contactId: string;
  customer: CrmCustomer | null;
  openFollowUps: CrmFollowUp[];
  latestNote: CrmNote | null;
  erp: {
    totalVisits: number;
    lastVisitAt: string | null;
    totalSpend: number;
    favoriteService: string | null;
  } | null;
};

export function InboxCrmPanel({ conversationId }: { conversationId: string }) {
  const [panel, setPanel] = useState<InboxCrmPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [tagName, setTagName] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPanel(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/crm/inbox-panel?conversationId=${encodeURIComponent(conversationId)}`,
          { cache: "no-store" },
        );
        const data = await readApiJson<{ panel?: InboxCrmPanelData }>(response);
        if (!response.ok || !data.panel) {
          throw new Error(mapUserFacingError(data, "تعذر تحميل بيانات CRM."));
        }
        if (!cancelled) setPanel(data.panel);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "تعذر تحميل بيانات CRM.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function refresh() {
    const response = await fetch(
      `/api/crm/inbox-panel?conversationId=${encodeURIComponent(conversationId)}`,
      { cache: "no-store" },
    );
    const data = await readApiJson<{ panel?: InboxCrmPanelData }>(response);
    if (response.ok && data.panel) setPanel(data.panel);
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!panel?.customer || !noteBody.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/crm/customers/${panel.customer.customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر حفظ الملاحظة."));
      setNoteBody("");
      setNotice("تم حفظ الملاحظة.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الملاحظة.");
    } finally {
      setBusy(false);
    }
  }

  async function addTag(event: FormEvent) {
    event.preventDefault();
    if (!panel?.customer || !tagName.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/crm/customers/${panel.customer.customerId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName: tagName.trim() }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر إضافة الوسم."));
      setTagName("");
      setNotice("تمت إضافة الوسم.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الوسم.");
    } finally {
      setBusy(false);
    }
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!panel?.customer || !followUpTitle.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/crm/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: panel.customer.customerId,
          title: followUpTitle.trim(),
          conversationId,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر إنشاء المتابعة."));
      setFollowUpTitle("");
      setNotice("تم إنشاء المتابعة.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء المتابعة.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <DrvoLoading variant="inline" label="تحميل CRM…" hint="الرسائل تظهر بشكل مستقل" />;
  }

  if (error && !panel) {
    return <Alert variant="warning">{error}</Alert>;
  }

  if (!panel?.customer) {
    return (
      <EmptyState
        title="لا يوجد عميل CRM مرتبط"
        description="هذه المحادثة غير مربوطة بعد بملف عميل. يمكنك المتابعة من الرسائل كالمعتاد."
      />
    );
  }

  const { customer, openFollowUps, latestNote, erp } = panel;

  return (
    <div className="space-y-4" dir="rtl">
      {error ? <Alert variant="warning">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <div className="rounded-2xl border border-border bg-surface/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-muted-foreground">CRM</p>
            <h4 className="mt-1 text-base font-black">{customer.fullName}</h4>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {customer.primaryPhoneNormalized || "بدون رقم"}
            </p>
          </div>
          <Badge variant={customer.status === "ACTIVE" ? "success" : "muted"}>
            {CRM_STATUS_LABELS[customer.status]}
          </Badge>
        </div>
        {customer.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {customer.tags.map((tag) => (
              <Badge key={tag.tagId} variant="muted">{tag.name}</Badge>
            ))}
          </div>
        ) : null}
        <Link
          href={`/dashboard/contacts/${customer.customerId}`}
          className="mt-3 inline-block text-xs font-bold text-primary hover:underline"
        >
          فتح ملف العميل
        </Link>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <h5 className="text-[11px] font-bold text-muted-foreground">ملخص ERP</h5>
        {erp ? (
          <div className="mt-2 space-y-1 text-xs">
            <p>الزيارات: <strong>{erp.totalVisits.toLocaleString("ar-EG")}</strong></p>
            <p>الإنفاق: <strong>{formatCrmMoney(erp.totalSpend)}</strong></p>
            <p>آخر زيارة: <strong>{formatCrmDate(erp.lastVisitAt)}</strong></p>
            <p>الخدمة المفضلة: <strong>{erp.favoriteService || "—"}</strong></p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">لا توجد بيانات ERP بعد.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <h5 className="text-[11px] font-bold text-muted-foreground">متابعات مفتوحة</h5>
        {openFollowUps.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">لا توجد متابعات مفتوحة.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {openFollowUps.map((item) => (
              <li key={item.followUpId} className="rounded-xl bg-surface px-3 py-2 text-xs">
                <strong>{item.title}</strong>
                <p className="mt-1 text-muted-foreground">الاستحقاق: {formatCrmDate(item.dueAtUtc)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {latestNote ? (
        <div className="rounded-2xl border border-border p-4">
          <h5 className="text-[11px] font-bold text-muted-foreground">آخر ملاحظة</h5>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6">{latestNote.body}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatCrmDate(latestNote.createdAtUtc)}</p>
        </div>
      ) : null}

      <form onSubmit={addNote} className="space-y-2 rounded-2xl border border-border p-4">
        <h5 className="text-[11px] font-bold text-muted-foreground">ملاحظة سريعة</h5>
        <Textarea
          rows={3}
          maxLength={4000}
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          placeholder="اكتب ملاحظة…"
        />
        <Button type="submit" size="sm" disabled={busy || !noteBody.trim()}>حفظ</Button>
      </form>

      <form onSubmit={addTag} className="space-y-2 rounded-2xl border border-border p-4">
        <h5 className="text-[11px] font-bold text-muted-foreground">وسم سريع</h5>
        <div className="flex gap-2">
          <Input
            value={tagName}
            maxLength={80}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="VIP"
          />
          <Button type="submit" size="sm" disabled={busy || !tagName.trim()}>إضافة</Button>
        </div>
      </form>

      <form onSubmit={createFollowUp} className="space-y-2 rounded-2xl border border-border p-4">
        <h5 className="text-[11px] font-bold text-muted-foreground">متابعة سريعة</h5>
        <Input
          value={followUpTitle}
          maxLength={200}
          onChange={(event) => setFollowUpTitle(event.target.value)}
          placeholder="عنوان المتابعة"
        />
        <Button type="submit" size="sm" disabled={busy || followUpTitle.trim().length < 2}>
          إنشاء متابعة
        </Button>
      </form>
    </div>
  );
}
