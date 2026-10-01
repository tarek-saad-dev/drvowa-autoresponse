import { redirect } from "next/navigation";

import { InboxPanel } from "@/components/dashboard/inbox-panel";
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
  const initialConversations = conversations.map((c) => ({
    conversationId: c.conversationId,
    contactExternalKey: c.contactExternalKey,
    contactDisplayName: c.contactDisplayName,
    contactPhoneNormalized: c.contactPhoneNormalized,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageAtUtc: c.lastMessageAtUtc
      ? new Date(c.lastMessageAtUtc).toISOString()
      : null,
    status: c.status,
    aiMode: c.aiMode ?? "AUTO",
    aiPauseReason: c.aiPauseReason,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black text-primary">المحادثات</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">محادثات العملاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تابع اللي بيحصل، وخد المحادثة بنفسك وقت ما تحتاج.
          </p>
        </div>
        <div className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-black text-success">
          الموظف يتابع تلقائيًا، وإنت تتدخل وقت ما تحتاج
        </div>
      </div>
      <InboxPanel initialConversations={initialConversations} />
    </div>
  );
}
