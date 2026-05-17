export const transferRoomDefaultWagePeriod = "year";
export const transferRoomCurrencyOptions = Object.freeze([
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "SEK", label: "SEK" },
  { value: "CAD", label: "CAD" },
  { value: "AUD", label: "AUD" },
]);
export const transferRoomWagePeriodOptions = Object.freeze([
  { value: "year", label: "Per year", multiplier: 1 },
  { value: "month", label: "Per month", multiplier: 12 },
  { value: "week", label: "Per week", multiplier: 52 },
]);

const transferRoomSchemaVersion = 1;
const transferRoomDefaultCurrency = "USD";
const transferRoomSquadStatuses = new Set(["keep", "review", "sell", "loan", "release", "renew"]);
const transferRoomTargetStages = new Set(["monitoring", "shortlist", "contact", "negotiation", "approved", "paused"]);
const transferRoomDefaultLeagueProfiles = Object.freeze({
  "nwsl-2026": Object.freeze({
    id: "nwsl-2026",
    label: "NWSL 2026",
    country: "United States",
    league: "NWSL",
    season: "2026",
    currency: "USD",
    wagePeriod: "year",
    baseSalaryCap: 3500000,
    revenueShareMinimum: 200000,
    salaryCap: 3700000,
    sourceLabel: "NWSLPA CBA and NWSL 2026 Competition Rules",
    sourceUrl: "https://www.nwslplayers.com/cba",
    competitionRulesUrl: "https://www.nwslsoccer.com/rules-and-policies",
    rules: Object.freeze([
      { id: "salary-cap-base", label: "Base team salary cap", amount: 3500000, type: "money", severity: "cap" },
      { id: "revenue-share-floor", label: "Minimum revenue-share addition", amount: 200000, type: "money", severity: "cap" },
      { id: "player-consent", label: "Trade requires player consent", type: "check", severity: "legal" },
      { id: "guaranteed-contracts", label: "Guaranteed player contracts", type: "check", severity: "legal" },
      { id: "free-agency", label: "Free agency after contract expiry", type: "check", severity: "roster" },
    ]),
  }),
});

