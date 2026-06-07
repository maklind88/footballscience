import { expect, test } from "@playwright/test";
import { createWorkspaceModuleRuntimeController } from "../src/core/workspace-module-runtime-controller.mjs";

async function flushPromises() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function createRuntime(overrides = {}) {
  const calls = {
    stylesheets: [],
    modules: [],
    gameplanRender: [],
    scoutingRender: [],
    analysisRender: [],
    transferLoad: 0,
    transferRender: 0,
    hydrated: [],
  };
  const ui = {
    gameplanWorkspace: { textContent: "" },
    scoutingWorkspace: { innerHTML: "" },
    analysisRoomWorkspace: { innerHTML: "" },
    transferRoomWorkspace: { innerHTML: "" },
  };
  const controller = createWorkspaceModuleRuntimeController({
    ui,
    win: {
      setTimeout: (callback) => callback(),
      clearTimeout: () => {},
    },
    platformModuleLoader: {
      loadStylesheet: async (id) => {
        calls.stylesheets.push(id);
      },
      loadModule: async (id) => {
        calls.modules.push(id);
        if (id === "gameplan") {
          return { render: (context) => calls.gameplanRender.push(context) };
        }
        return {
          render: (context) => calls.scoutingRender.push(context),
          renderAnalysisRoom: (context) => calls.analysisRender.push(context),
        };
      },
    },
    getAssetVersion: () => "test-build",
    getUsers: () => [{ id: "u1" }],
    getCurrentUser: () => ({ id: "u1", team: "First Team" }),
    getScheduleStateForGameplan: () => ({ events: [] }),
    getPlayerProfilesStateForGameplan: () => ({ players: [] }),
    canEditGameplan: () => true,
    getAuthToken: () => "token",
    suppressCentralWrites: (key) => calls.hydrated.push(`suppress:${key}`),
    unsuppressCentralWrites: (key) => calls.hydrated.push(`unsuppress:${key}`),
    getScoutingTeamName: () => "First Team",
    ensureScoutingState: () => {
      calls.hydrated.push("scouting");
      return { reports: [] };
    },
    writeScoutingState: () => calls.hydrated.push("write-scouting"),
    canEditScouting: () => true,
    canSendToTransferRoom: () => true,
    sendToTransferRoom: () => calls.hydrated.push("send-transfer"),
    scoutingTabs: [{ key: "database" }],
    scoutingShadowSlots: [{ id: "st" }],
    scoutingCoreMetricOptions: [{ key: "pace" }],
    scoutingStatusOptions: [{ key: "monitor" }],
    scoutingPriorityOptions: [{ key: "high" }],
    transferRoomRuntime: {
      getContext: () => ({ room: true }),
      loadWorkspaceModule: () => {
        calls.transferLoad += 1;
      },
      render: () => {
        calls.transferRender += 1;
      },
    },
    getWorkspaceViewId: (workspaceId) => ({
      schedule: "schedule",
      periodization: "periodization",
      sessions: "session-planner",
      medical: "medical-team",
      squad: "player-profiles",
      scouting: "scouting",
      transfer: "transfer-room",
      simulator: "game-simulator",
    })[workspaceId] || workspaceId,
    getSafeWorkspaceId: (workspaceId) => workspaceId,
    getHubState: () => ({ activeWorkspaceId: "home" }),
    hydrateState: {
      schedule: () => calls.hydrated.push("schedule"),
      periodization: () => calls.hydrated.push("periodization"),
      sessionPlanner: () => calls.hydrated.push("session-planner"),
      medical: () => calls.hydrated.push("medical"),
      playerProfiles: () => calls.hydrated.push("player-profiles"),
      transferRoom: () => calls.hydrated.push("transfer-room"),
      gameSimulator: () => calls.hydrated.push("game-simulator"),
    },
    ...overrides,
  });
  return { calls, controller, ui };
}

test("workspace module runtime owns Gameplan and Scouting lazy render handoff", async () => {
  const { calls, controller, ui } = createRuntime();

  controller.renderGameplanWorkspace();
  expect(ui.gameplanWorkspace.textContent).toBe("Loading Gameplan");
  await flushPromises();
  expect(calls.modules).toContain("gameplan");
  expect(calls.stylesheets).toContain("gameplan");
  expect(calls.gameplanRender[0]).toMatchObject({ currentUser: { id: "u1", team: "First Team" } });
  expect(calls.gameplanRender[0].canEdit()).toBe(true);

  controller.renderScoutingWorkspace();
  expect(ui.scoutingWorkspace.innerHTML).toContain("Loading Scouting");
  await flushPromises();
  expect(calls.modules).toContain("scouting-workspace");
  expect(calls.scoutingRender[0]).toMatchObject({ teamName: "First Team" });

  controller.renderAnalysisRoomWorkspace();
  await flushPromises();
  expect(calls.analysisRender[0].ui.scoutingWorkspace).toBe(ui.analysisRoomWorkspace);
});

test("workspace module runtime hydrates and preloads the correct module families", () => {
  const { calls, controller } = createRuntime();

  ["schedule", "periodization", "sessions", "medical", "squad", "scouting", "transfer"].forEach((workspaceId) => {
    controller.hydrateWorkspaceModuleState(workspaceId);
  });
  expect(calls.hydrated).toEqual([
    "schedule",
    "periodization",
    "session-planner",
    "medical",
    "player-profiles",
    "scouting",
    "transfer-room",
  ]);

  controller.queueWorkspaceModulePreload("simulator");
  controller.queueWorkspaceModulePreload("transfer");
  controller.preloadWorkspaceFromTrigger({ dataset: { openWorkspace: "scouting" } });

  expect(calls.hydrated).toContain("game-simulator");
  expect(calls.transferLoad).toBe(1);
});

test("workspace module runtime keeps Transfer Room delegated to its existing runtime", () => {
  const { calls, controller } = createRuntime();

  expect(controller.getTransferRoomWorkspaceContext()).toEqual({ room: true });
  controller.loadTransferRoomWorkspaceModule();
  controller.renderTransferRoomWorkspace();

  expect(calls.transferLoad).toBe(1);
  expect(calls.transferRender).toBe(1);
});
