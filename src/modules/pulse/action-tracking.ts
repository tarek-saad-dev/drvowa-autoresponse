import { sql, type TransactionClient } from "@/lib/db";
import { needsCustomerFollowUp } from "./action-policy";

export type PulseActionTransition = "IN_PROGRESS" | "NEEDS_REPLY" | "UNCHANGED";
type Scope = { businessId:string;conversationId:string };
const scope=(p:Scope)=>[
 {name:"businessId",type:sql.UniqueIdentifier,value:p.businessId},
 {name:"conversationId",type:sql.UniqueIdentifier,value:p.conversationId},
];

/**
 * Must be called only after verified HUMAN outbound success/observation.
 * A human reply acknowledges earlier requests; it NEVER declares a complaint resolved.
 * Timestamp guard prevents late out-of-order WhatsApp sync from hiding newer work.
 */
export async function recordHumanPulseReply(params:Scope & {
 repliedAtUtc:Date; providerMessageId:string;
},trx:TransactionClient):Promise<number>{
 const affected=await trx.execute(`
  UPDATE p SET
    ActionState=N'IN_PROGRESS',
    LastHumanReplyAtUtc=@at,
    ActionUpdatedAtUtc=SYSUTCDATETIME(),
    ActionSource=N'HUMAN_REPLY'
  FROM dbo.TblPulseSignal p WITH (UPDLOCK)
  WHERE p.BusinessID=@businessId AND p.ConversationID=@conversationId
    AND p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'
    AND p.ActionState=N'NEEDS_REPLY'
    AND p.MessageAtUtc<=@at
    AND (p.LastCustomerFollowupAtUtc IS NULL OR p.LastCustomerFollowupAtUtc<=@at)`,
  [...scope(params),{name:"at",type:sql.DateTime2,value:params.repliedAtUtc}]);
 return affected;
}

/**
 * A new explicit unresolved customer message can reopen the attention queue.
 * Generic "thanks", passive acknowledgements or weak replies never reopen.
 * Keeps IN_PROGRESS after a human reply until there is another actionable request.
 */
export async function recordCustomerPulseFollowUp(params:Scope & {
 receivedAtUtc:Date;text:string|null;
},trx:TransactionClient):Promise<PulseActionTransition>{
 if(!needsCustomerFollowUp(params.text))return "UNCHANGED";
 const affected=await trx.execute(`
  UPDATE p SET
    ActionState=N'NEEDS_REPLY',
    LastCustomerFollowupAtUtc=@at,
    ActionUpdatedAtUtc=SYSUTCDATETIME(),
    ActionSource=N'CUSTOMER_FOLLOWUP'
  FROM dbo.TblPulseSignal p WITH (UPDLOCK)
  WHERE p.BusinessID=@businessId AND p.ConversationID=@conversationId
    AND p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'
    AND p.ActionState=N'IN_PROGRESS'
    AND p.LastHumanReplyAtUtc IS NOT NULL
    AND p.LastHumanReplyAtUtc<@at
    AND (p.LastCustomerFollowupAtUtc IS NULL OR p.LastCustomerFollowupAtUtc<@at)
    AND p.MessageAtUtc<@at`,
 [...scope(params),{name:"at",type:sql.DateTime2,value:params.receivedAtUtc}]);
 return affected>0?"NEEDS_REPLY":"UNCHANGED";
}
