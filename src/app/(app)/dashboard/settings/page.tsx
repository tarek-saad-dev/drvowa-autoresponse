import { redirect } from "next/navigation";

import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBusinessById } from "@/modules/businesses/service";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const business = await getBusinessById({ businessId });

  return (
    <main className="mx-auto w-full max-w-[704px] space-y-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          إعدادات النشاط
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          عدّل المعلومات الأساسية لنشاطك التجاري.
        </p>
      </header>

      <BusinessSettingsForm key={business.businessId} business={business} />
    </main>
  );
}
