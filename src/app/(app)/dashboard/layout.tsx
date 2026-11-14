import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MobileNav } from "@/components/dashboard/mobile-nav";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AuthError } from "@/lib/tenancy/errors";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";

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
    // Match post-login destination: plan selection before guided onboarding.
    redirect("/choose-plan");
  }

  const activeBusinessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  const showPlatformAdminLink = await isPlatformAdminUser(user.userId);

  return (
    <DashboardShell
      topbar={
        <DashboardTopbar
          showPlatformAdminLink={showPlatformAdminLink}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
        />
      }
      mobileNav={<MobileNav showPlatformAdminLink={showPlatformAdminLink} />}
    >
      {children}
    </DashboardShell>
  );
}