export function normalizeTransferRoomText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeTransferRoomComparable(value = "") {
  return normalizeTransferRoomText(value, 240).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTransferRoomMoney(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const numericValue = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.round(numericValue) : "";
}

export function normalizeTransferRoomCurrency(value) {
  const currency = normalizeTransferRoomText(value, 12).toUpperCase();
  return transferRoomCurrencyOptions.some((option) => option.value === currency) ? currency : transferRoomDefaultCurrency;
}

export function normalizeTransferRoomWagePeriod(value) {
  const period = normalizeTransferRoomText(value, 20).toLowerCase();
  return transferRoomWagePeriodOptions.some((option) => option.value === period) ? period : transferRoomDefaultWagePeriod;
}

function normalizeTransferRoomLeagueProfile(profile = {}, fallback = transferRoomDefaultLeagueProfiles["nwsl-2026"]) {
  const id = normalizeTransferRoomText(profile.id || fallback.id, 120) || fallback.id;
  return {
    ...fallback,
    ...profile,
    id,
    label: normalizeTransferRoomText(profile.label || fallback.label, 120),
    country: normalizeTransferRoomText(profile.country || fallback.country, 120),
    league: normalizeTransferRoomText(profile.league || fallback.league, 120),
    season: normalizeTransferRoomText(profile.season || fallback.season, 40),
    currency: normalizeTransferRoomCurrency(profile.currency || fallback.currency),
    wagePeriod: normalizeTransferRoomWagePeriod(profile.wagePeriod || fallback.wagePeriod),
    baseSalaryCap: normalizeTransferRoomMoney(profile.baseSalaryCap ?? fallback.baseSalaryCap),
    revenueShareMinimum: normalizeTransferRoomMoney(profile.revenueShareMinimum ?? fallback.revenueShareMinimum),
    salaryCap: normalizeTransferRoomMoney(profile.salaryCap ?? fallback.salaryCap),
    rules: Array.isArray(profile.rules) && profile.rules.length ? profile.rules : [...fallback.rules],
  };
}

function getTransferRoomLeagueProfiles(sourceProfiles = {}) {
  const profiles = { ...transferRoomDefaultLeagueProfiles };
  if (sourceProfiles && typeof sourceProfiles === "object" && !Array.isArray(sourceProfiles)) {
    Object.entries(sourceProfiles).forEach(([profileId, profile]) => {
      const fallback = transferRoomDefaultLeagueProfiles[profileId] || transferRoomDefaultLeagueProfiles["nwsl-2026"];
      profiles[profileId] = normalizeTransferRoomLeagueProfile({ id: profileId, ...(profile || {}) }, fallback);
    });
  }
  return profiles;
}

function normalizeTransferRoomTeam(team = {}, fallbackTeam = {}) {
  const id = normalizeTransferRoomText(team.id || team.teamId || fallbackTeam.id, 180) || fallbackTeam.id;
  const name = normalizeTransferRoomText(team.name || team.teamName || fallbackTeam.name, 180) || fallbackTeam.name;
  return {
    id,
    clubId: normalizeTransferRoomText(team.clubId || fallbackTeam.clubId, 180),
    name,
    shortName: normalizeTransferRoomText(team.shortName || fallbackTeam.shortName, 24),
    season: normalizeTransferRoomText(team.season || fallbackTeam.season, 40),
    country: normalizeTransferRoomText(team.country || fallbackTeam.country, 80),
    league: normalizeTransferRoomText(team.league || fallbackTeam.league, 80),
    leagueProfileId: normalizeTransferRoomText(team.leagueProfileId || fallbackTeam.leagueProfileId, 120),
  };
}

function normalizeTransferRoomAccessByTeam(source = {}, teams = []) {
  const normalized = {};
  teams.forEach((team) => {
    const teamId = normalizeTransferRoomText(team.id, 180);
    if (teamId) {
      normalized[teamId] = { userIds: [] };
    }
  });
  if (source && typeof source === "object" && !Array.isArray(source)) {
    Object.entries(source).forEach(([teamId, access]) => {
      const normalizedTeamId = normalizeTransferRoomText(teamId, 180);
      if (!normalizedTeamId) {
        return;
      }
      const userIds = Array.isArray(access?.userIds) ? access.userIds : Array.isArray(access) ? access : [];
      normalized[normalizedTeamId] = {
        userIds: Array.from(new Set(userIds.map((userId) => normalizeTransferRoomText(userId, 180)).filter(Boolean))),
      };
    });
  }
  return normalized;
}

export function normalizeTransferRoomSquadPlan(plan = {}, player = {}) {
  const playerId = normalizeTransferRoomText(plan.playerId || player.id, 180);
  const status = normalizeTransferRoomText(plan.status || plan.transferStatus || "keep", 40);
  return {
    playerId,
    name: normalizeTransferRoomText(plan.name || player.name, 180),
    position: normalizeTransferRoomText(plan.position || player.position, 120),
    status: transferRoomSquadStatuses.has(status) ? status : "keep",
    salary: normalizeTransferRoomMoney(plan.salary),
    wagePeriod: normalizeTransferRoomWagePeriod(plan.wagePeriod || transferRoomDefaultWagePeriod),
    estimatedValue: normalizeTransferRoomMoney(plan.estimatedValue || plan.value),
    contractEnd: normalizeTransferRoomText(plan.contractEnd || player.contractEnd, 40),
    notes: normalizeTransferRoomText(plan.notes, 900),
    updatedAt: normalizeTransferRoomText(plan.updatedAt, 40),
  };
}

function normalizeTransferRoomSnapshotFact(fact = {}) {
  const label = normalizeTransferRoomText(fact.label || fact.key, 80);
  const value = normalizeTransferRoomText(fact.value ?? fact.text, 220);
  if (!label || !value) {
    return null;
  }
  return {
    label,
    value,
    tone: normalizeTransferRoomText(fact.tone, 40),
  };
}

function normalizeTransferRoomSnapshotMetric(metric = {}) {
  const label = normalizeTransferRoomText(metric.label || metric.name, 120);
  const value = normalizeTransferRoomText(metric.value ?? metric.rawValue, 80);
  const percentile = normalizeTransferRoomText(metric.percentile ?? metric.score, 24);
  if (!label || (!value && !percentile)) {
    return null;
  }
  return {
    label,
    value,
    percentile,
    quality: normalizeTransferRoomText(metric.quality, 40),
    group: normalizeTransferRoomText(metric.group || metric.profile, 120),
  };
}

export function normalizeTransferRoomSnapshot(snapshot = {}) {
  const recordId = normalizeTransferRoomText(snapshot.recordId || snapshot.id, 180);
  if (!recordId) {
    return null;
  }
  return {
    recordId,
    name: normalizeTransferRoomText(snapshot.name || snapshot.playerName, 180),
    club: normalizeTransferRoomText(snapshot.club || snapshot.team, 180),
    position: normalizeTransferRoomText(snapshot.position, 120),
    age: normalizeTransferRoomText(snapshot.age, 24),
    minutes: normalizeTransferRoomText(snapshot.minutes, 30),
    birthCountry: normalizeTransferRoomText(snapshot.birthCountry, 120),
    passportCountry: normalizeTransferRoomText(snapshot.passportCountry || snapshot.nationality, 120),
    nationalityCode: normalizeTransferRoomText(snapshot.nationalityCode, 20),
    nationalityLabel: normalizeTransferRoomText(snapshot.nationalityLabel, 120),
    dateOfBirth: normalizeTransferRoomText(snapshot.dateOfBirth, 40),
    height: normalizeTransferRoomText(snapshot.height, 40),
    weight: normalizeTransferRoomText(snapshot.weight, 40),
    imageUrl: normalizeTransferRoomText(snapshot.imageUrl, 600),
    league: normalizeTransferRoomText(snapshot.league, 180),
    season: normalizeTransferRoomText(snapshot.season, 80),
    bestRole: normalizeTransferRoomText(snapshot.bestRole || snapshot.role, 120),
    fit: normalizeTransferRoomText(snapshot.fit, 40),
    signalLabel: normalizeTransferRoomText(snapshot.signalLabel, 120),
    signalPercentile: normalizeTransferRoomText(snapshot.signalPercentile, 24),
    summary: normalizeTransferRoomText(snapshot.summary, 700),
    facts: (Array.isArray(snapshot.facts) ? snapshot.facts : [])
      .map(normalizeTransferRoomSnapshotFact)
      .filter(Boolean)
      .slice(0, 14),
    metrics: (Array.isArray(snapshot.metrics) ? snapshot.metrics : [])
      .map(normalizeTransferRoomSnapshotMetric)
      .filter(Boolean)
      .slice(0, 12),
    source: normalizeTransferRoomText(snapshot.source, 80),
    sourceSlotId: normalizeTransferRoomText(snapshot.sourceSlotId || snapshot.slotId, 60),
    updatedAt: normalizeTransferRoomText(snapshot.updatedAt, 40) || new Date().toISOString(),
  };
}

function mergeTransferRoomSnapshotValue(value, previousValue) {
  if (Array.isArray(value)) {
    return value.length ? value : Array.isArray(previousValue) ? previousValue : [];
  }
  return value || previousValue || "";
}

function mergeTransferRoomSnapshot(previousSnapshot = {}, incomingSnapshot = {}) {
  const normalizedSnapshot = normalizeTransferRoomSnapshot({
    ...previousSnapshot,
    ...incomingSnapshot,
    facts: incomingSnapshot.facts?.length ? incomingSnapshot.facts : previousSnapshot.facts,
    metrics: incomingSnapshot.metrics?.length ? incomingSnapshot.metrics : previousSnapshot.metrics,
    summary: incomingSnapshot.summary || previousSnapshot.summary,
  });
  if (!normalizedSnapshot) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(normalizedSnapshot).map(([key, value]) => [key, mergeTransferRoomSnapshotValue(value, previousSnapshot[key])])
  );
}

