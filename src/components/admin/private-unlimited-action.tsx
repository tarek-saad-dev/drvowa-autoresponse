"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PrivateUnlimitedAction({ businessId, businessName, assigned }: { businessId: string; businessName: string; assigned: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  async function apply() {
    if (!reason.trim() || busy) return;
    if (!window.confirm(assigned ? `إلغاء الباقة الخاصة والعودة للمجاني: ${businessName}؟` : `تفعيل DRVO Unlimited بلا موعد انتهاء للنشاط: ${businessName}؟`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${businessId}/private-unlimited`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: assigned ? "revoke" : "assign", reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "تعذر تنفيذ الإجراء");
      setExpanded(false);
      setReason("");
      setMessage("تم تحديث الاشتراك");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
    } finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2 text-xs">
    <Button variant="outline" onClick={() => setExpanded(!expanded)}>{assigned ? "إلغاء Unlimited" : "تفعيل Unlimited"}</Button>
    {expanded ? <div className="space-y-2">
      <label className="block">سبب الإجراء
        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-card px-2" />
      </label>
      <Button disabled={busy || !reason.trim()} onClick={apply}>{busy ? "جارٍ التنفيذ" : "تأكيد"}</Button>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
