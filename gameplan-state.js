const gameplanSchemaVersion = 6;

const defaultPhaseKeys = Object.freeze([
  "inPossession",
  "outOfPossession",
  "attackingTransition",
  "defensiveTransition",
  "setPieces",
]);

const defaultPhaseLabels = Object.freeze({
  inPossession: "In Possession",
  outOfPossession: "Out of Possession",
  attackingTransition: "Attacking Transition",
  defensiveTransition: "Defensive Transition",
  setPieces: "Set Pieces",
});

const defaultChecklistStages = Object.freeze([
  { stage: "T-3", title: "Opponent analysis locked" },
  { stage: "T-1", title: "Staff alignment meeting" },
  { stage: "MD", title: "Player brief delivered" },
  { stage: "Warm-up", title: "Final availability check" },
  { stage: "Halftime", title: "Staff observation report" },
  { stage: "Post", title: "Review notes captured" },
]);

const defaultScenarioTemplates = Object.freeze([
  {
    title: "First 15 minutes",
    trigger: "Opponent builds through the same side twice in a row.",
    staffAction: "Lock the press cue and confirm distances from the bench.",
    playerMessage: "Stay compact, jump together, protect the second ball.",
  },
  {
    title: "Protect lead after 75",
    trigger: "We lead by one goal after 75 minutes or opponent adds another forward.",
    staffAction: "Check rest defence, slow restart tempo, prepare control substitution.",
    playerMessage: "Keep the ball-side distances short and defend the box early.",
  },
  {
    title: "Chasing goal after 70",
    trigger: "We are level or behind after 70 minutes and territory is stable.",
    staffAction: "Prepare higher full-back position and extra box runner.",
    playerMessage: "Play forward earlier, attack second phase, keep counter cover.",
  },
]);

const defaultStaffResponsibilityTemplates = Object.freeze([
  { role: "Head Coach", area: "Match direction" },
  { role: "Assistant Coach", area: "Out of possession" },
  { role: "Analyst", area: "Opponent trends" },
  { role: "Set Piece Lead", area: "Set pieces" },
  { role: "Goalkeeper Coach", area: "Goalkeeper and box control" },
  { role: "Performance", area: "Load and readiness" },
  { role: "Medical", area: "Availability risk" },
]);

export const gameplanPhaseKeys = defaultPhaseKeys;
export const gameplanPhaseLabels = defaultPhaseLabels;
export const gameplanActiveTabs = Object.freeze(["plan", "staff", "player-brief", "matchday"]);
export const gameplanPlanModes = Object.freeze(["briefing", "edit"]);
export const gameplanStatusOptions = Object.freeze([
  { value: "draft", label: "Draft" },
  { value: "staff-review", label: "Staff review" },
  { value: "player-brief-ready", label: "Player brief ready" },
  { value: "locked", label: "Locked" },
]);
export const gameplanScenarioStatusOptions = Object.freeze([
  { value: "open", label: "Open" },
  { value: "ready", label: "Ready" },
  { value: "used", label: "Used" },
  { value: "parked", label: "Parked" },
]);
export const gameplanEvidenceConfidenceOptions = Object.freeze([
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]);
export const gameplanObservationStatusOptions = Object.freeze([
  { value: "watching", label: "Watching" },
  { value: "reported", label: "Reported" },
  { value: "actioned", label: "Actioned" },
  { value: "closed", label: "Closed" },
]);

