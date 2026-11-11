import { cn } from "@/lib/utils/cn";

/**
 * Usage progress is determinate only when a finite, positive limit exists.
 * Preserve the distinct amber warning for near-limit usage.
 */
export function Progress({
  value,
  max,
  className,
  label,
}: {
  value: number;
  max: number | null | undefined;
  className?: string;
  label?: string;
}) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const unlimited = max == null || !Number.isFinite(max) || max <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((safeValue / max) * 100));
  const nearLimit = !unlimited && pct >= 85;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span dir="ltr" className="whitespace-nowrap font-medium tabular-nums">
            {unlimited ? `${safeValue} · بلا حد` : `${safeValue} / ${max}`}
          </span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={unlimited ? undefined : pct}
        aria-valuemin={unlimited ? undefined : 0}
        aria-valuemax={unlimited ? undefined : 100}
        aria-valuetext={unlimited ? `${safeValue} · بلا حد` : undefined}
        aria-label={label ?? "معدل الاستخدام"}
      >
        {!unlimited ? (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
              nearLimit ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/12 rounded-full bg-primary/40" />
        )}
      </div>
    </div>
  );
}
