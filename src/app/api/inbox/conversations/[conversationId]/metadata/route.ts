import { z } from "zod";
import { query, sql } from "@/lib/db";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { NotFoundError } from "@/lib/tenancy/errors";
import { getConversationForBusiness } from "@/modules/messaging/repository";

const schema = z.object({
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
}).strict().refine(d => d.archived !== undefined || d.pinned !== undefined);

type Context = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { businessId } = await requireApiBusiness();
    const { conversationId } = await context.params;
    const body = schema.parse(await parseJsonBody(request));
    const conversation = await getConversationForBusiness({ businessId, conversationId });
    if (!conversation) throw new NotFoundError("Conversation not found");
    await query(
      `UPDATE dbo.TblConversation SET
         IsArchived=COALESCE(@archived, IsArchived),
         IsPinned=COALESCE(@pinned, IsPinned),
         UpdatedAtUtc=SYSUTCDATETIME()
       WHERE BusinessID=@businessId AND ConversationID=@conversationId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "conversationId", type: sql.UniqueIdentifier, value: conversationId },
        { name: "archived", type: sql.Bit, value: body.archived ?? null },
        { name: "pinned", type: sql.Bit, value: body.pinned ?? null },
      ],
    );
    return jsonOk({ archived: body.archived, pinned: body.pinned });
  } catch (error) { return handleApiError(error); }
}
