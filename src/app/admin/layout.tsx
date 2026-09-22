import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { AuthError, ForbiddenError } from "@/lib/tenancy/errors";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let adminCtx;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  const businesses = await listBusinessesForUser(adminCtx.userId);
  const hasWorkspace = businesses.length > 0;

  return (
    <div className="min-h-full bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-amber-400">
              DRVOWA PLATFORM
            </p>
            <h1 className="text-lg font-semibold">لوحة إدارة المنصة</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 hover:bg-slate-800"
            >
              نظرة عامة
            </Link>
            <Link
              href="/admin/payments"
              className="rounded-md px-3 py-1.5 hover:bg-slate-800"
            >
              طلبات الدفع
            </Link>
            {hasWorkspace ? (
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800"
              >
                مساحة العمل
              </Link>
            ) : null}
            <AdminLogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
