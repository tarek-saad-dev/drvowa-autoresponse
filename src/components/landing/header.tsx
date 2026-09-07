import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants/app";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-2">
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
