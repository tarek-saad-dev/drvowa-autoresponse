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
import { Textarea } from "@/components/ui/textarea";
import type { Agent } from "@/types/domain";

export function AgentsManager({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      roleTitle: String(form.get("roleTitle") ?? ""),
      language: String(form.get("language") ?? "ar"),
      dialect: String(form.get("dialect") ?? "") || null,
      tone: String(form.get("tone") ?? "") || null,
      instructions: String(form.get("instructions") ?? "") || null,
    };

    try {
      const response = await fetch(
        editing ? `/api/agents/${editing.agentId}` : "/api/agents",
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
        setError(data.error ?? "تعذر حفظ الوكيل");
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

  async function remove(agentId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "تعذر حذف الوكيل");
        return;
      }
      if (editing?.agentId === agentId) setEditing(null);
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
          <CardTitle>{editing ? "تعديل الوكيل" : "إنشاء وكيل"}</CardTitle>
          <CardDescription>
            إعداد موظف الاستقبال دون تشغيل نماذج الذكاء الاصطناعي بعد.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={save} key={editing?.agentId ?? "new"}>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div>
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={editing?.name ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="roleTitle">المسمى</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                defaultValue={editing?.roleTitle ?? "AI receptionist"}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="language">اللغة</Label>
                <Input
                  id="language"
                  name="language"
                  defaultValue={editing?.language ?? "ar"}
                />
              </div>
              <div>
                <Label htmlFor="dialect">اللهجة</Label>
                <Input
                  id="dialect"
                  name="dialect"
                  defaultValue={editing?.dialect ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="tone">النبرة</Label>
                <Input id="tone" name="tone" defaultValue={editing?.tone ?? ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="instructions">التعليمات</Label>
              <Textarea
                id="instructions"
                name="instructions"
                defaultValue={editing?.instructions ?? ""}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "جارٍ الحفظ..." : editing ? "حفظ التعديل" : "إنشاء"}
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
        {agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-sm text-muted-foreground">
              لا يوجد وكلاء بعد. أنشئ أول وكيل استقبال.
            </CardContent>
          </Card>
        ) : (
          agents.map((agent) => (
            <Card key={agent.agentId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <CardDescription>{agent.roleTitle}</CardDescription>
                  </div>
                  <Badge variant={agent.isActive ? "success" : "muted"}>
                    {agent.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  اللغة: {agent.language}
                  {agent.dialect ? ` · ${agent.dialect}` : ""}
                  {agent.tone ? ` · ${agent.tone}` : ""}
                </p>
                {agent.instructions ? (
                  <p className="line-clamp-3">{agent.instructions}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(agent)}
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => remove(agent.agentId)}
                  >
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
