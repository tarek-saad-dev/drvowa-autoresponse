"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Business } from "@/types/domain";

type FormValues = Pick<
  Business,
  "name" | "category" | "countryCode" | "locale" | "timezone"
>;

const editableFields: (keyof FormValues)[] = [
  "name",
  "category",
  "countryCode",
  "locale",
  "timezone",
];

export function BusinessSettingsForm({ business }: { business: Business }) {
  const router = useRouter();
  const initialValues: FormValues = {
    name: business.name,
    category: business.category,
    countryCode: business.countryCode,
    locale: business.locale,
    timezone: business.timezone,
  };
  const [values, setValues] = useState<FormValues>(initialValues);
  const [savedValues, setSavedValues] = useState<FormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const hasChanges = editableFields.some(
    (field) => values[field].trim() !== savedValues[field].trim(),
  );

  function updateField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !hasChanges) return;

    const payload: FormValues = {
      name: values.name.trim(),
      category: values.category.trim(),
      countryCode: values.countryCode.trim().toUpperCase(),
      locale: values.locale,
      timezone: values.timezone.trim(),
    };

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/businesses/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "تعذّر حفظ التغييرات. حاول مرة تانية.");
        return;
      }
      setValues(payload);
      setSavedValues(payload);
      setSuccess("تم حفظ التغييرات بنجاح.");
      router.refresh();
    } catch {
      setError("تعذّر الاتصال. اتأكد من الإنترنت وحاول مرة تانية.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-4 pt-5 sm:px-6">
        <h2 className="text-base font-black">بيانات النشاط</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          الاسم والتصنيف اللي بيظهروا داخل التطبيق.
        </p>
      </div>
      <form className="space-y-5 px-4 pb-5 pt-5 sm:px-6" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="business-name">اسم النشاط</Label>
          <Input
            id="business-name"
            name="name"
            autoComplete="organization"
            required
            maxLength={120}
            value={values.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-category">نوع النشاط</Label>
          <Input
            id="business-category"
            name="category"
            required
            maxLength={120}
            placeholder="مثال: صالون حلاقة"
            value={values.category}
            onChange={(event) => updateField("category", event.target.value)}
          />
        </div>

        <details className="group border-t border-border pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold marker:hidden focus-visible:outline-none focus-visible:text-primary [&::-webkit-details-marker]:hidden">
            <span>اللغة والمنطقة الزمنية</span>
            <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-90">‹</span>
          </summary>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            إعدادات إضافية غالبًا مش هتحتاج تغيّرها.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-country">كود الدولة</Label>
              <Input
                id="business-country"
                name="countryCode"
                dir="ltr"
                className="text-start"
                required
                minLength={2}
                maxLength={2}
                value={values.countryCode}
                onChange={(event) => updateField("countryCode", event.target.value)}
                placeholder="EG"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-locale">لغة النظام</Label>
              <Select
                id="business-locale"
                name="locale"
                value={values.locale}
                onChange={(event) => updateField("locale", event.target.value)}
              >
                {!["ar-SA", "en-US"].includes(values.locale) ? (
                  <option value={values.locale}>{values.locale}</option>
                ) : null}
                <option value="ar-SA">العربية</option>
                <option value="en-US">English</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="business-timezone">المنطقة الزمنية</Label>
              <Input
                id="business-timezone"
                name="timezone"
                required
                dir="ltr"
                className="text-start"
                value={values.timezone}
                onChange={(event) => updateField("timezone", event.target.value)}
                placeholder="Africa/Cairo"
              />
            </div>
          </div>
        </details>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}
        <div className="flex items-center justify-end border-t border-border pt-4">
          <Button type="submit" disabled={pending || !hasChanges}>
            {pending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </Button>
        </div>
      </form>
    </section>
  );
}
