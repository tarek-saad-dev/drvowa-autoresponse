"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DASHBOARD_NAV_GROUPS,
  isNavGroupActive,
} from "@/constants/nav";
import { cn } from "@/lib/utils/cn";

export function MobileNav({
  showPlatformAdminLink = false,
}: {
  showPlatformAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const primary = DASHBOARD_NAV_GROUPS.filter((item) => item.mobilePrimary);

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-1.5 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_35px_rgba(15,28,36,.08)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-0.5">
        {primary.map((item) => {
          const active = isNavGroupActive(pathname, item);
          const isInbox = item.id === "inbox";

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center transition active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                isInbox && "-mt-0.5",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-secondary",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center text-base font-black transition",
                  isInbox
                    && "h-9 w-9 rounded-2xl bg-primary text-lg text-primary-foreground shadow-[0_8px_22px_rgba(0,117,154,.28)]",
                  isInbox && active && "ring-4 ring-primary/10",
                )}
              >
                {item.icon}
              </span>
              <span className="max-w-full truncate text-[10px] font-black leading-none">
                {item.mobileLabel}
              </span>
            </Link>
          );
        })}
      </div>
      {showPlatformAdminLink ? (
        <Link href="/admin" className="sr-only">
          إدارة المنصة
        </Link>
      ) : null}
    </nav>
  );
}
