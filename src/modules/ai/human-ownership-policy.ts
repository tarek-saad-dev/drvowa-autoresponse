/**
 * A human owns the conversation until a quiet, answered interval has passed.
 * 30-minute reply SLA is NOT a handback deadline. This default controls only
 * sessions without unresolved escalations or unanswered customer messages.
 */
export const HUMAN_OWNERSHIP_QUIET_MINUTES = 90;

export function canReleaseHumanOwnership(params:{
  lastHumanReplyAtUtc:Date|null;
  lastInboundAtUtc:Date|null;
  lastActivityAtUtc:Date|null;
  hasOpenEscalation:boolean;
  hasUnansweredAction:boolean;
  now:Date;
}):boolean{
  const {lastHumanReplyAtUtc,lastInboundAtUtc,lastActivityAtUtc,hasOpenEscalation,hasUnansweredAction,now}=params;
  if(!lastHumanReplyAtUtc || hasOpenEscalation || hasUnansweredAction)return false;
  const human=lastHumanReplyAtUtc.getTime();
  const activity=Math.max(human,lastActivityAtUtc?.getTime()??human);
  if(lastInboundAtUtc && lastInboundAtUtc.getTime()>human)return false;
  return now.getTime()-activity>=HUMAN_OWNERSHIP_QUIET_MINUTES*60_000;
}
