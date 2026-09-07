"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { DASHBOARD_NAV } from "@/constants/nav";
import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils/cn";

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-e border-white/10 bg-sidebar text-sidebar-foreground">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
        <p className="mt-1 text-xs text-sidebar-muted">لوحة التحكم</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {DASHBOARD_NAV.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              <span>{item.label}</span>
              {"deferred" in item && item.deferred ? (
                <Badge variant="muted" className="bg-white/10 text-[10px] text-sidebar-muted">
                  لاحقاً
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
