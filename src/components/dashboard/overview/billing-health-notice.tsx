import Link from "next/link";
import type { HomeBillingAlert } from "@/lib/dashboard/billing-alert";

export function BillingHealthNotice({ alert }: { alert: HomeBillingAlert | null }) {
  if (!alert) return null;

  return (
    <section
      role="alert"
      aria-label="حالة الاشتراك وحدود الاستخدام"
      dir="rtl"
      className="rounded-[22px] border border-warning/30 bg-warning-soft/60 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-warning/30 bg-card text-sm font-black text-warning"
          >
            !
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground sm:text-base">{alert.title}</h2>
            <p className="mt-1 text-xs leading-6 text-foreground/85 sm:text-sm">{alert.description}</p>
            {alert.detail ? <p className="mt-1 text-xs leading-6 text-muted-foreground">{alert.detail}</p> : null}
          </div>
        </div>
        <Link
          href="/dashboard/billing"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-xs font-black text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {alert.actionLabel}
          <span aria-hidden="true" className="mr-2">←</span>
        </Link>
      </div>
    </section>
  );
}
