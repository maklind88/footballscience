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
    gameplanEvents: [],
    gameplanRender: [],
    scoutingEvents: [],
    scoutingRender: [],
    analysisEvents: [],
    analysisRender: [],
    transferEvents: [],
    transferLoad: 0,
    transferRender: 0,
    hydrated: [],
  };
  const createRoot = (fields = {}) => ({
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    ...fields,
  });
  const ui = {
    gameplanWorkspace: createRoot({ textContent: "" }),
    scoutingWorkspace: createRoot({ innerHTML: "" }),
    analysisRoomWorkspace: createRoot({ innerHTML: "" }),
    transferRoomWorkspace: createRoot({ innerHTML: "" }),
  };
  const createEventHandlers = (target) => ({
    handleClick: (event, context) => target.push(["click", event, context]),
    handleInput: (event, context) => target.push(["input", event, context]),
    handleChange: (event, context) => target.push(["change", event, context]),
    handleSubmit: (event, context) => target.push(["submit", event, context]),
  });
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
          return {
            render: (context) => calls.gameplanRender.push(context),
            ...createEventHandlers(calls.gameplanEvents),
          };
        }
        if (id === "video-analysis") {
          return {
            render: (context) => calls.analysisRender.push(context),
            ...createEventHandlers(calls.analysisEvents),
          };
        }
        return {
          render: (context) => calls.scoutingRender.push(context),
          ...createEventHandlers(calls.scoutingEvents),
        };
      },
    },
    getAssetVersion: () => "test-build",
    getUsers: () => [{ id: "u1" }],
    getCurrentUser: () => ({ id: "u1", team: "First Team" }),
    getScheduleStateForGameplan: () => ({ events: [] }),
    getPlayerProfilesStateForGameplan: () => ({ players: [] }),
    getPlayerProfilesStateForVideoAnalysis: () => ({ players: [{ id: "p1", name: "Player One" }] }),
    canEditGameplan: () => true,
    canEditVideoAnalysis: () => true,
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
      workspaceModule: createEventHandlers(calls.transferEvents),
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
    },
    ...overrides,
  });
  return { calls, controller, ui };
}

test("workspace module runtime owns Gameplan, Scouting, and Video Analysis lazy render handoff", async () => {
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
  expect(calls.modules).toContain("video-analysis");
  expect(calls.stylesheets).toContain("video-analysis");
  expect(calls.analysisRender[0].ui.analysisRoomWorkspace).toBe(ui.analysisRoomWorkspace);
  expect(calls.analysisRender[0].canEdit()).toBe(true);
  expect(calls.analysisRender[0].getPlayerProfilesState().players[0].id).toBe("p1");
});

test("workspace module runtime hydrates and preloads the correct module families", async () => {
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

  controller.queueWorkspaceModulePreload("analysis-room");
  controller.queueWorkspaceModulePreload("simulator");
  controller.queueWorkspaceModulePreload("transfer");
  controller.preloadWorkspaceFromTrigger({ dataset: { openWorkspace: "scouting" } });
  await flushPromises();

  expect(calls.hydrated).not.toContain("game-simulator");
  expect(calls.modules).toContain("video-analysis");
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

test("workspace module runtime owns lazy workspace event delegation", async () => {
  const { calls, controller, ui } = createRuntime();

  controller.bindWorkspaceModuleEvents();
  await controller.loadGameplanModule();
  await controller.loadScoutingWorkspaceModule();
  await controller.loadVideoAnalysisModule();

  ui.gameplanWorkspace.handlers.click({ type: "click" });
  ui.scoutingWorkspace.handlers.input({ type: "input" });
  ui.analysisRoomWorkspace.handlers.change({ type: "change" });
  ui.transferRoomWorkspace.handlers.submit({ type: "submit" });

  expect(calls.gameplanEvents[0][0]).toBe("click");
  expect(calls.gameplanEvents[0][2].canEdit()).toBe(true);
  expect(calls.scoutingEvents.map(([type]) => type)).toEqual(["input"]);
  expect(calls.analysisEvents[0][0]).toBe("change");
  expect(calls.analysisEvents[0][2].ui.analysisRoomWorkspace).toBe(ui.analysisRoomWorkspace);
  expect(calls.transferEvents[0][0]).toBe("submit");
  expect(calls.transferEvents[0][2]).toEqual({ room: true });
});
