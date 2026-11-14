import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const deploy = read(".github/workflows/deploy-production.yml");
const styles = read("src/app/globals.css");
const logo = read("src/components/brand/brand-logo.tsx");

describe("DRVO Brand V2 visual-only deployment invariants", () => {
  it("uses the approved theme palette with the current original logos", () => {
    for (const hex of ["#0b0f14", "#151b23", "#f7f9fc", "#7bf36a"]) {
      expect(styles.toLowerCase()).toContain(hex);
    }
    expect(logo).toContain("/brand/logo-on-dark.png");
    expect(logo).toContain("/brand/logo-on-light.png");
    expect(logo).toContain("/api/brand/assets/primary-dark");
    expect(logo).toContain("/api/brand/assets/primary-light");
  });

  it("requires an explicit one-commit visual scope verified against deployed SHA", () => {
    expect(deploy).toContain('case "$DEPLOY_TITLE" in');
    expect(deploy).toContain('"release(visual-only):"*');
    expect(deploy).toContain('test "$CURRENT_SHA" = "$DEPLOY_BEFORE"');
    expect(deploy).toContain('git rev-list --count "$DEPLOY_BEFORE..$DEPLOY_SHA"');
    expect(deploy).toContain('git diff --name-only "$DEPLOY_BEFORE" "$DEPLOY_SHA"');
    expect(deploy).toContain("src/app/api/*|src/app/admin/brand-assets/*|src/modules/*");
    expect(deploy).toContain("BLOCKED: non-visual file in UI-only release");
  });

  it("never migrates data, rewrites feature flags, or restarts the worker in visual mode", () => {
    expect(deploy).toContain('if [ "$VISUAL_ONLY" != 1 ] && [ "$BRAND_ASSETS_ONLY" != 1 ] && [ "$PULSE_TEAM_ONLY" != 1 ]; then');
    expect(deploy).toContain('echo "==> UI-only release: SQL migrations explicitly skipped"');
    expect(deploy).toContain("preserving all existing production secrets and feature flags");
    expect(deploy).toContain("AI worker stays running without restart");
    expect(deploy).toContain("no SQL or billing scheduler modifications");
    expect(deploy).toContain('"release(pulse-team-chat-no-db):"*');
    expect(deploy).toContain("BLOCKED: non-UI file in no-DB Pulse team release");
  });

  it("retains SQL backup gate for all other releases and app rollback for UI failures", () => {
    expect(deploy).toContain("Checking production SQL full-backup metadata");
    // Missing / damaged / invalid backup records still block. For a prelaunch
    // pilot, backup age is advisory rather than a hard 24-hour cutoff.
    expect(deploy).toContain("no full SQL backup record found for the current database");
    expect(deploy).toContain("latest full SQL backup metadata is invalid or damaged");
    expect(deploy).toContain("latest full SQL backup has invalid or future timestamp");
    expect(deploy).toContain("SQL account lacks permission to read msdb backup metadata");
    expect(deploy).toContain("if (ageHours > 24)");
    expect(deploy).toContain('console.warn("WARNING: latest full SQL backup is older than 24 hours; recovery may lose newer data")');
    expect(deploy).toContain("metadata does NOT prove the backup file exists or is restorable");
    expect(deploy).toContain("process.exitCode = 1");
    expect(deploy.indexOf("Checking production SQL full-backup metadata")).toBeLessThan(
      deploy.indexOf('git checkout --detach "$DEPLOY_SHA"'),
    );
    expect(deploy).toContain("rollback_visual_release");
    expect(deploy).toContain('git checkout --detach "$CURRENT_SHA"');
  });
});
