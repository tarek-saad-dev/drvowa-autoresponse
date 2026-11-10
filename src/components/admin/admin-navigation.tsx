"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/admin", label: "نظرة عامة", exact: true },
  { href: "/admin/financials", label: "المالية والتقارير" },
  { href: "/admin/ai-cost", label: "تكلفة AI" },
  { href: "/admin/subscriptions", label: "العملاء والاشتراكات" },
  { href: "/admin/payments", label: "المدفوعات" },
  { href: "/admin/discount-codes", label: "أكواد الخصم" },
  { href: "/admin/refunds", label: "الاستردادات" },
  { href: "/admin/whatsapp", label: "واتساب" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="أقسام إدارة المنصة" className="flex w-full gap-1 overflow-x-auto px-1 py-1 scrollbar-none">
      {navigation.map((item) => {
        const current = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={current
              ? "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm"
              : "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
