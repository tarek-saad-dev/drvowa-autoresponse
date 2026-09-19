import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Phase 3B Part 2B.1.2 migration 008 restricted-principal safety", () => {
  it("migration 008 does not require EXEC of a user-defined merge procedure", () => {
    const migrationPath = resolve(
      process.cwd(),
      "db/migrations/008_whatsapp_contact_identity_canonicalization.sql",
    );
    const text = readFileSync(migrationPath, "utf8");

    expect(text).not.toMatch(
      /EXEC\s+dbo\.usp_MergeWhatsAppContactDuplicates/i,
    );
    expect(text).not.toMatch(
      /CREATE\s+(OR\s+ALTER\s+)?PROCEDURE\s+dbo\.usp_MergeWhatsAppContactDuplicates/i,
    );
    expect(text).toMatch(
      /@include:\s*\.\.\/sql\/merge_whatsapp_contact_duplicates\.sql/i,
    );
    expect(text).toMatch(
      /DROP\s+PROCEDURE\s+dbo\.usp_MergeWhatsAppContactDuplicates/i,
    );
  });

  it("shared merge SQL has no nested transaction and no procedure wrapper", () => {
    const mergePath = resolve(
      process.cwd(),
      "db/sql/merge_whatsapp_contact_duplicates.sql",
    );
    const text = readFileSync(mergePath, "utf8");

    expect(text).not.toMatch(/CREATE\s+(OR\s+ALTER\s+)?PROCEDURE/i);
    expect(text).not.toMatch(/\bBEGIN\s+TRAN\b/i);
    expect(text).not.toMatch(/\bCOMMIT\s+TRAN\b/i);
    expect(text).toMatch(/#DupGroups/);
    expect(text).toMatch(/DEDUP_CONTACT_MERGE_PENDING/);
    expect(text).toMatch(/DEDUP_CONTACT_MERGE_PROCESSING/);
  });
});
