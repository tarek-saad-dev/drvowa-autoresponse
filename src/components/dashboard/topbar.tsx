"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { AppIcon } from "@/components/ui/app-icon";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DASHBOARD_NAV, isNavHrefActive } from "@/constants/nav";
import type { Business } from "@/types/domain";

export function DashboardTopbar({
  userName,
  businesses,
  activeBusinessId,
  title,
}: {
  userName: string;
  businesses: Business[];
  activeBusinessId: string | null;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-6">
      <div className="min-w-0">
        <div className="min-w-0 sm:hidden">
          <BrandLogo className="h-5" />
          <p className="mt-1 truncate text-xs font-bold text-foreground">
            {activeBusiness?.name ?? currentLabel}
          </p>
        </div>

        <div className="hidden sm:block">
          <p className="truncate text-sm font-bold text-foreground">
            {activeBusiness?.name ?? `أهلاً، ${userName}`}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {pathname === "/dashboard"
              ? `أهلاً، ${userName}`
              : currentLabel}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <WorkspaceSwitcher
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
        <ThemeToggle />
        <Link
          href="/dashboard/settings?tab=account"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-input bg-card text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          aria-label="الحساب"
        >
          <AppIcon name="user" className="h-[18px] w-[18px]" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
          loading={loggingOut}
          className="min-h-10 shrink-0 rounded-xl px-2 text-xs sm:px-3"
          aria-label="تسجيل الخروج"
        >
          <span className="sm:hidden"><AppIcon name="log-out" className="h-[18px] w-[18px]" /></span>
          <span className="hidden sm:inline">{loggingOut ? "جارٍ الخروج..." : "خروج"}</span>
        </Button>
      </div>
    </header>
  );
}
