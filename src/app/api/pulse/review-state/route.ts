import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { query, sql } from "@/lib/db";

const search = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["SIGNAL", "ESCALATION"]),
  intent: z.string().max(40).optional(),
});

/**
 * Lightweight, read-only status probe for a single review popup.
 * The ordinary WhatsApp outbound-observation flow updates these states after
 * a confirmed staff phone reply. This endpoint never changes the case itself.
 */
export async function GET(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const params = search.parse(Object.fromEntries(new URL(request.url).searchParams));
    const args = [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "conversationId", type: sql.UniqueIdentifier, value: params.conversationId },
    ];

    if (params.kind === "ESCALATION") {
      const data = await query<{FollowUpPhase: string}>(`
        SELECT TOP (1) FollowUpPhase
        FROM dbo.TblHumanEscalation
        WHERE BusinessID=@businessId AND ConversationID=@conversationId
          AND ResolvedAtUtc IS NULL AND Status IN(N'OPEN',N'ACKNOWLEDGED')
        ORDER BY CreatedAtUtc DESC
      `, args);
      const phase = data.recordset[0]?.FollowUpPhase ?? null;
      return jsonOk({
        needsReply: phase === "NEEDS_ATTENTION",
        inProgress: phase === "IN_PROGRESS" || phase === "WAITING_CUSTOMER",
      });
    }

    const intent = z.enum([
      "BOOKING", "PRICE", "COMPLAINT", "HUMAN", "REFUND",
      "PURCHASE", "LOCATION", "HOURS",
    ]).parse(params.intent);
    const data = await query<{Pending:number;Handling:number}>(`
      SELECT
        COALESCE(SUM(CASE WHEN ReviewStatus=N'OPEN'
          AND ActionState=N'NEEDS_REPLY' THEN 1 ELSE 0 END),0) AS Pending,
        COALESCE(SUM(CASE WHEN ReviewStatus=N'OPEN'
          AND ActionState=N'IN_PROGRESS' THEN 1 ELSE 0 END),0) AS Handling
      FROM dbo.TblPulseSignal
      WHERE BusinessID=@businessId AND ConversationID=@conversationId
        AND Intent=@intent AND ActionType IS NOT NULL
    `, [...args, {name:"intent",type:sql.NVarChar(40),value:intent}]);
    return jsonOk({
      needsReply: Number(data.recordset[0]?.Pending??0)>0,
      inProgress: Number(data.recordset[0]?.Handling??0)>0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
