"use client";

import { FormEvent, useMemo, useState } from "react";
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
import type { Location } from "@/types/domain";

function locationSummary(location: Location): string {
  return [location.city, location.addressLine].filter(Boolean).join(" — ")
    || "لسه مفيش عنوان مضاف";
}

export function LocationsManager({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [formOpen, setFormOpen] = useState(locations.length === 0);

  const activeCount = useMemo(
    () => locations.filter((location) => location.isActive).length,
    [locations],
  );

  function openNew() {
    setEditing(null);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(location: Location) {
    setEditing(location);
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (pending) return;
    setEditing(null);
    setError(null);
    setFormOpen(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setPending(true);
    setError(null);

    const form = new FormData(formEl);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      code: String(form.get("code") ?? "").trim() || null,
      city: String(form.get("city") ?? "").trim() || null,
      addressLine: String(form.get("addressLine") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
      timezone: String(form.get("timezone") ?? "").trim() || null,
    };

    try {
      const response = await fetch(
        editing ? `/api/locations/${editing.locationId}` : "/api/locations",
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
        setError(data.error ?? "تعذر حفظ الفرع");
        return;
      }

      setEditing(null);
      setFormOpen(false);
      formEl.reset();
      router.refresh();
    } catch {
      setError("حصلت مشكلة في الاتصال. جرّب تاني.");
    } finally {
      setPending(false);
    }
  }

  async function remove(location: Location) {
    const confirmed = window.confirm(
      `متأكد إنك عايز تحذف "${location.name}"؟`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/locations/${location.locationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "تعذر حذف الفرع");
        return;
      }

      if (editing?.locationId === location.locationId) {
        setEditing(null);
        setFormOpen(false);
      }

      router.refresh();
    } catch {
      setError("حصلت مشكلة في الاتصال. جرّب تاني.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-bold text-muted-foreground">إجمالي الفروع</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{locations.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-bold text-muted-foreground">الفروع النشطة</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{activeCount}</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="group rounded-2xl border border-primary/20 bg-primary/5 p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/8"
        >
          <p className="text-[11px] font-black text-primary">إجراء سريع</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-black">أضف فرع جديد</span>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-lg text-primary-foreground transition group-hover:scale-105">＋</span>
          </div>
        </button>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">فروعك</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                عدّل البيانات أو افتح فرع جديد من غير ما تدخل في إعدادات معقدة.
              </p>
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-surface/40 p-8 text-center">
              <div className="text-4xl">⌖</div>
              <h3 className="mt-3 text-lg font-black">ابدأ بأول فرع</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                ضيف اسم الفرع، المدينة، والعنوان. تقدر تكمل أي تفاصيل ناقصة بعدين.
              </p>
              <Button type="button" onClick={openNew} className="mt-5">
                أضف أول فرع
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {locations.map((location) => (
                <Card
                  key={location.locationId}
                  className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          {location.name}
                        </CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">
                          {locationSummary(location)}
                        </CardDescription>
                      </div>
                      <Badge variant={location.isActive ? "success" : "muted"}>
                        {location.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-2 text-xs text-muted-foreground">
                      {location.phone ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                          <span>الهاتف</span>
                          <span dir="ltr" className="font-bold text-foreground">
                            {location.phone}
                          </span>
                        </div>
                      ) : null}
                      {location.code ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                          <span>الكود</span>
                          <span className="font-bold text-foreground">{location.code}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openEdit(location)}
                      >
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void remove(location)}
                        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                      >
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <aside>
          {formOpen ? (
            <Card className="sticky top-20 overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black text-primary">
                      {editing ? "تعديل الفرع" : "فرع جديد"}
                    </p>
                    <CardTitle className="mt-1 text-lg">
                      {editing ? editing.name : "ضيف بيانات الفرع"}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      الاسم مطلوب، والباقي تقدر تكمله حسب المتاح.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={closeForm}
                    disabled={pending}
                    className="rounded-xl"
                  >
                    إغلاق
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={save}
                  key={editing?.locationId ?? "new"}
                >
                  <div>
                    <Label htmlFor="name">اسم الفرع</Label>
                    <Input
                      id="name"
                      name="name"
                      required
                      autoFocus
                      placeholder="مثال: فرع جليم"
                      defaultValue={editing?.name ?? ""}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <Label htmlFor="city">المدينة</Label>
                      <Input
                        id="city"
                        name="city"
                        placeholder="مثال: الإسكندرية"
                        defaultValue={editing?.city ?? ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="code">كود الفرع</Label>
                      <Input
                        id="code"
                        name="code"
                        placeholder="اختياري"
                        defaultValue={editing?.code ?? ""}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="addressLine">العنوان</Label>
                    <Input
                      id="addressLine"
                      name="addressLine"
                      placeholder="الشارع، المنطقة، علامة مميزة..."
                      defaultValue={editing?.addressLine ?? ""}
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">رقم الفرع</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="اختياري"
                      defaultValue={editing?.phone ?? ""}
                      dir="ltr"
                      className="text-start"
                    />
                  </div>

                  <details className="rounded-2xl border border-border bg-surface/40 p-3">
                    <summary className="cursor-pointer text-xs font-black text-muted-foreground">
                      إعدادات متقدمة
                    </summary>
                    <div className="mt-3">
                      <Label htmlFor="timezone">المنطقة الزمنية</Label>
                      <Input
                        id="timezone"
                        name="timezone"
                        placeholder="مثال: Africa/Cairo"
                        defaultValue={editing?.timezone ?? ""}
                        dir="ltr"
                        className="text-start"
                      />
                    </div>
                  </details>

                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={pending} className="flex-1">
                      {pending
                        ? "جارٍ الحفظ..."
                        : editing
                          ? "حفظ التعديل"
                          : "إضافة الفرع"}
                    </Button>
                    {editing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={openNew}
                        disabled={pending}
                      >
                        فرع جديد
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <button
              type="button"
              onClick={openNew}
              className="sticky top-20 flex min-h-56 w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-surface/30 p-6 text-center transition hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-2xl text-primary">
                ＋
              </span>
              <span className="mt-3 font-black">ضيف فرع أو موقع جديد</span>
              <span className="mt-1 text-sm leading-6 text-muted-foreground">
                الفورم هيفتح هنا من غير ما يخرجك من الصفحة.
              </span>
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
