import { redirect } from "next/navigation";

import { InboxPanel } from "@/components/dashboard/inbox-panel";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import {
  getInboxConversationCounts,
  listInboxConversations,
} from "@/modules/messaging";

const INITIAL_PAGE_SIZE = 60;

export default async function InboxPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");

  const [batch, counts] = await Promise.all([
    listInboxConversations({ businessId, limit: INITIAL_PAGE_SIZE + 1 }),
    getInboxConversationCounts({ businessId }),
  ]);

  const conversations = batch.slice(0, INITIAL_PAGE_SIZE);
  const last = conversations.at(-1);
  const hasMore = batch.length > INITIAL_PAGE_SIZE;

  return (
    <InboxPanel
      initialConversations={conversations.map((c) => ({
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
        unread: c.unread,
      }))}
      initialCounts={counts}
      initialHasMore={hasMore}
      initialCursor={hasMore && last ? {
        beforeAt: (last.lastMessageAtUtc ?? last.createdAtUtc).toISOString(),
        beforeId: last.conversationId,
      } : null}
    />
  );
}
