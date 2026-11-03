import { describe, expect, it, vi } from "vitest";

const getMembership = vi.hoisted(() => vi.fn());

vi.mock("@/modules/businesses/repository", () => ({ getMembership }));
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";

describe("campaign owner authorization", () => {
  const context = { businessId: "b-1", userId: "user-1" };

  it("permits active owner only", async () => {
    getMembership.mockResolvedValueOnce({ role: "OWNER", status: "ACTIVE" });
    await expect(requireLabelCampaignOwner(context)).resolves.toBeUndefined();
    expect(getMembership).toHaveBeenCalledWith(context);
  });

  it.each([
    { role: "ADMIN", status: "ACTIVE" },
    { role: "MEMBER", status: "ACTIVE" },
    { role: "OWNER", status: "INACTIVE" },
    null,
  ])("blocks non-owners or inactive memberships: %s", async member => {
    getMembership.mockResolvedValueOnce(member);
    await expect(requireLabelCampaignOwner(context)).rejects.toThrow("OWNER_ROLE_REQUIRED_FOR_CAMPAIGN");
  });
});
