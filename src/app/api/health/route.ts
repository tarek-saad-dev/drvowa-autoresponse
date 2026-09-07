import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config/app";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: appConfig.service,
  });
}
