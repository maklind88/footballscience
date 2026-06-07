export function createGameSimulatorSequenceEngine(deps = {}) {
  const {
    applyBallExecutionProfile,
    applyPhysicalProfileToPlayers,
    applyResolvedBallProfile,
    applyTeamIdentities,
    buildPlayerTendencyProfile,
    canEditScenario,
    clamp,
    clearAutoPilotReceiveMomentum,
    clearBallAction,
    cloneAutoV2DecisionTriggers,
    cloneDefensiveAutopilotIntents,
    cloneGoalEvent,
    cloneOffensiveAutopilotIntents,
    cloneRestartPhase,
    cloneSecurePossession,
    cloneShotPlacement,
    cloneTeamIdentities,
    cloneTeamIdentity,
    cloneVector,
    competitionPhysicalProfiles,
    configureBallTravelProfile,
    createInitialState,
    createPlayer,
    createTransitionPlan,
    defaultScenarioInfo,
    describeStep,
    distance,
    getActionSpeed,
    getPlayerById,
    getPlayerFacingAngle,
    getRecordedStepEndSnapshot,
    getSelectedPlayerIds,
    getSequenceFrameSnapshot,
    hasBallAction,
    logEvent,
    persistCurrentFrameSnapshot,
    pitch,
    playerTendencyTemplates,
    resolveRecordedStepProfile,
    setDribbleCarryPathForBall,
    setLastFrame,
    setSelectedPlayers,
    setState,
    setTeamFormationOnPlayers,
    sequenceLibraryStorageKey,
    sequenceStorageKey,
    snapshotsMatch,
    squadBlueprints,
    teams,
    ui,
    updateModeButtons,
    updateSequenceButtons,
    vec,
    win,
    getState,
    documentRef = globalThis.document,
    URLRef = globalThis.URL,
    BlobRef = globalThis.Blob,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

  function captureSnapshot() {
  return {
  selectedPlayerId: state.selectedPlayerId,
  selectedPlayerIds: getSelectedPlayerIds(),
  matchPhase: state.matchPhase ?? "inPossession",
  restartPhase: cloneRestartPhase(state.restartPhase),
  formations: {
  home: teams.home.formation,
  away: teams.away.formation,
  },
  physicalProfile: state.physicalProfile,
  teamIdentities: cloneTeamIdentities(),
  ball: {
  position: cloneVector(state.ball.position),
  ownerPlayerId: state.ball.ownerPlayerId,
  securePossession: cloneSecurePossession(state.ball.securePossession),
  },
  players: state.players.map((player) => ({
  id: player.id,
  position: cloneVector(player.position),
  bodyAngle: getPlayerFacingAngle(player),
  tendencyKey: player.tendencyProfile?.key ?? null,
  })),
  };
  }
  function applySnapshot(snapshot) {
  if (snapshot.formations) {
  teams.home.formation = snapshot.formations.home ?? teams.home.formation;
  teams.away.formation = snapshot.formations.away ?? teams.away.formation;
  }
  if (snapshot.teamIdentities) {
  applyTeamIdentities(snapshot.teamIdentities);
  }
  if (snapshot.physicalProfile && competitionPhysicalProfiles[snapshot.physicalProfile]) {
  state.physicalProfile = snapshot.physicalProfile;
  }
  applyPhysicalProfileToPlayers(state.players, state.physicalProfile);
  const positions = new Map(snapshot.players.map((player) => [player.id, player.position]));
  state.players.forEach((player) => {
  const snapshotPosition = positions.get(player.id);
  if (snapshotPosition) {
  player.position = cloneVector(snapshotPosition);
  }
  const snapshotPlayer = snapshot.players.find((entry) => entry.id === player.id);
  if (snapshotPlayer && Number.isFinite(snapshotPlayer.bodyAngle)) {
  player.bodyAngle = snapshotPlayer.bodyAngle;
  }
  if (snapshotPlayer?.tendencyKey && playerTendencyTemplates[snapshotPlayer.tendencyKey]) {
  player.tendencyProfile = buildPlayerTendencyProfile({
  ...player,
  tendencyKey: snapshotPlayer.tendencyKey,
  });
  }
  player.actionOrigin = null;
  player.movementProgress = 0;
  });
  const snapshotSelectedPlayerIds = "selectedPlayerIds" in snapshot
  ? snapshot.selectedPlayerIds ?? []
  : snapshot.selectedPlayerId
  ? [snapshot.selectedPlayerId]
  : [];
  const snapshotPrimarySelectedId = "selectedPlayerId" in snapshot
  ? snapshot.selectedPlayerId ?? snapshotSelectedPlayerIds[0] ?? null
  : snapshotSelectedPlayerIds[0] ?? null;
  state.matchPhase = snapshot.matchPhase ?? "inPossession";
  state.restartPhase = cloneRestartPhase(snapshot.restartPhase);
  setSelectedPlayers(snapshotSelectedPlayerIds, snapshotPrimarySelectedId);
  state.ball.position = cloneVector(snapshot.ball.position);
  state.ball.startPosition = cloneVector(snapshot.ball.position);
  state.ball.target = cloneVector(snapshot.ball.position);
  state.ball.currentSpeed = 0;
  state.ball.launchSpeed = 0;
  state.ball.finalSpeed = 0;
  state.ball.deceleration = 0;
  state.ball.profileKey = null;
  state.ball.profileLabel = null;
  state.ball.profileMode = state.ballSpeedMode;
  state.ball.targetKind = null;
  state.ball.firstTouchMode = state.firstTouchMode;
  state.ball.flightStyle = "ground";
  state.ball.peakHeight = 0;
  state.ball.height = 0;
  state.ball.controlHeightThreshold = 0.12;
  state.ball.landingPhaseStart = 0.58;
  state.ball.curveAmount = 0;
  state.ball.curveDirection = 1;
  state.ball.spinRate = 0;
  state.ball.spinAngle = 0;
  state.ball.trackDistanceTotal = 0;
  state.ball.trackDistanceCovered = 0;
  state.ball.dribblePath = null;
  state.ball.bounceCount = 0;
  state.ball.inTransit = false;
  state.ball.elapsedTravelTime = 0;
  state.ball.actionType = null;
  state.ball.initiatorPlayerId = snapshot.ball.ownerPlayerId ?? null;
  state.ball.laneClarity = 0.84;
  state.ball.executionQuality = 0.84;
  state.ball.shotPlacement = null;
  state.ball.claimRadius = 2.2;
  state.ball.controlRadius = 1.4;
  state.ball.carrierPlayerId = null;
  state.ball.receiverPlayerId = null;
  state.ball.recoveryDuration = 0;
  state.ball.ownerPlayerId = snapshot.ball.ownerPlayerId ?? null;
  state.ball.securePossession = cloneSecurePossession(snapshot.ball.securePossession);
  clearAutoPilotReceiveMomentum(state.ball.ownerPlayerId);
  }
  function cloneSnapshot(snapshot) {
  return {
  selectedPlayerId: snapshot.selectedPlayerId,
  selectedPlayerIds: [...(snapshot.selectedPlayerIds ?? [snapshot.selectedPlayerId].filter(Boolean))],
  matchPhase: snapshot.matchPhase ?? "inPossession",
  restartPhase: cloneRestartPhase(snapshot.restartPhase),
  formations: {
  home: snapshot.formations.home,
  away: snapshot.formations.away,
  },
  physicalProfile: snapshot.physicalProfile ?? state.physicalProfile,
  teamIdentities: {
  home: cloneTeamIdentity(snapshot.teamIdentities?.home ?? teams.home.identity),
  away: cloneTeamIdentity(snapshot.teamIdentities?.away ?? teams.away.identity),
  },
  ball: {
  position: cloneVector(snapshot.ball.position),
  ownerPlayerId: snapshot.ball.ownerPlayerId ?? null,
  securePossession: cloneSecurePossession(snapshot.ball.securePossession),
  },
  players: snapshot.players.map((player) => ({
  id: player.id,
  position: cloneVector(player.position),
  bodyAngle: Number.isFinite(player.bodyAngle) ? player.bodyAngle : undefined,
  tendencyKey: player.tendencyKey ?? null,
  })),
  };
  }
  function cloneSequenceStep(step) {
  return {
  id: step.id,
  matchPhase: step.matchPhase ?? null,
  restartPhase: cloneRestartPhase(step.restartPhase),
  actionType: step.actionType,
  autoGenerated: !!step.autoGenerated,
  autoPrinciples: [...(step.autoPrinciples ?? [])],
  target: cloneVector(step.target),
  speed: step.speed,
  speedMode: step.speedMode ?? "manual",
  profileKey: step.profileKey ?? null,
  profileLabel: step.profileLabel ?? null,
  targetKind: step.targetKind ?? null,
  intendedTarget: step.intendedTarget ? cloneVector(step.intendedTarget) : null,
  shotPlacement: cloneShotPlacement(step.shotPlacement),
  nextRestartPhase: cloneRestartPhase(step.nextRestartPhase),
  goal: cloneGoalEvent(step.goal),
  recoveryDuration: step.recoveryDuration ?? 0,
  firstTouchMode: step.firstTouchMode ?? "auto",
  carrierPlayerId: step.carrierPlayerId ?? null,
  receiverPlayerId: step.receiverPlayerId ?? null,
  defensiveAutopilot: step.defensiveAutopilot
  ? {
  teamId: step.defensiveAutopilot.teamId ?? null,
  ballFocusPoint: step.defensiveAutopilot.ballFocusPoint
  ? cloneVector(step.defensiveAutopilot.ballFocusPoint)
  : cloneVector(step.target),
  presserPlayerId: step.defensiveAutopilot.presserPlayerId ?? null,
  phaseKey: step.defensiveAutopilot.phaseKey ?? null,
  phaseLabel: step.defensiveAutopilot.phaseLabel ?? null,
  behaviorVersion: step.defensiveAutopilot.behaviorVersion ?? null,
  intents: cloneDefensiveAutopilotIntents(step.defensiveAutopilot.intents),
  }
  : null,
  offensiveAutopilot: step.offensiveAutopilot
  ? {
  teamId: step.offensiveAutopilot.teamId ?? null,
  ballFocusPoint: step.offensiveAutopilot.ballFocusPoint
  ? cloneVector(step.offensiveAutopilot.ballFocusPoint)
  : cloneVector(step.target),
  runnerPlayerId: step.offensiveAutopilot.runnerPlayerId ?? null,
  phaseKey: step.offensiveAutopilot.phaseKey ?? null,
  phaseLabel: step.offensiveAutopilot.phaseLabel ?? null,
  principleKey: step.offensiveAutopilot.principleKey ?? null,
  principleLabel: step.offensiveAutopilot.principleLabel ?? null,
  behaviorVersion: step.offensiveAutopilot.behaviorVersion ?? null,
  intents: cloneOffensiveAutopilotIntents(step.offensiveAutopilot.intents),
  triggers: cloneAutoV2DecisionTriggers(step.offensiveAutopilot.triggers),
  }
  : null,
  beforeSnapshot: cloneSnapshot(step.beforeSnapshot),
  afterSnapshot: step.afterSnapshot ? cloneSnapshot(step.afterSnapshot) : null,
  };
  }
  function buildSnapshotFromFormations({
  homeFormation,
  awayFormation,
  overrides = {},
  ball,
  selectedPlayerId = state.selectedPlayerId,
  selectedPlayerIds = selectedPlayerId ? [selectedPlayerId] : [],
  }) {
  const players = squadBlueprints.map((blueprint) => createPlayer(blueprint, state.physicalProfile));
  setTeamFormationOnPlayers(players, "home", homeFormation);
  setTeamFormationOnPlayers(players, "away", awayFormation);
  players.forEach((player) => {
  const override = overrides[player.id];
  if (override) {
  player.position = cloneVector(override);
  }
  });
  return {
  selectedPlayerId,
  selectedPlayerIds: [...selectedPlayerIds],
  matchPhase: state.matchPhase ?? "inPossession",
  restartPhase: cloneRestartPhase(state.restartPhase),
  formations: {
  home: homeFormation,
  away: awayFormation,
  },
  physicalProfile: state.physicalProfile,
  teamIdentities: cloneTeamIdentities(),
  ball: {
  position: cloneVector(ball.position),
  ownerPlayerId: ball.ownerPlayerId ?? null,
  securePossession: cloneSecurePossession(ball.securePossession),
  },
  players: players.map((player) => ({
  id: player.id,
  position: cloneVector(player.position),
  bodyAngle: getPlayerFacingAngle(player),
  tendencyKey: player.tendencyProfile?.key ?? null,
  })),
  };
  }
  function withSnapshotOverrides(
  snapshot,
  { overrides = {}, ball = null, selectedPlayerId, selectedPlayerIds } = {}
  ) {
  const next = cloneSnapshot(snapshot);
  const positions = new Map(next.players.map((player) => [player.id, player]));
  Object.entries(overrides).forEach(([playerId, point]) => {
  const player = positions.get(playerId);
  if (player) {
  player.position = cloneVector(point);
  }
  });
  if (ball) {
  if (ball.position) {
  next.ball.position = cloneVector(ball.position);
  }
  if ("ownerPlayerId" in ball) {
  next.ball.ownerPlayerId = ball.ownerPlayerId ?? null;
  }
  }
  if (selectedPlayerId) {
  next.selectedPlayerId = selectedPlayerId;
  }
  if (selectedPlayerIds) {
  next.selectedPlayerIds = [...selectedPlayerIds];
  } else if (selectedPlayerId) {
  next.selectedPlayerIds = [selectedPlayerId];
  }
  return next;
  }
  function createLowBlockPressExample() {
  const startSnapshot = buildSnapshotFromFormations({
  homeFormation: "4-1-4-1",
  awayFormation: "4-3-3",
  selectedPlayerId: "H10",
  ball: {
  position: vec(66, 22),
  ownerPlayerId: "A2",
  },
  overrides: {
  H2: vec(21, 12),
  H3: vec(18, 25),
  H4: vec(18, 43),
  H5: vec(21, 56),
  H6: vec(28, 34),
  H10: vec(38, 24),
  H8: vec(38, 44),
  H11: vec(40, 14),
  H7: vec(40, 54),
  H9: vec(50, 34),
  A2: vec(66, 22),
  A3: vec(74, 34),
  A4: vec(75, 49),
  A5: vec(55, 11),
  A6: vec(60, 27),
  A8: vec(60, 42),
  A7: vec(58, 57),
  A11: vec(46, 15),
  A9: vec(44, 34),
  A10: vec(46, 53),
  },
  });
  const stepOneAfter = withSnapshotOverrides(startSnapshot, {
  overrides: {
  A2: vec(56, 28),
  H10: vec(45.5, 27.5),
  H9: vec(48.5, 32.2),
  H11: vec(39.2, 17.4),
  H6: vec(30.4, 31.8),
  H2: vec(20.6, 14.1),
  H3: vec(18.7, 26.4),
  H4: vec(18.6, 42.2),
  H8: vec(37.6, 41.7),
  H7: vec(39.1, 52.4),
  A6: vec(58.7, 29.5),
  A11: vec(45.4, 17.0),
  A3: vec(73.2, 33.6),
  A5: vec(54.8, 11.7),
  },
  ball: {
  position: vec(56, 28),
  ownerPlayerId: "A2",
  },
  });
  const stepTwoAfter = withSnapshotOverrides(stepOneAfter, {
  overrides: {
  A5: vec(53, 12),
  H11: vec(43, 15.8),
  H10: vec(43.6, 25.4),
  H6: vec(31.4, 31.7),
  H2: vec(21.6, 13.7),
  H9: vec(48.3, 33.3),
  H8: vec(37.2, 41.0),
  H7: vec(38.7, 51.7),
  A2: vec(56, 28.2),
  A6: vec(56.5, 29.1),
  A11: vec(44.8, 16.1),
  },
  ball: {
  position: vec(53, 12),
  ownerPlayerId: "A5",
  },
  selectedPlayerId: "H11",
  });
  const stepThreeAfter = withSnapshotOverrides(stepTwoAfter, {
  overrides: {
  A5: vec(46.5, 10.8),
  H11: vec(46.1, 13.6),
  H10: vec(44.2, 22.9),
  H2: vec(23.2, 13.3),
  H6: vec(32.4, 30.9),
  H3: vec(19.2, 26.0),
  H9: vec(48.0, 33.5),
  A6: vec(54.4, 27.8),
  A11: vec(43.6, 15.0),
  },
  ball: {
  position: vec(46.5, 10.8),
  ownerPlayerId: "A5",
  },
  });
  return {
  scenario: {
  title: "4-1-4-1 low block: centre-back drives forward",
  text:
  "The opposition left centre-back drives the ball into midfield. The nearest No. 8 steps out to press, the striker screens the six, and the holding midfielder protects the pocket in front of the back line.",
  meta:
  "Load the example and hit 'Play From Here' to watch the press step by step with realistic distances.",
  },
  initialSnapshot: startSnapshot,
  overlaySteps: [
  {
  title: "Step 1: No. 8 steps out, No. 9 screens",
  arrows: [
  { from: vec(38, 24), to: vec(45.5, 27.5), color: "#ffe28a", label: "Nearest No. 8 steps out" },
  { from: vec(50, 34), to: vec(48.5, 32.2), color: "#d6efff", label: "No. 9 screens the six" },
  { from: vec(28, 34), to: vec(30.4, 31.8), color: "#d6efff", label: "No. 6 protects the pocket" },
  { from: vec(40, 14), to: vec(39.2, 17.4), color: "#d6efff", label: "Winger tucks in" },
  { from: vec(66, 22), to: vec(56, 28), color: "#ffcf98", label: "Centre-back drives" },
  ],
  },
  {
  title: "Step 2: play is forced wide",
  arrows: [
  { from: vec(56, 28), to: vec(53, 12), color: "#ffcf98", label: "Ball is forced wide" },
  { from: vec(39.2, 17.4), to: vec(43, 15.8), color: "#ffe28a", label: "Winger jumps" },
  { from: vec(45.5, 27.5), to: vec(43.6, 25.4), color: "#d6efff", label: "No. 8 covers inside" },
  { from: vec(30.4, 31.8), to: vec(31.4, 31.7), color: "#d6efff", label: "No. 6 holds" },
  ],
  },
  {
  title: "Step 3: wide trap",
  arrows: [
  { from: vec(53, 12), to: vec(46.5, 10.8), color: "#ffcf98", label: "Full-back drives down the line" },
  { from: vec(43, 15.8), to: vec(46.1, 13.6), color: "#ffe28a", label: "Winger presses hard" },
  { from: vec(21.6, 13.7), to: vec(23.2, 13.3), color: "#d6efff", label: "Full-back covers behind" },
  { from: vec(43.6, 25.4), to: vec(44.2, 22.9), color: "#d6efff", label: "No. 8 locks the inside" },
  ],
  },
  ],
  steps: [
  {
  id: "low-block-step-1",
  actionType: "dribble",
  target: vec(56, 28),
  speed: 4.3,
  speedMode: "manual",
  carrierPlayerId: "A2",
  beforeSnapshot: startSnapshot,
  afterSnapshot: stepOneAfter,
  },
  {
  id: "low-block-step-2",
  actionType: "pass",
  target: vec(53, 12),
  speed: 9,
  speedMode: "manual",
  carrierPlayerId: null,
  receiverPlayerId: "A5",
  beforeSnapshot: stepOneAfter,
  afterSnapshot: stepTwoAfter,
  },
  {
  id: "low-block-step-3",
  actionType: "dribble",
  target: vec(46.5, 10.8),
  speed: 3.3,
  speedMode: "manual",
  carrierPlayerId: "A5",
  beforeSnapshot: stepTwoAfter,
  afterSnapshot: stepThreeAfter,
  },
  ],
  };
  }
  function loadLowBlockPressExample() {
  cancelSequenceAdvance();
  setState(createInitialState());
  setLastFrame(null);
  const example = createLowBlockPressExample();
  state.sequence.steps = example.steps;
  state.sequence.initialSnapshot = cloneSnapshot(example.initialSnapshot);
  state.sequence.isPlaying = false;
  state.sequence.playbackIndex = -1;
  state.sequence.currentFrameIndex = -1;
  state.sequence.phase = null;
  state.sequence.transition = null;
  state.sequence.actionTargets = null;
  state.scenario = example.scenario;
  state.example = {
  id: "low-block-4141",
  overlaySteps: example.overlaySteps,
  };
  applySnapshot(example.initialSnapshot);
  clearBallAction();
  ui.playPauseButton.textContent = "Start";
  updateModeButtons();
  updateSequenceButtons();
  logEvent("4-1-4-1 example loaded: centre-back drives forward and the nearest No. 8 presses.");
  }
  function cloneScenarioInfo(info = defaultScenarioInfo) {
  return {
  title: info.title,
  text: info.text,
  meta: info.meta,
  };
  }
  function markSimulatorDirty() {
  state.simulatorDirty = true;
  }
  function markSequenceDirty() {
  state.sequence.dirty = true;
  markSimulatorDirty();
  }
  function markSimulatorSaved() {
  state.simulatorDirty = false;
  state.sequence.dirty = false;
  }
  function readSavedSequenceLibrary() {
  try {
  const raw = win.localStorage.getItem(sequenceLibraryStorageKey);
  if (!raw) {
  return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
  return [];
  }
  return parsed
  .filter((entry) => entry && entry.id && entry.name && entry.sequence?.steps)
  .sort((a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0));
  } catch {
  return [];
  }
  }
  function writeSavedSequenceLibrary(entries) {
  const sortedEntries = [...entries].sort(
  (a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0)
  );
  state.savedSequences = sortedEntries;
  try {
  win.localStorage.setItem(
  sequenceLibraryStorageKey,
  JSON.stringify(sortedEntries)
  );
  if (sortedEntries[0]?.sequence) {
  win.localStorage.setItem(
  sequenceStorageKey,
  JSON.stringify(sortedEntries[0].sequence)
  );
  } else {
  win.localStorage.removeItem(sequenceStorageKey);
  }
  } catch {
  logEvent("The browser could not write to local storage.");
  }
  }
  function sanitizeFileName(input) {
  return input
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 48) || "football-sequence";
  }
  function goToSequenceFrame(frameIndex) {
  if (!canEditScenario()) {
  return;
  }
  if (hasBallAction() || state.draftStep) {
  logEvent("Finish or clear the current action before switching steps.");
  return;
  }
  const maxFrameIndex = state.sequence.steps.length - 1;
  const nextFrameIndex = clamp(frameIndex, -1, maxFrameIndex);
  if (state.sequence.steps.length) {
  persistCurrentFrameSnapshot(captureSnapshot());
  }
  clearBallAction();
  applySnapshot(getSequenceFrameSnapshot(nextFrameIndex));
  state.sequence.currentFrameIndex = nextFrameIndex;
  state.time = 0;
  ui.playPauseButton.textContent = "Start";
  }
  function cancelSequenceAdvance() {
  if (state.sequence.playbackTimeoutId !== null) {
  win.clearTimeout(state.sequence.playbackTimeoutId);
  state.sequence.playbackTimeoutId = null;
  }
  }
  function stopSequencePlayback(shouldLog = true) {
  const restoreFrameIndex = clamp(
  state.sequence.currentFrameIndex,
  -1,
  state.sequence.steps.length - 1
  );
  cancelSequenceAdvance();
  state.sequence.isPlaying = false;
  state.sequence.playbackIndex = -1;
  state.sequence.phase = null;
  state.sequence.transition = null;
  state.sequence.actionTargets = null;
  clearBallAction();
  if (state.sequence.steps.length) {
  applySnapshot(getSequenceFrameSnapshot(restoreFrameIndex));
  state.sequence.currentFrameIndex = restoreFrameIndex;
  }
  state.isRunning = false;
  state.time = 0;
  ui.playPauseButton.textContent = "Start";
  updateSequenceButtons();
  if (shouldLog) {
  logEvent("Sequence playback stopped.");
  }
  }
  function finishSequencePlayback() {
  cancelSequenceAdvance();
  state.sequence.isPlaying = false;
  state.sequence.currentFrameIndex = state.sequence.steps.length - 1;
  state.sequence.playbackIndex = -1;
  state.sequence.phase = null;
  state.sequence.transition = null;
  state.sequence.actionTargets = null;
  state.isRunning = false;
  state.time = 0;
  ui.playPauseButton.textContent = "Start";
  updateSequenceButtons();
  logEvent("Sequence playback is complete.");
  }
  function queueNextSequenceStep() {
  const nextIndex = state.sequence.playbackIndex + 1;
  if (nextIndex >= state.sequence.steps.length) {
  finishSequencePlayback();
  return;
  }
  cancelSequenceAdvance();
  state.sequence.playbackTimeoutId = win.setTimeout(() => {
  state.sequence.playbackTimeoutId = null;
  startSequenceStep(nextIndex);
  }, 16);
  }
  function startRecordedAction(step) {
  applySnapshot(step.beforeSnapshot);
  state.ballSpeedMode = step.speedMode ?? state.ballSpeedMode;
  const resolvedProfile = resolveRecordedStepProfile(step);
  state.sequence.phase = "action";
  state.sequence.transition = null;
  state.sequence.actionTargets = new Map(
  getRecordedStepEndSnapshot(step).players.map((player) => [
  player.id,
  cloneVector(player.position),
  ])
  );
  if (step.actionType === "dribble") {
  state.dribbleSpeed = step.speed;
  ui.dribbleSpeed.value = String(step.speed);
  ui.dribbleSpeedLabel.textContent = `${step.speed.toFixed(1)} m/s`;
  applyResolvedBallProfile(resolvedProfile);
  state.ball.ownerPlayerId = step.carrierPlayerId;
  state.ball.position = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.startPosition = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.target = cloneVector(step.target);
  state.ball.inTransit = true;
  state.ball.elapsedTravelTime = 0;
  state.ball.actionType = "dribble";
  state.ball.initiatorPlayerId = step.carrierPlayerId ?? null;
  state.ball.carrierPlayerId = step.carrierPlayerId;
  state.ball.receiverPlayerId = null;
  applyBallExecutionProfile("dribble", getPlayerById(step.carrierPlayerId), step.target, resolvedProfile);
  configureBallTravelProfile(
  "dribble",
  distance(state.ball.startPosition, state.ball.target),
  getActionSpeed(),
  resolvedProfile
  );
  {
  const carrier = getPlayerById(step.carrierPlayerId);
  if (carrier) {
  setDribbleCarryPathForBall(carrier, carrier.position, state.ball.target);
  }
  }
  } else if (step.actionType === "recovery") {
  applyResolvedBallProfile(resolvedProfile);
  state.ball.speed = step.speed;
  state.ball.position = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.startPosition = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.target = cloneVector(step.target);
  state.ball.inTransit = true;
  state.ball.elapsedTravelTime = 0;
  state.ball.actionType = "recovery";
  state.ball.initiatorPlayerId = step.carrierPlayerId ?? null;
  state.ball.carrierPlayerId = step.carrierPlayerId ?? null;
  state.ball.receiverPlayerId = null;
  state.ball.ownerPlayerId = null;
  state.ball.recoveryDuration = Math.max(step.recoveryDuration ?? 0, 0.35);
  state.ball.currentSpeed = 0;
  state.ball.launchSpeed = 0;
  state.ball.finalSpeed = 0;
  state.ball.deceleration = 0;
  state.ball.trackDistanceTotal = 0;
  state.ball.trackDistanceCovered = 0;
  } else {
  state.ball.speed = step.speed;
  if (step.actionType === "pass") {
  state.firstTouchMode = step.firstTouchMode ?? state.firstTouchMode;
  }
  if (step.speedMode === "manual") {
  state.ball.manualSpeed = step.speed;
  }
  applyResolvedBallProfile(resolvedProfile);
  state.ball.position = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.startPosition = cloneVector(step.beforeSnapshot.ball.position);
  state.ball.target = cloneVector(step.target);
  state.ball.inTransit = true;
  state.ball.elapsedTravelTime = 0;
  state.ball.actionType = step.actionType;
  state.ball.initiatorPlayerId = step.beforeSnapshot.ball.ownerPlayerId ?? null;
  state.ball.carrierPlayerId = null;
  state.ball.receiverPlayerId = step.actionType === "pass" ? step.receiverPlayerId ?? null : null;
  state.ball.firstTouchMode = step.actionType === "pass" ? step.firstTouchMode ?? "auto" : null;
  state.ball.ownerPlayerId = null;
  applyBallExecutionProfile(step.actionType, getPlayerById(step.beforeSnapshot.ball.ownerPlayerId), step.target, resolvedProfile);
  configureBallTravelProfile(
  step.actionType,
  distance(state.ball.startPosition, state.ball.target),
  getActionSpeed(),
  resolvedProfile
  );
  }
  state.players.forEach((player) => {
  player.actionOrigin = cloneVector(player.position);
  });
  state.isRunning = true;
  ui.playPauseButton.textContent = "Pause";
  }
  function createCommittedSnapshotFromCurrentState() {
  const snapshot = captureSnapshot();
  if (state.draftStep?.actionType === "dribble") {
  const carrier = snapshot.players.find(
  (player) => player.id === state.draftStep.carrierPlayerId
  );
  if (carrier && distance(carrier.position, state.ball.position) > 0.02) {
  carrier.position = cloneVector(state.ball.target);
  }
  }
  return snapshot;
  }
  function applyCommittedSnapshot(snapshot) {
  applySnapshot(snapshot);
  }
  function serializeSequence() {
  if (
  state.sequence.steps.length &&
  !state.sequence.isPlaying &&
  !state.isRunning &&
  !hasBallAction() &&
  !state.draftStep
  ) {
  persistCurrentFrameSnapshot(captureSnapshot());
  }
  return {
  version: 1,
  savedAt: new Date().toISOString(),
  surfacePreset: state.surfacePreset,
  weatherPreset: state.weatherPreset,
  scenario: cloneScenarioInfo(state.scenario),
  initialSnapshot: state.sequence.initialSnapshot
  ? cloneSnapshot(state.sequence.initialSnapshot)
  : null,
  steps: state.sequence.steps.map(cloneSequenceStep),
  };
  }
  function loadSequenceData(data) {
  if (!data || !Array.isArray(data.steps)) {
  return false;
  }
  state.sequence.isPlaying = false;
  state.sequence.playbackIndex = -1;
  state.sequence.currentFrameIndex = -1;
  state.sequence.phase = null;
  state.sequence.transition = null;
  state.sequence.actionTargets = null;
  state.sequence.initialSnapshot = data.initialSnapshot
  ? cloneSnapshot(data.initialSnapshot)
  : data.steps[0]?.beforeSnapshot
  ? cloneSnapshot(data.steps[0].beforeSnapshot)
  : null;
  state.surfacePreset = data.surfacePreset ?? state.surfacePreset;
  state.weatherPreset = data.weatherPreset ?? state.weatherPreset;
  state.sequence.steps = data.steps.map(cloneSequenceStep);
  markSimulatorSaved();
  state.example = null;
  state.scenario = cloneScenarioInfo(data.scenario ?? defaultScenarioInfo);
  clearBallAction();
  state.time = 0;
  ui.playPauseButton.textContent = "Start";
  if (state.sequence.initialSnapshot) {
  applySnapshot(state.sequence.initialSnapshot);
  }
  updateSequenceButtons();
  return true;
  }
  function saveSequenceToLocal() {
  if (!state.sequence.steps.length) {
  logEvent("There is no sequence to save yet.");
  return;
  }
  const defaultName =
  state.scenario.title && state.scenario.title !== defaultScenarioInfo.title
  ? state.scenario.title
  : `Sequence ${new Date().toLocaleDateString("en-GB")}`;
  const requestedName = win.prompt("What would you like to name this sequence?", defaultName);
  if (requestedName === null) {
  return;
  }
  const name = requestedName.trim() || defaultName;
  const sequence = serializeSequence();
  const entry = {
  id: `saved-sequence-${Date.now()}`,
  name,
  savedAt: sequence.savedAt,
  sequence,
  };
  writeSavedSequenceLibrary([entry, ...state.savedSequences]);
  markSimulatorSaved();
  logEvent(`Sequence "${name}" was saved centrally.`);
  }
  function loadSequenceFromLocal() {
  if (state.savedSequences.length) {
  const latest = state.savedSequences[0];
  if (loadSequenceData(latest.sequence)) {
  logEvent(`Latest central sequence loaded: ${latest.name}.`);
  } else {
  logEvent("The latest central sequence could not be read.");
  }
  return;
  }
  const raw = win.localStorage.getItem(sequenceStorageKey);
  if (!raw) {
  logEvent("No saved central sequence was found.");
  return;
  }
  try {
  const data = JSON.parse(raw);
  if (loadSequenceData(data)) {
  logEvent(`Saved sequence loaded with ${state.sequence.steps.length} steps.`);
  } else {
  logEvent("The saved sequence could not be read.");
  }
  } catch {
  logEvent("The saved sequence is corrupted and could not be loaded.");
  }
  }
  function downloadSequence(sequenceData = null, suggestedName = null) {
  const data = sequenceData ?? serializeSequence();
  if (!data?.steps?.length) {
  logEvent("There is no sequence to download yet.");
  return;
  }
  const blob = new BlobRef([JSON.stringify(data, null, 2)], {
  type: "application/json",
  });
  const url = URLRef.createObjectURL(blob);
  const link = documentRef.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  const fileStem = sanitizeFileName(suggestedName ?? data.scenario?.title ?? "football-sequence");
  link.download = `${fileStem}-${datePart}.json`;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  URLRef.revokeObjectURL(url);
  logEvent("Sequence downloaded as JSON.");
  }
  function createStepThumbnail(snapshot) {
  const width = 168;
  const height = 108;
  const sx = width / pitch.length;
  const sy = height / pitch.width;
  const playerCircles = snapshot.players
  .map((player) => {
  const original = squadBlueprints.find((item) => item.id === player.id);
  const color = original?.team === "home" ? teams.home.color : teams.away.color;
  return `<circle cx="${(player.position.x * sx).toFixed(1)}" cy="${(player.position.y * sy).toFixed(1)}" r="3.4" fill="${color}" stroke="white" stroke-width="0.8" />`;
  })
  .join("");
  const ball = snapshot.ball
  ? `<circle cx="${(snapshot.ball.position.x * sx).toFixed(1)}" cy="${(snapshot.ball.position.y * sy).toFixed(1)}" r="2.6" fill="#fff5d6" stroke="#5f4d2d" stroke-width="0.8" />`
  : "";
  const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" rx="10" fill="#1f7a45"/>
        <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="8" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.6"/>
        <line x1="${width / 2}" y1="2" x2="${width / 2}" y2="${height - 2}" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="14" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/>
        ${playerCircles}
        ${ball}
      </svg>
    `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  function startSequenceStep(index) {
  if (!state.sequence.isPlaying) {
  return;
  }
  const step = state.sequence.steps[index];
  if (!step) {
  finishSequencePlayback();
  return;
  }
  state.sequence.playbackIndex = index;
  if (index > 0 && !snapshotsMatch(captureSnapshot(), step.beforeSnapshot)) {
  const transitionPlan = createTransitionPlan(captureSnapshot(), step.beforeSnapshot);
  if (step.beforeSnapshot.formations) {
  teams.home.formation = step.beforeSnapshot.formations.home ?? teams.home.formation;
  teams.away.formation = step.beforeSnapshot.formations.away ?? teams.away.formation;
  }
  if (transitionPlan.duration > 0.02) {
  clearBallAction();
  state.sequence.phase = "transition";
  state.sequence.transition = transitionPlan;
  state.isRunning = true;
  ui.playPauseButton.textContent = "Pause";
  logEvent(`Transitioning into step ${index + 1}.`);
  return;
  }
  applySnapshot(step.beforeSnapshot);
  }
  startRecordedAction(step);
  const description = describeStep(step, index);
  logEvent(`Playing ${description.title.toLowerCase()}.`);
  }
  function startSequencePlayback() {
  if (!state.sequence.steps.length) {
  logEvent("There is no sequence to play yet.");
  return;
  }
  if (hasBallAction() || state.draftStep) {
  logEvent("Finish or clear the current action before starting sequence playback.");
  return;
  }
  const startIndex = state.sequence.currentFrameIndex < 0
  ? 0
  : state.sequence.currentFrameIndex;
  persistCurrentFrameSnapshot(captureSnapshot());
  cancelSequenceAdvance();
  state.sequence.isPlaying = true;
  state.sequence.playbackIndex = -1;
  state.sequence.phase = null;
  state.sequence.transition = null;
  state.sequence.actionTargets = null;
  state.time = 0;
  ui.playPauseButton.textContent = "Pause";
  updateSequenceButtons();
  startSequenceStep(startIndex);
  }
  function getActiveExampleOverlay() {
  if (!state.example?.overlaySteps?.length) {
  return null;
  }
  if (state.sequence.isPlaying && state.sequence.playbackIndex >= 0) {
  return (
  state.example.overlaySteps[state.sequence.playbackIndex] ??
  state.example.overlaySteps[state.example.overlaySteps.length - 1]
  );
  }
  return state.example.overlaySteps[0];
  }
  function getSavedSequenceById(sequenceId) {
  return state.savedSequences.find((entry) => entry.id === sequenceId) ?? null;
  }
  function loadSavedSequenceEntry(sequenceId) {
  const entry = getSavedSequenceById(sequenceId);
  if (!entry) {
  logEvent("The saved sequence could not be found.");
  return;
  }
  if (loadSequenceData(entry.sequence)) {
  logEvent(`Sequence "${entry.name}" loaded.`);
  } else {
  logEvent(`Sequence "${entry.name}" could not be read.`);
  }
  }
  function removeSavedSequenceEntry(sequenceId) {
  const entry = getSavedSequenceById(sequenceId);
  if (!entry) {
  return;
  }
  writeSavedSequenceLibrary(
  state.savedSequences.filter((candidate) => candidate.id !== sequenceId)
  );
  logEvent(`Sequence "${entry.name}" was removed from local storage.`);
  }

  return {
    captureSnapshot,
    applySnapshot,
    cloneSnapshot,
    cloneSequenceStep,
    buildSnapshotFromFormations,
    withSnapshotOverrides,
    createLowBlockPressExample,
    loadLowBlockPressExample,
    cloneScenarioInfo,
    markSimulatorDirty,
    markSequenceDirty,
    markSimulatorSaved,
    readSavedSequenceLibrary,
    writeSavedSequenceLibrary,
    sanitizeFileName,
    goToSequenceFrame,
    cancelSequenceAdvance,
    stopSequencePlayback,
    finishSequencePlayback,
    queueNextSequenceStep,
    startRecordedAction,
    createCommittedSnapshotFromCurrentState,
    applyCommittedSnapshot,
    serializeSequence,
    loadSequenceData,
    saveSequenceToLocal,
    loadSequenceFromLocal,
    downloadSequence,
    createStepThumbnail,
    startSequenceStep,
    startSequencePlayback,
    getActiveExampleOverlay,
    getSavedSequenceById,
    loadSavedSequenceEntry,
    removeSavedSequenceEntry,
  };
}
