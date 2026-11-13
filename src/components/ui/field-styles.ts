/**
 * Shared field anatomy for DRVO AutoRespond.
 * Semantic color tokens come from Brand V2 globals.css, so the same controls
 * work across light/dark themes without per-screen hex colors.
 */
export const fieldBaseClass =
  "w-full min-w-0 rounded-lg border border-input bg-card text-sm text-foreground shadow-sm";

export const fieldInteractionClass =
  "transition-colors placeholder:text-muted-foreground " +
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 " +
  "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface/70 disabled:text-muted-foreground " +
  "motion-reduce:transition-none";
