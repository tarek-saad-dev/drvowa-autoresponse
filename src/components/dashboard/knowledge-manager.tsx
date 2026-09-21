"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import {
  KNOWLEDGE_CATEGORY_OPTIONS,
  knowledgeCategoryLabel,
} from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { KnowledgeItem } from "@/types/domain";

export function KnowledgeManager({
  items,
  activeCount,
  activeLimit,
}: {
  items: KnowledgeItem[];
  activeCount: number;
  activeLimit: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [filter, setFilter] = useState("");

  const limitLabel =
    activeLimit == null ? "بلا حد" : String(activeLimit);
  const nearQuota =
    activeLimit != null && activeCount >= Math.max(1, activeLimit - 1);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.title} ${item.content} ${knowledgeCategoryLabel(item.category)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      category: String(form.get("category") ?? KNOWLEDGE_CATEGORIES.CUSTOM),
      title: String(form.get("title") ?? ""),
      content: String(form.get("content") ?? ""),
    };

    try {
      const response = await fetch(
        editing
          ? `/api/knowledge/${editing.knowledgeItemId}`
          : "/api/knowledge",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setError(
          mapUserFacingError(data, "تعذر حفظ المعلومة. حاول مرة أخرى."),
        );
        return;
      }
      setEditing(null);
      event.currentTarget.reset();
      setSuccess(editing ? "تم حفظ التعديل." : "تمت إضافة المعلومة.");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setPending(false);
    }
  }

  async function setActive(item: KnowledgeItem, nextActive: boolean) {
    if (item.isActive && !nextActive) {
      const ok = window.confirm(
        "تعطيل هذه المعلومة يمنع موظف الاستقبال من استخدامها في الردود. هل تريد المتابعة؟",
      );
      if (!ok) return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/knowledge/${item.knowledgeItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setError(
          mapUserFacingError(
            data,
            nextActive
              ? "تعذر تفعيل المعلومة. قد تكون وصلت لحد خطتك."
              : "تعذر تعطيل المعلومة.",
          ),
        );
        return;
      }
      if (editing?.knowledgeItemId === item.knowledgeItemId) {
        setEditing({ ...editing, isActive: nextActive });
      }
      setSuccess(nextActive ? "تم تفعيل المعلومة." : "تم تعطيل المعلومة.");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className={nearQuota ? "font-medium text-warning" : "text-muted-foreground"}>
          {activeCount} من {limitLabel} معلومة نشطة
        </p>
        {nearQuota && activeLimit != null ? (
          <Link
            href="/dashboard/billing"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            عرض حدود الخطة
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              {editing ? "تعديل معلومة" : "إضافة معلومة"}
            </CardTitle>
            <CardDescription>
              المعلومات التي يعتمد عليها موظف الاستقبال في الرد على العملاء.
              المعلومات النشطة فقط هي ما يمكنه استخدامها.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={save}
              key={editing?.knowledgeItemId ?? "new"}
            >
              {error ? (
                <Alert variant="error" aria-live="polite">
                  {error}
                </Alert>
              ) : null}
              {success ? (
                <Alert variant="success" aria-live="polite">
                  {success}
                </Alert>
              ) : null}
              <div>
                <Label htmlFor="category">التصنيف</Label>
                <Select
                  id="category"
                  name="category"
                  defaultValue={editing?.category ?? KNOWLEDGE_CATEGORIES.FAQ}
                >
                  {KNOWLEDGE_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="title">العنوان</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  maxLength={200}
                  defaultValue={editing?.title ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="content">المحتوى</Label>
                <Textarea
                  id="content"
                  name="content"
                  required
                  rows={5}
                  maxLength={4000}
                  defaultValue={editing?.content ?? ""}
                  placeholder="مثال: نعمل من السبت إلى الخميس ٩ صباحاً – ٩ مساءً."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "جارٍ الحفظ..." : editing ? "حفظ التعديل" : "إضافة"}
                </Button>
                {editing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    إلغاء
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {items.length > 0 ? (
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="بحث في المعرفة…"
              aria-label="بحث في المعرفة"
              className="h-9"
            />
          ) : null}

          {items.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-sm text-muted-foreground">
                لا توجد معرفة بعد. أضف أسئلة وأجوبة أو ساعات العمل أو الخدمات
                والأسعار لتعليم موظف الاستقبال كيف يرد.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-sm text-muted-foreground">
                لا نتائج مطابقة لبحثك.
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => (
              <Card key={item.knowledgeItemId}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>
                        {knowledgeCategoryLabel(item.category)}
                      </CardDescription>
                    </div>
                    <Badge variant={item.isActive ? "info" : "muted"}>
                      {item.isActive ? "نشط" : "معطّل"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-4 text-sm text-muted-foreground">
                    {item.content}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setEditing(item);
                      }}
                    >
                      تعديل
                    </Button>
                    {item.isActive ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() => void setActive(item, false)}
                      >
                        تعطيل
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => void setActive(item, true)}
                      >
                        تفعيل
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
