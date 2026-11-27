import { describe, expect, it } from "vitest";
import { normalizePrivatePhone, isPrivateContactBlocked } from "@/modules/messaging/private-contact-policy";
describe("private contact policy", () => {
  it("uses international numbers and never guesses LID", () => {
    expect(normalizePrivatePhone("+20 (100) 123-4567")).toBe("201001234567");
    expect(normalizePrivatePhone("01001234567")).toBeNull();
    expect(normalizePrivatePhone("12345678@lid")).toBeNull();
  });
  it("blocks private and unresolved identities only when exclusions exist", () => {
    const list = ["201001234567"];
    expect(isPrivateContactBlocked(list, "201001234567")).toBe(true);
    expect(isPrivateContactBlocked(list, null)).toBe(true);
    expect(isPrivateContactBlocked(list, "201001234568")).toBe(false);
    expect(isPrivateContactBlocked([], null)).toBe(false);
  });
});
