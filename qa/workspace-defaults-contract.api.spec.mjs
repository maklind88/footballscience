import { expect, test } from "@playwright/test";
import {
  defaultHubState,
  placeholderWorkspaceContent,
  platformSidebarMoreOrder,
  platformSidebarPrimaryOrder,
  topIconMenuOrder,
} from "../src/core/workspace-defaults.mjs";

test("Workspace defaults expose stable hub workspaces and navigation order", () => {
  expect(defaultHubState.activeWorkspaceId).toBe("home");
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "home")?.hiddenFromNav).toBe(true);
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "admin")?.requiresAdmin).toBe(true);
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "idp")).toMatchObject({
    kind: "idp",
    title: "IDP",
  });
  expect(defaultHubState.workspaces.find((workspace) => workspace.id === "leaderboard")).toMatchObject({
    kind: "leaderboard",
    title: "Leaderboard",
  });
  const workspaceIds = defaultHubState.workspaces.map((workspace) => workspace.id);
  expect(workspaceIds.indexOf("leaderboard")).toBe(workspaceIds.indexOf("player-profiles") + 1);
  expect(defaultHubState.workspaces.map((workspace) => workspace.id)).not.toContain("game-simulator");
  expect(topIconMenuOrder[0]).toBe("schedule");
  expect(topIconMenuOrder).toContain("idp");
  expect(topIconMenuOrder.indexOf("leaderboard")).toBe(topIconMenuOrder.indexOf("player-profiles") + 1);
  expect(topIconMenuOrder).not.toContain("game-simulator");
  expect(platformSidebarPrimaryOrder).toEqual([
    "player-profiles",
    "leaderboard",
    "schedule",
    "periodization",
    "medical-team",
    "session-planner",
    "set-pieces-room",
    "idp",
    "scouting",
    "analysis-room",
  ]);
  expect(platformSidebarMoreOrder).not.toContain("set-pieces-room");
  expect(platformSidebarMoreOrder).not.toContain("analysis-room");
  expect(platformSidebarMoreOrder).toContain("admin");
  expect(placeholderWorkspaceContent).toEqual({});
});
