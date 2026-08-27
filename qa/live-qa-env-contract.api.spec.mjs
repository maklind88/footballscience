import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("staging smoke binds the read-only Leaderboard proof to staging", () => {
  const workflow = fs.readFileSync(path.join(rootDir, ".github/workflows/staging-deploy.yml"), "utf8");

  expect(workflow).toContain("LEADERBOARD_READONLY_EXPECTED_ORIGIN: ${{ vars.STAGING_QA_BASE_URL }}");
  expect(workflow).toContain("LEADERBOARD_READONLY_EXPECTED_SUPABASE_REF: ${{ vars.STAGING_SUPABASE_PROJECT_REF }}");
  expect(workflow).toContain("LEADERBOARD_READONLY_DENIED_SUPABASE_REF: ${{ vars.SUPABASE_PROJECT_REF }}");
});

function runNodeScript(relativePath, env = {}) {
  return spawnSync(process.execPath, [path.join(rootDir, relativePath)], {
    cwd: rootDir,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

test("live QA env allows mandatory peer chat through dynamic admin peer setup", () => {
  const result = runNodeScript("scripts/verify-live-qa-env.mjs", {
    LIVE_QA_USERNAME: "qa-admin@example.com",
    LIVE_QA_PASSWORD: "secret",
    LIVE_QA_EXPECT_ADMIN: "1",
    LIVE_QA_REQUIRE_PEER_CHAT: "1",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("dynamic peer account");
  expect(result.stderr).toBe("");
});

test("live QA env fails closed when mandatory peer chat has no peer path", () => {
  const result = runNodeScript("scripts/verify-live-qa-env.mjs", {
    LIVE_QA_USERNAME: "qa-admin@example.com",
    LIVE_QA_PASSWORD: "secret",
    LIVE_QA_REQUIRE_PEER_CHAT: "1",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("LIVE_QA_PEER_USERNAME/LIVE_QA_PEER_PASSWORD or LIVE_QA_EXPECT_ADMIN=1");
});

test("CI release env accepts mandatory peer chat when admin live QA can create the peer", () => {
  const result = runNodeScript("scripts/verify-ci-release-env.mjs", {
    VERCEL_TOKEN: "vercel-token",
    VERCEL_ORG_ID: "org",
    VERCEL_PROJECT_ID: "project",
    CRON_SECRET: "cron",
    LIVE_QA_USERNAME: "qa-admin@example.com",
    LIVE_QA_PASSWORD: "secret",
    LIVE_QA_EXPECT_ADMIN: "1",
    LIVE_QA_REQUIRE_PEER_CHAT: "1",
    STAGING_QA_BASE_URL: "https://staging.footballscience.xyz",
    STAGING_QA_USERNAME: "staging-admin@example.com",
    STAGING_QA_PASSWORD: "secret",
    SUPABASE_PROJECT_REF: "production",
    STAGING_SUPABASE_PROJECT_REF: "staging",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("CI release environment: ok");
  expect(result.stderr).toBe("");
});
