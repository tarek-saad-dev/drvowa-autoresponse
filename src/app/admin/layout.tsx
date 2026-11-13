import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthError, ForbiddenError } from "@/lib/tenancy/errors";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let adminCtx;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/dashboard");
    throw error;
  }

  const businesses = await listBusinessesForUser(adminCtx.userId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/admin" aria-label="الرئيسية - DRVO AutoRespond" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <BrandLogo priority className="h-8 max-w-[170px] object-contain sm:h-9" />
              </Link>
              <div className="hidden border-r border-border pr-4 sm:block">
                <p className="text-[10px] font-bold tracking-[0.18em] text-primary" dir="ltr">
                  PLATFORM ADMIN
                </p>
                <p className="mt-0.5 text-xs font-bold">إدارة DRVO AutoRespond</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {businesses.length > 0 ? (
                <Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg border border-input bg-card px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  مساحة العمل
                </Link>
              ) : null}
              <ThemeToggle />
              <AdminLogoutButton />
            </div>
          </div>
          <AdminNavigation canManageBrand={adminCtx.admin.role === "SUPER_ADMIN"} />
        </div>
      </header>
      <main id="main-content" className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
