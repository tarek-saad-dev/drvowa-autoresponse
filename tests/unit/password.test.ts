import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/modules/auth/password";

describe("password hashing", () => {
  it("hashes and verifies a matching password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPassword("correct-horse-battery", hash)).resolves.toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
