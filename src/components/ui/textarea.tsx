import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { fieldBaseClass, fieldInteractionClass } from "@/components/ui/field-styles";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-28 px-3 py-2",
        fieldBaseClass,
        fieldInteractionClass,
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
