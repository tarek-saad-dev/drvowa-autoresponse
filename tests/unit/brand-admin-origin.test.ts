import { describe, expect, it } from "vitest";

import { assertBrandAdminSameOrigin } from "@/lib/security/brand-origin";

const INTERNAL_URL = "http://127.0.0.1:3100/api/admin/brand-assets";

function attempt(origin?: string, host = "127.0.0.1:3100", forwardedHost?: string): () => void {
  const headers = new Headers({ host });
  if (origin !== undefined) headers.set("origin", origin);
  if (forwardedHost !== undefined) headers.set("x-forwarded-host", forwardedHost);
  const request = new Request(INTERNAL_URL, { method: "POST", headers });
  return () => assertBrandAdminSameOrigin(request);
}

describe("Admin Brand Assets same-origin checks behind Nginx", () => {
  it("accepts real public admin Origin despite Next receiving an internal proxy URL", () => {
    expect(attempt("https://app.drvotech.com")).not.toThrow();
    expect(attempt("https://app.drvotech.com", "app.drvotech.com")).not.toThrow();
  });

  it("does not grant access based on Host or spoofable forwarded headers", () => {
    expect(attempt("https://attacker.example", "app.drvotech.com", "app.drvotech.com")).toThrow();
    expect(attempt("https://attacker.example", "attacker.example", "attacker.example")).toThrow();
    expect(attempt("https://attacker.example", "127.0.0.1:3100", "app.drvotech.com")).toThrow();
  });

  it("rejects missing, null, insecure and malformed browser origins", () => {
    for (const origin of [undefined, "null", "http://app.drvotech.com",
      "https://evil.example", "https://app.drvotech.com.attacker.example",
      "https://app.drvotech.com/other", "https://user@app.drvotech.com"]) {
      expect(attempt(origin)).toThrow("طلب التعديل لازم يكون من نفس موقع الإدارة.");
    }
  });

  it("accepts a secure explicitly configured staging admin origin only when matched exactly", () => {
    const original = process.env.DRVO_ADMIN_PUBLIC_ORIGIN;
    try {
      process.env.DRVO_ADMIN_PUBLIC_ORIGIN = "https://staging.drvotech.com";
      expect(attempt("https://staging.drvotech.com")).not.toThrow();
      expect(attempt("https://app.drvotech.com")).toThrow();
    } finally {
      if (original === undefined) delete process.env.DRVO_ADMIN_PUBLIC_ORIGIN;
      else process.env.DRVO_ADMIN_PUBLIC_ORIGIN = original;
    }
  });
});
