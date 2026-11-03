"use client";

import { useCallback, useEffect, useState } from "react";
import { LabelCampaignLaunch } from "@/components/dashboard/label-campaign-launch";

type Preflight = {
  preflightId: string;
  isCurrentCopy: boolean;
  observedMemberships: number;
  uniqueValidPhones: number;
  duplicatePhones: number;
  invalidPhones: number;
  optedOutPhones: number;
  sendEnabled: false;
};
type Result = {
  preflights?: Preflight[];
  preflight?: Preflight;
  sendingEnabled?: boolean;
  error?: string;
};

/**
 * Recipient snapshot runs automatically and idempotently AFTER copy approval.
 * This does not start any delivery; launch still requires the owner's explicit
 * final confirmation, and the server independently enforces opt-in and STOP.
 */
export function LabelCampaignPreflight({
  draftId, messageText,
}: {
  draftId: string;
  messageText: string;
  openByDefault?: boolean;
}) {
  const [plan, setPlan] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadPlan = useCallback(async () => {
    const url = "/api/whatsapp/label-campaigns/" + draftId + "/preflight";
    const existing = await fetch(url, { cache: "no-store" });
    const data = await existing.json().catch(() => ({})) as Result;
    if (!existing.ok || data.sendingEnabled !== false || !Array.isArray(data.preflights)) {
      throw new Error(data.error || "تعذر تجهيز جمهور الحملة.");
    }
    const current = data.preflights.find(item => item.isCurrentCopy);
    if (current) return current;

    // Creates a BLOCKED, read-only snapshot, never a queued send.
    // Concurrent requests are deduplicated by the existing backend.
    const response = await fetch(url, { method: "POST" });
    const created = await response.json().catch(() => ({})) as Result;
    if (!response.ok || created.sendingEnabled !== false
      || !created.preflight || !created.preflight.isCurrentCopy) {
      throw new Error(created.error || "تعذر تجهيز قائمة المستلمين.");
    }
    return created.preflight;
  }, [draftId]);

  useEffect(() => {
    let live = true;
    setPlan(null);
    setBusy(true);
    setError(null);
    void loadPlan().then(result => {
      if (live) setPlan(result);
    }).catch(err => {
      if (live) setError(err instanceof Error ? err.message : "تعذر تجهيز الحملة.");
    }).finally(() => {
      if (live) setBusy(false);
    });
    return () => { live = false; };
  }, [loadPlan, retry]);

  if (busy) return (
    <div role="status" className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">
      بنجهّز الإرسال ونراجع المستلمين تلقائيًا…
    </div>
  );

  if (error || !plan) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
      <p className="text-sm text-warning">{error || "تعذر تجهيز الحملة."}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)}
        className="text-xs font-bold text-primary underline underline-offset-2">
        إعادة المحاولة
      </button>
    </div>
  );

  return (
    <LabelCampaignLaunch
      draftId={draftId} preflightId={plan.preflightId} messageText={messageText}
    />
  );
}
