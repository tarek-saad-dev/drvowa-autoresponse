import { EmployeeDestinations } from "@/components/dashboard/employee-destinations";
import { KnowledgePageClient } from "@/components/dashboard/knowledge-page-client";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBillingOverview } from "@/modules/billing/service";
import { listItems } from "@/modules/knowledge/service";
import { redirect } from "next/navigation";

export default async function KnowledgePage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [items, billing] = await Promise.all([
    listItems({ businessId, includeInactive: true }),
    getBillingOverview({ businessId }),
  ]);

  const activeCount = items.filter((i) => i.isActive).length;
  const activeLimit = billing.plan?.maxActiveKnowledgeItems ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">علّم الموظف</h1>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            علّمه الأسعار والخدمات والمواعيد والسياسات بالكلام الطبيعي.
          </p>
        </div>
        <EmployeeDestinations currentHref="/dashboard/knowledge" />
      </div>
      <KnowledgePageClient
        items={items}
        activeCount={activeCount}
        activeLimit={activeLimit}
      />
    </div>
  );
}
