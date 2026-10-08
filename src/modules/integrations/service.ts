import { randomUUID } from "node:crypto";

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  generateIntegrationApiKey,
  hashIntegrationApiKey,
} from "@/lib/security/integration-secrets";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { sendAccountMessage } from "@/modules/channels/runtime-client";
import type { Integration, IntegrationStatus } from "@/types/domain";

import { callIntegrationTool, fetchIntegrationManifest } from "./connector-client";
import type {
  IntegrationManifest,
  IntegrationToolCallResult,
} from "./contracts";
import * as repo from "./repository";
import { INTEGRATION_TYPE_DRVO_ERP } from "./repository";

export async function listIntegrations(params: {
  businessId: string;
}): Promise<Integration[]> {
  return repo.listIntegrations({ businessId: params.businessId });
}

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

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ValidationError("ERP base URL must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

export async function configureDrvoErpIntegration(params: {
  businessId: string;
  baseUrl: string;
  outboundToken: string;
  externalReference?: string | null;
}): Promise<{
  integration: Integration;
  inboundApiKey: string;
  manifest: IntegrationManifest | null;
}> {
  if (!params.outboundToken.trim()) {
    throw new ValidationError("ERP access token is required");
  }

  const shell = await repo.upsertIntegration({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
    status: "PENDING",
    externalReference: params.externalReference ?? null,
    config: { contractVersion: "drvowa-erp-v1" },
  });

  const inboundApiKey = generateIntegrationApiKey();
  const configured = await repo.configureIntegrationConnector({
    businessId: params.businessId,
    integrationId: shell.integrationId,
    baseUrl: normalizeBaseUrl(params.baseUrl),
    inboundApiKeyHash: hashIntegrationApiKey(inboundApiKey),
    secretCiphertext: encryptIntegrationSecret(params.outboundToken.trim()),
    status: "ACTIVE",
  });
  if (!configured) {
    throw new NotFoundError("Integration not found");
  }

  let manifest: IntegrationManifest | null = null;
  try {
    manifest = await fetchIntegrationManifest(configured);
    await repo.updateIntegrationHealth({
      businessId: params.businessId,
      integrationId: configured.integrationId,
      status: "HEALTHY",
      capabilitiesJson: JSON.stringify(manifest),
    });
  } catch {
    await repo.updateIntegrationHealth({
      businessId: params.businessId,
      integrationId: configured.integrationId,
      status: "ERROR",
    });
  }

  const latest = await repo.getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });

  return {
    integration: latest ?? configured,
    inboundApiKey,
    manifest,
  };
}

export async function refreshDrvoErpManifest(params: {
  businessId: string;
}): Promise<IntegrationManifest> {
  const integration = await repo.getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });
  if (!integration || integration.status === "INACTIVE") {
    throw new NotFoundError("DRVO ERP integration is not active");
  }

  try {
    const manifest = await fetchIntegrationManifest(integration);
    await repo.updateIntegrationHealth({
      businessId: params.businessId,
      integrationId: integration.integrationId,
      status: "HEALTHY",
      capabilitiesJson: JSON.stringify(manifest),
    });
    return manifest;
  } catch (error) {
    await repo.updateIntegrationHealth({
      businessId: params.businessId,
      integrationId: integration.integrationId,
      status: "ERROR",
    });
    throw error;
  }
}

export async function invokeDrvoErpTool(params: {
  businessId: string;
  tool: string;
  input: Record<string, unknown>;
  requestId?: string;
}): Promise<IntegrationToolCallResult> {
  const integration = await repo.getIntegrationByType({
    businessId: params.businessId,
    type: INTEGRATION_TYPE_DRVO_ERP,
  });
  if (!integration || integration.status !== "ACTIVE") {
    throw new NotFoundError("DRVO ERP integration is not active");
  }

  const manifest = integration.capabilitiesJson
    ? (JSON.parse(integration.capabilitiesJson) as IntegrationManifest)
    : await refreshDrvoErpManifest({ businessId: params.businessId });

  const tool = manifest.tools.find((item) => item.name === params.tool);
  if (!tool) {
    throw new NotFoundError("ERP tool is not available");
  }
  if (tool.mode === "WRITE" && tool.approval === "HUMAN_APPROVAL") {
    throw new ForbiddenError("This ERP action requires human approval");
  }

  return callIntegrationTool({
    integration,
    tool: params.tool,
    input: params.input,
    requestId: params.requestId ?? randomUUID(),
  });
}

export async function authenticateExternalIntegration(
  authorizationHeader: string | null,
): Promise<Integration> {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new ForbiddenError("Integration authorization required");
  }
  const integration = await repo.getIntegrationByInboundApiKeyHash({
    apiKeyHash: hashIntegrationApiKey(token),
  });
  if (!integration || integration.status !== "ACTIVE") {
    throw new ForbiddenError("Invalid integration authorization");
  }
  return integration;
}

export async function deliverExternalEventMessage(params: {
  integration: Integration;
  externalEventId: string;
  eventType: string;
  recipient: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}): Promise<{
  replay: boolean;
  status: string;
  providerMessageId: string | null;
}> {
  const claim = await repo.claimIntegrationEvent({
    businessId: params.integration.businessId,
    integrationId: params.integration.integrationId,
    externalEventId: params.externalEventId,
    eventType: params.eventType,
    recipient: params.recipient,
    messagePreview: params.message.slice(0, 300),
    metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
  });

  if (claim.replay && claim.status !== "RECEIVED") {
    return {
      replay: true,
      status: claim.status,
      providerMessageId: claim.providerMessageId,
    };
  }

  const connection = await findWhatsAppConnection({
    businessId: params.integration.businessId,
  });
  if (
    !connection
    || !connection.isActive
    || connection.status !== "ACTIVE"
    || !connection.externalAccountKey
  ) {
    await repo.completeIntegrationEvent({
      eventLogId: claim.eventLogId,
      status: "FAILED",
      errorCode: "WHATSAPP_NOT_READY",
    });
    throw new ValidationError("WhatsApp is not ready");
  }

  try {
    const sent = await sendAccountMessage({
      accountKey: connection.externalAccountKey,
      phone: params.recipient,
      message: params.message,
      idempotencyKey: `erp-event:${params.integration.integrationId}:${params.externalEventId}`,
    });
    if (!sent.success) {
      throw new Error(sent.code || "WHATSAPP_SEND_FAILED");
    }
    await repo.completeIntegrationEvent({
      eventLogId: claim.eventLogId,
      status: "SENT",
      providerMessageId: sent.messageId ?? null,
    });
    return {
      replay: claim.replay,
      status: "SENT",
      providerMessageId: sent.messageId ?? null,
    };
  } catch (error) {
    const code = error instanceof Error
      ? error.message.slice(0, 128)
      : "WHATSAPP_SEND_FAILED";
    await repo.completeIntegrationEvent({
      eventLogId: claim.eventLogId,
      status: "FAILED",
      errorCode: code,
    });
    throw error;
  }
}

export function getIntegrationOutboundToken(integration: Integration): string | null {
  return integration.secretCiphertext
    ? decryptIntegrationSecret(integration.secretCiphertext)
    : null;
}

export { INTEGRATION_TYPE_DRVO_ERP };
