"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(currentTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      const saved = localStorage.getItem("drvo-theme");
      if (saved === "light" || saved === "dark") return;
      const next: ThemeMode = media.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      setTheme(next);
    };

    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  function toggleTheme() {
    const next: ThemeMode = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("drvo-theme", next);
    setTheme(next);
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground shadow-sm transition hover:border-primary/35 hover:bg-surface hover:text-primary"
      aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
      title={dark ? "الوضع الفاتح" : "الوضع الداكن"}
    >
      <span
        aria-hidden
        className="transition-transform duration-200 group-active:scale-90"
      >
        {dark ? "☀" : "◐"}
      </span>
    </button>
  );
}
