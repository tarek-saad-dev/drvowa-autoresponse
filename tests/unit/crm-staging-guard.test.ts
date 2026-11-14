import { describe, expect, it } from "vitest";

import { requireApprovedStagingOrigin } from "@/modules/crm/staging-guard";

describe("CRM staging HTTP guard", () => {
  const approved = [
    "https://crm-staging.example.test",
    "https://cashier-staging.example.test",
    "http://127.0.0.1:5500",
    "http://[::1]:5500",
  ];

  it("accepts explicitly approved HTTPS staging hosts and loopback", () => {
    expect(requireApprovedStagingOrigin(approved[0]!, approved)).toBe(approved[0]);
    expect(requireApprovedStagingOrigin(approved[1]!, approved)).toBe(approved[1]);
    expect(requireApprovedStagingOrigin(approved[2]!, approved)).toBe(approved[2]);
    expect(requireApprovedStagingOrigin(approved[3]!, approved)).toBe(approved[3]);
  });

  it("refuses production, unapproved or unencrypted remote hosts", () => {
    for (const value of [
      "https://app.drvotech.com",
      "https://ops.cutsaloon.com",
      "https://not-approved-staging.example.test",
      "http://crm-staging.example.test",
      "https://crm-staging.example.test.evil.com",
    ]) {
      expect(() => requireApprovedStagingOrigin(value, approved)).toThrow();
    }
  });

  it("refuses approved origins that contain embedded credentials", () => {
    expect(() => requireApprovedStagingOrigin(
      "https://crm-staging.example.test",
      ["https://name:secret@crm-staging.example.test"],
    )).toThrow();
  });

  it("refuses credentials, paths, and query strings that could redirect token use", () => {
    for (const value of [
      "https://user:pass@crm-staging.example.test",
      "https://crm-staging.example.test/other",
      "https://crm-staging.example.test?redirect=1",
      "file:///tmp/secret",
    ]) {
      expect(() => requireApprovedStagingOrigin(value, approved)).toThrow();
    }
  });
});
