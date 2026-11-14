"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  InboxChromeProvider,
  useInboxChrome,
} from "@/components/dashboard/inbox-chrome";

function DashboardShellInner({
  children,
  topbar,
  mobileNav,
}: {
  children: ReactNode;
  topbar: ReactNode;
  mobileNav: ReactNode;
}) {
  const pathname = usePathname();
  const isInbox = pathname === "/dashboard/inbox";
  const isAgent = pathname === "/dashboard/agent";
  const { threadOpen } = useInboxChrome();

  // Keep the bottom navigation on mobile conversation lists, not over an open thread.
  // Desktop Inbox always gets the shared top navigation, without a side rail.
  const showMobileNav = !isInbox || !threadOpen;

  return (
    <div
      className={
        (isInbox || isAgent)
          ? "fixed inset-0 z-40 flex h-[100dvh] w-screen min-h-0 min-w-0 flex-col overflow-hidden overscroll-none bg-background"
          : "flex min-h-full min-w-0 flex-1 flex-col bg-background"
      }
    >
      <div className={isInbox ? "hidden shrink-0 lg:block" : "shrink-0"}>{topbar}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main
          className={
            isInbox
              ? "flex min-h-0 min-w-0 flex-1 overflow-hidden p-0"
              : isAgent
                ? "flex min-h-0 min-w-0 flex-1 overflow-hidden p-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:p-5"
                : "flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6"
          }
        >
          {children}
        </main>
        {showMobileNav ? (
          <div className={isInbox ? "lg:hidden" : undefined}>{mobileNav}</div>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  topbar,
  mobileNav,
}: {
  children: ReactNode;
  topbar: ReactNode;
  mobileNav: ReactNode;
}) {
  return (
    <InboxChromeProvider>
      <DashboardShellInner
        topbar={topbar}
        mobileNav={mobileNav}
      >
        {children}
      </DashboardShellInner>
    </InboxChromeProvider>
  );
}
