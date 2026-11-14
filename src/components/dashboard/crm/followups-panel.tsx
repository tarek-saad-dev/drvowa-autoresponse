"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  CRM_FOLLOWUP_STATUS_LABELS,
  CRM_PRIORITY_LABELS,
  formatCrmDate,
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
import type { CrmFollowUp, CrmFollowUpPriority, CrmFollowUpStatus } from "@/modules/crm/types";

type ListResponse = {
  items?: CrmFollowUp[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export function FollowUpsPanel() {
  const [items, setItems] = useState<CrmFollowUp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "COMPLETED" | "">("OPEN");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CrmFollowUpPriority>("MEDIUM");
  const [dueAt, setDueAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/crm/follow-ups?${params.toString()}`, { cache: "no-store" });
      const data = await readApiJson<ListResponse>(response);
      if (!response.ok || !Array.isArray(data.items)) {
        throw new Error(mapUserFacingError(data, "تعذر تحميل المتابعات."));
      }
      setItems(data.items);
      setTotal(data.total ?? data.items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل المتابعات.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  async function completeFollowUp(followUpId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/crm/follow-ups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر إكمال المتابعة."));
      setNotice("تم إكمال المتابعة.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إكمال المتابعة.");
    } finally {
      setBusy(false);
    }
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/crm/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId.trim(),
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueAtUtc: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const data = await readApiJson<{ followUp?: CrmFollowUp }>(response);
      if (!response.ok || !data.followUp) {
        throw new Error(mapUserFacingError(data, "تعذر إنشاء المتابعة."));
      }
      setCustomerId("");
      setTitle("");
      setDescription("");
      setDueAt("");
      setNotice("تم إنشاء المتابعة.");
      setStatusFilter("OPEN");
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء المتابعة.");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <p className="text-xs font-black text-primary">CRM</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">المتابعات</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          راقب المهام المفتوحة والمكتملة وأنشئ متابعات جديدة للعملاء.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-black">إنشاء متابعة</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createFollowUp} className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="followup-customer">معرّف العميل</Label>
              <Input
                id="followup-customer"
                dir="ltr"
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                placeholder="UUID للعميل"
              />
            </div>
            <div>
              <Label htmlFor="followup-title">العنوان</Label>
              <Input
                id="followup-title"
                required
                minLength={2}
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="followup-priority">الأولوية</Label>
              <Select
                id="followup-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as CrmFollowUpPriority)}
              >
                {(Object.keys(CRM_PRIORITY_LABELS) as CrmFollowUpPriority[]).map((value) => (
                  <option key={value} value={value}>{CRM_PRIORITY_LABELS[value]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="followup-due">الاستحقاق</Label>
              <Input
                id="followup-due"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="followup-description">الوصف</Label>
              <Textarea
                id="followup-description"
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <Button type="submit" disabled={busy}>إنشاء متابعة</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-black">قائمة المتابعات</CardTitle>
          <div className="flex gap-2">
            {([
              { value: "OPEN", label: "مفتوحة" },
              { value: "COMPLETED", label: "مكتملة" },
              { value: "", label: "الكل" },
            ] as const).map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs font-bold " +
                  (statusFilter === option.value
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <DrvoLoading variant="inline" label="جاري تحميل المتابعات…" />
          ) : items.length === 0 ? (
            <EmptyState
              title="لا توجد متابعات"
              description="أنشئ متابعة جديدة أو غيّر فلتر الحالة."
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.followUpId} className="rounded-xl border border-border px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black">{item.title}</h3>
                      {item.customerId ? (
                        <Link
                          href={`/dashboard/contacts/${item.customerId}`}
                          className="mt-1 inline-block text-xs font-bold text-primary hover:underline"
                        >
                          {item.customerName || "فتح العميل"}
                        </Link>
                      ) : null}
                      {item.description ? (
                        <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        الاستحقاق: {formatCrmDate(item.dueAtUtc)} · المسؤول: {item.assignedUserName || "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="muted">
                        {CRM_FOLLOWUP_STATUS_LABELS[item.status as CrmFollowUpStatus]}
                      </Badge>
                      <Badge variant={item.priority === "URGENT" || item.priority === "HIGH" ? "warning" : "info"}>
                        {CRM_PRIORITY_LABELS[item.priority]}
                      </Badge>
                      {item.status === "OPEN" || item.status === "IN_PROGRESS" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void completeFollowUp(item.followUpId)}
                        >
                          إكمال
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {total.toLocaleString("ar-EG")} متابعة · صفحة {page.toLocaleString("ar-EG")} من{" "}
              {totalPages.toLocaleString("ar-EG")}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                السابق
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
