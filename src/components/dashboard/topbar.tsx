"use client";

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
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        {title ? (
          <h1 className="truncate text-base font-semibold text-foreground">
            {title}
          </h1>
        ) : (
          <p className="truncate text-sm text-muted-foreground">مرحباً، {userName}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <WorkspaceSwitcher
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
        >
          {loggingOut ? "..." : "خروج"}
        </Button>
      </div>
    </header>
  );
}