export function normalizeGameplanText(value, maxLength = 1200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function createGameplanId(prefix = "gameplan") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStatus(value) {
  const normalized = normalizeGameplanText(value, 40).toLowerCase();
  return gameplanStatusOptions.some((option) => option.value === normalized) ? normalized : "draft";
}

function normalizeOption(value, options, fallback) {
  const normalized = normalizeGameplanText(value, 40).toLowerCase();
  return options.some((option) => option.value === normalized) ? normalized : fallback;
}

function normalizeDate(value) {
  const text = normalizeGameplanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeGameplanActiveTab(value) {
  const tab = normalizeGameplanText(value, 40);
  if (gameplanActiveTabs.includes(tab)) {
    return tab;
  }
  if (tab === "scenarios" || tab === "evidence") {
    return "plan";
  }
  if (tab === "live" || tab === "review" || tab === "checklist") {
    return "matchday";
  }
  return "plan";
}

function normalizeGameplanPlanMode(value) {
  const mode = normalizeGameplanText(value, 40);
  return gameplanPlanModes.includes(mode) ? mode : "briefing";
}

function normalizeGameplanPerson(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("staff"),
    userId: normalizeGameplanText(entry.userId, 180),
    role: normalizeGameplanText(entry.role, 80),
    ownerName: normalizeGameplanText(entry.ownerName, 140),
    area: normalizeGameplanText(entry.area, 160),
    watchFor: normalizeGameplanText(entry.watchFor, 700),
    reportAtHalftime: normalizeGameplanText(entry.reportAtHalftime, 700),
    decisionTrigger: normalizeGameplanText(entry.decisionTrigger, 700),
    status: normalizeGameplanText(entry.status, 40) || "open",
  };
}

function normalizeChecklistItem(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("check"),
    stage: normalizeGameplanText(entry.stage, 80),
    title: normalizeGameplanText(entry.title, 180),
    ownerUserId: normalizeGameplanText(entry.ownerUserId, 180),
    due: normalizeGameplanText(entry.due, 80),
    done: Boolean(entry.done),
  };
}

function normalizePhaseMap(source = {}, maxLength = 900) {
  return defaultPhaseKeys.reduce((map, key) => {
    map[key] = normalizeGameplanText(source?.[key], maxLength);
    return map;
  }, {});
}

function normalizeStringArray(values = [], maxLength = 180) {
  const source = Array.isArray(values) ? values : [];
  return Array.from(new Set(source.map((value) => normalizeGameplanText(value, maxLength)).filter(Boolean)));
}

function normalizeGameplanMap(source = {}, maxLength = 700) {
  const entries = Object.entries(source && typeof source === "object" && !Array.isArray(source) ? source : {});
  return entries.reduce((map, [key, value]) => {
    const normalizedKey = normalizeGameplanText(key, 180);
    const normalizedValue = normalizeGameplanText(value, maxLength);
    if (normalizedKey && normalizedValue) {
      map[normalizedKey] = normalizedValue;
    }
    return map;
  }, {});
}

function normalizeGameplanScenario(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("scenario"),
    title: normalizeGameplanText(entry.title, 160),
    trigger: normalizeGameplanText(entry.trigger, 900),
    staffAction: normalizeGameplanText(entry.staffAction, 900),
    playerMessage: normalizeGameplanText(entry.playerMessage, 700),
    ownerUserId: normalizeGameplanText(entry.ownerUserId, 180),
    status: normalizeOption(entry.status, gameplanScenarioStatusOptions, "open"),
  };
}

function normalizeGameplanEvidence(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("evidence"),
    title: normalizeGameplanText(entry.title, 180),
    source: normalizeGameplanText(entry.source, 120),
    linkedSourceType: normalizeGameplanText(entry.linkedSourceType || entry.sourceType, 80).toLowerCase(),
    linkedSourceId: normalizeGameplanText(entry.linkedSourceId || entry.sourceId, 220),
    linkedSourceLabel: normalizeGameplanText(entry.linkedSourceLabel || entry.sourceLabel, 180),
    linkedWorkspace: normalizeGameplanText(entry.linkedWorkspace || entry.workspaceId, 80),
    mediaType: normalizeGameplanText(entry.mediaType || entry.assetType, 80).toLowerCase(),
    matchEventId: normalizeGameplanText(entry.matchEventId, 180),
    sourceRef: normalizeGameplanText(entry.sourceRef, 260),
    phase: normalizeGameplanText(entry.phase, 80),
    url: normalizeGameplanText(entry.url, 1000),
    note: normalizeGameplanText(entry.note, 900),
    ownerUserId: normalizeGameplanText(entry.ownerUserId, 180),
    confidence: normalizeOption(entry.confidence, gameplanEvidenceConfidenceOptions, "medium"),
  };
}

