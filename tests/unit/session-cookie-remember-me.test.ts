import { beforeEach, describe, expect, it, vi } from "vitest";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
}));

import { SESSION_COOKIE_NAME, setSessionCookie } from "@/modules/auth/session-cookie";

describe("login remember me cookie", () => {
  beforeEach(() => {
    setCookie.mockReset();
  });

  it("sets a browser-session cookie when remember me is off", async () => {
    await setSessionCookie("short-lived", false);

    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: SESSION_COOKIE_NAME,
        value: "short-lived",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
    expect(setCookie.mock.calls[0][0]).not.toHaveProperty("maxAge");
    expect(setCookie.mock.calls[0][0]).not.toHaveProperty("expires");
  });

  it("persists for 14 days when remember me is on", async () => {
    await setSessionCookie("remembered", true);

    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: SESSION_COOKIE_NAME,
        value: "remembered",
        maxAge: 60 * 60 * 24 * 14,
        httpOnly: true,
      }),
    );
  });

  it("keeps the pre-existing persistent behavior for signup and legacy callers", async () => {
    await setSessionCookie("legacy");

    expect(setCookie.mock.calls[0][0]).toHaveProperty("maxAge", 60 * 60 * 24 * 14);
  });
});
