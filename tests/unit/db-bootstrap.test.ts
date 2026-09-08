import { describe, expect, it } from "vitest";

import {
  formatSafeDbBootstrapFailure,
  isProgrammingError,
  rethrowDbBootstrapFailure,
} from "../helpers/db-bootstrap";

describe("db bootstrap error classification", () => {
  it("treats ReferenceError as a programming error (must not skip)", () => {
    expect(isProgrammingError(new ReferenceError("getPool is not defined"))).toBe(
      true,
    );
  });

  it("treats TypeError as a programming error", () => {
    expect(isProgrammingError(new TypeError("x is not a function"))).toBe(true);
  });

  it("does not treat ordinary Errors as programming errors", () => {
    expect(isProgrammingError(new Error("Failed to connect to 127.0.0.1:1433"))).toBe(
      false,
    );
  });

  it("rethrows ReferenceError unchanged so it cannot be masked as DB skip", () => {
    const err = new ReferenceError("getPool is not defined");
    expect(() => rethrowDbBootstrapFailure(err)).toThrow(ReferenceError);
    expect(() => rethrowDbBootstrapFailure(err)).toThrow(/getPool is not defined/);
  });

  it("fails loudly for connection errors when DB_* is configured", () => {
    expect(() =>
      rethrowDbBootstrapFailure(new Error("Failed to connect to 127.0.0.1:1433")),
    ).toThrow(/failing tenant isolation suite \(not skipped\)/i);
  });

  it("redacts password-like fragments from failure summaries", () => {
    const summary = formatSafeDbBootstrapFailure(
      new Error("Login failed; Password=SuperSecret123; PWD=also-secret"),
    );
    expect(summary).not.toMatch(/SuperSecret123/);
    expect(summary).not.toMatch(/also-secret/);
    expect(summary).toMatch(/\[REDACTED\]/);
  });
});
