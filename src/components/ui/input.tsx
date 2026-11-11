import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { fieldBaseClass, fieldInteractionClass } from "@/components/ui/field-styles";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 px-3",
        fieldBaseClass,
        fieldInteractionClass,
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
