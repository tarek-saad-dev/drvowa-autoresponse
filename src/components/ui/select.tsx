import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { fieldBaseClass, fieldInteractionClass } from "@/components/ui/field-styles";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "flex h-11 px-3",
        fieldBaseClass,
        fieldInteractionClass,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
