import { NotFoundError } from "@/lib/tenancy/errors";
import type { Agent } from "@/types/domain";

import * as repo from "./repository";

export async function listAgents(params: {
  businessId: string;
}): Promise<Agent[]> {
  return repo.listAgents({ businessId: params.businessId });
}

export async function getAgent(params: {
  businessId: string;
  agentId: string;
}): Promise<Agent> {
  const agent = await repo.getAgent(params);
  if (!agent) {
    throw new NotFoundError("Agent not found");
  }
  return agent;
}

export async function createAgent(params: {
  businessId: string;
  name: string;
  roleTitle: string;
  language: string;
  dialect?: string | null;
  tone?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<Agent> {
  return repo.createAgent({
    ...params,
    name: params.name.trim(),
    roleTitle: params.roleTitle.trim(),
    language: params.language.trim(),
  });
}

export async function updateAgent(params: {
  businessId: string;
  agentId: string;
  name?: string;
  roleTitle?: string;
  language?: string;
  dialect?: string | null;
  tone?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<Agent> {
  const updated = await repo.updateAgent({
    ...params,
    name: params.name?.trim(),
    roleTitle: params.roleTitle?.trim(),
    language: params.language?.trim(),
  });
  if (!updated) {
    throw new NotFoundError("Agent not found");
  }
  return updated;
}

export async function deleteAgent(params: {
  businessId: string;
  agentId: string;
}): Promise<void> {
  const deleted = await repo.deleteAgent(params);
  if (!deleted) {
    throw new NotFoundError("Agent not found");
  }
}
