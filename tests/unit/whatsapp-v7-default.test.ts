import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: db.query,
  sql: {
    UniqueIdentifier: "uuid", NVarChar: (length: number) => length,
    Bit: "bit", DateTime2: "date",
  },
}));
import { createChannelConnectionShell } from "@/modules/channels/repository";
const businessId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
describe("V7 default for new WhatsApp accounts", () => {
  beforeEach(() => { db.query.mockReset(); db.query.mockResolvedValue({ recordset: [] }); });
  it("persists V7 when a new WhatsApp account is created", async () => {
    const connection = await createChannelConnectionShell({ businessId, externalAccountKey: "wa_abc123def456abc123def456" });
    expect(connection.runtimeEngine).toBe("BAILEYS_V7");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO TblChannelConnection"), expect.arrayContaining([expect.objectContaining({ name: "runtimeEngine", value: "BAILEYS_V7" })]));
  });
  it("does not alter other channel defaults", async () => {
    const connection = await createChannelConnectionShell({ businessId, channel: "OTHER", provider: "OTHER" });
    expect(connection.runtimeEngine).toBe("BAILEYS_V6");
  });
  it("does not update any assigned runtime ownership in migration", () => {
    const migration = readFileSync("db/migrations/107_default_whatsapp_runtime_v7.sql", "utf8");
    expect(migration).toContain("DEFAULT (N'BAILEYS_V7')");
    expect(migration).toContain("AND ExternalAccountKey IS NULL");
    expect(migration).toContain("AND IsActive = 0");
  });
});
