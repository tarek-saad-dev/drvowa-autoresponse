import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { AuthError } from "@/lib/tenancy/errors";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  const businesses = await listBusinessesForUser(user.userId);
  if (businesses.length === 0) {
    redirect("/onboarding");
  }

  const activeBusinessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <div className="hidden md:flex">
        <DashboardSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          userName={user.fullName}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
        <div className="border-b border-border bg-card px-4 py-2 md:hidden">
          <MobileNav />
        </div>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