export function normalizeTransferRoomTargetPlan(plan = {}, snapshot = {}) {
  const recordId = normalizeTransferRoomText(plan.recordId || snapshot.recordId, 180);
  const stage = normalizeTransferRoomText(plan.stage || plan.status || "monitoring", 40);
  return {
    recordId,
    name: normalizeTransferRoomText(plan.name || snapshot.name, 180),
    position: normalizeTransferRoomText(plan.position || snapshot.position, 120),
    club: normalizeTransferRoomText(plan.club || snapshot.club, 180),
    stage: transferRoomTargetStages.has(stage) ? stage : "monitoring",
    fee: normalizeTransferRoomMoney(plan.fee || plan.estimatedFee),
    wage: normalizeTransferRoomMoney(plan.wage || plan.salary),
    wagePeriod: normalizeTransferRoomWagePeriod(plan.wagePeriod || transferRoomDefaultWagePeriod),
    replacementFor: normalizeTransferRoomText(plan.replacementFor, 180),
    priority: normalizeTransferRoomText(plan.priority || "normal", 40),
    source: normalizeTransferRoomText(plan.source || "scouting", 80),
    notes: normalizeTransferRoomText(plan.notes, 900),
    updatedAt: normalizeTransferRoomText(plan.updatedAt, 40),
  };
}

