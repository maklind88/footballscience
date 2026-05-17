const gameplanSchemaVersion = 2;

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
export const gameplanStatusOptions = Object.freeze([
  { value: "draft", label: "Draft" },
  { value: "staff-review", label: "Staff review" },
  { value: "player-brief-ready", label: "Player brief ready" },
  { value: "locked", label: "Locked" },
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

function normalizeDate(value) {
  const text = normalizeGameplanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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
      individualFocus: "",
      audiencePlayerIds: [],
      publishedAt: "",
      readReceipts: {},
      phases: {},
    },
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
    playerBrief: {
      headline: normalizeGameplanText(playerBrief.headline, 180),
      message: normalizeGameplanText(playerBrief.message, 900),
      focus: normalizeGameplanText(playerBrief.focus, 900),
      individualFocus: normalizeGameplanText(playerBrief.individualFocus, 900),
      audiencePlayerIds: normalizeStringArray(playerBrief.audiencePlayerIds, 180),
      publishedAt: normalizeGameplanText(playerBrief.publishedAt, 40),
      readReceipts: normalizeBriefReceipts(playerBrief.readReceipts || playerBrief.receipts),
      phases: normalizePhaseMap(playerBrief.phases, 700),
    },
    checklist,
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
  const selectedId = normalizeGameplanText(source.activeGameplanId, 180);
  const activeGameplanId = gameplans.some((plan) => plan.id === selectedId) ? selectedId : gameplans[0]?.id || "";
  const activeTab = ["plan", "staff", "player-brief", "checklist"].includes(source.activeTab)
    ? source.activeTab
    : "plan";
  return {
    schemaVersion: gameplanSchemaVersion,
    activeGameplanId,
    activeTab,
    gameplans,
    updatedAt: normalizeGameplanText(source.updatedAt, 40) || new Date().toISOString(),
  };
}

export function getActiveGameplan(state = {}) {
  const plans = Array.isArray(state.gameplans) ? state.gameplans : [];
  return plans.find((plan) => plan.id === state.activeGameplanId) || plans[0] || null;
}
