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

type ErpSourceProbe = {
  connected: boolean;
  allToolsReachable: boolean;
  anySourceRows: boolean;
  resources: Array<{
    resource: string;
    ok: boolean;
    returnedRows: number | null;
    errorCode: string | null;
  }>;
};

type ErpSyncResult = {
  customers: { synced: number; skipped: boolean };
  invoices: { synced: number; skipped: boolean };
  catalog: { synced: number; skipped: boolean };
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
  const [probe, setProbe] = useState<ErpSourceProbe | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);

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
      const data = await readApiJson<{ status?: ErpSyncStatus; result?: ErpSyncResult }>(response);
      if (!response.ok || !data.status || !data.result) {
        throw new Error(mapUserFacingError(data, "تعذر تشغيل المزامنة."));
      }
      setStatus(data.status);
      const names = ["customers", "invoices", "catalog"] as const;
      const missing = names.some((name) =>
        data.result![name].skipped || !data.status!.resources.some(
          (resource) => resource.resource === name,
        ),
      );
      if (missing) {
        throw new Error("المزامنة رجعت بدون تنفيذ أو حفظ بعض الموارد. اختبر المصدر؛ لم يتم تأكيد المزامنة.");
      }
      const progress = names.map((name) =>
        resourceLabel(name) + ": " + data.result![name].synced.toLocaleString("ar-EG"),
      ).join(" · ");
      if (data.status.resources.some((resource) => resource.status === "PARTIAL")) {
        setNotice("المزامنة جزئية: " + progress + ". كرر المحاولة حتى تصبح الموارد SUCCESS.");
      } else if (data.status.resources.some((resource) => resource.status === "ERROR")) {
        throw new Error("حدث خطأ في أحد موارد المزامنة. راجع التفاصيل أدناه.");
      } else if ((data.status.mirrorCounts?.validInvoices ?? 0) === 0) {
        setNotice("تم تسجيل محاولة المزامنة، لكن CRM ما زال بدون فواتير. " + progress + ". استخدم «اختبار مصدر Cashier» لمعرفة هل المصدر بيرجع سجلات.");
      } else {
        setNotice("اكتملت المزامنة وسُجلت حالة الموارد. " + progress + ".");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل المزامنة.");
    } finally {
      setBusy(false);
    }
  }

  async function probeSource() {
    if (probeBusy || busy) return;
    setProbeBusy(true);
    setError(null);
    setProbe(null);
    try {
      const response = await fetch("/api/crm/erp/probe", { method: "POST" });
      const data = await readApiJson<{ probe?: ErpSourceProbe }>(response);
      if (!response.ok || !data.probe) {
        throw new Error(mapUserFacingError(data, "تعذر اختبار مصدر Cashier."));
      }
      setProbe(data.probe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر اختبار مصدر Cashier.");
    } finally {
      setProbeBusy(false);
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
          <Button type="button" variant="outline" disabled={loading || busy || probeBusy || !status?.connected} onClick={() => void probeSource()}>
            {probeBusy ? "جاري فحص المصدر…" : "اختبار مصدر Cashier (قراءة فقط)"}
          </Button>
          <Button type="button" disabled={loading || busy || probeBusy || !status?.connected} onClick={() => void resync()}>
            {busy ? "جاري المزامنة…" : "مزامنة الآن"}
          </Button>
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {probe ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-black">نتيجة فحص Cashier المباشر — بدون نسخ بيانات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert variant={probe.allToolsReachable && probe.anySourceRows ? "success" : "warning"}>
              {!probe.connected
                ? "التكامل ظاهر Active، لكن تعذّر الوصول لمصدر Cashier باستخدام بيانات الربط الحالية."
                : !probe.allToolsReachable
                  ? "فيه أداة مش بترد أو مش مُعلنة من Cashier. راجع صلاحيات الربط ومصدر الخدمة."
                  : !probe.anySourceRows
                    ? "Cashier رد على الاختبار، لكن الثلاث أدوات رجّعت صفحات فاضية. لو فيه بيانات في المحل، راجع قاعدة البيانات اللي الـConnector متصل بيها."
                    : "Cashier رجّع سجلات فعلية. لو CRM لسه صفر، المشكلة في حفظ/مزامنة البيانات، مش مجرد الاتصال."}
            </Alert>
            <div className="grid gap-2 sm:grid-cols-3">
              {probe.resources.map((item) => (
                <div key={item.resource} className="rounded-xl border border-border p-3 text-sm">
                  <strong>{resourceLabel(item.resource)}</strong>
                  <p className="mt-2 text-muted-foreground">
                    {item.ok ? "وصول ناجح" : "فشل الاتصال/الأداة"}
                    {" · "}
                    {item.returnedRows == null ? "لا توجد قراءة" : item.returnedRows + " سجل في صفحة الفحص"}
                  </p>
                  {item.errorCode ? <p className="mt-1 text-xs text-warning">{item.errorCode}</p> : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              كل أداة بتقرأ صفحة محدودة بحد أقصى سجل واحد. الأعداد هنا ليست إجمالي بيانات Cashier، ومفيش بيانات عملاء أو فواتير اتعرضت من المصدر.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