export function syncTransferRoomSquadPlans(state, players = []) {
  const squadPlans = state.squadPlans && typeof state.squadPlans === "object" && !Array.isArray(state.squadPlans)
    ? { ...state.squadPlans }
    : {};
  players.forEach((player) => {
    squadPlans[player.id] = normalizeTransferRoomSquadPlan(squadPlans[player.id] || {}, player);
  });
  state.squadPlans = squadPlans;
  return players;
}

export function getTransferRoomSquadPlayersFromProfiles(profileState = {}) {
  return (Array.isArray(profileState.players) ? profileState.players : [])
    .map((player) => ({
      id: normalizeTransferRoomText(player.id, 180),
      name: normalizeTransferRoomText(player.name, 180),
      number: normalizeTransferRoomText(player.number, 20),
      position: normalizeTransferRoomText(player.position || player.primaryRole || player.roleGroup, 120),
      roleGroup: normalizeTransferRoomText(player.roleGroup || "", 80),
      status: normalizeTransferRoomText(player.status || player.squadStatus || "", 80),
      photoUrl: normalizeTransferRoomText(player.photoUrl || player.profileImageUrl || player.avatarUrl || "", 1800),
      contractEnd: normalizeTransferRoomText(player.contractEnd || player.contractUntil || player.futureData?.contractEnd || "", 40),
      rosterOrder: Number.isFinite(Number(player.rosterOrder)) ? Number(player.rosterOrder) : Number.MAX_SAFE_INTEGER,
    }))
    .filter((player) => player.id && player.name)
    .sort((first, second) => {
      if (first.rosterOrder !== second.rosterOrder) {
        return first.rosterOrder - second.rosterOrder;
      }
      return first.name.localeCompare(second.name);
    });
}

function getTransferRoomShadowRecordsFromScouting(state = {}) {
  const slots = state?.shadowXi?.slots && typeof state.shadowXi.slots === "object" ? state.shadowXi.slots : {};
  const meta = state?.shadowXi?.meta && typeof state.shadowXi.meta === "object" ? state.shadowXi.meta : {};
  const snapshots = state?.playerSnapshots && typeof state.playerSnapshots === "object" ? state.playerSnapshots : {};
  const records = [];
  Object.entries(slots).forEach(([slotId, value]) => {
    const ids = Array.isArray(value) ? value : value ? [value] : [];
    ids.forEach((recordIdValue) => {
      const recordId = normalizeTransferRoomText(recordIdValue, 180);
      if (!recordId) {
        return;
      }
      const metaEntry = meta[`${slotId}:${recordId}`] || {};
      const snapshot = normalizeTransferRoomSnapshot({
        recordId,
        sourceSlotId: slotId,
        ...(snapshots[recordId] || {}),
        name: snapshots[recordId]?.name || metaEntry.playerName || metaEntry.name,
        club: snapshots[recordId]?.club || metaEntry.team,
        league: snapshots[recordId]?.league || metaEntry.league,
        season: snapshots[recordId]?.season || metaEntry.season,
        position: snapshots[recordId]?.position || metaEntry.position,
      });
      if (snapshot) {
        records.push(snapshot);
      }
    });
  });
  return records;
}

