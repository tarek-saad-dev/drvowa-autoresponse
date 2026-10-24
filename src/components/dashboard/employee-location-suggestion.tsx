"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizedLocationName,
  type LocationSuggestion,
} from "@/lib/knowledge/location-from-fact";

type Location = {
  locationId: string;
  name: string;
  addressLine: string | null;
  phone: string | null;
};

export function EmployeeLocationSuggestion({ suggestion }: { suggestion: LocationSuggestion }) {
  const [name, setName] = useState(suggestion.name);
  const [address, setAddress] = useState(suggestion.addressLine);
  const [phone, setPhone] = useState(suggestion.phone);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const listResponse = await fetch("/api/locations", { cache: "no-store" });
      const listData = (await listResponse.json().catch(() => ({}))) as {
        locations?: Location[]; error?: string;
      };
      if (!listResponse.ok || !listData.locations) throw new Error("تعذر مراجعة الفروع الموجودة. مش هنضيف فرع قبل ما نتأكد إنه مش مكرر.");
      const matches = listData.locations.filter((loc) =>
        normalizedLocationName(loc.name) === normalizedLocationName(name)
      );
      if (matches.length > 1) {
        throw new Error("في أكتر من سجل بنفس اسم الفرع. راجع الفروع الموجودة قبل الحفظ.");
      }
      const existing = matches[0];
      const body = existing
        ? {
            name: name.trim(),
            ...(address.trim() ? { addressLine: address.trim() } : {}),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          }
        : { name: name.trim(), addressLine: address.trim() || null, phone: phone.trim() || null };
      const response = await fetch(existing ? "/api/locations/" + existing.locationId : "/api/locations", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { location?: Location; error?: string };
      if (!response.ok || !data.location) throw new Error("تعذر حفظ بيانات الفرع. المعلومات اللي اتعلمها الموظف لسه محفوظة.");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الفرع.");
    } finally {
      setSaving(false);
    }
  }

  if (dismissed) return null;
  return (
    <aside className="rounded-2xl border border-primary/25 bg-primary/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black">{saved ? "بيانات الفرع محفوظة ✓" : "تعلمت معلومات عن فرع"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {saved ? "تقدر تعلّمه أي معلومة جديدة." : "تقدر تحفظ الفرع كبيانات منظمة كمان، من غير ما تدخل صفحة إعدادات منفصلة."}
          </p>
        </div>
        {!saved ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "إخفاء" : "مراجعة الفرع"}
          </Button>
        ) : null}
      </div>
      {!saved && expanded ? (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div>
            <Label htmlFor="teaching-location-name">اسم الفرع</Label>
            <Input id="teaching-location-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="teaching-location-address">العنوان (اختياري)</Label>
            <Input id="teaching-location-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="اكتبه لو محددتوش في الشات" />
          </div>
          <div>
            <Label htmlFor="teaching-location-phone">هاتف الفرع (اختياري)</Label>
            <Input id="teaching-location-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
          </div>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saving || !name.trim()} size="sm" onClick={() => void save()}>
              {saving ? "بنحفظ..." : "تأكيد حفظ الفرع"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDismissed(true)}>مش دلوقتي</Button>
          </div>
        </div>
      ) : null}
      {error && !expanded ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
      {!saved ? <Link href="/dashboard/locations" className="mt-2 inline-block text-[11px] text-muted-foreground underline-offset-2 hover:underline">إدارة بيانات الفروع القديمة</Link> : null}
    </aside>
  );
}
