"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { AppIcon } from "@/components/ui/app-icon";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DASHBOARD_NAV_GROUPS,
  getNavGroupChildren,
  isNavGroupActive,
  isNavHrefActive,
} from "@/constants/nav";
import { APP_NAME } from "@/constants/app";
import type { Business } from "@/types/domain";
import { cn } from "@/lib/utils/cn";

/**
 * One-row header: logo → light separators between primary links → logout.
 * Optional account/workspace controls live INSIDE Settings, never as a second bar.
 */
export function DashboardTopbar({
  showPlatformAdminLink = false,
  businesses,
  activeBusinessId,
}: {
  showPlatformAdminLink?: boolean;
  businesses: Business[];
  activeBusinessId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openGroup) return;
    function onOutsideClick(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [openGroup]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const optionControls = (
    <div className="mt-1 space-y-3 border-t border-border/70 px-3 py-3">
      {businesses.length > 1 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">تغيير النشاط</p>
          <WorkspaceSwitcher businesses={businesses} activeBusinessId={activeBusinessId} />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">المظهر</span>
        <ThemeToggle />
      </div>
      <Link href="/dashboard/settings?tab=account" onClick={() => setOpenGroup(null)}
        className="block rounded-lg px-2 py-2 text-xs font-semibold text-foreground hover:bg-surface">
        إعدادات الحساب
      </Link>
      {showPlatformAdminLink ? (
        <Link href="/admin" onClick={() => setOpenGroup(null)}
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-primary/10">
          <AppIcon name="admin" className="h-4 w-4" />
          إدارة المنصة
        </Link>
      ) : null}
    </div>
  );

  return (
    <header ref={headerRef} dir="rtl"
      className="sticky top-0 z-40 w-full shrink-0 border-b border-border bg-card/95 backdrop-blur-xl">
      <div className="flex h-16 min-w-0 items-center gap-3 px-3 sm:px-5 xl:gap-6 xl:px-7">
        <Link href="/dashboard" aria-label={APP_NAME} onClick={() => setOpenGroup(null)}
          className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <BrandLogo navigation priority className="h-auto w-[150px] max-h-10 object-contain xl:w-[175px] 2xl:w-[190px]" />
        </Link>

        <nav aria-label="التنقل العلوي" className="hidden min-w-0 flex-1 items-center lg:flex">
          {DASHBOARD_NAV_GROUPS.map((group, index) => {
            const active = isNavGroupActive(pathname, group);
            const children = getNavGroupChildren(group);
            const expanded = openGroup === group.id;
            return (
              <div key={group.id} className="relative flex shrink-0 items-center">
                {index > 0 ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70 xl:mx-2" /> : null}
                <div className={cn(
                  "flex min-h-11 items-center gap-0 rounded-lg transition-colors hover:bg-surface/70",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}>
                  <Link href={group.href} onClick={() => setOpenGroup(null)}
                    aria-current={isNavHrefActive(pathname, group.href) ? "page" : undefined}
                    className={cn(
                      "relative inline-flex min-h-11 items-center whitespace-nowrap px-2.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary xl:px-3.5 xl:text-sm",
                      active && "after:absolute after:bottom-1 after:right-2.5 after:left-2.5 after:h-0.5 after:rounded-full after:bg-primary",
                    )}>
                    {group.label}
                  </Link>
                  {children.length > 0 ? (
                    <button type="button"
                      aria-label={"الصفحات الفرعية: " + group.label}
                      aria-expanded={expanded} aria-controls={"topnav-" + group.id}
                      onClick={() => setOpenGroup(current => current === group.id ? null : group.id)}
                      className="grid min-h-10 w-6 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <AppIcon name="chevron" className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                    </button>
                  ) : null}
                </div>

                {children.length > 0 && expanded ? (
                  <div id={"topnav-" + group.id}
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl">
                    <p className="px-3 pb-2 pt-1 text-[11px] font-semibold text-muted-foreground">{group.label}</p>
                    {children.map((child) => {
                      const current = isNavHrefActive(pathname, child.href);
                      return (
                        <Link key={child.href + child.key} href={child.href}
                          aria-current={current ? "page" : undefined} onClick={() => setOpenGroup(null)}
                          className={cn(
                            "flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                            current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface",
                          )}>
                          {child.label}
                        </Link>
                      );
                    })}
                    {group.id === "settings" ? optionControls : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="relative flex min-w-0 flex-1 justify-end lg:hidden">
          <button type="button" aria-label="خيارات إضافية" aria-expanded={openGroup === "mobile-options"}
            aria-controls="topnav-mobile-options"
            onClick={() => setOpenGroup(current => current === "mobile-options" ? null : "mobile-options")}
            className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <AppIcon name="settings" className="h-5 w-5" />
          </button>
          {openGroup === "mobile-options" ? (
            <div id="topnav-mobile-options"
              className="absolute left-0 top-[calc(100%+10px)] z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl">
              <p className="px-3 py-2 text-xs font-bold">إعدادات سريعة</p>
              {optionControls}
            </div>
          ) : null}
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={logout}
          disabled={loggingOut} loading={loggingOut} aria-label="تسجيل الخروج"
          className="ms-auto min-h-11 shrink-0 gap-2 rounded-xl px-2 text-xs font-bold text-muted-foreground hover:text-foreground sm:px-3 lg:ms-auto">
          <AppIcon name="log-out" className="h-[18px] w-[18px]" />
          <span>{loggingOut ? "جارٍ الخروج..." : "خروج"}</span>
        </Button>
      </div>
    </header>
  );
}
