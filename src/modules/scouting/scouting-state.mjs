import {
  defaultScoutingState,
  scoutingPriorityOptions,
  scoutingShadowSlots,
  scoutingStatusOptions,
  scoutingTabs,
} from "./scouting-defaults.mjs";

function normalizeScoutingText(value, maxLength = 160) {
return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function normalizeScoutingStatus(value) {
const status = normalizeScoutingText(value, 40);
return scoutingStatusOptions.some((option) => option.value === status) ? status : "new";
}
function normalizeScoutingPriority(value) {
const priority = normalizeScoutingText(value, 40);
return scoutingPriorityOptions.some((option) => option.value === priority) ? priority : "normal";
}
function cloneScoutingTarget(target = {}) {
const now = new Date().toISOString();
const createdAt = normalizeScoutingText(target.createdAt, 40) || now;
return {
id: normalizeScoutingText(target.id, 120) || `scouting-target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
recordId: normalizeScoutingText(target.recordId, 160),
name: normalizeScoutingText(target.name, 120),
club: normalizeScoutingText(target.club, 120),
position: normalizeScoutingText(target.position, 80),
age: normalizeScoutingText(target.age, 12),
slotId: normalizeScoutingText(target.slotId, 40),
status: normalizeScoutingStatus(target.status),
priority: normalizeScoutingPriority(target.priority),
fit: normalizeScoutingText(target.fit, 80),
notes: normalizeScoutingText(target.notes, 900),
createdAt,
updatedAt: normalizeScoutingText(target.updatedAt, 40) || createdAt,
};
}
function cloneScoutingReport(report = {}) {
return {
id: normalizeScoutingText(report.id, 120) || `scouting-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
targetId: normalizeScoutingText(report.targetId, 120),
title: normalizeScoutingText(report.title, 160),
type: ["player", "opposition"].includes(report.type) ? report.type : "player",
summary: normalizeScoutingText(report.summary, 1200),
createdAt: normalizeScoutingText(report.createdAt, 40) || new Date().toISOString(),
};
}
function normalizeScoutingRecordIds(values = []) {
const seen = new Set();
return (Array.isArray(values) ? values : [])
.map((value) => normalizeScoutingText(value, 160))
.filter((value) => {
if (!value || seen.has(value)) {
return false;
}
seen.add(value);
return true;
});
}
function normalizeScoutingFormationValue(value = "") {
const formation = normalizeScoutingText(value, 40);
return ["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2"].includes(formation) ? formation : "4-3-3";
}
function normalizeScoutingMyTeamSlots(value = {}, slotIds = new Set()) {
if (!value || typeof value !== "object") {
return {};
}
const normalizeSlotPlayerIds = (slotValue) => {
const rawIds = Array.isArray(slotValue) ? slotValue : [slotValue];
const seen = new Set();
return rawIds
.map((playerId) => normalizeScoutingText(playerId, 160))
.filter((playerId) => {
if (!playerId || seen.has(playerId)) {
return false;
}
seen.add(playerId);
return true;
});
};
return Object.fromEntries(
Object.entries(value)
.map(([slotId, playerIds]) => [normalizeScoutingText(slotId, 40), normalizeSlotPlayerIds(playerIds)])
.filter(([slotId, playerIds]) => slotIds.has(slotId) && playerIds.length)
);
}
function normalizeScoutingMyTeamPositions(value = {}, slotIds = new Set()) {
if (!value || typeof value !== "object") {
return {};
}
const formationIds = new Set(["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2"]);
const normalizeCoordinate = (coordinate) => {
const number = Number(coordinate);
if (!Number.isFinite(number)) {
return null;
}
return Math.max(4, Math.min(96, Math.round(number * 100) / 100));
};
return Object.fromEntries(
Object.entries(value)
.map(([formationId, formationPositions]) => {
const formation = normalizeScoutingFormationValue(formationId);
if (!formationIds.has(formation) || !formationPositions || typeof formationPositions !== "object") {
return null;
}
const positions = Object.fromEntries(
Object.entries(formationPositions)
.map(([slotId, coordinates]) => {
const normalizedSlotId = normalizeScoutingText(slotId, 40);
const x = normalizeCoordinate(coordinates?.x);
const y = normalizeCoordinate(coordinates?.y);
if (!slotIds.has(normalizedSlotId) || !Number.isFinite(x) || !Number.isFinite(y)) {
return null;
}
return [normalizedSlotId, { x, y }];
})
.filter(Boolean)
);
return Object.keys(positions).length ? [formation, positions] : null;
})
.filter(Boolean)
);
}
function normalizeScoutingPlayerSnapshot(snapshot = {}) {
const recordId = normalizeScoutingText(snapshot.recordId || snapshot.id, 160);
if (!recordId) {
return null;
}
return {
recordId,
name: normalizeScoutingText(snapshot.name, 180),
club: normalizeScoutingText(snapshot.club || snapshot.team, 180),
position: normalizeScoutingText(snapshot.position, 120),
age: normalizeScoutingText(snapshot.age, 20),
minutes: normalizeScoutingText(snapshot.minutes, 24),
birthCountry: normalizeScoutingText(snapshot.birthCountry, 120),
passportCountry: normalizeScoutingText(snapshot.passportCountry || snapshot.nationality, 120),
imageUrl: normalizeScoutingText(snapshot.imageUrl, 300),
league: normalizeScoutingText(snapshot.league, 180),
season: normalizeScoutingText(snapshot.season, 80),
fit: normalizeScoutingText(snapshot.fit, 40),
signalLabel: normalizeScoutingText(snapshot.signalLabel, 120),
signalPercentile: normalizeScoutingText(snapshot.signalPercentile, 20),
updatedAt: normalizeScoutingText(snapshot.updatedAt, 40) || new Date().toISOString(),
};
}
function normalizeScoutingPlayerSnapshots(value = {}) {
if (!value || typeof value !== "object") {
return {};
}
return Object.fromEntries(
Object.values(value)
.map(normalizeScoutingPlayerSnapshot)
.filter(Boolean)
.map((snapshot) => [snapshot.recordId, snapshot])
);
}
function normalizeScoutingShadowSlotRecordIds(value) {
return normalizeScoutingRecordIds(Array.isArray(value) ? value : value ? [value] : []);
}
function cloneScoutingList(list = {}) {
const name = normalizeScoutingText(list.name, 80) || "Scouting List";
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
return {
id: normalizeScoutingText(list.id, 120) || `scouting-list-${slug || "list"}-${Date.now()}`,
name,
recordIds: normalizeScoutingRecordIds(list.recordIds),
};
}
function normalizeScoutingDatabaseFilters(filters = {}) {
const minMinutes = Number(filters.minMinutes);
const maxMinutes = Number(filters.maxMinutes);
const metricId = normalizeScoutingText(filters.metricId, 120);
const metricIds = Array.isArray(filters.metricIds)
? filters.metricIds.map((item) => normalizeScoutingText(item, 120)).filter((item) => item && item !== "all")
: metricId && metricId !== "all"
? [metricId]
: [];
return {
query: normalizeScoutingText(filters.query, 120),
league: normalizeScoutingText(filters.league, 120) || "all",
team: normalizeScoutingText(filters.team, 160) || "all",
season: normalizeScoutingText(filters.season, 80) || "all",
position: normalizeScoutingText(filters.position, 40) || "all",
minMinutes: Number.isFinite(minMinutes) && minMinutes >= 0 ? Math.round(minMinutes) : 0,
minMinutesIntentional: Boolean(filters.minMinutesIntentional),
maxMinutes: Number.isFinite(maxMinutes) && maxMinutes >= 0 ? Math.round(maxMinutes) : 0,
minAge: normalizeScoutingText(filters.minAge, 12),
maxAge: normalizeScoutingText(filters.maxAge, 12),
metricId: metricIds[0] || metricId || "all",
metricIds: Array.from(new Set(metricIds)).slice(0, 20),
metricMin: normalizeScoutingText(filters.metricMin, 12),
roleProfileId: normalizeScoutingText(filters.roleProfileId, 80) || "all",
benchmarkMode: normalizeScoutingText(filters.benchmarkMode, 40) || "position",
roleFitMin: normalizeScoutingText(filters.roleFitMin, 12),
roleFloorMin: normalizeScoutingText(filters.roleFloorMin, 12),
signalMode: normalizeScoutingText(filters.signalMode, 40) || "all",
marketStatus: normalizeScoutingText(filters.marketStatus, 40) || "all",
sortMetricId: normalizeScoutingText(filters.sortMetricId, 120) || "minutes",
offset: Math.max(0, Math.floor(Number(filters.offset) || 0)),
};
}
function normalizeScoutingShadowMeta(value = {}, slotIds = new Set()) {
if (!value || typeof value !== "object") {
return {};
}
return Object.fromEntries(
Object.entries(value)
.map(([key, meta]) => {
const [rawSlotId, ...rawRecordParts] = String(key || "").split(":");
const slotId = normalizeScoutingText(rawSlotId, 40);
const recordId = normalizeScoutingText(rawRecordParts.join(":"), 160);
if (!slotIds.has(slotId) || !recordId || !meta || typeof meta !== "object") {
return null;
}
return [
`${slotId}:${recordId}`,
{
tag: normalizeScoutingText(meta.tag, 40) || "monitor",
note: normalizeScoutingText(meta.note, 180),
updatedAt: normalizeScoutingText(meta.updatedAt, 40),
playerName: normalizeScoutingText(meta.playerName, 180),
team: normalizeScoutingText(meta.team, 180),
league: normalizeScoutingText(meta.league, 180),
season: normalizeScoutingText(meta.season, 80),
position: normalizeScoutingText(meta.position, 120),
},
];
})
.filter(Boolean)
);
}
function normalizeScoutingShadowBoardVisibility(value = "") {
const normalized = normalizeScoutingText(value, 40).toLowerCase();
return ["private", "colleague", "team", "all"].includes(normalized) ? normalized : "private";
}
function normalizeScoutingShadowBoard(board = {}, slotIds = new Set()) {
const id = normalizeScoutingText(board.id, 100);
if (!id) {
return null;
}
const sourceSlots = board.slots && typeof board.slots === "object" ? board.slots : {};
const slots = Object.fromEntries(
Object.entries(sourceSlots)
.map(([slotId, recordIds]) => [normalizeScoutingText(slotId, 40), normalizeScoutingShadowSlotRecordIds(recordIds)])
.filter(([slotId, recordIds]) => slotIds.has(slotId) && recordIds.length)
);
return {
id,
name: normalizeScoutingText(board.name, 100) || "Shadow XI",
visibility: normalizeScoutingShadowBoardVisibility(board.visibility),
ownerName: normalizeScoutingText(board.ownerName, 120) || "You",
formation: normalizeScoutingFormationValue(board.formation),
slots,
positions: normalizeScoutingMyTeamPositions(board.positions, slotIds),
meta: normalizeScoutingShadowMeta(board.meta, slotIds),
createdAt: normalizeScoutingText(board.createdAt, 40) || new Date().toISOString(),
updatedAt: normalizeScoutingText(board.updatedAt, 40) || normalizeScoutingText(board.createdAt, 40) || new Date().toISOString(),
};
}
function normalizeScoutingRoleModel(model = {}) {
const minPercentile = Number(model.minPercentile);
const metrics = Array.isArray(model.metrics)
? model.metrics
.map((metric) => ({
metricId: normalizeScoutingText(metric?.metricId || metric?.id, 120),
minPercentile: Number.isFinite(Number(metric?.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(metric.minPercentile)))) : 70,
weight: Number.isFinite(Number(metric?.weight)) ? Math.max(1, Math.min(5, Math.round(Number(metric.weight)))) : 3,
direction: normalizeScoutingText(metric?.direction, 20).toLowerCase() === "lower" ? "lower" : "higher",
}))
.filter((metric) => metric.metricId)
: [];
return {
id: normalizeScoutingText(model.id, 120) || `scouting-role-model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
name: normalizeScoutingText(model.name, 120) || "Custom role model",
slotId: normalizeScoutingText(model.slotId, 40),
metricId: normalizeScoutingText(model.metricId, 120) || "minutes",
minPercentile: Number.isFinite(minPercentile) ? Math.max(1, Math.min(99, Math.round(minPercentile))) : 60,
metrics,
searchIntent: normalizeScoutingText(model.searchIntent, 500),
notes: normalizeScoutingText(model.notes, 900),
createdAt: normalizeScoutingText(model.createdAt, 40) || new Date().toISOString(),
updatedAt: normalizeScoutingText(model.updatedAt, 40) || normalizeScoutingText(model.createdAt, 40) || new Date().toISOString(),
};
}
function normalizeScoutingComparisonLab(value = {}) {
const normalizedPlayerIds = normalizeScoutingRecordIds(value.playerIds);
const metricId = normalizeScoutingText(value.metricId, 120);
const metricIds = Array.isArray(value.metricIds)
? value.metricIds.map((item) => normalizeScoutingText(item, 120)).filter(Boolean)
: metricId
? [metricId]
: [];
return {
slotId: normalizeScoutingText(value.slotId, 40),
playerIds: [normalizedPlayerIds[0] || "", normalizedPlayerIds[1] || "", normalizedPlayerIds[2] || "", normalizedPlayerIds[3] || ""],
metricId: metricIds[0] || "minutes",
metricIds: Array.from(new Set(metricIds)).slice(0, 12),
};
}
function cloneScoutingSavedViewState(view = {}) {
const name = normalizeScoutingText(view.name, 120);
if (!name) {
return null;
}
return {
id: normalizeScoutingText(view.id, 120) || `scouting-saved-view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
name,
filters: view.filters && typeof view.filters === "object" ? { ...view.filters } : {},
createdAt: normalizeScoutingText(view.createdAt, 40) || new Date().toISOString(),
};
}
function cloneScoutingState(source = defaultScoutingState) {
const activeTab = scoutingTabs.some((tab) => tab.id === source.activeTab) ? source.activeTab : "shadow-xi";
const lists = Array.isArray(source.lists)
? source.lists.map(cloneScoutingList).filter((list) => list.name)
: [];
const slotIds = new Set(scoutingShadowSlots.map((slot) => slot.id));
const sourceShadowXi = source.shadowXi && typeof source.shadowXi === "object" ? source.shadowXi : {};
const sourceSlots = sourceShadowXi.slots && typeof sourceShadowXi.slots === "object" ? sourceShadowXi.slots : {};
const slots = Object.fromEntries(
Object.entries(sourceSlots)
.map(([slotId, recordIds]) => [normalizeScoutingText(slotId, 40), normalizeScoutingShadowSlotRecordIds(recordIds)])
.filter(([slotId, recordIds]) => slotIds.has(slotId) && recordIds.length)
);
const selectedSlotId = normalizeScoutingText(sourceShadowXi.selectedSlotId, 40);
const sourceMyTeam = source.myTeam && typeof source.myTeam === "object" ? source.myTeam : {};
const existingShadowBoards = Array.isArray(sourceShadowXi.boards)
? sourceShadowXi.boards.map((board) => normalizeScoutingShadowBoard(board, slotIds)).filter(Boolean)
: [];
const requestedShadowBoardId = normalizeScoutingText(sourceShadowXi.activeBoardId, 100) || existingShadowBoards[0]?.id || "default-shadow-xi";
const existingActiveShadowBoard = existingShadowBoards.find((board) => board.id === requestedShadowBoardId);
const activeShadowBoard =
normalizeScoutingShadowBoard(
{
...(existingActiveShadowBoard || {}),
id: requestedShadowBoardId,
name: existingActiveShadowBoard?.name || normalizeScoutingText(sourceShadowXi.boardName, 100) || "My Shadow XI",
visibility: existingActiveShadowBoard?.visibility || sourceShadowXi.visibility || "private",
ownerName: existingActiveShadowBoard?.ownerName || sourceShadowXi.ownerName || "You",
formation: sourceShadowXi.formation,
slots,
positions: sourceShadowXi.positions,
meta: sourceShadowXi.meta,
createdAt: existingActiveShadowBoard?.createdAt || sourceShadowXi.createdAt,
updatedAt: sourceShadowXi.updatedAt || new Date().toISOString(),
},
slotIds
) || normalizeScoutingShadowBoard({ id: "default-shadow-xi", name: "My Shadow XI" }, slotIds);
const shadowBoardMap = new Map(existingShadowBoards.map((board) => [board.id, board]));
if (activeShadowBoard) {
shadowBoardMap.set(activeShadowBoard.id, activeShadowBoard);
}
const shadowBoards = Array.from(shadowBoardMap.values());
const databaseFilters = normalizeScoutingDatabaseFilters({
...source.databaseFilters,
query: source.databaseFilters?.query ?? source.searchQuery ?? "",
});
if (Number(source.databaseFilters?.minMinutes) === 450 && !source.databaseFilters?.minMinutesIntentional) {
databaseFilters.minMinutes = 0;
}
return {
activeTab,
databaseFilters,
targets: Array.isArray(source.targets)
? source.targets.map(cloneScoutingTarget).filter((target) => target.name)
: [],
roleModels: Array.isArray(source.roleModels) ? source.roleModels.map(normalizeScoutingRoleModel).filter((model) => model.name) : [],
favoriteRecordIds: normalizeScoutingRecordIds(source.favoriteRecordIds),
compareRecordIds: normalizeScoutingRecordIds(source.compareRecordIds).slice(0, 5),
playerSnapshots: normalizeScoutingPlayerSnapshots(source.playerSnapshots),
lists: lists.length ? lists : [cloneScoutingList(defaultScoutingState.lists[0])],
shadowXi: {
formation: normalizeScoutingFormationValue(sourceShadowXi.formation),
slots,
selectedSlotId: slotIds.has(selectedSlotId) ? selectedSlotId : "",
positions: normalizeScoutingMyTeamPositions(sourceShadowXi.positions, slotIds),
meta: normalizeScoutingShadowMeta(sourceShadowXi.meta, slotIds),
activeBoardId: activeShadowBoard?.id || "default-shadow-xi",
boards: shadowBoards.length ? shadowBoards : [activeShadowBoard].filter(Boolean),
},
myTeam: {
formation: normalizeScoutingFormationValue(sourceMyTeam.formation),
slots: normalizeScoutingMyTeamSlots(sourceMyTeam.slots, slotIds),
positions: normalizeScoutingMyTeamPositions(sourceMyTeam.positions, slotIds),
},
selectedRecordId: normalizeScoutingText(source.selectedRecordId, 160),
reports: Array.isArray(source.reports)
? source.reports.map(cloneScoutingReport).filter((report) => report.title || report.summary)
: [],
savedViews: Array.isArray(source.savedViews)
? source.savedViews.map(cloneScoutingSavedViewState).filter(Boolean)
: [],
contactLog: Array.isArray(source.contactLog)
? source.contactLog
.map((entry) => ({
id: normalizeScoutingText(entry?.id, 120),
recordId: normalizeScoutingText(entry?.recordId, 160),
date: normalizeScoutingText(entry?.date, 40),
type: normalizeScoutingText(entry?.type, 40),
contact: normalizeScoutingText(entry?.contact, 120),
outcome: normalizeScoutingText(entry?.outcome, 160),
nextStep: normalizeScoutingText(entry?.nextStep, 180),
notes: normalizeScoutingText(entry?.notes, 700),
createdAt: normalizeScoutingText(entry?.createdAt, 40),
}))
.filter((entry) => entry.recordId)
: [],
comparisonLab: normalizeScoutingComparisonLab(source.comparisonLab),
};
}
function preserveScoutingTransientUiState(nextState, previousState) {
if (!previousState || !nextState) {
return nextState;
}
if (scoutingTabs.some((tab) => tab.id === previousState.activeTab)) {
nextState.activeTab = previousState.activeTab;
}
nextState.selectedRecordId = normalizeScoutingText(previousState.selectedRecordId, 160);
nextState.profileTab = normalizeScoutingText(previousState.profileTab, 40);
nextState.profileRoleProfileId = normalizeScoutingText(previousState.profileRoleProfileId, 120);
const selectedSlotId = normalizeScoutingText(previousState.shadowXi?.selectedSlotId, 40);
if (scoutingShadowSlots.some((slot) => slot.id === selectedSlotId)) {
nextState.shadowXi.selectedSlotId = selectedSlotId;
}
return nextState;
}

export {
  cloneScoutingList,
  cloneScoutingReport,
  cloneScoutingSavedViewState,
  cloneScoutingState,
  cloneScoutingTarget,
  normalizeScoutingComparisonLab,
  normalizeScoutingDatabaseFilters,
  normalizeScoutingFormationValue,
  normalizeScoutingMyTeamPositions,
  normalizeScoutingMyTeamSlots,
  normalizeScoutingPlayerSnapshot,
  normalizeScoutingPlayerSnapshots,
  normalizeScoutingPriority,
  normalizeScoutingRecordIds,
  normalizeScoutingRoleModel,
  normalizeScoutingShadowBoard,
  normalizeScoutingShadowBoardVisibility,
  normalizeScoutingShadowMeta,
  normalizeScoutingShadowSlotRecordIds,
  normalizeScoutingStatus,
  normalizeScoutingText,
  preserveScoutingTransientUiState,
};
