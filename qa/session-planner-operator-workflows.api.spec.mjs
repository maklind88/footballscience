import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const drill = readFileSync(
  new URL("../.github/workflows/session-planner-staging-drill.yml", import.meta.url),
  "utf8"
);
const recovery = readFileSync(
  new URL("../.github/workflows/session-planner-staging-recovery.yml", import.meta.url),
  "utf8"
);

for (const [name, workflow] of [
  ["drill", drill],
  ["recovery", recovery],
]) {
  test(`Session Planner ${name} workflow is manual, staging-only, and serialized`, () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: platform-staging");
    expect(workflow).toContain("group: session-planner-migration-staging");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("SESSION_PLANNER_MIGRATION_TARGET: staging");
    expect(workflow).toContain(
      'GITHUB_REPOSITORY" != "maklind88/footballscience'
    );
    expect(workflow).toContain('GITHUB_REF" != "refs/heads/main');
    expect(workflow).toContain(
      "SESSION_PLANNER_EXPECTED_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}"
    );
    expect(workflow).toContain(
      "CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: ${{ vars.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF }}"
    );
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}"
    );
    expect(workflow).toContain("containsCoachingContent !== false");
    expect(workflow).not.toContain("platform-production");
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).not.toMatch(/\n\s*(push|schedule):/);
  });
}

test("Session Planner drill workflow binds writes to the reviewed source and bundle", () => {
  expect(drill).toContain("RUN_SESSION_PLANNER_STAGING_DRILL");
  expect(drill).toContain("SESSION_PLANNER_EXPECTED_SOURCE_REVISION");
  expect(drill).toContain("SESSION_PLANNER_EXPECTED_SOURCE_HASH");
  expect(drill).toContain("SESSION_PLANNER_EXPECTED_BUNDLE_SHA256");
  expect(drill).toContain("recoveryPackageReceipt?.readAfterWriteVerified !== true");
  expect(drill).toContain(
    "summary.firstApply?.projectionSha256 !== summary.reapply?.projectionSha256"
  );
  expect(drill).toContain('if [ "$APPLY" = "true" ]; then');
  expect(drill).toContain("--apply");
});

test("Session Planner recovery workflow binds rollback to the private recovery receipt", () => {
  expect(recovery).toContain("RECOVER_SESSION_PLANNER_STAGING_ROLLBACK");
  expect(recovery).toContain("SESSION_PLANNER_RECOVERY_PATH");
  expect(recovery).toContain("SESSION_PLANNER_EXPECTED_RECOVERY_SHA256");
  expect(recovery).toContain("SESSION_PLANNER_EXPECTED_ROLLBACK_BUNDLE_SHA256");
  expect(recovery).toContain("summary.alreadyRestored !== true");
  expect(recovery).toContain("summary.execution?.ok !== true");
  expect(recovery).toContain('if [ "$APPLY" = "true" ]; then');
  expect(recovery).toContain("--apply");
});
