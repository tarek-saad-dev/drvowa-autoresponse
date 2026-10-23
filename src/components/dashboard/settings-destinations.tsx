import Link from "next/link";

import { DASHBOARD_NAV_GROUPS, getNavGroupChildren } from "@/constants/nav";
import { cn } from "@/lib/utils/cn";

const settingsGroup = DASHBOARD_NAV_GROUPS.find((group) => group.id === "settings");

export function SettingsDestinations({
  className,
  currentHref,
}: {
  className?: string;
  currentHref?: string;
}) {
  const items = settingsGroup ? getNavGroupChildren(settingsGroup) : [];
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="أقسام الإعدادات"
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = currentHref === item.href;
        return (
          <Link
            key={item.href + item.key}
            href={item.href}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition",
              active
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
