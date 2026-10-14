import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/http";
import { query, sql } from "@/lib/db";
import { csvLine } from "@/modules/billing/admin-csv";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportRow = {
  PaymentReference: string;
  BusinessName: string;
  PlanName: string;
  Amount: number;
  CurrencyCode: string;
  ReviewedAtUtc: Date;
};

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const months = new URL(request.url).searchParams.get("range") === "12" ? 12 : 6;
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const result = await query<ExportRow>(`
      SELECT TOP (5001) p.PaymentReference, b.Name AS BusinessName,
        p.RequestedPlanDisplayName AS PlanName,
        p.Amount, p.CurrencyCode, p.ReviewedAtUtc
      FROM TblManualPaymentRequest p
      INNER JOIN TblBusiness b ON b.BusinessID = p.BusinessID
      WHERE p.Status = N'APPROVED' AND p.CurrencyCode = N'EGP'
        AND p.ReviewedAtUtc >= @periodStart AND p.ReviewedAtUtc < @nextMonthStart
      ORDER BY p.ReviewedAtUtc DESC, p.PaymentRequestID DESC
    `, [
      { name: "periodStart", type: sql.DateTime2, value: periodStart },
      { name: "nextMonthStart", type: sql.DateTime2, value: nextMonthStart },
    ]);

    if (result.recordset.length > 5000) {
      return NextResponse.json(
        { error: "نتائج التصدير أكبر من الحد المسموح. استخدم فترة أقصر." },
        { status: 422, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const header = ["Payment reference", "Business", "Plan", "Amount (EGP)", "Currency", "Approved at (UTC)"];
    const body = [
      csvLine(header),
      ...result.recordset.map((item) => csvLine([
        item.PaymentReference, item.BusinessName, item.PlanName,
        Number(item.Amount).toFixed(2), item.CurrencyCode,
        new Date(item.ReviewedAtUtc).toISOString(),
      ])),
    ].join("\r\n");

    return new NextResponse("\uFEFF" + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="autoresponse-approved-collections-${months}m.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
