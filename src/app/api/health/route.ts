import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config/app";
import { checkDbReady } from "@/lib/db";
import { jsonOk } from "@/lib/api/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ready = url.searchParams.get("ready");

  if (ready === "1" || ready === "true") {
    const databaseUp = await checkDbReady();
    return jsonOk({
      status: "ok",
      service: appConfig.service,
      database: databaseUp ? "up" : "down",
    });
  }

  return NextResponse.json({
    status: "ok",
    service: appConfig.service,
  });
}
