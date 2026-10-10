import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/constants/app";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label={APP_NAME} className="shrink-0">
          <BrandLogo priority className="h-8 sm:h-9" />
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            تسجيل الدخول
          </Link>
          <Link href="/signup">
            <Button size="sm">ابدأ الآن</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
