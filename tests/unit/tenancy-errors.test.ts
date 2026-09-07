import { describe, expect, it } from "vitest";

import {
  AuthError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/tenancy/errors";

describe("tenancy errors", () => {
  it("AuthError maps to 401", () => {
    const error = new AuthError();
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("AuthError");
  });

  it("ForbiddenError maps to 403", () => {
    const error = new ForbiddenError("nope");
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("nope");
  });

  it("NotFoundError maps to 404", () => {
    const error = new NotFoundError("missing");
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("missing");
  });
});
