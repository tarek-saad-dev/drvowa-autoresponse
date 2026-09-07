import type { UsageEvent } from "@/types/domain";

import * as repo from "./repository";

export async function listUsageEvents(params: {
  businessId: string;
  limit?: number;
}): Promise<UsageEvent[]> {
  return repo.listUsageEvents({
    businessId: params.businessId,
    limit: params.limit ?? 50,
  });
}

/** Internal foundation helper for future metering — not a public product API yet. */
export async function recordUsageEvent(params: {
  businessId: string;
  eventType: string;
  quantity: number;
  occurredAtUtc?: Date;
  metadata?: Record<string, unknown> | null;
}): Promise<UsageEvent> {
  return repo.insertUsageEvent(params);
}
