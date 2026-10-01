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
      <div>
        <p className="text-xs font-black text-primary">تدريب الموظف</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">خلّي موظفك يعرف البيزنس زيك</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          علّمه الأسعار والخدمات والمواعيد والسياسات بالكلام الطبيعي، وراجع كل اللي عارفه من نفس المكان.
        </p>
      </div>
      <KnowledgePageClient
        items={items}
        activeCount={activeCount}
        activeLimit={activeLimit}
      />
    </div>
  );
}
