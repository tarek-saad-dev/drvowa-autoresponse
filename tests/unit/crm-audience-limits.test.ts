import { describe, expect, it } from "vitest";

import {
  AUDIENCE_PREVIEW_PAGE_SIZE,
  AUDIENCE_SNAPSHOT_MAX_ROWS,
} from "@/modules/crm/audience-service";
import { AUDIENCE_MAX_ROWS } from "@/modules/crm/audience-compiler";

describe("audience size limits", () => {
  it("keeps preview page smaller than snapshot materialization cap", () => {
    expect(AUDIENCE_PREVIEW_PAGE_SIZE).toBeLessThanOrEqual(100);
    expect(AUDIENCE_SNAPSHOT_MAX_ROWS).toBe(AUDIENCE_MAX_ROWS);
    expect(AUDIENCE_SNAPSHOT_MAX_ROWS).toBe(2000);
    expect(AUDIENCE_PREVIEW_PAGE_SIZE).toBeLessThan(AUDIENCE_SNAPSHOT_MAX_ROWS);
  });
});
