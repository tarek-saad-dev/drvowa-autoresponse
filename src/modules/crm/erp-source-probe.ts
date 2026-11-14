import { randomUUID } from "node:crypto";

import { NotFoundError } from "@/lib/tenancy/errors";
import { callIntegrationTool, fetchIntegrationManifest } from "@/modules/integrations/connector-client";
import {
  getIntegrationByType,
  INTEGRATION_TYPE_DRVO_ERP,
} from "@/modules/integrations/repository";

type ProbeResource = "customers" | "invoices" | "catalog";
type ProbeItem = {
  resource: ProbeResource;
  ok: boolean;
  returnedRows: number | null;
  errorCode: "MISSING_TOOL" | "CONNECTOR_UNAVAILABLE" | "SOURCE_AUTH_FAILED" | "SOURCE_ERROR" | null;
};

const DEFINITIONS: Array<{
  resource: ProbeResource;
  name: string;
  dataField: string;
  input: Record<string, unknown>;
}> = [
  {
    resource: "customers",
    name: "customer.list_changes",
    dataField: "customers",
    input: { sinceClientId: 0, identitySweep: false, limit: 1 },
  },
  {
    resource: "invoices",
    name: "invoice.list_changes",
    dataField: "invoices",
    input: { sinceInvId: 0, statusSweep: false, includeInactive: true, limit: 1 },
  },
  {
    resource: "catalog",
    name: "catalog.list_services",
    dataField: "services",
    input: { sinceProId: 0, identitySweep: false, limit: 1 },
  },
];

/**
 * Pull at most ONE read-only row per ERP resource, disclose only row counts.
 * No CRM writes, no customer PII, no campaign creation or WhatsApp sends.
 * ACTIVE and cached manifest display alone do not prove the source is reachable.
 */
export async function probeCrmErpSource(params: { businessId: string }): Promise<{
  connected: boolean;
  allToolsReachable: boolean;
  anySourceRows: boolean;
  resources: ProbeItem[];
}> {
  const integration = await getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });
  if (!integration || integration.status !== "ACTIVE") {
    throw new NotFoundError("اتصال Cashier غير مفعّل");
  }

  // Fetch the LIVE manifest with the stored connector secret, not stale cache.
  // A bad URL, disabled credential, or wrong source is surfaced as a probe failure.
  let manifest: Awaited<ReturnType<typeof fetchIntegrationManifest>>;
  try {
    manifest = await fetchIntegrationManifest(integration);
  } catch {
    return {
      connected: false,
      allToolsReachable: false,
      anySourceRows: false,
      resources: DEFINITIONS.map(({ resource }) => ({
        resource,
        ok: false,
        returnedRows: null,
        errorCode: "CONNECTOR_UNAVAILABLE",
      })),
    };
  }

  const resources: ProbeItem[] = await Promise.all(
    DEFINITIONS.map(async (definition): Promise<ProbeItem> => {
      const available = manifest.tools.some(
        (tool) => tool.name === definition.name && tool.mode === "READ",
      );
      if (!available) {
        return {
          resource: definition.resource,
          ok: false,
          returnedRows: null,
          errorCode: "MISSING_TOOL",
        };
      }
      try {
        const result = await callIntegrationTool({
          integration,
          tool: definition.name,
          input: definition.input,
          requestId: randomUUID(),
        });
        if (!result.ok || !result.data || typeof result.data !== "object") {
          return {
            resource: definition.resource,
            ok: false,
            returnedRows: null,
            errorCode: "SOURCE_ERROR",
          };
        }
        const payload = result.data as Record<string, unknown>;
        const rows = payload[definition.dataField];
        // Invalid response shapes are failures, not "0 source rows".
        if (!Array.isArray(rows)) {
          return {
            resource: definition.resource,
            ok: false,
            returnedRows: null,
            errorCode: "SOURCE_ERROR",
          };
        }
        return { resource: definition.resource, ok: true, returnedRows: rows.length, errorCode: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        return {
          resource: definition.resource,
          ok: false,
          returnedRows: null,
          errorCode: /ERP_HTTP_40[13]/.test(message)
            ? "SOURCE_AUTH_FAILED"
            : "CONNECTOR_UNAVAILABLE",
        };
      }
    }),
  );

  return {
    connected: true,
    allToolsReachable: resources.every((item) => item.ok),
    anySourceRows: resources.some((item) => (item.returnedRows ?? 0) > 0),
    resources,
  };
}
