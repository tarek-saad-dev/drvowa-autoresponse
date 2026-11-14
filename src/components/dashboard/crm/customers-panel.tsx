"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  CRM_SOURCE_LABELS,
  CRM_STATUS_LABELS,
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
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type {
  CrmCustomer,
  CrmCustomerSource,
  CrmCustomerStatus,
  CrmTag,
} from "@/modules/crm/types";

type ListResponse = {
  items?: CrmCustomer[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type CustomerFormState = {
  fullName: string;
  primaryPhone: string;
  email: string;
  status: Exclude<CrmCustomerStatus, "MERGED">;
  source: CrmCustomerSource;
};

const EMPTY_FORM: CustomerFormState = {
  fullName: "",
  primaryPhone: "",
  email: "",
  status: "ACTIVE",
  source: "MANUAL",
};

const STATUS_OPTIONS = (Object.keys(CRM_STATUS_LABELS) as CrmCustomerStatus[]).filter(
  (status) => status !== "MERGED",
);
const SOURCE_OPTIONS = Object.keys(CRM_SOURCE_LABELS) as CrmCustomerSource[];

function CustomerDialog({
  open,
  title,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: CustomerFormState;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: CustomerFormState) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" dir="rtl">
      <button type="button" className="absolute inset-0" aria-label="إغلاق" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-customer-dialog-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <h2 id="crm-customer-dialog-title" className="text-lg font-black">
          {title}
        </h2>
        {error ? <Alert variant="error" className="mt-3">{error}</Alert> : null}
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(form);
          }}
        >
          <div>
            <Label htmlFor="crm-customer-name">الاسم</Label>
            <Input
              id="crm-customer-name"
              value={form.fullName}
              required
              minLength={2}
              maxLength={200}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="crm-customer-phone">الهاتف</Label>
            <Input
              id="crm-customer-phone"
              dir="ltr"
              value={form.primaryPhone}
              maxLength={32}
              placeholder="+20..."
              onChange={(event) => setForm((prev) => ({ ...prev, primaryPhone: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="crm-customer-email">البريد</Label>
            <Input
              id="crm-customer-email"
              type="email"
              dir="ltr"
              value={form.email}
              maxLength={320}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="crm-customer-status">الحالة</Label>
              <Select
                id="crm-customer-status"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as CustomerFormState["status"],
                  }))
                }
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {CRM_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-customer-source">المصدر</Label>
              <Select
                id="crm-customer-source"
                value={form.source}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    source: event.target.value as CrmCustomerSource,
                  }))
                }
              >
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {CRM_SOURCE_LABELS[source]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              إلغاء
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CustomersPanel() {
  const router = useRouter();
  const [items, setItems] = useState<CrmCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<CrmCustomerStatus | "">("");
  const [source, setSource] = useState<CrmCustomerSource | "">("");
  const [tagId, setTagId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [lastInteractionFrom, setLastInteractionFrom] = useState("");
  const [lastInteractionTo, setLastInteractionTo] = useState("");
  const [sort, setSort] = useState<"name" | "lastInteraction" | "created" | "spend">("lastInteraction");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CrmCustomer | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sort", sort);
      params.set("sortDir", sortDir);
      if (debouncedQ) params.set("q", debouncedQ);
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      if (tagId) params.set("tagId", tagId);
      if (assignedUserId) params.set("assignedUserId", assignedUserId);
      if (lastInteractionFrom) params.set("lastInteractionFrom", lastInteractionFrom);
      if (lastInteractionTo) params.set("lastInteractionTo", lastInteractionTo);

      const response = await fetch(`/api/crm/customers?${params.toString()}`, { cache: "no-store" });
      const data = await readApiJson<ListResponse>(response);
      if (!response.ok || !Array.isArray(data.items)) {
        throw new Error(mapUserFacingError(data, "تعذر تحميل العملاء."));
      }
      setItems(data.items);
      setTotal(data.total ?? data.items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل العملاء.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    assignedUserId,
    debouncedQ,
    lastInteractionFrom,
    lastInteractionTo,
    page,
    pageSize,
    sort,
    sortDir,
    source,
    status,
    tagId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [
    assignedUserId,
    debouncedQ,
    lastInteractionFrom,
    lastInteractionTo,
    sort,
    sortDir,
    source,
    status,
    tagId,
  ]);

  const tagOptions = useMemo(() => {
    const map = new Map<string, CrmTag>();
    for (const customer of items) {
      for (const tag of customer.tags ?? []) {
        map.set(tag.tagId, tag);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [items]);

  const assignedOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of items) {
      if (customer.assignedUserId) {
        map.set(customer.assignedUserId, customer.assignedUserName || customer.assignedUserId);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function createCustomer(form: CustomerFormState) {
    setFormBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          primaryPhone: form.primaryPhone.trim() || null,
          email: form.email.trim() || null,
          status: form.status,
          source: form.source,
        }),
      });
      const data = await readApiJson<{ customer?: CrmCustomer }>(response);
      if (!response.ok || !data.customer) {
        throw new Error(mapUserFacingError(data, "تعذر إنشاء العميل."));
      }
      setCreateOpen(false);
      router.push(`/dashboard/contacts/${data.customer.customerId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "تعذر إنشاء العميل.");
    } finally {
      setFormBusy(false);
    }
  }

  async function updateCustomer(form: CustomerFormState) {
    if (!editTarget) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/crm/customers/${editTarget.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          primaryPhone: form.primaryPhone.trim() || null,
          email: form.email.trim() || null,
          status: form.status,
        }),
      });
      const data = await readApiJson<{ customer?: CrmCustomer }>(response);
      if (!response.ok || !data.customer) {
        throw new Error(mapUserFacingError(data, "تعذر تحديث العميل."));
      }
      setEditTarget(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "تعذر تحديث العميل.");
    } finally {
      setFormBusy(false);
    }
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setDebouncedQ(q.trim());
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-primary">CRM</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">العملاء</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            ابحث وصنّف عملاءك، وعدّل بياناتهم، وافتح ملف كل عميل للمتابعة.
          </p>
        </div>
        <Button type="button" onClick={() => { setFormError(null); setCreateOpen(true); }}>
          + عميل جديد
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-base font-black">بحث وتصفية</CardTitle>
          <form onSubmit={onSearchSubmit} className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو البريد…"
              aria-label="بحث العملاء"
            />
            <Button type="submit" variant="secondary">بحث</Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="crm-filter-status">الحالة</Label>
              <Select
                id="crm-filter-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as CrmCustomerStatus | "")}
              >
                <option value="">الكل</option>
                {(Object.keys(CRM_STATUS_LABELS) as CrmCustomerStatus[]).map((value) => (
                  <option key={value} value={value}>{CRM_STATUS_LABELS[value]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-filter-source">المصدر</Label>
              <Select
                id="crm-filter-source"
                value={source}
                onChange={(event) => setSource(event.target.value as CrmCustomerSource | "")}
              >
                <option value="">الكل</option>
                {SOURCE_OPTIONS.map((value) => (
                  <option key={value} value={value}>{CRM_SOURCE_LABELS[value]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-filter-tag">وسم</Label>
              <Select
                id="crm-filter-tag"
                value={tagId}
                onChange={(event) => setTagId(event.target.value)}
              >
                <option value="">الكل</option>
                {tagOptions.map((tag) => (
                  <option key={tag.tagId} value={tag.tagId}>{tag.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-filter-assigned">المسؤول</Label>
              <Select
                id="crm-filter-assigned"
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
              >
                <option value="">الكل</option>
                {assignedOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-filter-from">آخر تفاعل من</Label>
              <Input
                id="crm-filter-from"
                type="date"
                value={lastInteractionFrom}
                onChange={(event) => setLastInteractionFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="crm-filter-to">آخر تفاعل إلى</Label>
              <Input
                id="crm-filter-to"
                type="date"
                value={lastInteractionTo}
                onChange={(event) => setLastInteractionTo(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="crm-filter-sort">ترتيب حسب</Label>
              <Select
                id="crm-filter-sort"
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as "name" | "lastInteraction" | "created" | "spend")
                }
              >
                <option value="lastInteraction">آخر تفاعل</option>
                <option value="name">الاسم</option>
                <option value="created">تاريخ الإنشاء</option>
                <option value="spend">الإنفاق</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="crm-filter-dir">اتجاه الترتيب</Label>
              <Select
                id="crm-filter-dir"
                value={sortDir}
                onChange={(event) => setSortDir(event.target.value as "asc" | "desc")}
              >
                <option value="desc">تنازلي</option>
                <option value="asc">تصاعدي</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <Alert variant="error" className="mb-4">{error}</Alert> : null}
          {loading ? (
            <DrvoLoading variant="inline" label="جاري تحميل العملاء…" />
          ) : items.length === 0 ? (
            <EmptyState
              title="لا يوجد عملاء مطابقون"
              description="جرّب تعديل البحث أو الفلاتر، أو أضف عميلاً يدوياً."
              action={
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  إضافة عميل
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted-foreground">
                    <th className="px-2 py-3 font-bold">العميل</th>
                    <th className="px-2 py-3 font-bold">الحالة</th>
                    <th className="px-2 py-3 font-bold">المصدر</th>
                    <th className="px-2 py-3 font-bold">المسؤول</th>
                    <th className="px-2 py-3 font-bold">آخر تفاعل</th>
                    <th className="px-2 py-3 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((customer) => (
                    <tr key={customer.customerId} className="border-b border-border/70 align-top">
                      <td className="px-2 py-3">
                        <Link
                          href={`/dashboard/contacts/${customer.customerId}`}
                          className="font-bold text-foreground hover:text-primary"
                        >
                          {customer.fullName}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                          {customer.primaryPhoneNormalized || "بدون رقم"}
                        </p>
                        {customer.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {customer.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag.tagId} variant="muted">{tag.name}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant={customer.status === "ACTIVE" ? "success" : "muted"}>
                          {CRM_STATUS_LABELS[customer.status]}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {CRM_SOURCE_LABELS[customer.source]}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {customer.assignedUserName || "—"}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {formatCrmDate(customer.lastInteractionAtUtc)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/dashboard/contacts/${customer.customerId}`)}
                          >
                            فتح
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setFormError(null);
                              setEditTarget(customer);
                            }}
                          >
                            تعديل
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {total.toLocaleString("ar-EG")} عميل · صفحة {page.toLocaleString("ar-EG")} من{" "}
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

      <CustomerDialog
        open={createOpen}
        title="عميل جديد"
        initial={EMPTY_FORM}
        busy={formBusy}
        error={formError}
        onClose={() => setCreateOpen(false)}
        onSubmit={createCustomer}
      />
      <CustomerDialog
        open={Boolean(editTarget)}
        title="تعديل عميل"
        initial={
          editTarget
            ? {
                fullName: editTarget.fullName,
                primaryPhone: editTarget.primaryPhoneNormalized ?? "",
                email: editTarget.email ?? "",
                status: editTarget.status === "MERGED" ? "ACTIVE" : editTarget.status,
                source: editTarget.source,
              }
            : EMPTY_FORM
        }
        busy={formBusy}
        error={formError}
        onClose={() => setEditTarget(null)}
        onSubmit={updateCustomer}
      />
    </div>
  );
}
