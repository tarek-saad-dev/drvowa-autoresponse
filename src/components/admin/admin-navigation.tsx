"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/admin", label: "نظرة عامة", exact: true },
  { href: "/admin/financials", label: "المالية والتقارير" },
  { href: "/admin/subscriptions", label: "العملاء والاشتراكات" },
  { href: "/admin/payments", label: "المدفوعات" },
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
              ? "whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm sm:text-sm"
              : "whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground sm:text-sm"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
