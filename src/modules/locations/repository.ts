import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import type { Location } from "@/types/domain";

type LocationRow = {
  LocationID: string;
  BusinessID: string;
  Name: string;
  Code: string | null;
  Timezone: string | null;
  AddressLine: string | null;
  City: string | null;
  Phone: string | null;
  IsActive: boolean;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapLocation(row: LocationRow): Location {
  return {
    locationId: row.LocationID,
    businessId: row.BusinessID,
    name: row.Name,
    code: row.Code,
    timezone: row.Timezone,
    addressLine: row.AddressLine,
    city: row.City,
    phone: row.Phone,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function listLocations(params: {
  businessId: string;
}): Promise<Location[]> {
  const result = await query<LocationRow>(
    `SELECT LocationID, BusinessID, Name, Code, Timezone, AddressLine, City, Phone,
            IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblLocation
     WHERE BusinessID = @businessId
     ORDER BY Name`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  return result.recordset.map(mapLocation);
}

export async function getLocation(params: {
  businessId: string;
  locationId: string;
}): Promise<Location | null> {
  const result = await query<LocationRow>(
    `SELECT LocationID, BusinessID, Name, Code, Timezone, AddressLine, City, Phone,
            IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblLocation
     WHERE BusinessID = @businessId AND LocationID = @locationId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "locationId",
        type: sql.UniqueIdentifier,
        value: params.locationId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapLocation(row) : null;
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
  const locationId = randomUUID();
  const now = new Date();
  const isActive = params.isActive ?? true;

  await query(
    `INSERT INTO TblLocation (
      LocationID, BusinessID, Name, Code, Timezone, AddressLine, City, Phone,
      IsActive, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @locationId, @businessId, @name, @code, @timezone, @addressLine, @city, @phone,
      @isActive, @createdAtUtc, @updatedAtUtc
    )`,
    [
      { name: "locationId", type: sql.UniqueIdentifier, value: locationId },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "name", type: sql.NVarChar(200), value: params.name },
      {
        name: "code",
        type: sql.NVarChar(64),
        value: params.code ?? null,
      },
      {
        name: "timezone",
        type: sql.NVarChar(64),
        value: params.timezone ?? null,
      },
      {
        name: "addressLine",
        type: sql.NVarChar(300),
        value: params.addressLine ?? null,
      },
      { name: "city", type: sql.NVarChar(100), value: params.city ?? null },
      { name: "phone", type: sql.NVarChar(32), value: params.phone ?? null },
      { name: "isActive", type: sql.Bit, value: isActive },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    locationId,
    businessId: params.businessId,
    name: params.name,
    code: params.code ?? null,
    timezone: params.timezone ?? null,
    addressLine: params.addressLine ?? null,
    city: params.city ?? null,
    phone: params.phone ?? null,
    isActive,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
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
}): Promise<Location | null> {
  const existing = await getLocation({
    businessId: params.businessId,
    locationId: params.locationId,
  });
  if (!existing) {
    return null;
  }

  const next = {
    name: params.name ?? existing.name,
    code: params.code === undefined ? existing.code : params.code,
    timezone:
      params.timezone === undefined ? existing.timezone : params.timezone,
    addressLine:
      params.addressLine === undefined
        ? existing.addressLine
        : params.addressLine,
    city: params.city === undefined ? existing.city : params.city,
    phone: params.phone === undefined ? existing.phone : params.phone,
    isActive: params.isActive ?? existing.isActive,
  };
  const now = new Date();

  await query(
    `UPDATE TblLocation
     SET Name = @name,
         Code = @code,
         Timezone = @timezone,
         AddressLine = @addressLine,
         City = @city,
         Phone = @phone,
         IsActive = @isActive,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId AND LocationID = @locationId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "locationId",
        type: sql.UniqueIdentifier,
        value: params.locationId,
      },
      { name: "name", type: sql.NVarChar(200), value: next.name },
      { name: "code", type: sql.NVarChar(64), value: next.code },
      { name: "timezone", type: sql.NVarChar(64), value: next.timezone },
      {
        name: "addressLine",
        type: sql.NVarChar(300),
        value: next.addressLine,
      },
      { name: "city", type: sql.NVarChar(100), value: next.city },
      { name: "phone", type: sql.NVarChar(32), value: next.phone },
      { name: "isActive", type: sql.Bit, value: next.isActive },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return { ...existing, ...next, updatedAtUtc: now };
}

export async function deleteLocation(params: {
  businessId: string;
  locationId: string;
}): Promise<boolean> {
  const affected = await query(
    `DELETE FROM TblLocation
     WHERE BusinessID = @businessId AND LocationID = @locationId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "locationId",
        type: sql.UniqueIdentifier,
        value: params.locationId,
      },
    ],
  );
  return (affected.rowsAffected[0] ?? 0) > 0;
}
