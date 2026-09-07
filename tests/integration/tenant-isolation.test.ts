import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig } from "@/lib/db";
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  requireAuthenticatedUser,
  requireBusinessMembership,
  setActiveBusiness,
} from "@/lib/tenancy";
import { createSession } from "@/modules/auth/session";
import { signup } from "@/modules/auth/service";
import { getAgent, updateAgent } from "@/modules/agents/service";
import { getSubscription } from "@/modules/billing/service";
import {
  createChannelConnectionShell,
  getConnection,
  listConnections,
} from "@/modules/channels/service";
import {
  listIntegrations,
  upsertIntegrationShell,
} from "@/modules/integrations/service";
import { listItems, updateItem } from "@/modules/knowledge/service";
import {
  getLocation,
  listLocations,
  updateLocation,
} from "@/modules/locations/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import {
  getBusinessById,
  listBusinessesForUser,
} from "@/modules/businesses/service";
import { clearTestCookies } from "../helpers/cookies";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbEnvOk = dbEnvConfigured();
let dbSkipReason: string | null = dbEnvOk
  ? null
  : "DB_* env not configured — tenant isolation suite skipped (not a pass of isolation)";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) {
    skip(dbSkipReason);
  }
}

describe("tenant isolation", () => {
  let userAId = "";
  let sessionAId = "";
  let businessAId = "";
  let agentAId = "";
  let locationAId = "";
  let knowledgeAId = "";

  let userBId = "";
  let sessionBId = "";
  let businessBId = "";
  let agentBId = "";
  let locationBId = "";
  let knowledgeBId = "";
  let channelBId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[tenant-isolation] ${dbSkipReason}`);
      return;
    }

    try {
      await getPool();
    } catch {
      dbSkipReason =
        "Database connection failed — tenant isolation suite skipped (not a pass of isolation)";
      console.warn(`[tenant-isolation] ${dbSkipReason}`);
      return;
    }

    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);

    const a = await signup({
      email: `tenant-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Tenant A",
    });
    userAId = a.user.userId;
    sessionAId = a.session.sessionId;

    const onboardA = await completeOnboarding({
      userId: userAId,
      sessionId: sessionAId,
      business: {
        name: `Business A ${suffix}`,
        category: "clinic",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: {
        name: "Location A",
        city: "Riyadh",
      },
      agent: {
        name: "Agent A",
        roleTitle: "Receptionist",
        language: "ar",
      },
      knowledgeItems: [
        {
          category: "ABOUT",
          title: "About A",
          content: "Business A knowledge",
        },
      ],
    });
    businessAId = onboardA.business.businessId;
    agentAId = onboardA.agent.agentId;
    locationAId = onboardA.location!.locationId;
    knowledgeAId = onboardA.knowledgeItems[0]!.knowledgeItemId;

    clearTestCookies();
    const b = await signup({
      email: `tenant-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Tenant B",
    });
    userBId = b.user.userId;
    sessionBId = b.session.sessionId;

    const onboardB = await completeOnboarding({
      userId: userBId,
      sessionId: sessionBId,
      business: {
        name: `Business B ${suffix}`,
        category: "clinic",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: {
        name: "Location B",
        city: "Jeddah",
      },
      agent: {
        name: "Agent B",
        roleTitle: "Receptionist",
        language: "ar",
      },
      knowledgeItems: [
        {
          category: "ABOUT",
          title: "About B",
          content: "Business B knowledge",
        },
      ],
    });
    businessBId = onboardB.business.businessId;
    agentBId = onboardB.agent.agentId;
    locationBId = onboardB.location!.locationId;
    knowledgeBId = onboardB.knowledgeItems[0]!.knowledgeItemId;

    const channelB = await createChannelConnectionShell({
      businessId: businessBId,
      displayName: "B WhatsApp shell",
    });
    channelBId = channelB.channelConnectionId;

    await upsertIntegrationShell({
      businessId: businessBId,
      status: "INACTIVE",
      config: { note: "b-only" },
    });
  }, 120_000);

  afterAll(async () => {
    clearTestCookies();
    await closePool().catch(() => undefined);
  });

  it("denies anonymous access via requireAuthenticatedUser", ({ skip }) => {
    requireDb(skip);
    clearTestCookies();
    return expect(requireAuthenticatedUser()).rejects.toBeInstanceOf(AuthError);
  });

  it("allows A membership on A resources", async ({ skip }) => {
    requireDb(skip);

    const membership = await requireBusinessMembership(userAId, businessAId);
    expect(membership.businessId).toBe(businessAId);

    const businesses = await listBusinessesForUser(userAId);
    expect(businesses.some((b) => b.businessId === businessAId)).toBe(true);
    expect(businesses.some((b) => b.businessId === businessBId)).toBe(false);

    const locations = await listLocations({ businessId: businessAId });
    expect(locations.some((l) => l.locationId === locationAId)).toBe(true);

    const items = await listItems({ businessId: businessAId });
    expect(items.some((i) => i.knowledgeItemId === knowledgeAId)).toBe(true);

    const sub = await getSubscription({ businessId: businessAId });
    expect(sub?.businessId).toBe(businessAId);

    await setActiveBusiness({
      sessionId: sessionAId,
      userId: userAId,
      businessId: businessAId,
    });

    const agent = await getAgent({
      businessId: businessAId,
      agentId: agentAId,
    });
    expect(agent.agentId).toBe(agentAId);
  });

  it("blocks A from B membership and setActiveBusiness", async ({ skip }) => {
    requireDb(skip);

    await expect(
      requireBusinessMembership(userAId, businessBId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      setActiveBusiness({
        sessionId: sessionAId,
        userId: userAId,
        businessId: businessBId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("scopes agent/knowledge/location reads and updates by businessId", async ({
    skip,
  }) => {
    requireDb(skip);

    await expect(
      getAgent({ businessId: businessAId, agentId: agentBId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      updateAgent({
        businessId: businessAId,
        agentId: agentBId,
        name: "Hijacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      getLocation({ businessId: businessAId, locationId: locationBId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      updateLocation({
        businessId: businessAId,
        locationId: locationBId,
        name: "Hijacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      updateItem({
        businessId: businessAId,
        knowledgeItemId: knowledgeBId,
        title: "Hijacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const aKnowledge = await listItems({ businessId: businessAId });
    expect(aKnowledge.some((i) => i.knowledgeItemId === knowledgeBId)).toBe(
      false,
    );
  });

  it("scopes channel, integration, and subscription by business", async ({
    skip,
  }) => {
    requireDb(skip);

    const aChannels = await listConnections({ businessId: businessAId });
    expect(
      aChannels.some((c) => c.channelConnectionId === channelBId),
    ).toBe(false);

    await expect(
      getConnection({
        businessId: businessAId,
        channelConnectionId: channelBId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const aIntegrations = await listIntegrations({ businessId: businessAId });
    expect(aIntegrations.every((i) => i.businessId === businessAId)).toBe(true);

    const bIntegrations = await listIntegrations({ businessId: businessBId });
    expect(bIntegrations.length).toBeGreaterThan(0);

    const aSub = await getSubscription({ businessId: businessAId });
    const bSub = await getSubscription({ businessId: businessBId });
    expect(aSub?.businessId).toBe(businessAId);
    expect(bSub?.businessId).toBe(businessBId);
    expect(aSub?.subscriptionId).not.toBe(bSub?.subscriptionId);
  });

  it("requires membership to access known foreign business ids", async ({
    skip,
  }) => {
    requireDb(skip);

    const listed = await listBusinessesForUser(userAId);
    expect(listed.map((b) => b.businessId)).not.toContain(businessBId);

    const foreign = await getBusinessById({ businessId: businessBId });
    expect(foreign.businessId).toBe(businessBId);
    await expect(
      requireBusinessMembership(userAId, foreign.businessId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows A session without granting B workspace switch", async ({
    skip,
  }) => {
    requireDb(skip);

    const { session } = await createSession({
      userId: userAId,
      activeBusinessId: businessAId,
    });
    expect(session.userId).toBe(userAId);

    await expect(
      setActiveBusiness({
        sessionId: session.sessionId,
        userId: userAId,
        businessId: businessBId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
