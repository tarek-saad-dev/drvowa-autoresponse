import Link from "next/link";

import { Button } from "@/components/ui/button";

export function HumanInterventionBanner({
  count,
}: {
  count: number;
}) {
  if (count <= 0) return null;

  const title =
    count === 1
      ? "في عميل محتاج متابعتك"
      : `في ${count} عملاء محتاجين متابعتك`;

  return (
    <section
      aria-label="تدخل بشري مطلوب"
      className="rounded-2xl border border-warning/30 bg-warning-soft/50 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black sm:text-lg">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            الموظف حوّل المحادثة ليك عشان تكمل معاه
          </p>
        </div>
        <Link href="/dashboard/inbox?filter=FOLLOW_UP" className="shrink-0">
          <Button size="sm">راجع المحادثات</Button>
        </Link>
      </div>
    </section>
  );
}
