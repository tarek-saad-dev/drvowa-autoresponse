"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatCrmDate, readApiJson } from "@/components/dashboard/crm/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type ErpSyncResource = {
  syncStateId: string;
  resource: string;
  status: "IDLE" | "RUNNING" | "PARTIAL" | "SUCCESS" | "ERROR";
  lastSuccessAtUtc: string | null;
  lastAttemptAtUtc: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type ErpSyncStatus = {
  connected: boolean;
  mirrorCounts?: {
    erpCustomers: number;
    validInvoices: number;
    unlinkedInvoices: number;
    invoiceLines: number;
    catalogServices: number;
  };
  integrationId: string | null;
  integrationStatus: string | null;
  availableTools: {
    customers: boolean;
    invoices: boolean;
    catalog: boolean;
  };
  resources: ErpSyncResource[];
};

function resourceLabel(raw: string): string {
  if (raw === "customers") return "العملاء";
  if (raw === "invoices") return "الفواتير";
  if (raw === "catalog") return "الكتالوج";
  return raw;
}

export function ErpSyncPanel() {
  const [status, setStatus] = useState<ErpSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/erp/sync", { cache: "no-store" });
      const data = await readApiJson<{ status?: ErpSyncStatus }>(response);
      if (!response.ok || !data.status) {
        throw new Error(mapUserFacingError(data, "تعذر تحميل حالة مزامنة ERP."));
      }
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل حالة مزامنة ERP.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/crm/erp/sync", { method: "POST" });
      const data = await readApiJson<{ status?: ErpSyncStatus }>(response);
      if (!response.ok || !data.status) {
        throw new Error(mapUserFacingError(data, "تعذر تشغيل المزامنة."));
      }
      setStatus(data.status);
      setNotice(data.status.resources.some((r) => r.status === "PARTIAL")
        ? "المزامنة جزئية؛ فيه صفحات بيانات لسه محتاجة استكمال. كرر المزامنة لحد ما الحالة تبقى SUCCESS."
        : data.status.resources.some((r) => r.status === "ERROR")
          ? "محاولة المزامنة واجهت خطأ؛ راجع حالة كل مورد."
          : "اكتملت محاولة المزامنة اليدوية. راجع حالة كل مورد للتأكد من اكتمالها.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل المزامنة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-primary">CRM</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">مزامنة ERP</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            راقب اتصال DRVO ERP وشغّل مزامنة يدوية للعملاء والفواتير والكتالوج.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void load()}>
            تحديث الحالة
          </Button>
          <Button type="button" disabled={loading || busy || !status?.connected} onClick={() => void resync()}>
            {busy ? "جاري المزامنة…" : "مزامنة الآن"}
          </Button>
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {loading ? (
        <DrvoLoading label="جاري تحميل حالة ERP…" />
      ) : !status ? (
        <EmptyState
          title="تعذر قراءة حالة المزامنة"
          description="تحقق من صلاحيات CRM أو من ربط التكامل."
          action={
            <Link href="/dashboard/integrations" className="text-sm font-bold text-primary hover:underline">
              فتح التكاملات
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="font-black">حالة الاتصال</CardTitle>
              <Badge variant={status.connected ? "success" : "warning"}>
                {status.connected ? "متصل" : "غير متصل"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>حالة التكامل: <strong>{status.integrationStatus || "—"}</strong></p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={status.availableTools.customers ? "success" : "muted"}>عملاء</Badge>
                <Badge variant={status.availableTools.invoices ? "success" : "muted"}>فواتير</Badge>
                <Badge variant={status.availableTools.catalog ? "success" : "muted"}>كتالوج</Badge>
              </div>
              {!status.connected ? (
                <p className="text-xs leading-6 text-muted-foreground">
                  اربط DRVO ERP أولاً من صفحة التكاملات قبل تشغيل المزامنة.{" "}
                  <Link href="/dashboard/integrations" className="font-bold text-primary hover:underline">
                    التكاملات
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-black">الداتا الموجودة فعليًا في CRM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.mirrorCounts ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      { label: "عملاء ERP", value: status.mirrorCounts.erpCustomers },
                      { label: "فواتير بيع صحيحة", value: status.mirrorCounts.validInvoices },
                      { label: "بنود الفواتير", value: status.mirrorCounts.invoiceLines },
                      { label: "خدمات الكتالوج", value: status.mirrorCounts.catalogServices },
                      { label: "فواتير بلا عميل مربوط", value: status.mirrorCounts.unlinkedInvoices },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-lg font-bold">{item.value.toLocaleString("ar-EG")}</p>
                      </div>
                    ))}
                  </div>
                  {status.mirrorCounts.validInvoices === 0 ? (
                    <Alert variant="warning">
                      مفيش فواتير بيع في نسخة CRM حاليًا. لو Cashier فيه فواتير، اتأكد من الربط واضغط «مزامنة الآن» لحد ما مزامنة الفواتير تبقى SUCCESS.
                    </Alert>
                  ) : null}
                  {status.mirrorCounts.unlinkedInvoices > 0 ? (
                    <Alert variant="warning">
                      فيه {status.mirrorCounts.unlinkedInvoices.toLocaleString("ar-EG")} فاتورة غير مربوطة بعميل CRM. الفواتير دي مش هتظهر في جمهور العملاء لحد ما يتصلح الربط.
                    </Alert>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">إحصاءات نسخة ERP غير متاحة.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-black">موارد المزامنة</CardTitle>
            </CardHeader>
            <CardContent>
              {status.resources.length === 0 ? (
                <EmptyState
                  title="لا يوجد سجل مزامنة بعد"
                  description="شغّل مزامنة يدوية لإنشاء أول حالة لكل مورد."
                />
              ) : (
                <div className="space-y-3">
                  {status.resources.map((resource) => (
                    <div key={resource.syncStateId} className="rounded-xl border border-border px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{resourceLabel(resource.resource)}</strong>
                        <Badge variant={resource.status === "ERROR" || resource.status === "PARTIAL" ? "warning" : resource.status === "SUCCESS" ? "success" : "muted"}>
                          {resource.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        آخر نجاح: {formatCrmDate(resource.lastSuccessAtUtc)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        آخر محاولة: {formatCrmDate(resource.lastAttemptAtUtc)}
                      </p>
                      {resource.lastErrorCode ? (
                        <p className="mt-1 text-xs text-warning">
                          {resource.lastErrorCode}
                          {resource.lastErrorMessage ? ` · ${resource.lastErrorMessage}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
