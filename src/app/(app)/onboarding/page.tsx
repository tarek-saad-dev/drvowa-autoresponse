import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/wizard";
import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { APP_NAME } from "@/constants/app";

export default async function OnboardingPage() {
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
  if (businesses.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold text-primary">{APP_NAME}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          مرحباً {user.fullName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          لنُعد مساحة عملك الأولى ووكيل الاستقبال.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  );
}
