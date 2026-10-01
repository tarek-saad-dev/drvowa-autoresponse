"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV } from "@/constants/nav";
import { cn } from "@/lib/utils/cn";

export function MobileNav({
  showPlatformAdminLink = false,
}: {
  showPlatformAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const primary = DASHBOARD_NAV.filter((item) => item.primary);

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_35px_rgba(15,28,36,.08)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {primary.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center transition",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-secondary",
              )}
            >
              <span className="grid h-7 w-7 place-items-center text-base font-black">
                {item.icon}
              </span>
              <span className="max-w-full truncate text-[10px] font-black">{item.label}</span>
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
