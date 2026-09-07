import { NotFoundError } from "@/lib/tenancy/errors";
import type { Location } from "@/types/domain";

import * as repo from "./repository";

export async function listLocations(params: {
  businessId: string;
}): Promise<Location[]> {
  return repo.listLocations({ businessId: params.businessId });
}

export async function getLocation(params: {
  businessId: string;
  locationId: string;
}): Promise<Location> {
  const location = await repo.getLocation(params);
  if (!location) {
    throw new NotFoundError("Location not found");
  }
  return location;
}

export async function createLocation(params: {
  businessId: string;
  name: string;
  code?: string | null;
  timezone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  phone?: string | null;
  isActive?: boolean;
}): Promise<Location> {
  return repo.createLocation({
    ...params,
    name: params.name.trim(),
  });
}

export async function updateLocation(params: {
  businessId: string;
  locationId: string;
  name?: string;
  code?: string | null;
  timezone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  phone?: string | null;
  isActive?: boolean;
}): Promise<Location> {
  const updated = await repo.updateLocation({
    ...params,
    name: params.name?.trim(),
  });
  if (!updated) {
    throw new NotFoundError("Location not found");
  }
  return updated;
}

export async function deleteLocation(params: {
  businessId: string;
  locationId: string;
}): Promise<void> {
  const deleted = await repo.deleteLocation(params);
  if (!deleted) {
    throw new NotFoundError("Location not found");
  }
}
