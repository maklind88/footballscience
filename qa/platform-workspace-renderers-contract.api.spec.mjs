import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Platform workspace renderers own Admin Profile Staff and Squad renderer wiring", () => {
  const appSource = readProjectFile("app-runtime.js");
  const rendererSource = readProjectFile("src/modules/platform/workspace-renderers.mjs");

  expect(appSource).toContain("createPlatformWorkspaceRenderers({");
  expect(appSource).not.toContain("createAdminWorkspaceRenderer({");
  expect(appSource).not.toContain("createProfileWorkspaceRenderer({");
  expect(appSource).not.toContain("createStaffWorkspaceRenderer({");
  expect(appSource).not.toContain("createSquadRosterRenderer({");
  expect(rendererSource).toContain("createAdminWorkspaceRenderer({");
  expect(rendererSource).toContain("createProfileWorkspaceRenderer({");
  expect(rendererSource).toContain("createStaffWorkspaceRenderer({");
  expect(rendererSource).toContain("createSquadRosterRenderer({");
});

test("Platform workspace renderer wiring stays read only", () => {
  const rendererSource = readProjectFile("src/modules/platform/workspace-renderers.mjs");

  expect(rendererSource).not.toContain("localStorage");
  expect(rendererSource).not.toContain("rawDataSafetySetItem");
  expect(rendererSource).not.toContain("queueCentralStateWrite");
  expect(rendererSource).not.toContain("fetch(");
  expect(rendererSource).not.toContain("getPlatformAuthStore");
});
