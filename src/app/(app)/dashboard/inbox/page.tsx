import { redirect } from "next/navigation";

import {
  InboxPanel,
  serializeConversations,
} from "@/components/dashboard/inbox-panel";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listInboxConversations } from "@/modules/messaging";

export default async function InboxPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const conversations = await listInboxConversations({ businessId, limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الوارد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          محادثات واتساب الواردة — عرض فقط في هذه المرحلة.
        </p>
      </div>
      <InboxPanel initialConversations={serializeConversations(conversations)} />
    </div>
  );
}
