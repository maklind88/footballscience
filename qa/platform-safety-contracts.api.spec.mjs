import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

const protectedStorageKeys = [
  "football-workspace-hub-v3",
  "football-periodization-v2",
  "football-schedule-v1",
  "football-session-planner-v3",
  "football-session-exercise-library-v1",
  "football-session-exercise-library-backup-v1",
  "football-dashboard-tasks-v1",
  "football-dashboard-chat-v1",
  "football-dashboard-notification-seen-v1",
  "football-dashboard-tutorial-prefs-v1",
  "football-dashboard-news-seen-v1",
  "football-medical-team-v1",
  "football-player-profiles-v1",
  "football-simulator-sequence-v1",
  "football-simulator-sequence-library-v2",
];

const moduleContractIds = [
  "platform-shell",
  "home",
  "schedule",
  "periodization",
  "session-planner",
  "medical-team",
  "player-profiles",
  "game-simulator",
];

test("protected product data remains covered by client safety, central state, and backups", () => {
  const appSource = readProjectFile("app.js");
  const appStateSource = readProjectFile("api/app-state.js");
  const backupSource = readProjectFile("api/app-state-backup.js");
  const moduleContracts = readProjectFile("docs/MODULE_CONTRACTS.md");

  for (const key of protectedStorageKeys) {
    expect(appSource, `${key} must stay in app.js data safety coverage`).toContain(key);
    expect(appStateSource, `${key} must stay in /api/app-state central coverage`).toContain(key);
    expect(backupSource, `${key} must stay in /api/app-state-backup coverage`).toContain(key);
    expect(moduleContracts, `${key} must be assigned to a module contract`).toContain(key);
  }
});

test("platform evolution plan forbids risky rewrites and destructive data moves", () => {
  const plan = readProjectFile("docs/PLATFORM_EVOLUTION_PLAN.md");

  [
    "Do not rebuild the platform in one big-bang rewrite",
    "Protected coaching data must not be deleted",
    "dual-read / dual-write",
    "Every tenant-owned table should include `organization_id`",
    "Every data migration needs a rollback story",
  ].forEach((requiredText) => {
    expect(plan).toContain(requiredText);
  });
});

test("module contracts define stable ids for the current platform modules", () => {
  const moduleContracts = readProjectFile("docs/MODULE_CONTRACTS.md");

  for (const moduleId of moduleContractIds) {
    expect(moduleContracts).toContain(`\`id\`: \`${moduleId}\``);
  }
});

test("release safety rails keep cron backups and live smoke hooks visible", () => {
  const packageJson = readJson("package.json");
  const vercelConfig = readJson("vercel.json");
  const liveSpec = readProjectFile("qa/production.live.spec.mjs");
  const qaWorkflow = readProjectFile(".github/workflows/qa.yml");

  expect(packageJson.scripts["qa:live"]).toContain("qa/live.playwright.config.mjs");
  expect(liveSpec).toContain("LIVE_QA_USERNAME");
  expect(liveSpec).toContain("LIVE_QA_PASSWORD");
  expect(liveSpec).toContain("production-safe live smoke");
  expect(vercelConfig.crons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "/api/app-state-backup",
        schedule: "0 8 * * *",
      }),
    ])
  );
  expect(qaWorkflow).toContain("node-version: 24");
  expect(qaWorkflow).toContain("npm run qa");
});

