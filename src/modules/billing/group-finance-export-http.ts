import { NextResponse } from "next/server";

import {
  authorizeFinanceExport,
  configuredFinanceExportToken,
} from "./group-finance-export-auth";

export function financeExportResponse<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function financeExportUnauthorized(request: Request): NextResponse | null {
  const configured = configuredFinanceExportToken();
  if (!configured) return financeExportResponse({ error: "Finance export is not configured" }, 503);
  if (!authorizeFinanceExport(request.headers.get("authorization"), configured)) {
    const response = financeExportResponse({ error: "Unauthorized" }, 401);
    response.headers.set("WWW-Authenticate", 'Bearer realm="group-finance"');
    return response;
  }
  return null;
}
