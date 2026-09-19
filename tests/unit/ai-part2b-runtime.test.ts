import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/tenancy/errors";
import { outboundObservedDtoSchema } from "@/modules/ai/observation-service";
import { sendAccountMessage } from "@/modules/channels/runtime-client";
import {
  requireRuntimeBearer,
} from "@/lib/api/runtime-auth";

describe("Phase 3B Part 2B runtime client + observation auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("1. sendAccountMessage includes idempotencyKey in body", async () => {
    process.env.WHATSAPP_RUNTIME_BASE_URL = "http://runtime.test";
    process.env.DRVOWA_RUNTIME_TOKEN = "runtime-token-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        status: "sent",
        messageId: "m-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendAccountMessage({
      accountKey: "acct",
      phone: "201555900001",
      message: "hi",
      idempotencyKey: "ai:31d6e6ce-900b-4cfd-b8f5-e92b08047ee3",
    });

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({
      phone: "201555900001",
      message: "hi",
      idempotencyKey: "ai:31d6e6ce-900b-4cfd-b8f5-e92b08047ee3",
    });
  });

  it("38. outbound-observed rejects missing/invalid runtime token", () => {
    const prev = process.env.DRVOWA_RUNTIME_TOKEN;
    process.env.DRVOWA_RUNTIME_TOKEN = "expected-token";
    expect(() => requireRuntimeBearer(null)).toThrow(AuthError);
    expect(() => requireRuntimeBearer("Bearer wrong")).toThrow(AuthError);
    expect(() => requireRuntimeBearer("Bearer expected-token")).not.toThrow();
    process.env.DRVOWA_RUNTIME_TOKEN = prev;
  });

  it("observation schema validates origin enum", () => {
    expect(() =>
      outboundObservedDtoSchema.parse({
        accountKey: "a",
        provider: "baileys",
        providerMessageId: "p1",
        origin: "HUMAN_MANUAL",
      }),
    ).not.toThrow();
    expect(() =>
      outboundObservedDtoSchema.parse({
        accountKey: "a",
        provider: "baileys",
        providerMessageId: "p1",
        origin: "BOT",
      }),
    ).toThrow();
  });
});

describe("Phase 3B Part 2B graceful worker shutdown semantics", () => {
  it("42/43. shutdown stops claims and waits for in-flight", async () => {
    let stopping = false;
    let inFlight = 0;
    let claims = 0;
    const claim = async () => {
      if (stopping) return null;
      claims += 1;
      return { id: claims };
    };

    const requestShutdown = () => {
      stopping = true;
    };

    inFlight = 1;
    const work = new Promise<void>((resolve) => {
      setTimeout(() => {
        inFlight -= 1;
        resolve();
      }, 30);
    });

    requestShutdown();
    const afterShutdownClaim = await claim();
    expect(afterShutdownClaim).toBeNull();

    const deadline = Date.now() + 5_000;
    while (inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await work;
    expect(inFlight).toBe(0);
    expect(stopping).toBe(true);
  });
});
