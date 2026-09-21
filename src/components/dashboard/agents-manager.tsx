"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { Agent } from "@/types/domain";

const INSTRUCTIONS_MAX = 2000;

export function AgentsManager({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [instructionsLen, setInstructionsLen] = useState(0);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function beginEdit(agent: Agent) {
    // Only confirm when abandoning another in-progress edit.
    // An empty create draft must not block opening an existing receptionist.
    if (dirty && editing && editing.agentId !== agent.agentId) {
      const ok = window.confirm(
        "لديك تعديلات غير محفوظة. هل تريد فتح سجل آخر؟",
      );
      if (!ok) return;
    }
    setError(null);
    setSuccess(null);
    setEditing(agent);
    setInstructionsLen((agent.instructions ?? "").length);
    setDirty(false);
  }

  function markDirty() {
    setDirty(true);
    setSuccess(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setPending(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(formEl);
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
        code?: string;
      };
      if (!response.ok) {
        setError(
          mapUserFacingError(data, "تعذر حفظ موظف الاستقبال. حاول مرة أخرى."),
        );
        return;
      }
      setDirty(false);
      setEditing(null);
      formEl.reset();
      setSuccess("تم حفظ شخصية موظف الاستقبال.");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setPending(false);
    }
  }

  async function remove(agentId: string) {
    const ok = window.confirm(
      "حذف موظف الاستقبال نهائي لهذا السجل. هل تريد المتابعة؟",
    );
    if (!ok) return;

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        setError(mapUserFacingError(data, "تعذر حذف موظف الاستقبال."));
        return;
      }
      if (editing?.agentId === agentId) setEditing(null);
      setDirty(false);
      setSuccess("تم الحذف.");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setPending(false);
    }
  }

  function cancelEdit() {
    if (dirty) {
      const ok = window.confirm("لديك تعديلات غير محفوظة. هل تريد إلغاءها؟");
      if (!ok) return;
    }
    setEditing(null);
    setDirty(false);
    setError(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "تعديل موظف الاستقبال" : "شخصية موظف الاستقبال"}
          </CardTitle>
          <CardDescription>
            عرّف كيف يتحدث مع عملائك. التغييرات تُطبَّق على الردود الجديدة بعد
            الحفظ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={save}
            key={editing?.agentId ?? "new"}
            onChange={markDirty}
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
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={80}
                defaultValue={editing?.name ?? ""}
                placeholder="مثال: سارة"
              />
            </div>
            <div>
              <Label htmlFor="roleTitle">المسمى</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                maxLength={80}
                defaultValue={editing?.roleTitle ?? "موظف استقبال"}
                placeholder="موظف استقبال"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="language">اللغة</Label>
                <Input
                  id="language"
                  name="language"
                  defaultValue={editing?.language ?? "ar"}
                  placeholder="ar"
                />
              </div>
              <div>
                <Label htmlFor="dialect">اللهجة</Label>
                <Input
                  id="dialect"
                  name="dialect"
                  defaultValue={editing?.dialect ?? ""}
                  placeholder="مثال: بيضاء · خليجية · مصرية"
                />
              </div>
              <div>
                <Label htmlFor="tone">النبرة</Label>
                <Input
                  id="tone"
                  name="tone"
                  defaultValue={editing?.tone ?? ""}
                  placeholder="مثال: مهني وودود"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="instructions">تعليمات السلوك</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                مثال: رحّب بالعميل، اسأل عن الخدمة المطلوبة، لا تعد بمواعيد دون
                تأكيد، ووجّه للطوارئ لرقم المحل.
              </p>
              <Textarea
                id="instructions"
                name="instructions"
                rows={5}
                maxLength={INSTRUCTIONS_MAX}
                placeholder="اكتب كيف يجب أن يتصرف موظف الاستقبال مع العملاء…"
                defaultValue={editing?.instructions ?? ""}
                onChange={(e) => {
                  setInstructionsLen(e.target.value.length);
                  markDirty();
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                {instructionsLen} / {INSTRUCTIONS_MAX}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={pending}
                data-testid={editing ? "agent-save-edit" : "agent-create"}
              >
                {pending
                  ? "جارٍ الحفظ..."
                  : editing
                    ? "حفظ التعديل"
                    : "إنشاء"}
              </Button>
              {editing ? (
                <Button type="button" variant="ghost" onClick={cancelEdit}>
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
              لا يوجد موظف استقبال بعد. أنشئ شخصيته من النموذج المجاور.
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
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="agent-edit"
                    onClick={() => beginEdit(agent)}
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => void remove(agent.agentId)}
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
