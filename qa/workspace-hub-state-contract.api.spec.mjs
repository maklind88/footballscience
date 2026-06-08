import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspaceHubStateHelpers } from "../src/core/workspace-hub-state.mjs";
import { defaultHubState } from "../src/core/workspace-defaults.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("workspace hub state helpers own clone and persistable snapshots outside app-runtime", () => {
  const helpers = createWorkspaceHubStateHelpers({
    defaultHubState,
    defaultWorkspaceAccess: { schedule: ["admin", "coach"] },
    mergeWorkspaceDefinitions: (workspaces = []) =>
      defaultHubState.workspaces.map((defaultWorkspace) => ({
        ...defaultWorkspace,
        ...(workspaces.find((workspace) => workspace.id === defaultWorkspace.id) || {}),
      })),
  });

  const cloned = helpers.cloneHubState({
    activeWorkspaceId: "schedule",
    sidebarCollapsed: 1,
    profile: { name: "Mak", role: "Coach" },
    workspaces: [{ id: "admin", title: "Unsafe Rename", requiresAdmin: true }],
    workspaceAccess: { scouting: ["admin"] },
  });

  expect(cloned).toMatchObject({
    activeWorkspaceId: "schedule",
    sidebarCollapsed: true,
    profile: {
      name: "Mak",
      shortName: defaultHubState.profile.shortName,
      role: "Coach",
    },
    workspaceAccess: {
      schedule: ["admin", "coach"],
      scouting: ["admin"],
    },
  });
  expect(cloned.workspaces.find((workspace) => workspace.id === "admin")).toMatchObject({
    id: "admin",
    title: "Unsafe Rename",
    requiresAdmin: true,
    hiddenFromNav: false,
  });

  const persistable = helpers.clonePersistableWorkspaceHubState(cloned);
  expect(persistable.activeWorkspaceId).toBeUndefined();
  expect(persistable.workspaces.length).toBe(defaultHubState.workspaces.length);
});

test("app-runtime delegates workspace hub cloning to the core helper", () => {
  const appRuntime = readProjectFile("app-runtime.js");
  expect(appRuntime).toContain('import { createWorkspaceHubStateHelpers } from "./src/core/workspace-hub-state.mjs";');
  expect(appRuntime).toContain("const {\ncloneHubState,\nclonePersistableWorkspaceHubState,");
  expect(appRuntime).not.toContain("function cloneHubState(");
  expect(appRuntime).not.toContain("function clonePersistableWorkspaceHubState(");
});
