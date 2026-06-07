import { expect, test } from "@playwright/test";
import { createGameSimulatorSequenceEngine } from "../src/modules/game-simulator/sequence-engine.mjs";

function createSequenceEngine(overrides = {}) {
  let state = overrides.state ?? {
    ball: {
      ownerPlayerId: "H8",
      position: { x: 35, y: 34 },
      securePossession: { ownerPlayerId: "H8" },
    },
    ballSpeedMode: "manual",
    draftStep: null,
    example: null,
    firstTouchMode: "auto",
    isRunning: false,
    matchPhase: "inPossession",
    physicalProfile: "standard",
    players: [
      { id: "H8", team: "home", position: { x: 35, y: 34 }, bodyAngle: 0, tendencyProfile: { key: "balanced" } },
      { id: "A5", team: "away", position: { x: 55, y: 18 }, bodyAngle: Math.PI, tendencyProfile: { key: "balanced" } },
    ],
    restartPhase: null,
    savedSequences: [],
    scenario: { title: "Scenario", text: "Text", meta: "Meta" },
    sequence: {
      currentFrameIndex: -1,
      dirty: false,
      initialSnapshot: null,
      isPlaying: false,
      playbackIndex: -1,
      playbackTimeoutId: null,
      phase: null,
      steps: [],
      transition: null,
    },
    simulatorDirty: false,
    surfacePreset: "grass",
    time: 0,
    weatherPreset: "clear",
  };
  const localStorage = new Map();
  const teams = {
    home: { color: "#2563eb", formation: "4-3-3", identity: { attackStyle: "balanced", defenseStyle: "balanced-block" } },
    away: { color: "#dc2626", formation: "4-3-3", identity: { attackStyle: "balanced", defenseStyle: "balanced-block" } },
  };
  const cloneVector = (point) => ({ x: point.x, y: point.y });
  const engine = createGameSimulatorSequenceEngine({
    applyBallExecutionProfile: () => {},
    applyPhysicalProfileToPlayers: () => {},
    applyResolvedBallProfile: () => {},
    applyTeamIdentities: (identitySnapshot = {}) => {
      teams.home.identity = { ...teams.home.identity, ...identitySnapshot.home };
      teams.away.identity = { ...teams.away.identity, ...identitySnapshot.away };
    },
    buildPlayerTendencyProfile: () => ({ key: "balanced" }),
    canEditScenario: () => true,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    clearAutoPilotReceiveMomentum: () => {},
    clearBallAction: () => {
      state.ball.actionType = null;
    },
    cloneAutoV2DecisionTriggers: (triggers) => (triggers ? { ...triggers } : null),
    cloneDefensiveAutopilotIntents: (intents) => (intents ? { ...intents } : null),
    cloneGoalEvent: (event) => (event ? { ...event } : null),
    cloneOffensiveAutopilotIntents: (intents) => (intents ? { ...intents } : null),
    cloneRestartPhase: (phase) => (phase ? { ...phase, point: phase.point ? cloneVector(phase.point) : null } : null),
    cloneSecurePossession: (possession) => (possession ? { ...possession } : null),
    cloneShotPlacement: (placement) => (placement ? { ...placement } : null),
    cloneTeamIdentities: () => ({
      home: { ...teams.home.identity },
      away: { ...teams.away.identity },
    }),
    cloneTeamIdentity: (identity) => ({ ...identity }),
    cloneVector,
    competitionPhysicalProfiles: { standard: { label: "Standard" } },
    configureBallTravelProfile: () => {},
    createInitialState: () => ({ ...state, sequence: { ...state.sequence, steps: [] } }),
    createPlayer: (blueprint) => ({
      id: blueprint.id,
      position: cloneVector(blueprint.position),
      team: blueprint.team,
      tendencyProfile: { key: "balanced" },
    }),
    createTransitionPlan: () => ({ duration: 0 }),
    defaultScenarioInfo: { title: "Default", text: "Default text", meta: "Default meta" },
    describeStep: (_step, index) => ({ title: `Step ${index + 1}` }),
    distance: (first, second) => Math.hypot(first.x - second.x, first.y - second.y),
    getActionSpeed: () => 4,
    getPlayerById: (playerId) => state.players.find((player) => player.id === playerId) ?? null,
    getPlayerFacingAngle: (player) => player.bodyAngle ?? 0,
    getRecordedStepEndSnapshot: (step) => step.afterSnapshot ?? step.beforeSnapshot,
    getSelectedPlayerIds: () => ["H8"],
    getSequenceFrameSnapshot: () => engine.captureSnapshot(),
    hasBallAction: () => false,
    logEvent: () => {},
    persistCurrentFrameSnapshot: () => {},
    pitch: { length: 105, width: 68 },
    playerTendencyTemplates: { balanced: {} },
    resolveRecordedStepProfile: () => ({ label: "Manual" }),
    setDribbleCarryPathForBall: () => {},
    setLastFrame: () => {},
    setSelectedPlayers: (playerIds, primaryId) => {
      state.selectedPlayerIds = [...playerIds];
      state.selectedPlayerId = primaryId;
    },
    setState: (nextState) => {
      state = nextState;
    },
    setTeamFormationOnPlayers: () => {},
    sequenceLibraryStorageKey: "sequence-library",
    sequenceStorageKey: "latest-sequence",
    snapshotsMatch: () => true,
    squadBlueprints: [
      { id: "H8", position: { x: 35, y: 34 }, team: "home" },
      { id: "A5", position: { x: 55, y: 18 }, team: "away" },
    ],
    teams,
    ui: {
      dribbleSpeed: { value: "" },
      dribbleSpeedLabel: { textContent: "" },
      playPauseButton: { textContent: "Start" },
    },
    updateModeButtons: () => {},
    updateSequenceButtons: () => {},
    vec: (x, y) => ({ x, y }),
    win: {
      clearTimeout: () => {},
      localStorage: {
        getItem: (key) => localStorage.get(key) ?? null,
        removeItem: (key) => localStorage.delete(key),
        setItem: (key, value) => localStorage.set(key, value),
      },
      prompt: () => "Saved sequence",
      setTimeout: (callback) => {
        callback();
        return 1;
      },
    },
    getState: () => state,
  });
  return { engine, getState: () => state, localStorage, teams };
}

test("game simulator sequence engine owns snapshots, examples, and serialization", () => {
  const { engine, getState } = createSequenceEngine();
  const snapshot = engine.captureSnapshot();

  expect(snapshot.selectedPlayerIds).toEqual(["H8"]);
  expect(snapshot.formations).toEqual({ home: "4-3-3", away: "4-3-3" });
  expect(snapshot.players).toHaveLength(2);

  const example = engine.createLowBlockPressExample();
  expect(example.scenario.title).toContain("4-1-4-1 low block");
  expect(example.steps).toHaveLength(3);
  expect(example.overlaySteps).toHaveLength(3);

  getState().sequence.initialSnapshot = example.initialSnapshot;
  getState().sequence.steps = example.steps;
  const serialized = engine.serializeSequence();
  expect(serialized.steps).toHaveLength(3);
  expect(serialized.steps[0].beforeSnapshot).not.toBe(example.steps[0].beforeSnapshot);

  const thumbnail = engine.createStepThumbnail(example.initialSnapshot);
  expect(thumbnail).toContain("data:image/svg+xml");
});
