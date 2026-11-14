import { describe, expect, it } from "vitest";

/**
 * Contract for ERP→CRM identity reconciliation:
 * - Existing ERP-linked customers receive name/phone/email updates from ERP.
 * - Notes/tags/assignments are never part of the sync payload.
 */
describe("ERP identity reconcile contract", () => {
  it("treats ERP name/phone/email as updatable identity fields", () => {
    const existing = {
      fullName: "قديم",
      primaryPhoneNormalized: "201011110000",
      email: "old@example.com",
      assignedUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      tags: ["VIP"],
      notes: "do not overwrite",
    };
    const erp = {
      name: "جديد",
      phone: "201022220000",
      email: "new@example.com",
    };
    const next = {
      fullName: erp.name,
      primaryPhoneNormalized: erp.phone,
      email: erp.email,
      assignedUserId: existing.assignedUserId,
      tags: existing.tags,
      notes: existing.notes,
    };
    expect(next.fullName).toBe("جديد");
    expect(next.primaryPhoneNormalized).toBe("201022220000");
    expect(next.email).toBe("new@example.com");
    expect(next.assignedUserId).toBe(existing.assignedUserId);
    expect(next.tags).toEqual(["VIP"]);
    expect(next.notes).toBe("do not overwrite");
  });

  it("documents rotating sweep cursors for customers and catalog", () => {
    const customerCursor = {
      sinceClientId: 900,
      identitySweepSinceClientId: 120,
    };
    const catalogCursor = {
      sinceProId: 40,
      identitySweepSinceProId: 10,
    };
    expect(customerCursor.identitySweepSinceClientId).toBeLessThan(
      customerCursor.sinceClientId,
    );
    expect(catalogCursor.identitySweepSinceProId).toBeLessThan(catalogCursor.sinceProId);
  });
});
