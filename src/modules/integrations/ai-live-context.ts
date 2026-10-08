import "server-only";

import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { Message } from "@/types/domain";

import { callIntegrationTool } from "./connector-client";
import type { IntegrationManifest } from "./contracts";
import * as repo from "./repository";

const plannerSchema = z.object({
  action: z.enum(["NONE", "CALL"]),
  tool: z.string().max(128).nullish(),
  input: z.record(z.string(), z.unknown()).default({}),
});

const LIVE_INTENT_HINT =
  /(حجز|حجزي|احجز|موعد|ميعاد|متاح|مواعيد|إلغاء|الغاء|طلب|اوردر|أوردر|حالة الطلب|فاتورة|رصيد|booking|appointment|available|availability|order|invoice|balance|status)/i;

function latestInbound(
  recentMessages: Array<Pick<Message, "direction" | "textContent">>,
): string {
  return [...recentMessages]
    .reverse()
    .find((item) => item.direction === "INBOUND")
    ?.textContent?.trim() ?? "";
}

function parseManifest(value: string | null | undefined): IntegrationManifest | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as IntegrationManifest;
  } catch {
    return null;
  }
}

export type LiveErpContextResult = {
  text: string;
  tool: string | null;
  status: "USED" | "UNAVAILABLE" | "NONE";
};

export async function resolveLiveErpContext(params: {
  businessId: string;
  recentMessages: Array<
    Pick<Message, "direction" | "textContent" | "createdAtUtc" | "messageId">
  >;
  customerPhoneHint?: string | null;
}): Promise<LiveErpContextResult> {
  const customerMessage = latestInbound(params.recentMessages);
  if (!customerMessage || !LIVE_INTENT_HINT.test(customerMessage)) {
    return { text: "", tool: null, status: "NONE" };
  }

  const integration = await repo.getIntegrationByType({
    businessId: params.businessId,
    type: repo.INTEGRATION_TYPE_DRVO_ERP,
  });
  if (!integration || integration.status !== "ACTIVE") {
    return { text: "", tool: null, status: "NONE" };
  }

  const manifest = parseManifest(integration.capabilitiesJson);
  const readable = (manifest?.tools ?? []).filter(
    (tool) => tool.mode === "READ" && tool.approval === "AUTO",
  );
  if (!manifest || readable.length === 0) {
    return {
      text:
        "LIVE ERP STATUS: ERP integration exists but no live read tool is currently available. "
        + "Do not invent current booking, availability, order, invoice, or balance data.",
      tool: null,
      status: "UNAVAILABLE",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      text:
        "LIVE ERP STATUS: Live ERP lookup could not run. "
        + "Do not invent current operational data; offer human confirmation.",
      tool: null,
      status: "UNAVAILABLE",
    };
  }

  const client = new GoogleGenAI({ apiKey });
  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

  const history = params.recentMessages
    .slice(-6)
    .map((m) => `${m.direction === "INBOUND" ? "Customer" : "Receptionist"}: ${m.textContent ?? ""}`)
    .join("\n");

  const tools = readable.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? {},
  }));

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        "You route a customer question to at most one LIVE ERP read tool.",
        "Use only the listed tools. Never select a WRITE tool.",
        "If the customer is not asking for live operational/customer data, choose NONE.",
        "Use the customer phone hint when a phone is required and the user did not type one.",
        `Customer phone hint: ${params.customerPhoneHint ?? "(none)"}`,
        `Available READ tools: ${JSON.stringify(tools)}`,
        "Recent conversation:",
        history,
        'Return JSON only: {"action":"NONE|CALL","tool":string|null,"input":{}}',
      ].join("\n"),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 1200,
      },
    });

    const raw = response.text ?? "";
    const planned = plannerSchema.parse(JSON.parse(raw || "{}"));
    if (planned.action !== "CALL" || !planned.tool) {
      return { text: "", tool: null, status: "NONE" };
    }

    const tool = readable.find((item) => item.name === planned.tool);
    if (!tool) {
      return { text: "", tool: null, status: "NONE" };
    }

    const input = { ...planned.input };
    if (
      params.customerPhoneHint
      && !("phone" in input)
      && /booking\.(get_|get)/i.test(tool.name)
    ) {
      input.phone = params.customerPhoneHint;
    }

    const result = await callIntegrationTool({
      integration,
      tool: tool.name,
      input,
      requestId: randomUUID(),
    });

    if (!result.ok) {
      return {
        text:
          `LIVE ERP TOOL ${tool.name} failed. Do not invent the requested live data. `
          + "Tell the customer you could not confirm it right now and offer human help.",
        tool: tool.name,
        status: "UNAVAILABLE",
      };
    }

    const serialized = JSON.stringify(result.data ?? null).slice(0, 7000);
    return {
      text: [
        "LIVE ERP CONTEXT (authoritative current data; newer than static knowledge):",
        `Tool: ${tool.name}`,
        serialized,
        "Use this data only for the current customer request. Do not expose tool names or raw JSON.",
      ].join("\n"),
      tool: tool.name,
      status: "USED",
    };
  } catch {
    return {
      text:
        "LIVE ERP STATUS: Live ERP lookup was unavailable. "
        + "Do not guess current booking, availability, order, invoice, or balance data; offer human confirmation.",
      tool: null,
      status: "UNAVAILABLE",
    };
  }
}
