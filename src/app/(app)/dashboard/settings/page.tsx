import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBusinessById } from "@/modules/businesses/service";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const business = await getBusinessById({ businessId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تعديل بيانات النشاط لمساحة العمل الحالية.
        </p>
      </div>
      <BusinessSettingsForm business={business} />
    </div>
  );
}
