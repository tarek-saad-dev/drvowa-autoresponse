import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "default" | "success" | "warning" | "info" | "muted";

const variantClass: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  muted: "bg-surface text-muted-foreground",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold leading-tight",
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
