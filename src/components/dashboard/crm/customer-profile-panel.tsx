"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  CRM_FOLLOWUP_STATUS_LABELS,
  CRM_PRIORITY_LABELS,
  CRM_SOURCE_LABELS,
  CRM_STATUS_LABELS,
  formatCrmDate,
  formatCrmMoney,
  readApiJson,
} from "@/components/dashboard/crm/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type {
  CrmCustomerProfile,
  CrmCustomerStatus,
  CrmFollowUp,
  CrmFollowUpPriority,
  CrmNote,
  CrmTag,
} from "@/modules/crm/types";

type TabId = "overview" | "conversations" | "timeline" | "notes" | "tasks" | "erp";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "نظرة عامة" },
  { id: "conversations", label: "المحادثات" },
  { id: "timeline", label: "الخط الزمني" },
  { id: "notes", label: "الملاحظات" },
  { id: "tasks", label: "المهام" },
  { id: "erp", label: "ERP" },
];

export function CustomerProfilePanel({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<CrmCustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [tagName, setTagName] = useState("");
  const [status, setStatus] = useState<Exclude<CrmCustomerStatus, "MERGED">>("ACTIVE");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [followUpPriority, setFollowUpPriority] = useState<CrmFollowUpPriority>("MEDIUM");
  const [followUpDue, setFollowUpDue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/customers/${customerId}`, { cache: "no-store" });
      const data = await readApiJson<{ profile?: CrmCustomerProfile }>(response);
      if (!response.ok || !data.profile) {
        throw new Error(mapUserFacingError(data, "تعذر تحميل ملف العميل."));
      }
      setProfile(data.profile);
      setStatus(
        data.profile.customer.status === "MERGED"
          ? "ACTIVE"
          : data.profile.customer.status,
      );
      setAssignedUserId(data.profile.customer.assignedUserId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل ملف العميل.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchCustomer(payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(`/api/crm/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر حفظ التغيير."));
      setActionNotice(successMessage);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر حفظ التغيير.");
    } finally {
      setBusy(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(`/api/crm/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const data = await readApiJson<{ note?: CrmNote }>(response);
      if (!response.ok || !data.note) {
        throw new Error(mapUserFacingError(data, "تعذر إضافة الملاحظة."));
      }
      setNoteBody("");
      setActionNotice("تمت إضافة الملاحظة.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر إضافة الملاحظة.");
    } finally {
      setBusy(false);
    }
  }

  async function addTag(event: FormEvent) {
    event.preventDefault();
    if (!tagName.trim()) return;
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(`/api/crm/customers/${customerId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName: tagName.trim() }),
      });
      const data = await readApiJson<{ tags?: CrmTag[] }>(response);
      if (!response.ok || !Array.isArray(data.tags)) {
        throw new Error(mapUserFacingError(data, "تعذر إضافة الوسم."));
      }
      setTagName("");
      setActionNotice("تمت إضافة الوسم.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر إضافة الوسم.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tagId: string) {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/crm/customers/${customerId}/tags?tagId=${encodeURIComponent(tagId)}`, {
        method: "DELETE",
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر إزالة الوسم."));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر إزالة الوسم.");
    } finally {
      setBusy(false);
    }
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!followUpTitle.trim()) return;
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch("/api/crm/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          title: followUpTitle.trim(),
          description: followUpDescription.trim() || null,
          priority: followUpPriority,
          dueAtUtc: followUpDue ? new Date(followUpDue).toISOString() : null,
        }),
      });
      const data = await readApiJson<{ followUp?: CrmFollowUp }>(response);
      if (!response.ok || !data.followUp) {
        throw new Error(mapUserFacingError(data, "تعذر إنشاء المتابعة."));
      }
      setFollowUpTitle("");
      setFollowUpDescription("");
      setFollowUpDue("");
      setActionNotice("تم إنشاء المتابعة.");
      setTab("tasks");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر إنشاء المتابعة.");
    } finally {
      setBusy(false);
    }
  }

  async function completeFollowUp(followUpId: string) {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/crm/follow-ups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر إكمال المتابعة."));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر إكمال المتابعة.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <DrvoLoading label="جاري تحميل ملف العميل…" />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="تعذر فتح ملف العميل"
        description={error || "العميل غير موجود أو غير متاح في هذا النشاط."}
        action={
          <Link href="/dashboard/contacts" className="text-sm font-bold text-primary hover:underline">
            العودة لقائمة العملاء
          </Link>
        }
      />
    );
  }

  const { customer, notes, followUps, activities, conversations, erp, erpInvoices } = profile;
  const openTasks = followUps.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS");

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-primary">
            <Link href="/dashboard/contacts" className="hover:underline">العملاء</Link>
            {" · "}ملف العميل
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">{customer.fullName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span dir="ltr">{customer.primaryPhoneNormalized || "بدون رقم"}</span>
            <Badge variant={customer.status === "ACTIVE" ? "success" : "muted"}>
              {CRM_STATUS_LABELS[customer.status]}
            </Badge>
            <Badge variant="info">{CRM_SOURCE_LABELS[customer.source]}</Badge>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>
          تحديث
        </Button>
      </div>

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      {actionNotice ? <Alert variant="success">{actionNotice}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-black">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={addNote} className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
            <Label htmlFor="crm-quick-note">إضافة ملاحظة</Label>
            <Textarea
              id="crm-quick-note"
              value={noteBody}
              rows={3}
              maxLength={4000}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="اكتب ملاحظة سريعة…"
            />
            <Button type="submit" size="sm" disabled={busy || !noteBody.trim()}>حفظ الملاحظة</Button>
          </form>

          <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-3">
            <div>
              <Label htmlFor="crm-quick-status">تغيير الحالة</Label>
              <div className="flex gap-2">
                <Select
                  id="crm-quick-status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as Exclude<CrmCustomerStatus, "MERGED">)
                  }
                >
                  {(Object.keys(CRM_STATUS_LABELS) as CrmCustomerStatus[])
                    .filter((value) => value !== "MERGED")
                    .map((value) => (
                      <option key={value} value={value}>{CRM_STATUS_LABELS[value]}</option>
                    ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void patchCustomer({ status }, "تم تحديث الحالة.")}
                >
                  حفظ
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="crm-quick-assign">تعيين مسؤول (معرّف المستخدم)</Label>
              <div className="flex gap-2">
                <Input
                  id="crm-quick-assign"
                  dir="ltr"
                  value={assignedUserId}
                  placeholder="UUID أو اتركه فارغًا"
                  onChange={(event) => setAssignedUserId(event.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void patchCustomer(
                      { assignedUserId: assignedUserId.trim() || null },
                      "تم تحديث المسؤول.",
                    )
                  }
                >
                  تعيين
                </Button>
              </div>
            </div>
            <form onSubmit={addTag} className="space-y-2">
              <Label htmlFor="crm-quick-tag">إضافة وسم</Label>
              <div className="flex gap-2">
                <Input
                  id="crm-quick-tag"
                  value={tagName}
                  maxLength={80}
                  onChange={(event) => setTagName(event.target.value)}
                  placeholder="مثلاً: VIP"
                />
                <Button type="submit" size="sm" disabled={busy || !tagName.trim()}>إضافة</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {customer.tags.map((tag) => (
                  <button
                    key={tag.tagId}
                    type="button"
                    disabled={busy}
                    onClick={() => void removeTag(tag.tagId)}
                    className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-destructive-soft"
                    title="إزالة الوسم"
                  >
                    {tag.name} ×
                  </button>
                ))}
              </div>
            </form>
          </div>

          <form onSubmit={createFollowUp} className="space-y-2 rounded-xl border border-border bg-surface/40 p-3 lg:col-span-2">
            <Label>إنشاء متابعة</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                value={followUpTitle}
                required
                minLength={2}
                maxLength={200}
                placeholder="عنوان المتابعة"
                onChange={(event) => setFollowUpTitle(event.target.value)}
              />
              <Select
                value={followUpPriority}
                onChange={(event) => setFollowUpPriority(event.target.value as CrmFollowUpPriority)}
              >
                {(Object.keys(CRM_PRIORITY_LABELS) as CrmFollowUpPriority[]).map((value) => (
                  <option key={value} value={value}>{CRM_PRIORITY_LABELS[value]}</option>
                ))}
              </Select>
              <Input
                type="datetime-local"
                value={followUpDue}
                onChange={(event) => setFollowUpDue(event.target.value)}
              />
              <Button type="submit" disabled={busy || followUpTitle.trim().length < 2}>
                إنشاء متابعة
              </Button>
            </div>
            <Textarea
              value={followUpDescription}
              rows={2}
              maxLength={2000}
              placeholder="تفاصيل اختيارية…"
              onChange={(event) => setFollowUpDescription(event.target.value)}
            />
          </form>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام ملف العميل">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
              (tab === item.id
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="font-black">الملخص</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">البريد</p><p className="font-bold" dir="ltr">{customer.email || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">المسؤول</p><p className="font-bold">{customer.assignedUserName || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">آخر تفاعل</p><p className="font-bold">{formatCrmDate(customer.lastInteractionAtUtc)}</p></div>
              <div><p className="text-xs text-muted-foreground">معرّف ERP</p><p className="font-bold" dir="ltr">{customer.externalErpClientId || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">متابعات مفتوحة</p><p className="font-bold">{openTasks.length.toLocaleString("ar-EG")}</p></div>
              <div><p className="text-xs text-muted-foreground">محادثات مرتبطة</p><p className="font-bold">{conversations.length.toLocaleString("ar-EG")}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="font-black">ERP سريع</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>الزيارات: <strong>{erp.totalVisits.toLocaleString("ar-EG")}</strong></p>
              <p>الإنفاق: <strong>{formatCrmMoney(erp.totalSpend)}</strong></p>
              <p>آخر زيارة: <strong>{formatCrmDate(erp.lastVisitAt)}</strong></p>
              <p>الخدمة المفضلة: <strong>{erp.favoriteService || "—"}</strong></p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "conversations" ? (
        <Card>
          <CardHeader><CardTitle className="font-black">المحادثات</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {conversations.length === 0 ? (
              <EmptyState title="لا توجد محادثات مرتبطة" description="ستظهر محادثات واتساب المرتبطة بهذا العميل هنا." />
            ) : conversations.map((conversation) => (
              <Link
                key={conversation.conversationId}
                href={`/dashboard/inbox?conversationId=${conversation.conversationId}`}
                className="block rounded-xl border border-border bg-surface/40 px-4 py-3 transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{conversation.contactDisplayName || "محادثة"}</strong>
                  <span className="text-xs text-muted-foreground">{formatCrmDate(conversation.lastMessageAtUtc)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {conversation.lastMessagePreview || "بدون معاينة"}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "timeline" ? (
        <Card>
          <CardHeader><CardTitle className="font-black">الخط الزمني</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {activities.length === 0 ? (
              <EmptyState title="لا يوجد نشاط بعد" description="ستظهر هنا الملاحظات والمتابعات والتفاعلات." />
            ) : activities.map((activity) => (
              <div key={activity.activityId} className="rounded-xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{activity.title}</strong>
                  <span className="text-xs text-muted-foreground">{formatCrmDate(activity.occurredAtUtc)}</span>
                </div>
                {activity.body ? <p className="mt-1 text-xs leading-6 text-muted-foreground">{activity.body}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {activity.activityType}
                  {activity.actorName ? ` · ${activity.actorName}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "notes" ? (
        <Card>
          <CardHeader><CardTitle className="font-black">الملاحظات</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notes.length === 0 ? (
              <EmptyState title="لا توجد ملاحظات" description="أضف ملاحظة من الإجراءات السريعة أعلاه." />
            ) : notes.map((note) => (
              <div key={note.noteId} className="rounded-xl border border-border px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-7">{note.body}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {note.createdByName || "فريق العمل"} · {formatCrmDate(note.createdAtUtc)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "tasks" ? (
        <Card>
          <CardHeader><CardTitle className="font-black">المتابعات والمهام</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {followUps.length === 0 ? (
              <EmptyState title="لا توجد متابعات" description="أنشئ متابعة من الإجراءات السريعة." />
            ) : followUps.map((item) => (
              <div key={item.followUpId} className="rounded-xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{item.title}</strong>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="muted">{CRM_FOLLOWUP_STATUS_LABELS[item.status]}</Badge>
                    <Badge variant={item.priority === "URGENT" || item.priority === "HIGH" ? "warning" : "info"}>
                      {CRM_PRIORITY_LABELS[item.priority]}
                    </Badge>
                  </div>
                </div>
                {item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  الاستحقاق: {formatCrmDate(item.dueAtUtc)} · المسؤول: {item.assignedUserName || "—"}
                </p>
                {item.status === "OPEN" || item.status === "IN_PROGRESS" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    disabled={busy}
                    onClick={() => void completeFollowUp(item.followUpId)}
                  >
                    إكمال
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "erp" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="font-black">ملخص ERP</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>متصل بالبيانات: <strong>{erp.connected ? "نعم" : "لا"}</strong></p>
              <p>الزيارات: <strong>{erp.totalVisits.toLocaleString("ar-EG")}</strong></p>
              <p>إجمالي الإنفاق: <strong>{formatCrmMoney(erp.totalSpend)}</strong></p>
              <p>متوسط الفاتورة: <strong>{formatCrmMoney(erp.averageInvoice)}</strong></p>
              <p>القيمة مدى الحياة: <strong>{formatCrmMoney(erp.lifetimeValue)}</strong></p>
              <p>الخدمة المفضلة: <strong>{erp.favoriteService || "—"}</strong></p>
              <p>الموظف المفضل: <strong>{erp.favoriteEmployee || "—"}</strong></p>
              <p>أكثر فرع زيارة: <strong>{erp.mostVisitedBranch || "—"}</strong></p>
              <p>آخر زيارة: <strong>{formatCrmDate(erp.lastVisitAt)}</strong></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="font-black">فواتير مرآة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {erpInvoices.length === 0 ? (
                <EmptyState title="لا توجد فواتير" description="بعد مزامنة ERP ستظهر الفواتير هنا." />
              ) : erpInvoices.slice(0, 20).map((invoice) => (
                <div key={invoice.invoiceMirrorId} className="rounded-xl border border-border px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong dir="ltr">{invoice.externalInvId}</strong>
                    <span>{formatCrmMoney(invoice.grandTotal)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {invoice.branchName || "فرع غير محدد"} · {formatCrmDate(invoice.invDate)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
