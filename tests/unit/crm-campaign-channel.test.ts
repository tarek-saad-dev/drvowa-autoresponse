import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

const query = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => query(...args),
  sql: {
    UniqueIdentifier: "uuid",
    NVarChar: (n: number) => `nvarchar(${n})`,
  },
}));

vi.mock("@/lib/ids/uuid", () => ({
  normalizeUuid: (value: string) => value.toLowerCase(),
}));

import { requireCampaignWhatsAppChannel } from "@/modules/crm/channel";
import { enrichAudienceMarketingEligibility } from "@/modules/crm/repository";
import {
  AUDIENCE_PREVIEW_PAGE_SIZE,
  AUDIENCE_SNAPSHOT_MAX_ROWS,
} from "@/modules/crm/audience-service";

const BUSINESS = "11111111-1111-1111-1111-111111111111";
const CHANNEL_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("requireCampaignWhatsAppChannel", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("fails closed when the business has zero active WhatsApp channels", async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    let caught: unknown;
    try {
      await requireCampaignWhatsAppChannel({ businessId: BUSINESS });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(String((caught as Error).message)).toMatch(/لا توجد قناة واتساب نشطة/);
  });

  it("requires explicit selection when multiple active channels exist", async () => {
    query.mockResolvedValueOnce({
      recordset: [
        {
          ChannelConnectionID: CHANNEL_A,
          DisplayName: "Main",
          ExternalAccountKey: null,
          Status: "ACTIVE",
          IsActive: true,
        },
        {
          ChannelConnectionID: CHANNEL_B,
          DisplayName: "Second",
          ExternalAccountKey: null,
          Status: "ACTIVE",
          IsActive: true,
        },
      ],
    });
    await expect(
      requireCampaignWhatsAppChannel({ businessId: BUSINESS }),
    ).rejects.toThrow(/أكثر من قناة/);
  });

  it("accepts an explicit active channel and never substitutes another", async () => {
    query.mockResolvedValueOnce({
      recordset: [
        {
          ChannelConnectionID: CHANNEL_B,
          DisplayName: "Second",
          ExternalAccountKey: "wa-b",
          Status: "ACTIVE",
          IsActive: true,
        },
      ],
    });
    const channel = await requireCampaignWhatsAppChannel({
      businessId: BUSINESS,
      channelConnectionId: CHANNEL_B,
    });
    expect(channel.channelConnectionId).toBe(CHANNEL_B);
    expect(channel.displayName).toBe("Second");
  });

  it("rejects an inaccessible or missing explicit channel", async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    await expect(
      requireCampaignWhatsAppChannel({
        businessId: BUSINESS,
        channelConnectionId: CHANNEL_A,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an inactive explicit channel", async () => {
    query.mockResolvedValueOnce({
      recordset: [
        {
          ChannelConnectionID: CHANNEL_A,
          DisplayName: "Old",
          ExternalAccountKey: null,
          Status: "DISCONNECTED",
          IsActive: false,
        },
      ],
    });
    await expect(
      requireCampaignWhatsAppChannel({
        businessId: BUSINESS,
        channelConnectionId: CHANNEL_A,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("auto-selects only when exactly one active channel exists", async () => {
    query.mockResolvedValueOnce({
      recordset: [
        {
          ChannelConnectionID: CHANNEL_A,
          DisplayName: "Only",
          ExternalAccountKey: null,
          Status: "ACTIVE",
          IsActive: true,
        },
      ],
    });
    const channel = await requireCampaignWhatsAppChannel({ businessId: BUSINESS });
    expect(channel.channelConnectionId).toBe(CHANNEL_A);
  });
});

describe("channel-scoped marketing eligibility", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("requires channelConnectionId and never allows cross-channel fallback", async () => {
    await expect(
      enrichAudienceMarketingEligibility({
        businessId: BUSINESS,
        channelConnectionId: "",
        rows: [
          {
            CustomerID: "c1",
            FullName: "Test",
            PrimaryPhoneNormalized: "201012345678",
            TotalSpend: 10,
            LastVisitAt: null,
          },
        ],
      }),
    ).rejects.toThrow(/channelConnectionId is required/);
  });

  it("treats consent on another channel as NO_PERMISSION for the selected channel", async () => {
    // First query = permission on CHANNEL_A (empty). Second = opt-out (empty).
    query
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] });

    const enriched = await enrichAudienceMarketingEligibility({
      businessId: BUSINESS,
      channelConnectionId: CHANNEL_A,
      rows: [
        {
          CustomerID: "22222222-2222-2222-2222-222222222222",
          FullName: "Consent elsewhere",
          PrimaryPhoneNormalized: "201011112222",
          TotalSpend: 100,
          LastVisitAt: null,
        },
      ],
    });

    expect(enriched).toHaveLength(1);
    expect(enriched[0].marketingEligible).toBe(false);
    expect(enriched[0].exclusionReason).toBe("NO_PERMISSION");
    // Permission SQL must bind the selected channel only.
    const permissionSql = String(query.mock.calls[0][0]);
    expect(permissionSql).toContain("ChannelConnectionID = @channelId");
    expect(permissionSql).not.toMatch(/ChannelConnectionID\s+IS\s+NULL/i);
  });

  it("marks opted-out phones on the selected channel as OPTED_OUT", async () => {
    query
      .mockResolvedValueOnce({ recordset: [{ PhoneNormalized: "201033334444" }] })
      .mockResolvedValueOnce({ recordset: [{ PhoneNormalized: "201033334444" }] });

    const enriched = await enrichAudienceMarketingEligibility({
      businessId: BUSINESS,
      channelConnectionId: CHANNEL_A,
      rows: [
        {
          CustomerID: "33333333-3333-3333-3333-333333333333",
          FullName: "Opted out",
          PrimaryPhoneNormalized: "201033334444",
          TotalSpend: 50,
          LastVisitAt: null,
        },
      ],
    });

    expect(enriched[0].marketingEligible).toBe(false);
    expect(enriched[0].exclusionReason).toBe("OPTED_OUT");
  });
});

describe("preview vs final audience counts", () => {
  it("keeps preview page eligibility distinct from full snapshot materialization", () => {
    expect(AUDIENCE_PREVIEW_PAGE_SIZE).toBeLessThan(AUDIENCE_SNAPSHOT_MAX_ROWS);
    // Contract: UI must not treat preview_page eligibleMarketing as the final recipient count.
    const previewScoped = {
      countsScope: "preview_page" as const,
      eligibleMarketing: 12,
      totalMatched: 400,
    };
    const fullScoped = {
      countsScope: "full_audience" as const,
      eligibleMarketing: 180,
      totalMatched: 400,
    };
    expect(previewScoped.countsScope).not.toBe(fullScoped.countsScope);
    expect(previewScoped.eligibleMarketing).not.toBe(fullScoped.eligibleMarketing);
    expect(previewScoped.totalMatched).toBe(fullScoped.totalMatched);
  });
});
