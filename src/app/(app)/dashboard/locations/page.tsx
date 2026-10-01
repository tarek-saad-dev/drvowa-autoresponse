import { redirect } from "next/navigation";

import { LocationsManager } from "@/components/dashboard/locations-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listLocations } from "@/modules/locations/service";

export default async function LocationsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const locations = await listLocations({ businessId });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black text-primary">الفروع والمواقع</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">
          خلي بيانات كل فرع واضحة وسهلة
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          ضيف الفروع، أرقام التواصل والعناوين من مكان واحد. خلي التفاصيل التقنية
          اختيارية، وركز على البيانات اللي الفريق والعملاء محتاجينها.
        </p>
      </section>

      <LocationsManager locations={locations} />
    </div>
  );
}
