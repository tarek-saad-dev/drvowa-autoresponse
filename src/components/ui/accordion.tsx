"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from "react";

import { cn } from "@/lib/utils/cn";

export type AccordionItem = {
  id: string;
  title: string;
  summary: string;
  children: ReactNode;
};

type AccordionProps = {
  items: AccordionItem[];
  /** Exactly one section open; pass null to start fully collapsed. */
  defaultOpenId?: string | null;
  /** Controlled open section (takes precedence over internal state when set). */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  className?: string;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "mt-0.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
        open && "rotate-180",
      )}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Accessible single-open accordion. Panel content stays mounted when collapsed
 * so form state is preserved.
 */
export function Accordion({
  items,
  defaultOpenId = null,
  openId: controlledOpenId,
  onOpenChange,
  className,
}: AccordionProps) {
  const baseId = useId();
  const [uncontrolledOpenId, setUncontrolledOpenId] = useState<string | null>(
    defaultOpenId,
  );
  const isControlled = controlledOpenId !== undefined;
  const openId = isControlled ? controlledOpenId : uncontrolledOpenId;

  function toggle(id: string) {
    const next = openId === id ? null : id;
    if (!isControlled) setUncontrolledOpenId(next);
    onOpenChange?.(next);
  }

  function onHeaderKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(id);
    }
  }

  return (
    <div className={cn("space-y-2", className)} dir="rtl">
      {items.map((item) => {
        const open = openId === item.id;
        const headerId = `${baseId}-${item.id}-header`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <section
            key={item.id}
            className="overflow-hidden rounded-2xl border border-border/70 bg-card"
          >
            <h2 className="m-0">
              <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                onKeyDown={(event) => onHeaderKeyDown(event, item.id)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors",
                  "hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                  open && "bg-surface/35",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-foreground sm:text-[15px]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-6 text-muted-foreground">
                    {item.summary}
                  </span>
                </span>
                <Chevron open={open} />
              </button>
            </h2>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    "border-t border-border/60 px-4 py-4",
                    !open && "invisible",
                  )}
                  // Keep focusable controls out of tab order while collapsed.
                  inert={!open ? true : undefined}
                >
                  {item.children}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
