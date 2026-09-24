import { describe, expect, it } from "vitest";

import { mapDbStatusFromRuntime } from "@/modules/channels/connection-lifecycle";

describe("mapDbStatusFromRuntime", () => {
  it("activates on READY after pairing", () => {
    expect(mapDbStatusFromRuntime("READY", { status: "PENDING", isActive: false })).toEqual({
      status: "ACTIVE",
      isActive: true,
    });
  });

  it("keeps ACTIVE sticky across transient reconnect states", () => {
    expect(mapDbStatusFromRuntime("STARTING", { status: "ACTIVE", isActive: true })).toEqual({
      status: "ACTIVE",
      isActive: true,
    });
    expect(mapDbStatusFromRuntime("CONNECTING", { status: "ACTIVE", isActive: true })).toEqual({
      status: "ACTIVE",
      isActive: true,
    });
    expect(mapDbStatusFromRuntime("DISCONNECTED", { status: "ACTIVE", isActive: true })).toEqual({
      status: "ACTIVE",
      isActive: true,
    });
  });

  it("maps intentional STOPPED to DISCONNECTED (not PENDING)", () => {
    expect(mapDbStatusFromRuntime("STOPPED", { status: "ACTIVE", isActive: true })).toEqual({
      status: "DISCONNECTED",
      isActive: false,
    });
  });

  it("preserves intentional INACTIVE unless READY or LOGGED_OUT", () => {
    expect(mapDbStatusFromRuntime("READY", { status: "INACTIVE", isActive: false })).toEqual({
      status: "ACTIVE",
      isActive: true,
    });
    expect(mapDbStatusFromRuntime("STARTING", { status: "INACTIVE", isActive: false })).toEqual({
      status: "INACTIVE",
      isActive: false,
    });
    expect(mapDbStatusFromRuntime("STOPPED", { status: "INACTIVE", isActive: false })).toEqual({
      status: "INACTIVE",
      isActive: false,
    });
  });

  it("does not auto-activate LOGGED_OUT", () => {
    expect(mapDbStatusFromRuntime("LOGGED_OUT", { status: "ACTIVE", isActive: true })).toEqual({
      status: "DISCONNECTED",
      isActive: false,
    });
  });

  it("first-time QR stays PENDING", () => {
    expect(mapDbStatusFromRuntime("QR_REQUIRED", null)).toEqual({
      status: "PENDING",
      isActive: false,
    });
  });
});
