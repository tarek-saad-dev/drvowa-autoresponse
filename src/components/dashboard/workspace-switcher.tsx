"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Select } from "@/components/ui/select";
import type { Business } from "@/types/domain";

export function WorkspaceSwitcher({
  businesses,
  activeBusinessId,
}: {
  businesses: Business[];
  activeBusinessId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (businesses.length === 0) {
    return null;
  }

  async function onChange(businessId: string) {
    if (businessId === activeBusinessId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/businesses/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "تعذر تبديل مساحة العمل");
        return;
      }
      router.refresh();
    } catch {
      setError("تعذر تبديل مساحة العمل");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        aria-label="مساحة العمل"
        className="h-9 min-w-40 text-sm"
        disabled={pending || businesses.length < 2}
        value={activeBusinessId ?? businesses[0]?.businessId}
        onChange={(e) => onChange(e.target.value)}
      >
        {businesses.map((business) => (
          <option key={business.businessId} value={business.businessId}>
            {business.name}
          </option>
        ))}
      </Select>
      {error ? (
        <p className="max-w-48 text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
