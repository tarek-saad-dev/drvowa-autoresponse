"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
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
import type { Business } from "@/types/domain";

export function BusinessSettingsForm({ business }: { business: Business }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? ""),
      countryCode: String(form.get("countryCode") ?? ""),
      locale: String(form.get("locale") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
    };

    try {
      const response = await fetch("/api/businesses/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "تعذر حفظ الإعدادات");
        return;
      }
      setSuccess("تم حفظ إعدادات النشاط.");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>إعدادات النشاط</CardTitle>
        <CardDescription>
          تحديث بيانات مساحة العمل الحالية ({business.slug})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert variant="error">{error}</Alert> : null}
          {success ? <Alert variant="success">{success}</Alert> : null}
          <div>
            <Label htmlFor="name">اسم النشاط</Label>
            <Input id="name" name="name" required defaultValue={business.name} />
          </div>
          <div>
            <Label htmlFor="category">التصنيف</Label>
            <Input
              id="category"
              name="category"
              required
              defaultValue={business.category}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="countryCode">الدولة</Label>
              <Input
                id="countryCode"
                name="countryCode"
                required
                defaultValue={business.countryCode}
              />
            </div>
            <div>
              <Label htmlFor="locale">اللغة المحلية</Label>
              <Select id="locale" name="locale" defaultValue={business.locale}>
                <option value="ar-SA">ar-SA</option>
                <option value="en-US">en-US</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">المنطقة الزمنية</Label>
              <Input
                id="timezone"
                name="timezone"
                required
                defaultValue={business.timezone}
                dir="ltr"
                className="text-start"
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
