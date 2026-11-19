import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createOtpCode,
  hashOtpCode,
  matchesOtpCode,
  normalizeOtpPhone,
} from "./crypto";

const params = {
  businessId: "3f83793a-fcdc-471d-a676-e28ac8263720",
  challengeId: "ad1299fe-b4e2-4d55-a900-ea3dc938b821",
  phone: "201012345678",
  purpose: "CUT_CLUB_SIGNUP",
  code: "012345",
};

describe("WhatsApp OTP primitives", () => {
  const originalSecret = process.env.OTP_HMAC_SECRET;
  beforeEach(() => { process.env.OTP_HMAC_SECRET = "testing-only-otp-hmac-secret-with-ample-bytes"; });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = originalSecret;
  });

  it("normalizes Egyptian local and E.164 mobile numbers", () => {
    expect(normalizeOtpPhone("01012345678")).toBe("201012345678");
    expect(normalizeOtpPhone("+20 101 234 5678")).toBe("201012345678");
    expect(normalizeOtpPhone("+447911123456")).toBe("447911123456");
    expect(normalizeOtpPhone("1-800-SMS-SPAM")).toBeNull();
    expect(normalizeOtpPhone("001012345678")).toBeNull();
  });

  it("generates six-digit crypto-safe codes, including leading zeros", () => {
    for (let i = 0; i < 50; i += 1) expect(createOtpCode()).toMatch(/^\d{6}$/);
  });

  it("binds a code to its business, challenge, phone and purpose", () => {
    const hash = hashOtpCode(params);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(matchesOtpCode(hash, params)).toBe(true);
    expect(matchesOtpCode(hash, { ...params, code: "012346" })).toBe(false);
    expect(matchesOtpCode(hash, { ...params, challengeId: "other" })).toBe(false);
    expect(matchesOtpCode(hash, { ...params, phone: "201099999999" })).toBe(false);
  });
});
