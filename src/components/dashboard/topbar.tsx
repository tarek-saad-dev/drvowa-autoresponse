"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
import { DASHBOARD_NAV } from "@/constants/nav";
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

  const currentLabel = useMemo(() => {
    if (title) return title;
    const matched = [...DASHBOARD_NAV]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) =>
        item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(`${item.href}/`),
      );
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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/92 px-3 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 sm:hidden">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-xs font-black text-primary-foreground shadow-sm">
            D
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">
              {currentLabel}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              DRVOWA
            </p>
          </div>
        </div>

        <div className="hidden sm:block">
          <p className="truncate text-sm font-black text-foreground">
            {title ?? `أهلاً، ${userName}`}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {title ? currentLabel : "كل حاجة محتاجها لتشغيل موظف الاستقبال."}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <WorkspaceSwitcher
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
        <Link
          href="/dashboard/settings"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
          aria-label="إعدادات النشاط"
        >
          ⚙
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
          className="h-9 shrink-0 rounded-xl px-2 text-xs sm:px-3"
          aria-label="تسجيل الخروج"
        >
          <span className="sm:hidden">{loggingOut ? "…" : "↪"}</span>
          <span className="hidden sm:inline">{loggingOut ? "..." : "خروج"}</span>
        </Button>
      </div>
    </header>
  );
}
