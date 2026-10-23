import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";

/**
 * Authenticated app shell.
 *
 * Do not gate onboarding/choose-plan from missing pathname headers here.
 * Dashboard routes enforce "must have a business" in `dashboard/layout.tsx`.
 * An earlier `!pathname → redirect("/onboarding")` fallback caused a
 * post-login redirect hop (login → /choose-plan → /onboarding) that left a
 * blank white screen on the first App Router navigation.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  try {
    await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  return <>{children}</>;
}
