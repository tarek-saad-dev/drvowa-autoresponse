"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV } from "@/constants/nav";
import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils/cn";

export function DashboardSidebar({
  showPlatformAdminLink = false,
}: {
  showPlatformAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const primary = DASHBOARD_NAV.filter((item) => item.primary);
  const secondary = DASHBOARD_NAV.filter((item) => !item.primary);

  const itemClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-all duration-200",
      active
        ? "bg-primary text-white shadow-[0_10px_28px_rgba(0,117,154,.24)]"
        : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
    );

  return (
    <aside className="flex w-[17.5rem] shrink-0 flex-col border-e border-white/10 bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="px-3 pb-5 pt-1">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-lg font-black text-white shadow-[0_8px_22px_rgba(0,117,154,.28)]">
            D
          </div>
          <div>
            <p className="text-sm font-black tracking-tight">{APP_NAME}</p>
            <p className="mt-0.5 text-[11px] text-sidebar-muted">موظف الاستقبال الذكي</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <p className="mb-2 px-3 text-[10px] font-black tracking-[.08em] text-sidebar-muted/70">
          كل يوم
        </p>
        <div className="space-y-1">
          {primary.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link key={item.href} href={item.href} className={itemClass(active)}>
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base transition",
                    active ? "bg-white/15 text-white" : "bg-white/6",
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </Link>
            );
          })}
        </div>

        <div className="my-4 border-t border-white/10" />
        <p className="mb-2 px-3 text-[10px] font-black tracking-[.08em] text-sidebar-muted/70">
          إدارة النشاط
        </p>

        <div className="space-y-1">
          {secondary.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link key={item.href} href={item.href} className={itemClass(active)}>
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm",
                    active ? "bg-white/15 text-white" : "bg-white/6",
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {showPlatformAdminLink ? (
          <Link
            href="/admin"
            className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-500/30 px-3 py-3 text-sm font-bold text-amber-200/90 transition hover:bg-amber-500/10"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/10">◆</span>
            <span>إدارة المنصة</span>
          </Link>
        ) : null}
      </nav>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-[10px] font-black tracking-[.08em] text-sidebar-muted/70">
          اختصارات
        </p>
        <div className="mt-2 grid gap-2">
          <Link
            href="/dashboard/inbox"
            className="flex items-center justify-between gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-black text-white transition hover:bg-primary-hover"
          >
            <span className="flex items-center gap-2">
              <span>💬</span>
              <span>افتح المحادثات</span>
            </span>
            <span aria-hidden>←</span>
          </Link>
          <Link
            href="/dashboard/knowledge"
            className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-black text-white transition hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <span>＋</span>
              <span>علّمه معلومة</span>
            </span>
            <span aria-hidden>←</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
