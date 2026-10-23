"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  InboxChromeProvider,
  useInboxChrome,
} from "@/components/dashboard/inbox-chrome";

function DashboardShellInner({
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
  const { threadOpen } = useInboxChrome();

  // Mobile: keep global nav on the conversation list; hide it inside an open thread
  // so the composer isn't covered. Desktop always uses the shared sidebar.
  const showMobileNav = !isInbox || !threadOpen;

  return (
    <div
      className={
        isInbox
          ? "fixed inset-0 z-40 flex h-[100dvh] w-screen min-h-0 min-w-0 overflow-hidden overscroll-none bg-background"
          : "flex min-h-full flex-1 bg-background"
      }
    >
      <div className="hidden md:flex">{sidebar}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!isInbox && topbar}
        <main
          className={
            isInbox
              ? "flex min-h-0 min-w-0 flex-1 overflow-hidden p-0"
              : "flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6"
          }
        >
          {children}
        </main>
        {showMobileNav ? (
          <div className={isInbox ? "md:hidden" : undefined}>{mobileNav}</div>
        ) : null}
      </div>
    </div>
  );
}

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
  return (
    <InboxChromeProvider>
      <DashboardShellInner
        sidebar={sidebar}
        topbar={topbar}
        mobileNav={mobileNav}
      >
        {children}
      </DashboardShellInner>
    </InboxChromeProvider>
  );
}
