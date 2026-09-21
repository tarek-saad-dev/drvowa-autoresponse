import { cn } from "@/lib/utils/cn";

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
  const unlimited = max == null || max <= 0;
  const pct = unlimited
    ? 0
    : Math.min(100, Math.round((Math.max(0, value) / max) * 100));
  const nearLimit = !unlimited && pct >= 85;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium tabular-nums">
            {unlimited ? `${value} · بلا حد` : `${value} / ${max}`}
          </span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={unlimited ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {!unlimited ? (
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
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
