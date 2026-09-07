import { NotFoundError } from "@/lib/tenancy/errors";
import type { ChannelConnection } from "@/types/domain";

import * as repo from "./repository";

export async function listConnections(params: {
  businessId: string;
}): Promise<ChannelConnection[]> {
  return repo.listChannelConnections({ businessId: params.businessId });
}

export async function getConnection(params: {
  businessId: string;
  channelConnectionId: string;
}): Promise<ChannelConnection> {
  const connection = await repo.getChannelConnection(params);
  if (!connection) {
    throw new NotFoundError("Channel connection not found");
  }
  return connection;
}

/** Inactive shell for tests / future WhatsApp pairing — no runtime. */
export async function createChannelConnectionShell(params: {
  businessId: string;
  channel?: string;
  provider?: string;
  locationId?: string | null;
  displayName?: string | null;
}): Promise<ChannelConnection> {
  return repo.createChannelConnectionShell(params);
}
