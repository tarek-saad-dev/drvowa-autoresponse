import { describe, expect, it } from "vitest";

import { parseAdminSubscriptionFilter } from "@/modules/billing/admin-subscriptions";
import { csvLine, safeCsvCell } from "@/modules/billing/admin-csv";

describe("admin subscriptions filters", () => {
  it("allows only explicit status filters", () => {
    expect(parseAdminSubscriptionFilter("paid")).toBe("PAID");
    expect(parseAdminSubscriptionFilter("EXPIRING")).toBe("EXPIRING");
    expect(parseAdminSubscriptionFilter("NO_PLAN")).toBe("NO_PLAN");
    expect(parseAdminSubscriptionFilter("status=' OR 1=1--")).toBe("ALL");
    expect(parseAdminSubscriptionFilter()).toBe("ALL");
  });
});

describe("approved collections CSV safety", () => {
  it("quotes delimiters and multiline values correctly", () => {
    expect(safeCsvCell('Business, "A"')).toBe('"Business, ""A"""');
    expect(csvLine(["alpha", 123, null])).toBe('"alpha","123",""');
    expect(safeCsvCell("hello\nworld")).toBe('"hello\nworld"');
  });

  it("neutralizes spreadsheet formula expressions", () => {
    for (const value of ["=SUM(1+1)", "+1+1", "-1+2", "@SUM(A1)", " \t=HYPERLINK(1)"]) {
      expect(safeCsvCell(value)).toBe('"\'' + value + '"');
    }
    expect(safeCsvCell("شركة عادية")).toBe('"شركة عادية"');
  });
});
