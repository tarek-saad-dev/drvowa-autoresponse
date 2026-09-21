import { ForbiddenError, NotFoundError } from "@/lib/tenancy/errors";
import { getAgent, listAgents } from "@/modules/agents/service";
import {
  findWhatsAppConnection,
  getChannelConnection,
} from "@/modules/channels/repository";
import type { ChannelAiSetting } from "@/types/domain";

import * as settingsRepo from "./settings-repository";

export async function getWhatsAppAiSetting(params: {
  businessId: string;
}): Promise<ChannelAiSetting | null> {
  return settingsRepo.getChannelAiSettingForBusiness(params);
}

export async function upsertWhatsAppAiSetting(params: {
  businessId: string;
  agentId: string;
  autoReplyEnabled: boolean;
  debounceMs?: number;
  channelConnectionId?: string;
}): Promise<ChannelAiSetting> {
  const connection = params.channelConnectionId
    ? await getChannelConnection({
        businessId: params.businessId,
        channelConnectionId: params.channelConnectionId,
      })
    : await findWhatsAppConnection({ businessId: params.businessId });

  if (!connection) {
    throw new NotFoundError("WhatsApp channel connection not found");
  }
  if (connection.businessId !== params.businessId) {
    throw new ForbiddenError("Channel connection access denied");
  }

  const agent = await getAgent({
    businessId: params.businessId,
    agentId: params.agentId,
  });
  if (!agent.isActive && params.autoReplyEnabled) {
    throw new ForbiddenError("Cannot enable auto-reply with an inactive agent");
  }
  if (params.autoReplyEnabled && connection.status !== "ACTIVE") {
    throw new ForbiddenError(
      "WhatsApp must be connected before enabling auto-reply",
    );
  }

  return settingsRepo.upsertChannelAiSetting({
    businessId: params.businessId,
    channelConnectionId: connection.channelConnectionId,
    agentId: agent.agentId,
    autoReplyEnabled: params.autoReplyEnabled,
    debounceMs: params.debounceMs,
  });
}

export async function listActiveAgentsForAi(params: {
  businessId: string;
}) {
  const agents = await listAgents({ businessId: params.businessId });
  return agents.filter((a) => a.isActive);
}

export { getChannelAiSettingByConnection } from "./settings-repository";
