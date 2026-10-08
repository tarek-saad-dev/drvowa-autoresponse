import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { z } from "zod";

import { decryptIntegrationSecret } from "@/lib/security/integration-secrets";
import type { Integration } from "@/types/domain";

import type {
  IntegrationManifest,
  IntegrationToolCallResult,
} from "./contracts";

const manifestSchema = z.object({
  contractVersion: z.literal("drvowa-erp-v1"),
  provider: z.string().min(1).max(100),
  providerVersion: z.string().max(100).nullish(),
  capabilities: z.array(z.string().min(1).max(128)).max(100),
  tools: z.array(
    z.object({
      name: z.string().min(1).max(128),
      description: z.string().min(1).max(500),
      mode: z.enum(["READ", "WRITE"]),
      approval: z.enum(["AUTO", "CUSTOMER_CONFIRM", "HUMAN_APPROVAL"]),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
    }),
  ).max(100),
});

function isPrivateIp(address: string): boolean {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  const lower = address.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:")) {
    return true;
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

export async function assertSafeIntegrationBaseUrl(value: string): Promise<string> {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Unsupported integration URL");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("ERP integration must use HTTPS in production");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Private integration hosts are not allowed");
    }
    return parsed.toString().replace(/\/$/, "");
  }

  if (isIP(hostname)) {
    if (process.env.NODE_ENV === "production" && isPrivateIp(hostname)) {
      throw new Error("Private integration hosts are not allowed");
    }
  } else if (process.env.NODE_ENV === "production") {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (!resolved.length || resolved.some((item) => isPrivateIp(item.address))) {
      throw new Error("Private integration hosts are not allowed");
    }
  }

  return parsed.toString().replace(/\/$/, "");
}

async function integrationFetch<T>(params: {
  integration: Integration;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  if (!params.integration.baseUrl || !params.integration.secretCiphertext) {
    throw new Error("Integration is not configured");
  }
  const baseUrl = await assertSafeIntegrationBaseUrl(params.integration.baseUrl);
  const token = decryptIntegrationSecret(params.integration.secretCiphertext);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 8_000);

  try {
    const response = await fetch(`${baseUrl}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DRVOWA-Integration/1.0",
      },
      body:
        params.body === undefined ? undefined : JSON.stringify(params.body),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const rec =
        payload && typeof payload === "object"
          ? payload as Record<string, unknown>
          : {};
      const code =
        typeof rec.code === "string"
          ? rec.code
          : `ERP_HTTP_${response.status}`;
      throw new Error(code);
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchIntegrationManifest(
  integration: Integration,
): Promise<IntegrationManifest> {
  const payload = await integrationFetch<unknown>({
    integration,
    path: "/api/integrations/drvowa/v1/manifest",
    timeoutMs: 6_000,
  });
  return manifestSchema.parse(payload) as IntegrationManifest;
}

export async function callIntegrationTool(params: {
  integration: Integration;
  tool: string;
  input: Record<string, unknown>;
  requestId: string;
}): Promise<IntegrationToolCallResult> {
  return integrationFetch<IntegrationToolCallResult>({
    integration: params.integration,
    path: `/api/integrations/drvowa/v1/tools/${encodeURIComponent(params.tool)}`,
    method: "POST",
    body: {
      requestId: params.requestId,
      input: params.input,
    },
    timeoutMs: 12_000,
  });
}
