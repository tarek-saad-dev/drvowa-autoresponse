"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
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
  const [loggingOut, setLoggingOut] = useState(false);

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-xl sm:px-6">
      <div className="min-w-0">
        {title ? (
          <h1 className="truncate text-base font-black text-foreground">
            {title}
          </h1>
        ) : (
          <>
            <p className="truncate text-sm font-black text-foreground">
              أهلاً، {userName}
            </p>
            <p className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
              كل اللي محتاجه لإدارة موظف الاستقبال في مكان واحد.
            </p>
          </>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <WorkspaceSwitcher
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
        <Link
          href="/dashboard/settings"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
          aria-label="الإعدادات"
        >
          ⚙
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
          className="hidden rounded-xl text-xs sm:inline-flex"
        >
          {loggingOut ? "..." : "خروج"}
        </Button>
      </div>
    </header>
  );
}