function normalizeGameplanLineup(source = {}) {
  const startingPlayerIds = normalizeStringArray(source.startingPlayerIds || source.starters || source.startingXI, 180).slice(0, 11);
  const startingSet = new Set(startingPlayerIds);
  return {
    formation: normalizeGameplanText(source.formation, 40),
    startingPlayerIds,
    benchPlayerIds: normalizeStringArray(source.benchPlayerIds || source.bench || source.substitutes, 180).filter((id) => !startingSet.has(id)),
  };
}

function normalizeMiniGamePrinciple(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("mini"),
    principle: normalizeGameplanText(entry.principle || entry.title || entry.label, 180),
    phase: normalizeGameplanText(entry.phase, 80),
    playerIds: normalizeStringArray(entry.playerIds || entry.assignedPlayerIds || (entry.playerId ? [entry.playerId] : []), 180),
    source: normalizeGameplanText(entry.source, 120),
  };
}

function normalizeGameplanMatchFocus(source = {}) {
  return {
    sourceGeneratedAt: normalizeGameplanText(source.sourceGeneratedAt, 40),
    sourceWindow: normalizeGameplanText(source.sourceWindow, 120),
    phasePrinciples: normalizePhaseMap(source.phasePrinciples, 900),
    miniGamePrinciples: Array.isArray(source.miniGamePrinciples)
      ? source.miniGamePrinciples.map(normalizeMiniGamePrinciple).filter((entry) => entry.principle || entry.playerIds.length)
      : [],
  };
}

function normalizeGameplanObservation(entry = {}) {
  return {
    id: normalizeGameplanText(entry.id, 160) || createGameplanId("obs"),
    minute: normalizeGameplanText(entry.minute, 20),
    phase: normalizeGameplanText(entry.phase, 80),
    ownerUserId: normalizeGameplanText(entry.ownerUserId, 180),
    observation: normalizeGameplanText(entry.observation, 900),
    action: normalizeGameplanText(entry.action, 900),
    status: normalizeOption(entry.status, gameplanObservationStatusOptions, "watching"),
    createdAt: normalizeGameplanText(entry.createdAt, 40) || new Date().toISOString(),
  };
}

function normalizeGameplanMeeting(source = {}) {
  return {
    agenda: normalizeGameplanText(
      source.agenda ||
        "1. Opponent identity and key threats\n2. Our match objective and non-negotiables\n3. Scenario decisions\n4. Player Brief approval",
      1200
    ),
    decisions: normalizeGameplanText(source.decisions, 1200),
    approvedByUserId: normalizeGameplanText(source.approvedByUserId, 180),
    approvedAt: normalizeGameplanText(source.approvedAt, 40),
  };
}

function normalizeGameplanLive(source = {}) {
  const halftime = source.halftime && typeof source.halftime === "object" ? source.halftime : {};
  return {
    observations: Array.isArray(source.observations)
      ? source.observations.map(normalizeGameplanObservation).filter((entry) => entry.observation || entry.action || entry.minute)
      : [],
    halftime: {
      keyMessage: normalizeGameplanText(halftime.keyMessage, 900),
      adjustments: normalizeGameplanText(halftime.adjustments, 900),
      risks: normalizeGameplanText(halftime.risks, 900),
    },
  };
}

function normalizeGameplanReview(source = {}) {
  return {
    outcome: normalizeGameplanText(source.outcome, 700),
    planWorked: normalizeGameplanText(source.planWorked, 900),
    lessons: normalizeGameplanText(source.lessons, 1200),
    trainingCarryover: normalizeGameplanText(source.trainingCarryover, 900),
    scoutingCarryover: normalizeGameplanText(source.scoutingCarryover, 900),
  };
}

function normalizeBriefReceipt(entry = {}, fallbackPlayerId = "") {
  const playerId = normalizeGameplanText(entry.playerId || fallbackPlayerId, 180);
  if (!playerId) {
    return null;
  }
  return {
    playerId,
    firstOpenedAt: normalizeGameplanText(entry.firstOpenedAt, 40),
    lastOpenedAt: normalizeGameplanText(entry.lastOpenedAt, 40),
    acknowledgedAt: normalizeGameplanText(entry.acknowledgedAt, 40),
    openCount: Math.max(0, Math.min(9999, Number.parseInt(entry.openCount, 10) || 0)),
  };
}

