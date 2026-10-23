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
type Field = keyof FormValues;

const CATEGORY_OPTIONS = [
  "صالون حلاقة",
  "صالون تجميل",
  "مطعم أو كافيه",
  "عقارات",
  "متجر",
  "عيادة أو مركز طبي",
  "تعليم وتدريب",
  "خدمات",
] as const;
const CUSTOM = "__custom__";

const COUNTRIES = [
  { code: "EG", label: "مصر" },
  { code: "SA", label: "السعودية" },
  { code: "AE", label: "الإمارات" },
  { code: "JO", label: "الأردن" },
  { code: "KW", label: "الكويت" },
  { code: "BH", label: "البحرين" },
  { code: "QA", label: "قطر" },
  { code: "OM", label: "عُمان" },
] as const;

const TIMEZONES = [
  { value: "Africa/Cairo", label: "القاهرة" },
  { value: "Asia/Riyadh", label: "الرياض" },
  { value: "Asia/Dubai", label: "دبي" },
  { value: "Asia/Amman", label: "عمّان" },
  { value: "Asia/Kuwait", label: "الكويت" },
  { value: "Asia/Bahrain", label: "البحرين" },
  { value: "Asia/Qatar", label: "الدوحة" },
  { value: "Asia/Muscat", label: "مسقط" },
] as const;

const LANGUAGES = [
  { value: "ar-SA", label: "العربية" },
  { value: "en-US", label: "English" },
] as const;

const fields: Field[] = [
  "name",
  "category",
  "countryCode",
  "locale",
  "timezone",
];

function businessInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
  }
  return Array.from(words[0] ?? "").slice(0, 2).join("").toUpperCase() || "—";
}

function initialValues(business: Business): FormValues {
  return {
    name: business.name,
    category: business.category,
    countryCode: business.countryCode,
    locale: business.locale,
    timezone: business.timezone,
  };
}

export function BusinessSettingsForm({ business }: { business: Business }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => initialValues(business));
  const [savedValues, setSavedValues] = useState<FormValues>(() => initialValues(business));
  const [customCategory, setCustomCategory] = useState(
    CATEGORY_OPTIONS.some((value) => value === business.category) ? "" : business.category,
  );
  const [customCountry, setCustomCountry] = useState(
    COUNTRIES.some((item) => item.code === business.countryCode) ? "" : business.countryCode,
  );
  const [customTimezone, setCustomTimezone] = useState(
    TIMEZONES.some((item) => item.value === business.timezone) ? "" : business.timezone,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categoryChoice = CATEGORY_OPTIONS.some((value) => value === values.category)
    ? values.category
    : CUSTOM;
  const countryChoice = COUNTRIES.some((item) => item.code === values.countryCode)
    ? values.countryCode
    : CUSTOM;
  const timezoneChoice = TIMEZONES.some((item) => item.value === values.timezone)
    ? values.timezone
    : CUSTOM;
  const dirty = fields.some(
    (field) => values[field].trim() !== savedValues[field].trim(),
  );

  const countryLabel =
    COUNTRIES.find((item) => item.code === values.countryCode)?.label ??
    values.countryCode;
  const languageLabel =
    LANGUAGES.find((item) => item.value === values.locale)?.label ??
    values.locale;
  const timezoneLabel =
    TIMEZONES.find((item) => item.value === values.timezone)?.label ??
    values.timezone;

  function updateField(field: Field, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setError(null);
    setSuccess(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;

    const payload: FormValues = {
      name: values.name.trim(),
      category: values.category.trim(),
      countryCode: values.countryCode.trim().toUpperCase(),
      locale: values.locale.trim(),
      timezone: values.timezone.trim(),
    };
    if (!payload.name || !payload.category || !/^[A-Z]{2}$/.test(payload.countryCode) ||
        !payload.locale || !payload.timezone) {
      setError("راجع البيانات المدخلة قبل الحفظ.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/businesses/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        business?: Partial<FormValues>;
      };
      if (!response.ok) {
        setError(data.error ?? "تعذّر حفظ التغييرات. جرّب مرة تانية.");
        return;
      }
      const updated: FormValues = { ...payload, ...data.business };
      setValues(updated);
      setSavedValues(updated);
      setSuccess("تم حفظ التغييرات.");
      router.refresh();
    } catch {
      setError("حصلت مشكلة في الاتصال. حاول مرة تانية.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-5 sm:px-7">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-black text-primary"
        >
          {businessInitials(values.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-black">{values.name.trim() || "اسم النشاط"}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {values.category.trim() || "نوع النشاط"}
          </p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
        <fieldset disabled={pending} className="space-y-5">
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
            <Select
              id="business-category"
              name="category-choice"
              value={categoryChoice}
              onChange={(event) =>
                updateField(
                  "category",
                  event.target.value === CUSTOM ? customCategory : event.target.value,
                )
              }
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
              <option value={CUSTOM}>نشاط آخر...</option>
            </Select>
            {categoryChoice === CUSTOM ? (
              <Input
                id="business-custom-category"
                aria-label="اكتب نوع النشاط"
                name="category"
                className="mt-2"
                placeholder="اكتب نوع النشاط"
                required
                maxLength={120}
                value={values.category}
                onChange={(event) => {
                  setCustomCategory(event.target.value);
                  updateField("category", event.target.value);
                }}
              />
            ) : null}
          </div>

          <details className="group border-t border-border/70 pt-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-black">اللغة والمنطقة</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {countryLabel} · {languageLabel} · {timezoneLabel}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-90">‹</span>
            </summary>

            <div className="mt-5 grid gap-4 border-t border-border/50 pt-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business-country">الدولة</Label>
                <Select
                  id="business-country"
                  value={countryChoice}
                  onChange={(event) =>
                    updateField(
                      "countryCode",
                      event.target.value === CUSTOM ? customCountry : event.target.value,
                    )
                  }
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                  <option value={CUSTOM}>دولة أخرى...</option>
                </Select>
                {countryChoice === CUSTOM ? (
                  <Input
                    aria-label="كود الدولة"
                    dir="ltr"
                    className="text-start"
                    placeholder="كود الدولة (EG)"
                    required
                    maxLength={2}
                    minLength={2}
                    pattern="[A-Za-z]{2}"
                    value={values.countryCode}
                    onChange={(event) => {
                      setCustomCountry(event.target.value);
                      updateField("countryCode", event.target.value);
                    }}
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-locale">اللغة</Label>
                <Select
                  id="business-locale"
                  value={values.locale}
                  onChange={(event) => updateField("locale", event.target.value)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                  {!LANGUAGES.some((item) => item.value === values.locale) ? (
                    <option value={values.locale}>{values.locale}</option>
                  ) : null}
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="business-timezone">المنطقة الزمنية</Label>
                <Select
                  id="business-timezone"
                  value={timezoneChoice}
                  onChange={(event) =>
                    updateField(
                      "timezone",
                      event.target.value === CUSTOM ? customTimezone : event.target.value,
                    )
                  }
                >
                  {TIMEZONES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                  <option value={CUSTOM}>منطقة زمنية أخرى...</option>
                </Select>
                {timezoneChoice === CUSTOM ? (
                  <Input
                    aria-label="المنطقة الزمنية المخصصة"
                    dir="ltr"
                    className="text-start"
                    placeholder="Africa/Cairo"
                    required
                    value={values.timezone}
                    onChange={(event) => {
                      setCustomTimezone(event.target.value);
                      updateField("timezone", event.target.value);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </details>
        </fieldset>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <div className="flex justify-end border-t border-border/70 pt-5">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </Button>
        </div>
      </div>
    </form>
  );
}