export function syncTransferRoomTargetsFromScouting(state, scoutingState = {}) {
  if (!state || typeof state !== "object") {
    return;
  }
  const targetPlans = state.targetPlans && typeof state.targetPlans === "object" && !Array.isArray(state.targetPlans)
    ? { ...state.targetPlans }
    : {};
  const targetSnapshots = state.targetSnapshots && typeof state.targetSnapshots === "object" && !Array.isArray(state.targetSnapshots)
    ? { ...state.targetSnapshots }
    : {};
  getTransferRoomShadowRecordsFromScouting(scoutingState).forEach((snapshot) => {
    const previousSnapshot = targetSnapshots[snapshot.recordId] || {};
    const nextSnapshot = mergeTransferRoomSnapshot(previousSnapshot, {
      ...snapshot,
      source: "shadow-xi",
    });
    if (!nextSnapshot) {
      return;
    }
    targetSnapshots[snapshot.recordId] = nextSnapshot;
    targetPlans[snapshot.recordId] = normalizeTransferRoomTargetPlan(
      {
        ...(targetPlans[snapshot.recordId] || {}),
        recordId: snapshot.recordId,
        source: targetPlans[snapshot.recordId]?.source || "shadow-xi",
      },
      nextSnapshot
    );
  });
  state.targetPlans = targetPlans;
  state.targetSnapshots = targetSnapshots;
}

export function cloneTransferRoomState(source = {}, options = {}) {
  const fallbackTeam = normalizeTransferRoomTeam(options.currentTeam || {});
  const teams = Array.isArray(source.teams) && source.teams.length
    ? source.teams.map((team) => normalizeTransferRoomTeam(team, fallbackTeam))
    : [fallbackTeam];
  const leagueProfiles = getTransferRoomLeagueProfiles(source.leagueProfiles);
  const activeTeamId = normalizeTransferRoomText(source.activeTeamId || source.settings?.activeTeamId || fallbackTeam.id, 180);
  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0] || fallbackTeam;
  const leagueProfileId = normalizeTransferRoomText(
    source.settings?.leagueProfileId || source.leagueProfileId || activeTeam.leagueProfileId || "nwsl-2026",
    120
  );
  const leagueProfile = leagueProfiles[leagueProfileId] || leagueProfiles["nwsl-2026"];
  const settings = {
    currency: normalizeTransferRoomCurrency(source.settings?.currency || source.currency || leagueProfile.currency),
    wagePeriod: normalizeTransferRoomWagePeriod(source.settings?.wagePeriod || source.wagePeriod || leagueProfile.wagePeriod),
    leagueProfileId: leagueProfile.id,
    activeTeamId: activeTeam.id,
    salaryCap: normalizeTransferRoomMoney(source.settings?.salaryCap ?? source.salaryCap ?? leagueProfile.salaryCap),
    capBuffer: normalizeTransferRoomMoney(source.settings?.capBuffer),
  };
  const targetSnapshots = {};
  if (source.targetSnapshots && typeof source.targetSnapshots === "object" && !Array.isArray(source.targetSnapshots)) {
    Object.values(source.targetSnapshots).forEach((snapshot) => {
      const normalizedSnapshot = normalizeTransferRoomSnapshot(snapshot);
      if (normalizedSnapshot) {
        targetSnapshots[normalizedSnapshot.recordId] = normalizedSnapshot;
      }
    });
  }
  const targetPlans = {};
  const sourceTargetPlans = Array.isArray(source.targetPlans)
    ? source.targetPlans
    : Object.values(source.targetPlans && typeof source.targetPlans === "object" ? source.targetPlans : {});
  sourceTargetPlans.forEach((plan) => {
    const normalizedPlan = normalizeTransferRoomTargetPlan(plan, targetSnapshots[plan?.recordId] || {});
    if (normalizedPlan.recordId) {
      targetPlans[normalizedPlan.recordId] = normalizedPlan;
    }
  });
  const state = {
    schemaVersion: transferRoomSchemaVersion,
    activeTab: normalizeTransferRoomText(source.activeTab || "overview", 40),
    activeTargetProfileRecordId: normalizeTransferRoomText(source.activeTargetProfileRecordId, 180),
    activeTeamId: activeTeam.id,
    settings,
    teams,
    leagueProfiles,
    accessByTeam: normalizeTransferRoomAccessByTeam(source.accessByTeam || source.access, teams),
    squadPlans: source.squadPlans && typeof source.squadPlans === "object" && !Array.isArray(source.squadPlans) ? { ...source.squadPlans } : {},
    targetPlans,
    targetSnapshots,
    windows: Array.isArray(source.windows) ? source.windows : [],
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
  syncTransferRoomSquadPlans(state, Array.isArray(options.squadPlayers) ? options.squadPlayers : []);
  syncTransferRoomTargetsFromScouting(state, options.scoutingState || {});
  return state;
}