function normalizeBriefReceipts(source = {}) {
  const entries = Array.isArray(source)
    ? source.map((entry) => [entry?.playerId, entry])
    : Object.entries(source && typeof source === "object" ? source : {});
  return entries.reduce((receipts, [playerId, entry]) => {
    const receipt = normalizeBriefReceipt(entry, playerId);
    if (receipt) {
      receipts[receipt.playerId] = receipt;
    }
    return receipts;
  }, {});
}

export function getGameplanMatchLabel(match = {}) {
  const title = normalizeGameplanText(match.title || match.opponent || "Match", 160);
  const date = normalizeDate(match.date);
  const time = normalizeGameplanText(match.time, 40);
  return [date, time, title].filter(Boolean).join(" · ");
}

export function createGameplanFromMatch(match = {}, options = {}) {
  const now = new Date().toISOString();
  const currentUser = options.currentUser || {};
  const title = normalizeGameplanText(match.title || match.opponent || "Match Plan", 160);
  return normalizeGameplan({
    id: createGameplanId(),
    matchEventId: normalizeGameplanText(match.id, 180),
    title,
    opponent: normalizeGameplanText(match.opponent || title, 160),
    date: normalizeDate(match.date),
    kickoff: normalizeGameplanText(match.time, 40),
    venue: normalizeGameplanText(match.venue || match.location, 180),
    competition: normalizeGameplanText(match.competition, 160),
    status: "draft",
    summary: {
      objective: "",
      matchStory: "",
      nonNegotiables: "",
    },
    tactical: {},
    opponentPlan: {},
    lineup: {},
    matchFocus: {},
    staffResponsibilities: defaultStaffResponsibilityTemplates.map((template) =>
      normalizeGameplanPerson({
        ...template,
        id: createGameplanId("staff"),
      })
    ),
    playerBrief: {
      headline: "",
      message: "",
      focus: "",
      positionGroupFocus: "",
      individualFocus: "",
      individualNotes: {},
      audiencePlayerIds: [],
      publishedAt: "",
      readReceipts: {},
      phases: {},
    },
    meeting: normalizeGameplanMeeting(),
    scenarioCards: defaultScenarioTemplates.map((item) =>
      normalizeGameplanScenario({
        ...item,
        id: createGameplanId("scenario"),
      })
    ),
    evidence: [],
    live: normalizeGameplanLive(),
    review: normalizeGameplanReview(),
    checklist: defaultChecklistStages.map((item) =>
      normalizeChecklistItem({
        ...item,
        id: createGameplanId("check"),
      })
    ),
    createdAt: now,
    updatedAt: now,
    createdBy: normalizeGameplanText(currentUser.id, 180),
  });
}

