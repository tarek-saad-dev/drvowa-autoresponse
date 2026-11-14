"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { AppIcon } from "@/components/ui/app-icon";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DASHBOARD_NAV,
  DASHBOARD_NAV_GROUPS,
  getNavGroupChildren,
  isNavGroupActive,
  isNavHrefActive,
} from "@/constants/nav";
import { APP_NAME } from "@/constants/app";
import type { Business } from "@/types/domain";
import { cn } from "@/lib/utils/cn";

export function DashboardTopbar({
  userName,
  planName = null,
  showPlatformAdminLink = false,
  businesses,
  activeBusinessId,
  title,
}: {
  userName: string;
  planName?: string | null;
  showPlatformAdminLink?: boolean;
  businesses: Business[];
  activeBusinessId: string | null;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const displayName = userName.trim() || "حسابي";
  const avatarInitial = Array.from(displayName)[0]?.toLocaleUpperCase() ?? "؟";
  const displayPlan = planName?.trim() || "الباقة غير محددة";

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.businessId === activeBusinessId) ?? businesses[0] ?? null,
    [activeBusinessId, businesses],
  );

  const currentLabel = useMemo(() => {
    if (title) return title;
    const matched = [...DASHBOARD_NAV]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => isNavHrefActive(pathname, item.href));
    return matched?.label ?? "الرئيسية";
  }, [pathname, title]);

  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
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

  const navClass = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:text-sm",
      active
        ? "bg-primary/12 text-primary"
        : "text-muted-foreground hover:bg-surface hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-40 w-full shrink-0 border-b border-border bg-card/95 backdrop-blur-xl" dir="rtl">
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 sm:min-h-16 sm:px-5 xl:px-7">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/dashboard" aria-label={APP_NAME}
            className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <BrandLogo priority className="h-5 w-auto max-w-[110px] sm:h-6 sm:max-w-[135px]" />
          </Link>
          <div className="hidden min-w-0 border-s border-border ps-3 sm:block">
            <p className="max-w-48 truncate text-xs font-bold text-foreground lg:text-sm">
              {activeBusiness?.name ?? `أهلًا، ${displayName}`}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {pathname === "/dashboard" ? "نظرة عامة على نشاطك" : currentLabel}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <WorkspaceSwitcher businesses={businesses} activeBusinessId={activeBusinessId} />
          <ThemeToggle />
          <Link href="/dashboard/settings?tab=account"
            title={`${displayName} — ${displayPlan}`}
            aria-label={`الحساب: ${displayName}، الباقة: ${displayPlan}`}
            className="group flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-background/65 px-1.5 transition-colors hover:border-primary/30 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:px-2.5">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary ring-1 ring-primary/25">
              {avatarInitial}
            </span>
            <span className="hidden min-w-0 text-start xl:block">
              <span className="block max-w-28 truncate text-xs font-bold">{displayName}</span>
              <span className="block max-w-28 truncate text-[10px] text-muted-foreground">{displayPlan}</span>
            </span>
          </Link>
          <Button variant="ghost" size="sm" onClick={logout} disabled={loggingOut} loading={loggingOut}
            className="min-h-10 shrink-0 rounded-xl px-2 text-xs lg:px-3"
            aria-label="تسجيل الخروج">
            <span className="lg:hidden"><AppIcon name="log-out" className="h-[18px] w-[18px]" /></span>
            <span className="hidden lg:inline">{loggingOut ? "جارٍ الخروج..." : "خروج"}</span>
          </Button>
        </div>
      </div>

      <nav ref={navRef} aria-label="التنقل العلوي"
        className="hidden min-h-[52px] items-center justify-between gap-2 border-t border-border/70 px-3 py-1.5 md:flex lg:px-5 xl:px-7">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {DASHBOARD_NAV_GROUPS.map((group) => {
            const active = isNavGroupActive(pathname, group);
            const children = getNavGroupChildren(group);
            if (children.length === 0) {
              return (
                <Link key={group.id} href={group.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpenGroup(null)}
                  className={navClass(active)}>
                  <AppIcon name={group.id} className="h-4 w-4 shrink-0" />
                  <span>{group.label}</span>
                </Link>
              );
            }

            const expanded = openGroup === group.id;
            return (
              <div key={group.id} className="relative shrink-0">
                <div className={cn(navClass(active), "gap-0 pe-1")}>
                  <Link href={group.href}
                    aria-current={isNavHrefActive(pathname, group.href) ? "page" : undefined}
                    onClick={() => setOpenGroup(null)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg pe-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <AppIcon name={group.id} className="h-4 w-4 shrink-0" />
                    <span>{group.label}</span>
                  </Link>
                  <button type="button" aria-label={`الصفحات الفرعية: ${group.label}`}
                    aria-expanded={expanded} aria-controls={`topnav-${group.id}`}
                    onClick={() => setOpenGroup(current => current === group.id ? null : group.id)}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <AppIcon name="chevron" className={cn("h-3.5 w-3.5 transition-transform", expanded ? "rotate-90" : "")} />
                  </button>
                </div>
                {expanded ? (
                  <div id={`topnav-${group.id}`}
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-2xl border border-border bg-card p-2 shadow-xl">
                    <p className="px-3 pb-2 pt-1 text-[11px] font-semibold text-muted-foreground">{group.label}</p>
                    {children.map((child) => {
                      const current = isNavHrefActive(pathname, child.href);
                      return (
                        <Link key={child.href + child.key} href={child.href}
                          aria-current={current ? "page" : undefined}
                          onClick={() => setOpenGroup(null)}
                          className={cn(
                            "flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                            current ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface",
                          )}>
                          <AppIcon name={child.key === "Billing" ? "billing" : child.key === "Integrations" ? "integrations" : "settings"} className="h-4 w-4 shrink-0 opacity-75" />
                          {child.label}
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
          <Link href="/admin" onClick={() => setOpenGroup(null)}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-primary/30 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <AppIcon name="admin" className="h-4 w-4" />
            <span className="hidden lg:inline">إدارة المنصة</span>
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
