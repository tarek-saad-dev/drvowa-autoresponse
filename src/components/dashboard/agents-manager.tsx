"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  const dialectRef = useRef<HTMLInputElement | null>(null);
  const toneRef = useRef<HTMLInputElement | null>(null);
  const instructionsRef = useRef<HTMLTextAreaElement | null>(null);

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

  function applyStylePreset(dialect: string, tone: string) {
    if (dialectRef.current) dialectRef.current.value = dialect;
    if (toneRef.current) toneRef.current.value = tone;
    markDirty();
  }

  function addInstruction(text: string) {
    const current = instructionsRef.current?.value?.trim() ?? "";
    const next = current ? `${current}\n${text}` : text;
    if (instructionsRef.current) {
      instructionsRef.current.value = next.slice(0, INSTRUCTIONS_MAX);
      setInstructionsLen(instructionsRef.current.value.length);
    }
    markDirty();
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
    <div className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "عدّل شخصية الموظف" : "خلّي طريقته شبه فريقك"}
          </CardTitle>
          <CardDescription>
            الاسم واللهجة والنبرة والتعليمات اللي عايزه يمشي عليها مع العملاء.
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
              <Label htmlFor="name">اسم الموظف</Label>
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
              <Label htmlFor="roleTitle">هيقدم نفسه بإيه؟</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                maxLength={80}
                defaultValue={editing?.roleTitle ?? "موظف استقبال"}
                placeholder="موظف استقبال"
              />
            </div>
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
              <p className="text-xs font-black text-primary">اختار ستايل جاهز</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                ابدأ بستايل قريب من فريقك وبعدها عدّل أي حاجة.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["مصرية", "ودود وبسيط", "مصري وودود"],
                  ["بيضاء", "مهني ومختصر", "مهني مختصر"],
                  ["فصحى", "رسمي وهادئ", "رسمي هادي"],
                ].map(([dialect, tone, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyStylePreset(dialect, tone)}
                    className="rounded-full border border-border bg-white px-3 py-2 text-[11px] font-black transition hover:border-primary/40 hover:text-primary"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="language">اللغة</Label>
                <Select
                  id="language"
                  name="language"
                  defaultValue={editing?.language ?? "ar"}
                >
                  {editing?.language && !["ar", "en"].includes(editing.language) ? (
                    <option value={editing.language}>{editing.language}</option>
                  ) : null}
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="dialect">اللهجة</Label>
                <Input
                  ref={dialectRef}
                  id="dialect"
                  name="dialect"
                  list="dialect-options"
                  defaultValue={editing?.dialect ?? ""}
                  placeholder="مثال: مصرية"
                />
                <datalist id="dialect-options">
                  <option value="مصرية" />
                  <option value="بيضاء" />
                  <option value="سعودية" />
                  <option value="خليجية" />
                  <option value="فصحى" />
                </datalist>
              </div>
              <div>
                <Label htmlFor="tone">النبرة</Label>
                <Input
                  ref={toneRef}
                  id="tone"
                  name="tone"
                  list="tone-options"
                  defaultValue={editing?.tone ?? ""}
                  placeholder="مثال: مهني وودود"
                />
                <datalist id="tone-options">
                  <option value="ودود وبسيط" />
                  <option value="مهني وودود" />
                  <option value="مهني ومختصر" />
                  <option value="رسمي وهادئ" />
                </datalist>
              </div>
            </div>
            <div>
              <Label htmlFor="instructions">قواعد مهمة يمشي عليها</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                اكتب له الحاجات اللي لازم يعملها أو يتجنبها في الرد.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  "ما تخترعش أسعار أو معلومات مش موجودة.",
                  "خلي الردود قصيرة ومناسبة لواتساب.",
                  "لو المعلومة مش معروفة، قول للعميل إن حد من الفريق هيساعده.",
                ].map((rule) => (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => addInstruction(rule)}
                    className="rounded-full bg-surface px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition hover:bg-primary/5 hover:text-primary"
                  >
                    + {rule}
                  </button>
                ))}
              </div>
              <Textarea
                ref={instructionsRef}
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
                {pending ? "جاري الحفظ..." : editing ? "احفظ التعديلات" : "جهّز الموظف"}
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
              لسه معندكش شخصية موظف جاهزة. ابدأ من النموذج وحدد أسلوبه في دقايق.
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
