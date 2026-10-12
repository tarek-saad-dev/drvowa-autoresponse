"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function DashboardShell({
  children,
  sidebar,
  topbar,
  mobileNav,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  topbar: ReactNode;
  mobileNav: ReactNode;
}) {
  const pathname = usePathname();
  const isInbox = pathname === "/dashboard/inbox";

  return (
    <div className={
      isInbox
        ? "flex h-[100dvh] min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
        : "flex min-h-full flex-1 bg-background"
    }>
      {!isInbox && <div className="hidden md:flex">{sidebar}</div>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!isInbox && topbar}
        <main className={
          isInbox
            ? "min-h-0 min-w-0 flex-1 overflow-hidden p-0"
            : "flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6"
        }>
          {children}
        </main>
        {!isInbox && mobileNav}
      </div>
    </div>
  );
}
