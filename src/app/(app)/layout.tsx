import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  const headerStore = await headers();
  const pathname =
    headerStore.get("x-pathname") ??
    headerStore.get("x-url") ??
    headerStore.get("next-url") ??
    "";

  const businesses = await listBusinessesForUser(user.userId);
  const onOnboarding =
    pathname.includes("/onboarding") || pathname.endsWith("/onboarding");

  if (businesses.length === 0 && !onOnboarding) {
    // Fallback: if pathname header missing, only dashboard subtree enforces again.
    if (!pathname || pathname.includes("/dashboard")) {
      redirect("/onboarding");
    }
  }

  void user;
  return <>{children}</>;
}
