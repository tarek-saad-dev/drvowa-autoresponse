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
    aiReplyHealth: c.aiReplyHealth,
  }));

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black text-primary">مركز المحادثات</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">محادثات العملاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            سيب الموظف الذكي يتابع، واستلم أي محادثة بنفسك وقت ما تحتاج.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-success/15 bg-success-soft/45 px-3 py-2 text-xs font-black text-success">
          <span className="h-2 w-2 rounded-full bg-success" />
          أول رد منك يسلّم المحادثة ليك تلقائيًا
        </div>
      </div>
      <InboxPanel initialConversations={initialConversations} />
    </div>
  );
}
