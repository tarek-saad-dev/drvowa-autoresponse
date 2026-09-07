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
import type { Location } from "@/types/domain";

export function LocationsManager({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? "") || null,
      city: String(form.get("city") ?? "") || null,
      addressLine: String(form.get("addressLine") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      timezone: String(form.get("timezone") ?? "") || null,
    };

    try {
      const response = await fetch(
        editing
          ? `/api/locations/${editing.locationId}`
          : "/api/locations",
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
        setError(data.error ?? "تعذر حفظ الموقع");
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

  async function remove(locationId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "تعذر حذف الموقع");
        return;
      }
      if (editing?.locationId === locationId) setEditing(null);
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
          <CardTitle>{editing ? "تعديل موقع" : "إضافة موقع"}</CardTitle>
          <CardDescription>فروع أو مواقع النشاط المرتبطة بمساحة العمل.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={save}
            key={editing?.locationId ?? "new"}
          >
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="code">الرمز</Label>
                <Input
                  id="code"
                  name="code"
                  defaultValue={editing?.code ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="city">المدينة</Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={editing?.city ?? ""}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="addressLine">العنوان</Label>
              <Input
                id="addressLine"
                name="addressLine"
                defaultValue={editing?.addressLine ?? ""}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">الهاتف</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={editing?.phone ?? ""}
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <div>
                <Label htmlFor="timezone">المنطقة الزمنية</Label>
                <Input
                  id="timezone"
                  name="timezone"
                  defaultValue={editing?.timezone ?? ""}
                  dir="ltr"
                  className="text-start"
                />
              </div>
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
        {locations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-sm text-muted-foreground">
              لا توجد مواقع بعد.
            </CardContent>
          </Card>
        ) : (
          locations.map((location) => (
            <Card key={location.locationId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{location.name}</CardTitle>
                    <CardDescription>
                      {[location.city, location.code].filter(Boolean).join(" · ") ||
                        "بدون تفاصيل إضافية"}
                    </CardDescription>
                  </div>
                  <Badge variant={location.isActive ? "success" : "muted"}>
                    {location.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {location.addressLine ? <p>{location.addressLine}</p> : null}
                {location.phone ? <p dir="ltr">{location.phone}</p> : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(location)}
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => remove(location.locationId)}
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