export function getTransferRoomTeamAccessIds(user = {}, currentTeam = {}, extraAliases = []) {
  return Array.from(
    new Set(
      [
        currentTeam.id,
        currentTeam.name,
        user?.teamId,
        user?.team_id,
        user?.teamName,
        user?.team,
        ...extraAliases,
      ].map(normalizeTransferRoomComparable).filter(Boolean)
    )
  );
}

export function isTransferRoomSelectedUser(user = {}, state = {}, teamAliases = []) {
  if (!user?.id || !state?.accessByTeam) {
    return false;
  }
  return Object.entries(state.accessByTeam).some(([teamId, access]) => {
    if (!teamAliases.includes(normalizeTransferRoomComparable(teamId))) {
      return false;
    }
    const userIds = Array.isArray(access?.userIds) ? access.userIds : [];
    return userIds.map((userId) => normalizeTransferRoomText(userId, 180)).includes(user.id);
  });
}

export function applyTransferRoomSettingsPatch(state, patch = {}) {
  state.settings = {
    ...state.settings,
    ...patch,
    currency: normalizeTransferRoomCurrency(patch.currency || state.settings.currency),
    wagePeriod: normalizeTransferRoomWagePeriod(patch.wagePeriod || state.settings.wagePeriod),
    salaryCap: normalizeTransferRoomMoney(patch.salaryCap ?? state.settings.salaryCap),
    capBuffer: normalizeTransferRoomMoney(patch.capBuffer ?? state.settings.capBuffer),
  };
}

export function applyTransferRoomSquadPlanPatch(state, playerId, patch = {}) {
  const id = normalizeTransferRoomText(playerId, 180);
  if (!id) {
    return false;
  }
  state.squadPlans[id] = normalizeTransferRoomSquadPlan({
    ...(state.squadPlans[id] || {}),
    ...patch,
    playerId: id,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

export function applyTransferRoomTargetPlanPatch(state, recordId, patch = {}) {
  const id = normalizeTransferRoomText(recordId, 180);
  if (!id) {
    return false;
  }
  state.targetPlans[id] = normalizeTransferRoomTargetPlan({
    ...(state.targetPlans[id] || {}),
    ...patch,
    recordId: id,
    updatedAt: new Date().toISOString(),
  }, state.targetSnapshots[id] || {});
  return true;
}

export function removeTransferRoomTargetFromState(state, recordId) {
  const id = normalizeTransferRoomText(recordId, 180);
  if (!id) {
    return false;
  }
  delete state.targetPlans[id];
  delete state.targetSnapshots[id];
  return true;
}

export function setTransferRoomAccessUser(state, teamId, userId, isSelected) {
  const cleanTeamId = normalizeTransferRoomText(teamId, 180);
  const cleanUserId = normalizeTransferRoomText(userId, 180);
  if (!cleanTeamId || !cleanUserId) {
    return false;
  }
  const access = state.accessByTeam[cleanTeamId] || { userIds: [] };
  const selected = new Set(Array.isArray(access.userIds) ? access.userIds : []);
  if (isSelected) {
    selected.add(cleanUserId);
  } else {
    selected.delete(cleanUserId);
  }
  state.accessByTeam[cleanTeamId] = { userIds: Array.from(selected) };
  return true;
}

export function addTransferRoomTargetSnapshot(state, snapshot = {}, options = {}) {
  const recordId = normalizeTransferRoomText(snapshot.recordId || snapshot.id || options.recordId, 180);
  const previousSnapshot = recordId ? state.targetSnapshots[recordId] || {} : {};
  const normalizedSnapshot = mergeTransferRoomSnapshot(previousSnapshot, {
    ...snapshot,
    source: options.source || snapshot.source || previousSnapshot.source,
    sourceSlotId: options.slotId || snapshot.sourceSlotId || snapshot.slotId || previousSnapshot.sourceSlotId,
  });
  if (!normalizedSnapshot) {
    return false;
  }
  state.targetSnapshots[normalizedSnapshot.recordId] = normalizedSnapshot;
  state.targetPlans[normalizedSnapshot.recordId] = normalizeTransferRoomTargetPlan({
    ...(state.targetPlans[normalizedSnapshot.recordId] || {}),
    recordId: normalizedSnapshot.recordId,
    stage: options.stage || state.targetPlans[normalizedSnapshot.recordId]?.stage || "shortlist",
    source: options.source || "scouting",
  }, normalizedSnapshot);
  return true;
}
