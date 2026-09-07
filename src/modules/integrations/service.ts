import type { Integration, IntegrationStatus } from "@/types/domain";

import * as repo from "./repository";
import { INTEGRATION_TYPE_DRVO_ERP } from "./repository";

export async function listIntegrations(params: {
  businessId: string;
}): Promise<Integration[]> {
  return repo.listIntegrations({ businessId: params.businessId });
}

/**
 * Upserts a DRVO_ERP integration shell without calling ERP.
 * ConfigJson accepts non-secret metadata only.
 */
export async function upsertIntegrationShell(params: {
  businessId: string;
  type?: string;
  status?: IntegrationStatus;
  externalReference?: string | null;
  config?: Record<string, unknown> | null;
}): Promise<Integration> {
  return repo.upsertIntegration({
    businessId: params.businessId,
    type: params.type ?? INTEGRATION_TYPE_DRVO_ERP,
    status: params.status ?? "INACTIVE",
    externalReference: params.externalReference ?? null,
    config: params.config ?? null,
  });
}

export { INTEGRATION_TYPE_DRVO_ERP };
