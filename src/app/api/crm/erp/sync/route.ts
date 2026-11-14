import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getErpSyncStatus, syncErpForBusiness } from "@/modules/crm/erp-sync";
import { assertErpResourceSyncRecorded, assertErpSyncRecorded } from "@/modules/crm/erp-sync-contract";
import type { ErpSyncResource } from "@/modules/crm/erp-sync";
import { ValidationError } from "@/lib/tenancy/errors";
import { requireCrmWriteAccess } from "@/modules/crm/service";

export async function GET() {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    const status = await getErpSyncStatus({ businessId });
    return jsonOk({ status });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireCrmWriteAccess({ businessId, userId: user.userId });
    // No body preserves the older all-resource API for compatibility.
    // The dashboard sends one explicit resource per bounded HTTP request.
    const body: unknown = await request.json().catch(() => ({}));
    const rawResource = body && typeof body === "object" && "resource" in body
      ? (body as { resource: unknown }).resource
      : undefined;
    if (rawResource !== undefined &&
        !["customers", "invoices", "catalog"].includes(String(rawResource))) {
      throw new ValidationError("مورد مزامنة ERP غير معروف");
    }
    const resource = rawResource as ErpSyncResource | undefined;
    assertRateLimit("crm-erp-sync:" + businessId, RATE_LIMITS.crmErpSyncBatch);
    const result = await syncErpForBusiness({ businessId, resource });
    const status = await getErpSyncStatus({ businessId });
    if (resource) assertErpResourceSyncRecorded(resource, result, status);
    else assertErpSyncRecorded(result, status);
    return jsonOk({ resource: resource ?? null, result, status });
  } catch (error) {
    return handleApiError(error);
  }
}
