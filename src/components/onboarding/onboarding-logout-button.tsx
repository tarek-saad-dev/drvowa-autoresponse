"use client";

import { useState } from "react";

/** Reuse the existing authenticated logout API in every onboarding stage. */
export function OnboardingLogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Logout failed");
      // A full navigation picks up the cleared session cookie on the first paint.
      // The onboarding draft is intentionally NOT cleared by logout.
      window.location.replace("/login");
    } catch {
      setError("مقدرناش نسجّل خروجك. حاول تاني.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void logout()}
        disabled={loggingOut}
        aria-label={loggingOut ? "جاري تسجيل الخروج" : "تسجيل الخروج"}
        title="تسجيل الخروج"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border/70 bg-surface/70 px-2.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:cursor-wait disabled:opacity-50 sm:px-3"
      >
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5" />
        </svg>
        <span className="hidden sm:inline">{loggingOut ? "جاري الخروج..." : "خروج"}</span>
      </button>
      {error ? (
        <p role="alert" className="absolute end-0 top-full z-50 mt-2 w-48 rounded-xl border border-destructive/30 bg-card p-2 text-xs text-destructive shadow-lg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
