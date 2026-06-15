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
    idpEvents: [],
    idpRender: [],
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
    idpWorkspace: createRoot({ innerHTML: "" }),
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
        if (id === "idp") {
          return {
            render: (context) => calls.idpRender.push(context),
            ...createEventHandlers(calls.idpEvents),
          };
        }
        return {
          render: (context) => calls.scoutingRender.push(context),
          ...createEventHandlers(calls.scoutingEvents),
        };
      },
    },
    getAssetVersion: () => "test-build",
    getUsers: () => [{ id: "u1" }, { id: "coach-2", firstName: "Alex", lastName: "Coach", role: "coach" }],
    getCurrentUser: () => ({ id: "u1", team: "First Team" }),
    formatUserName: (user = {}) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.id || "Staff",
    getPlatformTeamDisplayTeam: () => ({ id: "team-first", name: "First Team", shortName: "FT", logoUrl: "/team-logo.png" }),
    getPlatformTeamDisplayName: () => "First Team",
    getPlatformTeamLogoUrl: (team = {}) => team.logoUrl || "",
    getScheduleStateForGameplan: () => ({ events: [] }),
    getPlayerProfilesStateForGameplan: () => ({ players: [] }),
    getPlayerProfilesStateForVideoAnalysis: () => ({ players: [{ id: "p1", name: "Player One" }] }),
    getPlayerProfilesStateForIdp: () => ({ players: [{ id: "p-idp", name: "IDP Player" }] }),
    canEditGameplan: () => true,
    canEditVideoAnalysis: () => true,
    canEditIdp: () => true,
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
  expect(calls.analysisRender[0].teamName).toBe("First Team");
  expect(calls.analysisRender[0].teamLogoUrl).toBe("/team-logo.png");
  expect(calls.analysisRender[0].canEdit()).toBe(true);
  expect(calls.analysisRender[0].getPlayerProfilesState().players[0].id).toBe("p1");

  controller.renderIdpWorkspace();
  expect(ui.idpWorkspace.innerHTML).toContain("Loading IDP");
  await flushPromises();
  expect(calls.modules).toContain("idp");
  expect(calls.stylesheets).toContain("idp");
  expect(calls.idpRender[0].teamName).toBe("First Team");
  expect(calls.idpRender[0].teamLogoUrl).toBe("/team-logo.png");
  expect(calls.idpRender[0].users.map((user) => user.id)).toEqual(["u1", "coach-2"]);
  expect(calls.idpRender[0].formatUserName({ firstName: "Alex", lastName: "Coach" })).toBe("Alex Coach");
  expect(calls.idpRender[0].canEdit()).toBe(true);
  expect(calls.idpRender[0].getPlayerProfilesState().players[0].id).toBe("p-idp");
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
