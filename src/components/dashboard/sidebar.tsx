"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import {
  DASHBOARD_NAV_GROUPS,
  getNavGroupChildren,
  isNavGroupActive,
  isNavHrefActive,
} from "@/constants/nav";
import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils/cn";

export function DashboardSidebar({
  showPlatformAdminLink = false,
}: {
  showPlatformAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({});

  const itemClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all duration-200 motion-reduce:transition-none",
      active
        ? "bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(0,117,154,.24)]"
        : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
    );

  return (
    <aside className="flex w-[16.5rem] shrink-0 flex-col border-e border-white/10 bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="px-3 pb-5 pt-1">
        <Link href="/dashboard" aria-label={APP_NAME} className="block">
          <BrandLogo surface="dark" priority className="h-auto w-full max-w-[12.5rem]" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto" aria-label="القائمة الرئيسية">
        <div className="space-y-1">
          {DASHBOARD_NAV_GROUPS.map((group) => {
            const groupActive = isNavGroupActive(pathname, group);
            const children = getNavGroupChildren(group);
            const hasChildren = children.length > 0;
            const expanded = hasChildren
              ? (userExpanded[group.id] ?? groupActive)
              : false;

            if (!hasChildren) {
              return (
                <Link
                  key={group.id}
                  href={group.href}
                  className={itemClass(groupActive)}
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base transition",
                      groupActive ? "bg-white/15 text-white" : "bg-white/6",
                    )}
                  >
                    {group.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                </Link>
              );
            }

            return (
              <div key={group.id} className="space-y-1">
                <div className={cn(itemClass(groupActive), "gap-1 pe-1")}>
                  <Link
                    href={group.href}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5"
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base",
                        groupActive ? "bg-white/15 text-white" : "bg-white/6",
                      )}
                    >
                      {group.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  </Link>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs opacity-70 transition hover:bg-white/10 hover:opacity-100"
                    aria-expanded={expanded}
                    aria-label={expanded ? `طي ${group.label}` : `فتح ${group.label}`}
                    onClick={() =>
                      setUserExpanded((prev) => ({
                        ...prev,
                        [group.id]: !(prev[group.id] ?? groupActive),
                      }))
                    }
                  >
                    <span
                      className={cn(
                        "inline-block transition-transform motion-reduce:transition-none",
                        expanded ? "rotate-90" : "",
                      )}
                      aria-hidden
                    >
                      ◂
                    </span>
                  </button>
                </div>

                {expanded ? (
                  <div className="ms-3 space-y-0.5 border-s border-white/10 ps-3">
                    {children.map((child) => {
                      const active = isNavHrefActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href + child.key}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-bold transition motion-reduce:transition-none",
                            active
                              ? "bg-white/10 text-white"
                              : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
                          )}
                        >
                          <span className="opacity-70">{child.icon}</span>
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {showPlatformAdminLink ? (
          <Link
            href="/admin"
            className="mt-5 flex items-center gap-3 rounded-2xl border border-primary/35 px-3 py-3 text-sm font-bold text-primary transition hover:bg-primary/10"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15">◆</span>
            <span>إدارة المنصة</span>
          </Link>
        ) : null}
      </nav>
    </aside>
  );
}
