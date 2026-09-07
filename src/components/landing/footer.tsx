import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants/app";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-semibold text-foreground">{APP_NAME}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            منصة استقبال ذكي للأعمال — قيد البناء بشفافية.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              تسجيل الدخول
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">إنشاء حساب</Button>
          </Link>
        </div>
      </div>
    </footer>
  );
}
