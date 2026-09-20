import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("AI worker status oldest-age SQL", () => {
  it("uses MAX(DATEDIFF) for oldest pending/processing ages", () => {
    const src = readFileSync(
      join(process.cwd(), "src/modules/ai/worker-status.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /MAX\(DATEDIFF\(second, j\.CreatedAtUtc, SYSUTCDATETIME\(\)\)\)/,
    );
    expect(src).toMatch(
      /MAX\(DATEDIFF\(second, j\.StartedAtUtc, SYSUTCDATETIME\(\)\)\)/,
    );
    expect(src).not.toMatch(
      /MIN\(DATEDIFF\(second, j\.CreatedAtUtc, SYSUTCDATETIME\(\)\)\)/,
    );
    expect(src).not.toMatch(
      /MIN\(DATEDIFF\(second, j\.StartedAtUtc, SYSUTCDATETIME\(\)\)\)/,
    );
  });
});
