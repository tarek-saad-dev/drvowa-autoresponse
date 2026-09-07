"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
import {
  ALL_KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORIES,
} from "@/constants/knowledge";
import type { KnowledgeItem } from "@/types/domain";

export function KnowledgeManager({ items }: { items: KnowledgeItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
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
      };
      if (!response.ok) {
        setError(data.error ?? "تعذر حفظ عنصر المعرفة");
        return;
      }
      setEditing(null);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setPending(false);
    }
  }

  async function deactivate(knowledgeItemId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/knowledge/${knowledgeItemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "تعذر تعطيل العنصر");
        return;
      }
      if (editing?.knowledgeItemId === knowledgeItemId) setEditing(null);
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "تعديل عنصر معرفة" : "إضافة معرفة"}
          </CardTitle>
          <CardDescription>
            معرفة يدوية قابلة للمراجعة — بدون تضمينات أو RAG في هذه المرحلة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={save}
            key={editing?.knowledgeItemId ?? "new"}
          >
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div>
              <Label htmlFor="category">التصنيف</Label>
              <Select
                id="category"
                name="category"
                defaultValue={editing?.category ?? KNOWLEDGE_CATEGORIES.FAQ}
              >
                {ALL_KNOWLEDGE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
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
                defaultValue={editing?.title ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="content">المحتوى</Label>
              <Textarea
                id="content"
                name="content"
                required
                defaultValue={editing?.content ?? ""}
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
        {items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-sm text-muted-foreground">
              لا توجد عناصر معرفة بعد.
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item.knowledgeItemId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.category}</CardDescription>
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(item)}
                  >
                    تعديل
                  </Button>
                  {item.isActive ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() => deactivate(item.knowledgeItemId)}
                    >
                      تعطيل
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
