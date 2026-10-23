import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import { cn } from "@/lib/utils/cn";

const toneStyles: Record<ReceptionistStatus["tone"], string> = {
  success: "border-success/20 bg-success-soft/35",
  warning: "border-warning/25 bg-warning-soft/40",
  danger: "border-destructive/25 bg-destructive-soft/50",
  neutral: "border-border bg-card",
};

const dotStyles: Record<ReceptionistStatus["tone"], string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

export function ReceptionistStatusCard({
  status,
}: {
  status: ReceptionistStatus;
}) {
  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-2xl border px-4 py-4 sm:px-5 sm:py-5",
        toneStyles[status.tone],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                dotStyles[status.tone],
                status.kind === "working" && "motion-safe:animate-pulse",
              )}
              aria-hidden
            />
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">
              {status.headline}
            </h1>
          </div>
          <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
            {status.detail}
          </p>
          <p className="mt-2 text-xs font-bold text-foreground/70">
            {status.whatsappLine}
          </p>
        </div>

        {status.action ? (
          <Link href={status.action.href} className="shrink-0">
            <Button size="sm">{status.action.label}</Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
