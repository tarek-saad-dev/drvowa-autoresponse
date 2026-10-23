import Link from "next/link";
import { redirect } from "next/navigation";

import { KnowledgeManager } from "@/components/dashboard/knowledge-manager";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBillingOverview } from "@/modules/billing/service";
import { listItems } from "@/modules/knowledge/service";

export default async function ManageKnowledgePage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");

  const [items, billing] = await Promise.all([
    listItems({ businessId, includeInactive: true }),
    getBillingOverview({ businessId }),
  ]);
  const activeCount = items.filter((item) => item.isActive).length;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <Link href="/dashboard/agent?tab=knowledge"
        className="inline-flex rounded-xl px-2 py-1 text-sm font-bold text-primary hover:bg-primary/5">
        → العودة لمحادثة التعليم
      </Link>
      <div>
        <h1 className="text-2xl font-black">مراجعة معلومات الموظف</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          عدّل المعلومات اللي الموظف اتعلمها أو عطّل أي معلومة قديمة.
        </p>
      </div>
      <KnowledgeManager
        items={items}
        activeCount={activeCount}
        activeLimit={billing.plan?.maxActiveKnowledgeItems ?? null}
      />
    </main>
  );
}
