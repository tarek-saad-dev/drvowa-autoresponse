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
        ? "bg-white text-sidebar shadow-sm"
        : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
    );

  return (
    <aside className="flex w-[17rem] shrink-0 flex-col border-e border-white/10 bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="px-3 pb-5 pt-1">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-lg font-black text-sidebar">
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
          الشغل اليومي
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
                    active ? "bg-sidebar text-white" : "bg-white/6",
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </Link>
            );
          })}
        </div>

        <div className="my-4 border-t border-white/10" />
        <p className="mb-2 px-3 text-[10px] font-black tracking-[.08em] text-sidebar-muted/70">
          إدارة البيزنس
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
                    active ? "bg-sidebar text-white" : "bg-white/6",
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
        <p className="text-xs font-black">اختصارات سريعة</p>
        <p className="mt-1 text-[11px] leading-5 text-sidebar-muted">
          أكتر حاجتين هتحتاجهم خلال اليوم.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/dashboard/inbox"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-2 py-2 text-[11px] font-black text-sidebar transition hover:bg-white/90"
          >
            <span>💬</span>
            <span>شوف الرسائل</span>
          </Link>
          <Link
            href="/dashboard/knowledge"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-[11px] font-black text-white transition hover:bg-white/10"
          >
            <span>＋</span>
            <span>علّمه معلومة</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
