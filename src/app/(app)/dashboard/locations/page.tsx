import { LocationsManager } from "@/components/dashboard/locations-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listLocations } from "@/modules/locations/service";
import { redirect } from "next/navigation";

export default async function LocationsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const locations = await listLocations({ businessId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">المواقع</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة فروع ومواقع النشاط ضمن مساحة العمل.
        </p>
      </div>
      <LocationsManager locations={locations} />
    </div>
  );
}