export function normalizeGameplan(source = {}) {
  const now = new Date().toISOString();
  const id = normalizeGameplanText(source.id, 180) || createGameplanId();
  const playerBrief = source.playerBrief && typeof source.playerBrief === "object" ? source.playerBrief : {};
  const staffResponsibilities = Array.isArray(source.staffResponsibilities)
    ? source.staffResponsibilities.map(normalizeGameplanPerson).filter((entry) => entry.role || entry.area || entry.ownerName)
    : [];
  const checklist = Array.isArray(source.checklist)
    ? source.checklist.map(normalizeChecklistItem).filter((entry) => entry.title || entry.stage)
    : [];
  return {
    id,
    matchEventId: normalizeGameplanText(source.matchEventId, 180),
    title: normalizeGameplanText(source.title || source.opponent || "Match Plan", 160),
    opponent: normalizeGameplanText(source.opponent, 160),
    date: normalizeDate(source.date),
    kickoff: normalizeGameplanText(source.kickoff, 40),
    venue: normalizeGameplanText(source.venue, 180),
    competition: normalizeGameplanText(source.competition, 160),
    status: normalizeStatus(source.status),
    summary: {
      objective: normalizeGameplanText(source.summary?.objective, 900),
      matchStory: normalizeGameplanText(source.summary?.matchStory, 900),
      nonNegotiables: normalizeGameplanText(source.summary?.nonNegotiables, 900),
    },
    tactical: normalizePhaseMap(source.tactical, 1000),
    opponentPlan: {
      shape: normalizeGameplanText(source.opponentPlan?.shape, 700),
      threats: normalizeGameplanText(source.opponentPlan?.threats, 900),
      weakZones: normalizeGameplanText(source.opponentPlan?.weakZones, 900),
      keyPlayers: normalizeGameplanText(source.opponentPlan?.keyPlayers, 900),
      pressingCues: normalizeGameplanText(source.opponentPlan?.pressingCues, 900),
      setPieces: normalizeGameplanText(source.opponentPlan?.setPieces, 900),
    },
    staffResponsibilities,
    lineup: normalizeGameplanLineup(source.lineup),
    matchFocus: normalizeGameplanMatchFocus(source.matchFocus),
    playerBrief: {
      headline: normalizeGameplanText(playerBrief.headline, 180),
      message: normalizeGameplanText(playerBrief.message, 900),
      focus: normalizeGameplanText(playerBrief.focus, 900),
      positionGroupFocus: normalizeGameplanText(playerBrief.positionGroupFocus, 900),
      individualFocus: normalizeGameplanText(playerBrief.individualFocus, 900),
      individualNotes: normalizeGameplanMap(playerBrief.individualNotes, 700),
      audiencePlayerIds: normalizeStringArray(playerBrief.audiencePlayerIds, 180),
      publishedAt: normalizeGameplanText(playerBrief.publishedAt, 40),
      readReceipts: normalizeBriefReceipts(playerBrief.readReceipts || playerBrief.receipts),
      phases: normalizePhaseMap(playerBrief.phases, 700),
    },
    meeting: normalizeGameplanMeeting(source.meeting),
    scenarioCards: Array.isArray(source.scenarioCards)
      ? source.scenarioCards.map(normalizeGameplanScenario).filter((entry) => entry.title || entry.trigger || entry.staffAction)
      : [],
    evidence: Array.isArray(source.evidence)
      ? source.evidence
          .map(normalizeGameplanEvidence)
          .filter((entry) => entry.title || entry.note || entry.url || entry.linkedSourceId || entry.sourceRef)
      : [],
    live: normalizeGameplanLive(source.live),
    review: normalizeGameplanReview(source.review),
    checklist,
    archivedAt: normalizeGameplanText(source.archivedAt, 40),
    archivedBy: normalizeGameplanText(source.archivedBy, 180),
    createdAt: normalizeGameplanText(source.createdAt, 40) || now,
    updatedAt: normalizeGameplanText(source.updatedAt, 40) || now,
    createdBy: normalizeGameplanText(source.createdBy, 180),
  };
}

export function cloneGameplanState(source = {}, options = {}) {
  const rawPlans = Array.isArray(source.gameplans) ? source.gameplans : [];
  const gameplans = rawPlans.map(normalizeGameplan);
  const matches = Array.isArray(options.matches) ? options.matches : [];
  if (!gameplans.length && matches[0]) {
    gameplans.push(createGameplanFromMatch(matches[0], options));
  }
  const visibleGameplans = gameplans.filter((plan) => !plan.archivedAt);
  const selectedId = normalizeGameplanText(source.activeGameplanId, 180);
  const activeGameplanId = visibleGameplans.some((plan) => plan.id === selectedId)
    ? selectedId
    : visibleGameplans[0]?.id || "";
  const activeTab = normalizeGameplanActiveTab(source.activeTab);
  return {
    schemaVersion: gameplanSchemaVersion,
    activeGameplanId,
    activeTab,
    planMode: normalizeGameplanPlanMode(source.planMode),
    gameplans,
    updatedAt: normalizeGameplanText(source.updatedAt, 40) || new Date().toISOString(),
  };
}

export function getActiveGameplan(state = {}) {
  const plans = Array.isArray(state.gameplans) ? state.gameplans.filter((plan) => !plan?.archivedAt) : [];
  return plans.find((plan) => plan.id === state.activeGameplanId) || plans[0] || null;
}
