import { getPricingV1Plan } from "./pricing-v1-catalog";

export function evaluateFreeTrial(firstActivatedAtUtc: Date, nowUtc: Date, lifetimeUsed: number) {
 const free = getPricingV1Plan("FREE");
 if (!free?.trialDays) throw new Error("FREE_PLAN_MISSING");
 if (!Number.isFinite(firstActivatedAtUtc.getTime()) || !Number.isFinite(nowUtc.getTime()) ||
     !Number.isSafeInteger(lifetimeUsed) || lifetimeUsed < 0) throw new Error("INVALID_FREE_TRIAL_INPUT");
 const remaining = Math.max(0, free.aiReplies - lifetimeUsed);
 const expired = nowUtc.getTime() >= firstActivatedAtUtc.getTime() + free.trialDays * 86400000;
 return { allowed: !expired && remaining > 0, remaining: expired ? 0 : remaining, expired };
}
