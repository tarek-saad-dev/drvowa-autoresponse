import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/constants/app";

/**
 * One calm, legible account entry point for login, signup and password reset.
 * All accents are semantic brand tokens; theme selection is preserved.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-primary/5 blur-3xl" />
      <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 sm:px-8">
        <div className="mb-8 text-center">
          <Link href="/" aria-label={APP_NAME} className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <BrandLogo priority className="mx-auto h-10 w-auto max-w-[min(100%,16rem)] sm:h-11" />
          </Link>
          <p className="mt-5 text-[11px] font-bold tracking-[0.18em] text-primary" dir="ltr">
            DRVO / YOUR WORKSPACE
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            موظف ذكي يردّ على عملائك وإنت مركز في شغلك
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
