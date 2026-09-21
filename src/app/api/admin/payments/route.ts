import { handleApiError, jsonOk } from "@/lib/api/http";
import { listPaymentsForAdmin } from "@/modules/billing/manual-payment-service";
import type { ManualPaymentStatus } from "@/types/domain";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const statusParam = (url.searchParams.get("status") ?? "PENDING").toUpperCase();
    const status =
      statusParam === "ALL"
        ? "ALL"
        : (statusParam as ManualPaymentStatus);
    const items = await listPaymentsForAdmin({ status });
    return jsonOk({
      items: items.map((p) => ({
        paymentRequestId: p.paymentRequestId,
        paymentReference: p.paymentReference,
        businessId: p.businessId,
        businessName: p.businessName,
        submitterEmail: p.submitterEmail,
        submitterName: p.submitterName,
        currentPlanCode: p.currentPlanCode,
        currentPlanName: p.currentPlanName,
        requestedPlanCode: p.requestedPlanCode,
        requestedPlanName: p.requestedPlanDisplayName,
        liveRequestedPlanPrice: p.liveRequestedPlanPrice,
        amount: p.amount,
        currencyCode: p.currencyCode,
        payerName: p.payerName,
        transferReference: p.transferReference,
        customerNote: p.customerNote,
        status: p.status,
        submittedAtUtc: p.submittedAtUtc,
        reviewedAtUtc: p.reviewedAtUtc,
        reviewNote: p.reviewNote,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
