import { describe, expect, it } from "vitest";
import { customerRefundStatus } from "@/modules/billing/customer-account-actions";

describe("customer refund display never claims money moved without admin confirmation", () => {
  it("separates a customer request from an initiated financial refund", () => {
    expect(customerRefundStatus(null, null)).toBe("NONE");
    expect(customerRefundStatus(null, "REQUESTED")).toBe("REQUESTED");
    expect(customerRefundStatus("PENDING", "REQUESTED")).toBe("PROCESSING");
    expect(customerRefundStatus("SUCCEEDED", "REQUESTED")).toBe("SUCCEEDED");
  });
  it("surfaces rejected customer requests and failed manual transfers separately", () => {
    expect(customerRefundStatus(null, "REJECTED")).toBe("REJECTED");
    expect(customerRefundStatus("FAILED", "REQUESTED")).toBe("FAILED");
  });
});
