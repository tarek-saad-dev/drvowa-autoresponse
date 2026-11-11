"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatCrmDate, readApiJson } from "@/components/dashboard/crm/labels";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { CrmSegment } from "@/modules/crm/types";

export function SegmentsPanel() {
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/segments", { cache: "no-store" });
      const data = await readApiJson<{ segments?: CrmSegment[] }>(response);
      if (!response.ok || !Array.isArray(data.segments)) {
        throw new Error(mapUserFacingError(data, "تعذر تحميل الشرائح."));
      }
      setSegments(data.segments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الشرائح.");
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-primary">CRM</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">الشرائح المحفوظة</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            الشرائح المحفوظة من منشئ الحملات بالذكاء الاصطناعي تظهر هنا لإعادة استخدامها لاحقاً.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            تحديث
          </Button>
          <Link href="/dashboard/campaigns/create">
            <Button type="button">إنشاء عبر الذكاء الاصطناعي</Button>
          </Link>
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-black">الشرائح</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <DrvoLoading variant="inline" label="جاري تحميل الشرائح…" />
          ) : segments.length === 0 ? (
            <EmptyState
              title="لا توجد شرائح محفوظة"
              description="استخدم منشئ الحملات بالذكاء الاصطناعي ثم احفظ الجمهور كشريحة."
              action={
                <Link href="/dashboard/campaigns/create" className="text-sm font-bold text-primary hover:underline">
                  فتح منشئ الحملات
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {segments.map((segment) => (
                <article
                  key={segment.segmentId}
                  className="rounded-xl border border-border bg-surface/30 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-sm font-black">{segment.name}</h2>
                    <span className="text-[11px] text-muted-foreground">
                      {formatCrmDate(segment.updatedAtUtc)}
                    </span>
                  </div>
                  {segment.description ? (
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{segment.description}</p>
                  ) : null}
                  {segment.explanationAr ? (
                    <p className="mt-2 rounded-lg bg-card px-3 py-2 text-xs leading-6 text-foreground">
                      {segment.explanationAr}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
