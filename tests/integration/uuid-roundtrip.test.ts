import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import { signup } from "@/modules/auth/service";
import { createBusiness } from "@/modules/businesses/service";
import {
  createLocation,
  listLocations,
} from "@/modules/locations/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
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
const dbSkipReason: string | null = dbEnvOk
  ? null
  : "DB_* env not configured — UUID roundtrip suite skipped";

describe("UUID domain canonicalization (DB roundtrip)", () => {
  let businessId = "";
  let createdLocationId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[uuid-roundtrip] ${dbSkipReason}`);
      return;
    }

    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }

    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const user = await signup({
      email: `uuid-roundtrip-${suffix}@example.com`,
      password: "Password123!",
      fullName: "UUID Roundtrip",
    });

    const business = await createBusiness({
      ownerUserId: user.user.userId,
      name: `UUID Biz ${suffix}`,
      category: "clinic",
      countryCode: "SA",
      locale: "ar-SA",
      timezone: "Asia/Riyadh",
    });
    businessId = business.businessId;

    const location = await createLocation({
      businessId,
      name: "Location A",
      city: "Riyadh",
    });
    createdLocationId = location.locationId;
  }, 120_000);

  afterAll(async () => {
    clearTestCookies();
    await closePool().catch(() => undefined);
  });

  it("createLocation LocationID equals listLocations LocationID with strict equality", async ({
    skip,
  }) => {
    if (dbSkipReason) {
      skip(dbSkipReason);
    }

    expect(createdLocationId).toBe(normalizeUuid(createdLocationId));

    const locations = await listLocations({ businessId });
    const match = locations.find((l) => l.locationId === createdLocationId);

    expect(match).toBeDefined();
    expect(match!.locationId).toBe(createdLocationId);
    expect(match!.locationId).toBe(createdLocationId.toLowerCase());
    expect(locations.some((l) => l.locationId === createdLocationId)).toBe(
      true,
    );
  });
});
