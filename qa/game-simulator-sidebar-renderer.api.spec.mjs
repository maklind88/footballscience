import { expect, test } from "@playwright/test";
import { createGameSimulatorSidebarRenderer } from "../src/modules/game-simulator/sidebar-renderer.mjs";

function createUiElement() {
  return {
    textContent: "",
    innerHTML: "",
  };
}

function createSidebarUi() {
  const keys = [
    "scenarioTitle",
    "scenarioText",
    "scenarioMeta",
    "simTime",
    "ballStatus",
    "ballEta",
    "actionTime",
    "actionType",
    "ballProfile",
    "ballCurrentSpeed",
    "ballOwner",
    "selectedPlayerName",
    "selectedReachAtArrival",
    "selectedPlayerCard",
    "fullscreenSelectedPlayerCard",
    "playerTable",
    "eventLog",
    "sequenceStatus",
    "sequenceList",
    "savedSequenceStatus",
    "savedSequenceList",
  ];
  return Object.fromEntries(keys.map((key) => [key, createUiElement()]));
}

const teams = {
  home: { id: "home", name: "Home FC", formation: "4-3-3" },
  away: { id: "away", name: "Away FC", formation: "4-4-2" },
};

function createState() {
  const homePlayer = {
    id: "p1",
    team: "home",
    shortLabel: "MH",
    role: "8",
    position: { x: 12, y: 20 },
    maxSpeed: 8.1,
    acceleration: 3.2,
    reactionTime: 0.35,
    intelligenceProfile: { intelligence: 74.4 },
    physicalProfile: { label: "Elite" },
    tendencyProfile: { label: "Creator" },
  };
  const awayPlayer = {
    id: "p2",
    team: "away",
    shortLabel: "AD",
    role: "CB",
    position: { x: 42, y: 32 },
    maxSpeed: 7.6,
    acceleration: 2.9,
    reactionTime: 0.42,
    intelligenceProfile: { intelligence: 69 },
    physicalProfile: { label: "Senior" },
  };
  return {
    time: 12.34,
    physicalProfile: "elite",
    scenario: {
      title: "Build Up",
      text: "Find the free 8.",
      meta: "QA scenario",
    },
    players: [homePlayer, awayPlayer],
    ball: {
      ownerPlayerId: "p1",
      actionType: "pass",
      position: { x: 12, y: 20 },
    },
    eventLog: ["First event", "Second event"],
    sequence: {
      phase: "idle",
      steps: [{ speed: 12.3, beforeSnapshot: {}, afterSnapshot: {} }],
      currentFrameIndex: 0,
      isPlaying: false,
      playbackIndex: -1,
    },
    savedSequences: [
      {
        id: "seq-1",
        name: "High press",
        savedAt: "2026-05-31T11:14:00.000Z",
        sequence: { steps: [{ id: "step" }], scenario: { title: "Pressing" } },
      },
    ],
  };
}

function createRenderer(state, ui) {
  const selectedPlayer = state.players[0];
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  return createGameSimulatorSidebarRenderer({
    ui,
    getState: () => state,
    teams,
    getSelectedPlayer: () => selectedPlayer,
    getBallOwner: () => selectedPlayer,
    getProjectedActionDuration: () => 2.2,
    formatMeters: (value) => `m:${Number(value ?? 0).toFixed(1)}`,
    getActionDistance: () => 18,
    computeReachDistance: () => 14,
    getCurrentActionDuration: () => 1.1,
    getPlayerBallControlPoint: (player) => player.position,
    distance,
    getActionOrigin: (player) => ({ x: player.position.x - 1, y: player.position.y - 1 }),
    getEditableRadius: () => 15,
    getPlayerRoleModel: () => ({ label: "Creative 8" }),
    getCompetitionPhysicalLabel: () => "Elite",
    renderSelectedMetric: (label, value, _helpKey, className = "") =>
      `<div class="${className}" data-metric="${label}">${value}</div>`,
    renderSelectedProfileControl: (player) => `<select data-profile="${player.id}"></select>`,
    hasBallAction: () => true,
    formatTime: (value) => `t:${Number(value).toFixed(2)}`,
    getRemainingBallTravelTime: () => 1.5,
    getBallProfileLabel: () => "Driven",
    getDisplayedBallSpeed: () => 19.4,
    formatSpeed: (value) => `s:${Number(value).toFixed(1)}`,
    getBallStatus: () => "In transit",
    getActionTypeLabel: () => "Pass",
    isPlayerRenderedSelected: (playerId) => playerId === selectedPlayer.id,
    describeStep: (_step, index) => ({ title: `Step ${index + 1}`, meta: "QA step" }),
    createStepThumbnail: () => "data:image/png;base64,qa",
  });
}

test("game simulator sidebar renderer updates selected player, sequence, and saved sequence surfaces", () => {
  const state = createState();
  const ui = createSidebarUi();
  const renderer = createRenderer(state, ui);

  renderer.renderSidebar();

  expect(ui.scenarioTitle.textContent).toBe("Build Up");
  expect(ui.simTime.textContent).toBe("t:12.34");
  expect(ui.ballStatus.textContent).toBe("In transit");
  expect(ui.ballEta.textContent).toBe("t:1.50");
  expect(ui.ballOwner.textContent).toBe("MH 8");
  expect(ui.selectedPlayerName.textContent).toBe("MH 8");
  expect(ui.selectedPlayerCard.innerHTML).toContain('data-profile="p1"');
  expect(ui.selectedPlayerCard.innerHTML).toContain('data-metric="Game Intelligence">74');
  expect(ui.fullscreenSelectedPlayerCard.innerHTML).toContain("Creative 8");
  expect(ui.playerTable.innerHTML).toContain('data-player-id="p1"');
  expect(ui.playerTable.innerHTML).toContain("player-chip is-selected");
  expect(ui.eventLog.innerHTML).toContain("<li>Second event</li>");
  expect(ui.sequenceStatus.textContent).toBe("Viewing step 1/1");
  expect(ui.sequenceList.innerHTML).toContain("Step 1");
  expect(ui.savedSequenceStatus.textContent).toBe("1 central sequences saved.");
  expect(ui.savedSequenceList.innerHTML).toContain("High press");
});
