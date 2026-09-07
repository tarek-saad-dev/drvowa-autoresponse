import { KnowledgeManager } from "@/components/dashboard/knowledge-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listItems } from "@/modules/knowledge/service";
import { redirect } from "next/navigation";

export default async function KnowledgePage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const items = await listItems({ businessId, includeInactive: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">المعرفة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدر معلومات نشاطك التي سيعتمد عليها الوكيل لاحقاً.
        </p>
      </div>
      <KnowledgeManager items={items} />
    </div>
  );
}
