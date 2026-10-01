"use client";

import { useMemo, useState } from "react";

import { KnowledgeCopilot } from "@/components/dashboard/knowledge-copilot";
import { KnowledgeManager } from "@/components/dashboard/knowledge-manager";
import { Button } from "@/components/ui/button";
import type { KnowledgeItem } from "@/types/domain";

export function KnowledgePageClient({
  items,
  activeCount,
  activeLimit,
}: {
  items: KnowledgeItem[];
  activeCount: number;
  activeLimit: number | null;
}) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  const health = useMemo(() => {
    if (activeCount === 0) {
      return {
        label: "لسه محتاج يتعلم",
        description: "ضيف أول معلومات عن البيزنس عشان يبدأ يرد بثقة.",
        tone: "border-warning/20 bg-warning-soft/45",
      };
    }
    if (activeCount < 5) {
      return {
        label: "عنده أساسيات كويسة",
        description: "كل معلومة إضافية هتخلي ردوده أدق وأقرب لطريقة شغلك.",
        tone: "border-primary/15 bg-primary/5",
      };
    }
    return {
      label: "متعلم كويس",
      description: "الموظف عنده معرفة كفاية يبدأ منها، وتقدر تزودها في أي وقت.",
      tone: "border-success/20 bg-success-soft/45",
    };
  }, [activeCount]);

  return (
    <div className="space-y-6">
      <section className={`rounded-[26px] border p-5 shadow-sm sm:p-6 ${health.tone}`}>
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-primary shadow-sm">
                ذاكرة موظف الاستقبال
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                {activeCount}
                {activeLimit != null ? ` من ${activeLimit}` : ""} معلومة نشطة
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">{health.label}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              {health.description}
            </p>
          </div>

          <div className="grid min-w-44 grid-cols-2 gap-2 rounded-2xl border border-white/70 bg-white/75 p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`rounded-xl px-3 py-3 text-xs font-black transition ${mode === "ai" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-surface"}`}
            >
              ✦ علّمه بالذكاء
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`rounded-xl px-3 py-3 text-xs font-black transition ${mode === "manual" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-surface"}`}
            >
              ✎ إدارة المعرفة
            </button>
          </div>
        </div>
      </section>

      {mode === "ai" ? (
        <div className="rounded-[26px] border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
            <div>
              <p className="text-xs font-black text-primary">الطريقة الأسهل</p>
              <h3 className="mt-1 text-lg font-black">قول له اللي محتاج يعرفه</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                الصق أسعار، خدمات، سياسات أو أي كلام غير مرتب — وهو هينظمه قبل الحفظ.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("manual")}>
              شوف كل المعلومات
            </Button>
          </div>
          <KnowledgeCopilot />
        </div>
      ) : (
        <div className="rounded-[26px] border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
            <div>
              <p className="text-xs font-black text-primary">تحكم كامل</p>
              <h3 className="mt-1 text-lg font-black">راجع وعدّل اللي الموظف عارفه</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                ابحث، عدّل، فعّل أو عطّل أي معلومة من مكان واحد.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("ai")}>
              علّمه معلومة جديدة
            </Button>
          </div>
          <KnowledgeManager
            items={items}
            activeCount={activeCount}
            activeLimit={activeLimit}
          />
        </div>
      )}
    </div>
  );
}
