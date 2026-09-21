'use strict';

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("migration 013 commercial plans and billing provider", () => {
  it("seeds plan codes and billing webhook table without prices", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "db/migrations/013_commercial_plans_and_billing_provider.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/N'STARTER'/);
    expect(sql).toMatch(/N'PRO'/);
    expect(sql).toMatch(/N'BUSINESS'/);
    expect(sql).toMatch(/TblBillingWebhookEvent/);
    expect(sql).toMatch(/ProviderName/);
    expect(sql).toMatch(/ExternalCustomerId/);
    expect(sql).toMatch(/ExternalSubscriptionId/);
    expect(sql).toMatch(/UQ_TblSubscription_ExternalSubscriptionId/);
    expect(sql).toMatch(/UQ_TblBillingWebhookEvent_Provider_Event/);
    expect(sql).not.toMatch(/\bPrice(Amount|Cents|Monthly)?\b/);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});
