import { expect, test } from "@playwright/test";
import { createScoutingMyTeamSpiderController } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function createShell(overrides = {}) {
  const listeners = {};
  return {
    dataset: {
      scoutingMyTeamSpiderLinked: overrides.linked || "",
      scoutingMyTeamSpiderLoaded: overrides.loaded || "",
      scoutingMyTeamSpiderShell: overrides.playerId || "player-1",
    },
    listeners,
    open: overrides.open === true,
    outerHTML: "",
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    closest(selector) {
      if (selector !== "[data-my-team-slot-role]") {
        return null;
      }
      return { dataset: { myTeamSlotRole: overrides.slotId || "cf" } };
    },
    querySelector(selector) {
      if (selector === ".scouting-my-team-spider-panel" && overrides.hasPanel) {
        return {};
      }
      return null;
    },
  };
}

function createHarness(overrides = {}) {
  const player = overrides.player || { id: "player-1", name: "Ada Forward" };
  const slot = { id: "cf", label: "CF" };
  const shell = overrides.shell || createShell();
  const root = {
    querySelectorAll(selector) {
      return selector === "[data-scouting-my-team-spider-shell]" ? [shell] : [];
    },
  };
  const calls = {
    clearedMatchCache: 0,
    registered: [],
    renders: [],
    workerQueries: [],
    writes: [],
  };
  let currentRecord = overrides.initialRecord || null;
  const controller = createScoutingMyTeamSpiderController({
    canUseWorker: () => overrides.canUseWorker ?? true,
    clearRecordMatchCache: () => {
      calls.clearedMatchCache += 1;
    },
    findRecordForPlayer: () => currentRecord,
    getInitialSurnameAlias: () => overrides.searchAlias || "",
    getPlayerById: (playerId) => (playerId === player.id ? player : null),
    getRoot: () => root,
    getSlotById: (slotId) => (slotId === slot.id ? slot : null),
    getWorkerQueryFromState: () => ({ league: "nwsl", limit: 5, query: "old", team: "club" }),
    isDatabaseLoaded: () => overrides.databaseLoaded ?? true,
    normalizePersonNameForMatch: () => overrides.normalizedName || "ada forward",
    normalizeText,
    registerWorkerRecord: (candidate) => {
      calls.registered.push(candidate);
      if (candidate?.matchesPlayer) {
        currentRecord = candidate;
      }
    },
    renderSpiderButton: (renderedPlayer, renderedSlot, options) => {
      calls.renders.push({ options, player: renderedPlayer, slot: renderedSlot });
      return `<button>${renderedPlayer.name}</button>`;
    },
    requestWorkerQuery: async (payload) => {
      calls.workerQueries.push(payload);
      if (typeof overrides.onWorkerQuery === "function") {
        return overrides.onWorkerQuery(payload);
      }
      return { records: overrides.workerRecords || [] };
    },
    writeState: (options) => calls.writes.push(options),
  });
  return { calls, controller, player, shell };
}

test("Scouting My Team spider controller marks pre-rendered linked shells as loaded", async () => {
  const shell = createShell({ hasPanel: true, linked: "record-1" });
  const harness = createHarness({ shell });

  const result = await harness.controller.hydrateShell(shell);

  expect(result).toEqual({ changed: false, status: "already-linked" });
  expect(shell.dataset.scoutingMyTeamSpiderLoaded).toBe("1");
  expect(harness.calls.renders).toEqual([]);
  expect(harness.calls.workerQueries).toEqual([]);
});

test("Scouting My Team spider controller renders an idle panel before Database is loaded", async () => {
  const harness = createHarness({ databaseLoaded: false });

  const result = await harness.controller.hydrateShell(harness.shell);

  expect(result).toEqual({ changed: true, playerId: "player-1", status: "rendered-idle" });
  expect(harness.calls.renders).toHaveLength(1);
  expect(harness.calls.renders[0]).toMatchObject({
    options: { open: true, renderPanel: true },
    player: harness.player,
    slot: { id: "cf", label: "CF" },
  });
  expect(harness.calls.workerQueries).toEqual([]);
});

test("Scouting My Team spider controller hydrates unmatched players through a broad worker query", async () => {
  let resolveWorker;
  const workerResult = new Promise((resolve) => {
    resolveWorker = resolve;
  });
  const harness = createHarness({
    onWorkerQuery: () => workerResult,
    searchAlias: "Forward",
  });

  const firstHydration = harness.controller.hydrateShell(harness.shell);
  const secondResult = await harness.controller.hydrateShell(harness.shell);
  resolveWorker({ records: [{ id: "record-1", matchesPlayer: true }] });
  const firstResult = await firstHydration;

  expect(secondResult).toEqual({ changed: false, playerId: "player-1", status: "in-flight" });
  expect(firstResult).toEqual({ changed: true, linked: true, playerId: "player-1", status: "linked" });
  expect(harness.calls.workerQueries).toHaveLength(1);
  expect(harness.calls.workerQueries[0]).toEqual({
    query: {
      league: "all",
      limit: 25,
      maxAge: "",
      maxMinutes: 0,
      minAge: "",
      minMinutes: 0,
      offset: 0,
      position: "all",
      query: "Forward",
      season: "all",
      team: "all",
    },
    timeoutMs: 9000,
  });
  expect(harness.calls.registered).toEqual([{ id: "record-1", matchesPlayer: true }]);
  expect(harness.calls.clearedMatchCache).toBe(1);
  expect(harness.calls.writes).toEqual([{ syncCentral: false, syncShadowBoard: false }]);
  expect(harness.calls.renders).toHaveLength(1);
  expect(harness.controller.getInFlightPlayerIds()).toEqual([]);
});

test("Scouting My Team spider controller renders unmatched state and clears in-flight work after worker errors", async () => {
  const harness = createHarness({
    onWorkerQuery: async () => {
      throw new Error("worker unavailable");
    },
  });

  const result = await harness.controller.hydrateShell(harness.shell);

  expect(result).toEqual({ changed: true, linked: false, playerId: "player-1", status: "unmatched" });
  expect(harness.calls.renders).toHaveLength(1);
  expect(harness.calls.writes).toEqual([]);
  expect(harness.controller.getInFlightPlayerIds()).toEqual([]);
});

test("Scouting My Team spider controller binds toggle hydration once per shell", async () => {
  const harness = createHarness({ databaseLoaded: false });

  expect(harness.controller.bindShells()).toBe(1);
  expect(harness.controller.bindShells()).toBe(1);
  expect(harness.shell.listeners.toggle).toHaveLength(1);

  harness.shell.open = false;
  harness.shell.listeners.toggle[0]();
  await Promise.resolve();
  expect(harness.calls.renders).toHaveLength(0);

  harness.shell.open = true;
  harness.shell.listeners.toggle[0]();
  await Promise.resolve();
  expect(harness.calls.renders).toHaveLength(1);
});
