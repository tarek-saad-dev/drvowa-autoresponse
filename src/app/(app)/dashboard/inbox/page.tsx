import { redirect } from "next/navigation";

import { getConversationForBusiness, getContactForBusiness } from "@/modules/messaging/repository";
import { getInboxConversationAiState } from "@/modules/ai/inbox-ai-service";
import { InboxPanel } from "@/components/dashboard/inbox-panel";
import { getMembership } from "@/modules/businesses/repository";
import { resolveActiveBusiness, setActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import {
  getInboxConversationCounts,
  listInboxConversations,
} from "@/modules/messaging";

const INITIAL_PAGE_SIZE = 60;

export default async function InboxPage({ searchParams }: {
  searchParams: Promise<{ conversationId?: string; businessId?: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const requested = await searchParams;
  const requestedBusinessId = requested.businessId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requested.businessId)
    ? requested.businessId : null;
  const businessId = await resolveActiveBusiness(user.userId, requestedBusinessId ?? user.activeBusinessId);
  if (!businessId) redirect("/onboarding");
  if (requestedBusinessId && businessId !== user.activeBusinessId) {
    // Membership is validated in resolveActiveBusiness and again on update.
    // Subsequent inbox API calls now use the selected business workspace.
    await setActiveBusiness({ userId: user.userId, sessionId: user.sessionId, businessId });
  }

  const membership = await getMembership({ userId: user.userId, businessId });
  const canResumeAll = membership?.status === "ACTIVE" && ["OWNER", "ADMIN"].includes(membership.role);

  const [batch, counts] = await Promise.all([
    listInboxConversations({ businessId, limit: INITIAL_PAGE_SIZE + 1 }),
    getInboxConversationCounts({ businessId }),
  ]);

  const conversations = batch.slice(0, INITIAL_PAGE_SIZE);
  const requestedId = requested.conversationId;
  const deepLinkId = requestedId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestedId)
    ? requestedId : null;
  if (deepLinkId && !conversations.some(c => c.conversationId === deepLinkId)) {
    const conversation = await getConversationForBusiness({ businessId, conversationId: deepLinkId });
    if (conversation) {
      const [contact, aiState] = await Promise.all([
        getContactForBusiness({ businessId, contactId: conversation.contactId }),
        getInboxConversationAiState({ businessId, conversationId: deepLinkId }),
      ]);
      if (contact) conversations.unshift({
        ...conversation,
        contactExternalKey: contact.externalContactKey,
        contactDisplayName: contact.displayName,
        contactPhoneNormalized: contact.phoneNormalized,
        lastMessagePreview: null,
        lastMessageDirection: null,
        aiMode: aiState.mode,
        aiPauseReason: aiState.pauseReason,
        aiReplyHealth: null,
        unread: false,
      });
    }
  }
  const last = conversations.at(-1);
  const hasMore = batch.length > INITIAL_PAGE_SIZE;

  return (
    <InboxPanel
      canResumeAll={canResumeAll}
      initialSelectedId={deepLinkId}
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
