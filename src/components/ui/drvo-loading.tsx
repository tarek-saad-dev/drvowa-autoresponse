import { cn } from "@/lib/utils/cn";
import styles from "./drvo-loading.module.css";

type DrvoLoadingProps = {
  variant?: "page" | "inline";
  label?: string;
  hint?: string;
  className?: string;
};

/**
 * One loading language for route transitions and asynchronous content.
 * Keep the surrounding navigation visible; never replace a loading state
 * with a blocking full-screen overlay.
 */
export function DrvoLoading({
  variant = "page",
  label = "بنجهّز الصفحة…",
  hint,
  className,
}: DrvoLoadingProps) {
  const isPage = variant === "page";

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full items-center justify-center text-center text-foreground",
        isPage ? "min-h-[min(65vh,36rem)] px-6 py-12" : "min-h-28 px-4 py-5",
        className,
      )}
    >
      <div className={cn("flex flex-col items-center", styles.appear)}>
        <div
          className={cn(
            "relative grid shrink-0 place-items-center rounded-[22px] border border-primary/15 bg-card text-primary shadow-[0_18px_48px_-26px_rgba(0,117,154,.55)]",
            isPage ? "h-[72px] w-[72px]" : "h-14 w-14 rounded-[18px]",
            styles.mark,
          )}
          aria-hidden="true"
        >
          <span className="absolute -inset-2 -z-10 rounded-[28px] bg-primary/10 blur-xl" />
          <svg
            viewBox="0 0 48 48"
            fill="none"
            className={isPage ? "h-11 w-11" : "h-9 w-9"}
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 12.5h24a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6H24l-11 7v-7h-1a6 6 0 0 1-6-6v-11a6 6 0 0 1 6-6Z" />
          </svg>
          <span className="absolute top-[48%] flex -translate-y-1/2 items-center gap-[5px]">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={cn("h-1.5 w-1.5 rounded-full bg-primary", styles.dot)}
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
          </span>
          <span className="absolute -end-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground shadow-sm">
            ✦
          </span>
        </div>

        <p className={cn("font-black", isPage ? "mt-6 text-base" : "mt-4 text-sm")}>
          {label}
        </p>
        {hint ? (
          <p className="mt-1.5 max-w-64 text-xs leading-6 text-muted-foreground">
            {hint}
          </p>
        ) : null}
        <div className="mt-4 h-1 w-24 overflow-hidden rounded-full bg-primary/10" aria-hidden="true">
          <span className={cn("block h-full w-[42%] rounded-full bg-primary", styles.progress)} />
        </div>
      </div>
    </div>
  );
}
