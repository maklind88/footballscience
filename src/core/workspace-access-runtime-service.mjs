import { createWorkspaceHubStateHelpers } from "./workspace-hub-state.mjs";

export function createWorkspaceAccessRuntimeService(options = {}) {
const win = options.window ?? globalThis.window ?? {};
const defaultHubState = options.defaultHubState ?? { workspaces: [] };
const defaultWorkspaceAccess = options.defaultWorkspaceAccess ?? {};
const defaultWorkspaceEditAccess = options.defaultWorkspaceEditAccess ?? {};
const requiredWorkspaceAccess = options.requiredWorkspaceAccess ?? {};
const platformDefaultRoles = Array.isArray(options.defaultRoles) ? options.defaultRoles : ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
const workspaceHubStorageKey = options.workspaceHubStorageKey || "football-workspace-hub-v3";
const workspaceLastActiveStorageKey = options.workspaceLastActiveStorageKey || "football-workspace-last-active-local-v1";
const workspaceHubDefaultActiveWorkspaceId = options.defaultActiveWorkspaceId || "home";
const getHubState = typeof options.getHubState === "function" ? options.getHubState : () => null;
const getCurrentPlatformUser = typeof options.getCurrentPlatformUser === "function" ? options.getCurrentPlatformUser : () => null;
const normalizePlatformRole = typeof options.normalizePlatformRole === "function" ? options.normalizePlatformRole : (role, fallback = "guest") => String(role || fallback).trim().toLowerCase();
const isPlatformManagementUser = typeof options.isPlatformManagementUser === "function" ? options.isPlatformManagementUser : (user = {}) => ["admin", "club-admin", "team-admin"].includes(normalizePlatformRole(user?.role, ""));
const isPlatformStaffUser = typeof options.isPlatformStaffUser === "function" ? options.isPlatformStaffUser : (user = {}) => platformDefaultRoles.includes(normalizePlatformRole(user?.role, "guest"));
const canUserAccessTransferRoom = typeof options.canUserAccessTransferRoom === "function" ? options.canUserAccessTransferRoom : () => false;
const canUserEditTransferRoom = typeof options.canUserEditTransferRoom === "function" ? options.canUserEditTransferRoom : () => false;
const logEvent = typeof options.logEvent === "function" ? options.logEvent : () => {};

function getAllWorkspacePool(sourceState = getHubState()) {
return Array.isArray(sourceState?.workspaces) && sourceState.workspaces.length
? sourceState.workspaces
: defaultHubState.workspaces;
}
function normalizeWorkspaceRoleList(roles = [], fallback = []) {
const knownRoles = new Set(platformDefaultRoles);
const sourceRoles = Array.isArray(roles) ? roles : fallback;
return Array.from(
new Set(["admin", ...sourceRoles.filter((role) => knownRoles.has(role))])
);
}
function normalizeWorkspaceAccessEntry(workspaceId, entry) {
const defaultView = defaultWorkspaceAccess[workspaceId] ?? platformDefaultRoles;
const defaultEdit = defaultWorkspaceEditAccess[workspaceId] ?? ["admin"];
const requiredView = requiredWorkspaceAccess[workspaceId]?.view ?? [];
const requiredEdit = requiredWorkspaceAccess[workspaceId]?.edit ?? [];
const withRequiredAccess = (permission) => {
const view = normalizeWorkspaceRoleList([...(permission.view ?? []), ...requiredView], defaultView);
const edit = normalizeWorkspaceRoleList([...(permission.edit ?? []), ...requiredEdit], defaultEdit).filter((role) =>
view.includes(role)
);
return {
view,
edit: normalizeWorkspaceRoleList(edit, ["admin"]),
};
};
if (Array.isArray(entry)) {
return withRequiredAccess({
view: normalizeWorkspaceRoleList(entry, defaultView),
edit: normalizeWorkspaceRoleList(defaultEdit, ["admin"]),
});
}
if (entry && typeof entry === "object") {
const view = normalizeWorkspaceRoleList(entry.view, defaultView);
const edit = normalizeWorkspaceRoleList(entry.edit, defaultEdit).filter((role) => view.includes(role));
return withRequiredAccess({
view,
edit: normalizeWorkspaceRoleList(edit, ["admin"]),
});
}
return withRequiredAccess({
view: normalizeWorkspaceRoleList(defaultView, platformDefaultRoles),
edit: normalizeWorkspaceRoleList(defaultEdit, ["admin"]),
});
}
function getWorkspaceAccessConfig(sourceState = getHubState()) {
const configuredAccess = sourceState?.workspaceAccess ?? {};
const workspaceIds = new Set([
...Object.keys(defaultWorkspaceAccess),
...Object.keys(defaultWorkspaceEditAccess),
...Object.keys(configuredAccess),
]);
return Array.from(workspaceIds).reduce((config, workspaceId) => {
config[workspaceId] = normalizeWorkspaceAccessEntry(workspaceId, configuredAccess[workspaceId]);
return config;
}, {});
}
function getWorkspaceByIdFromPool(workspaceId, sourceState = getHubState()) { return getAllWorkspacePool(sourceState).find((workspace) => workspace.id === workspaceId) ?? null; }
function canUserAccessWorkspace(
workspace,
user = getCurrentPlatformUser(),
accessConfig = getWorkspaceAccessConfig()
) {
if (!workspace) {
return false;
}
const normalizedRole = normalizePlatformRole(user?.role, "guest");
if (normalizedRole === "admin") {
return true;
}
if (workspace.id === "transfer-room") {
return canUserAccessTransferRoom(user);
}
if (workspace.requiresAdmin) {
return isPlatformManagementUser(user);
}
const permission = normalizeWorkspaceAccessEntry(workspace.id, accessConfig[workspace.id]);
if (!permission.view.length) {
return true;
}
return permission.view.includes(normalizedRole);
}
function canCurrentUserAccessWorkspace(workspace) { return canUserAccessWorkspace(workspace); }
function canUserEditWorkspace(
workspaceId,
user = getCurrentPlatformUser(),
accessConfig = getWorkspaceAccessConfig()
) {
const normalizedRole = normalizePlatformRole(user?.role, "guest");
if (normalizedRole === "admin") {
return true;
}
const workspace = getWorkspaceByIdFromPool(workspaceId);
if (!workspace) {
return false;
}
if (workspaceId === "transfer-room") {
return canUserEditTransferRoom(user);
}
if (workspace.requiresAdmin) {
return isPlatformManagementUser(user);
}
if (!isPlatformStaffUser(user)) {
return false;
}
const permission = normalizeWorkspaceAccessEntry(workspaceId, accessConfig[workspaceId]);
return permission.view.includes(normalizedRole) && permission.edit.includes(normalizedRole);
}
function canCurrentUserEditWorkspace(workspaceId) { return canUserEditWorkspace(workspaceId); }
function canEditScheduleWorkspace() { return canCurrentUserEditWorkspace("schedule"); }
function canEditSessionPlanner() { return canCurrentUserEditWorkspace("session-planner"); }
function canEditPeriodizationWorkspace() { return canCurrentUserEditWorkspace("periodization"); }
function canEditGameSimulatorWorkspace() { return canCurrentUserEditWorkspace("game-simulator"); }
function canEditScoutingWorkspace() { return canCurrentUserEditWorkspace("scouting"); }
function getAccessibleWorkspacePool(sourceState = getHubState()) {
  const accessConfig = getWorkspaceAccessConfig(sourceState);
  const currentUser = getCurrentPlatformUser();
  return getAllWorkspacePool(sourceState).filter((workspace) =>
    canUserAccessWorkspace(workspace, currentUser, accessConfig)
  );
}
function getVisibleWorkspacePool(sourceState = getHubState()) {
  return getAccessibleWorkspacePool(sourceState).filter((workspace) => !workspace.hiddenFromNav);
}
function getFirstAccessibleWorkspaceId(sourceState = getHubState()) {
  const fallbackWorkspace = getAccessibleWorkspacePool(sourceState)[0];
  return fallbackWorkspace ? fallbackWorkspace.id : workspaceHubDefaultActiveWorkspaceId;
}
function mergeWorkspaceDefinitions(sourceWorkspaces = []) {
const sourceById = new Map(sourceWorkspaces.map((workspace) => [workspace.id, workspace]));
const defaultsById = new Map(defaultHubState.workspaces.map((workspace) => [workspace.id, workspace]));
return defaultHubState.workspaces.map((defaultWorkspace) => {
const workspace = sourceById.get(defaultWorkspace.id);
if (!workspace || !defaultsById.has(workspace.id)) {
return { ...defaultWorkspace };
}
const fallback = defaultsById.get(workspace.id) ?? {};
const mergedWorkspace = {
...fallback,
...workspace,
};
if (["session-planner", "player-profiles"].includes(defaultWorkspace.id)) {
mergedWorkspace.kind = defaultWorkspace.kind;
mergedWorkspace.status = defaultWorkspace.status;
}
if (defaultWorkspace.id === "player-profiles") {
mergedWorkspace.title = defaultWorkspace.title;
mergedWorkspace.meta = defaultWorkspace.meta;
mergedWorkspace.description = defaultWorkspace.description;
}
return mergedWorkspace;
});
}
const {
cloneHubState,
clonePersistableWorkspaceHubState,
} = createWorkspaceHubStateHelpers({
defaultHubState,
defaultWorkspaceAccess,
mergeWorkspaceDefinitions,
});
function repairWorkspaceState(candidateState = getHubState()) {
  const repairedState = candidateState ?? cloneHubState(defaultHubState);
  const mergedWorkspaces = mergeWorkspaceDefinitions(
    Array.isArray(repairedState.workspaces) && repairedState.workspaces.length
      ? repairedState.workspaces
      : defaultHubState.workspaces
  );
  const accessConfig = getWorkspaceAccessConfig(repairedState);
  const activeExists = mergedWorkspaces.some(
    (workspace) =>
      workspace.id === repairedState.activeWorkspaceId &&
      canUserAccessWorkspace(workspace, getCurrentPlatformUser(), accessConfig)
  );
  repairedState.workspaces = mergedWorkspaces;
  repairedState.workspaceAccess = accessConfig;
  if (!activeExists) {
    repairedState.activeWorkspaceId = getFirstAccessibleWorkspaceId(repairedState);
  }
  return repairedState;
}
function getWorkspaceIdFromUrl() {
try {
const params = new URLSearchParams(win.location.search);
return params.get("workspace") ?? params.get("space") ?? null;
} catch {
return null;
}
}
function readRememberedWorkspaceId() {
try {
return (
win.sessionStorage.getItem(workspaceLastActiveStorageKey) ||
win.localStorage.getItem(workspaceLastActiveStorageKey) ||
null
);
} catch {
return null;
}
}
function rememberActiveWorkspaceId(workspaceId) {
const safeWorkspaceId = typeof workspaceId === "string" ? workspaceId.trim() : "";
if (!safeWorkspaceId) {
return;
}
try {
win.sessionStorage.setItem(workspaceLastActiveStorageKey, safeWorkspaceId);
} catch {}
try {
win.localStorage.setItem(workspaceLastActiveStorageKey, safeWorkspaceId);
} catch {}
}
function readWorkspaceHubState() {
try {
const raw = win.localStorage.getItem(workspaceHubStorageKey);
if (!raw) {
return cloneHubState(defaultHubState);
}
const parsed = JSON.parse(raw);
return cloneHubState({
...defaultHubState,
...parsed,
activeWorkspaceId: workspaceHubDefaultActiveWorkspaceId,
profile: {
...defaultHubState.profile,
...(parsed?.profile ?? {}),
},
workspaces: mergeWorkspaceDefinitions(
Array.isArray(parsed?.workspaces) && parsed.workspaces.length
? parsed.workspaces
: defaultHubState.workspaces
),
workspaceAccess: {
...defaultWorkspaceAccess,
...(parsed?.workspaceAccess ?? {}),
},
});
} catch {
return cloneHubState(defaultHubState);
}
}
function writeWorkspaceHubState() {
const hubState = getHubState();
if (!hubState) {
return;
}
try {
win.localStorage.setItem(workspaceHubStorageKey, JSON.stringify(clonePersistableWorkspaceHubState(hubState)));
} catch {
logEvent("Workspace hub settings could not be written to local storage.");
}
}
function getWorkspaceById(workspaceId) {
const workspaces = getAccessibleWorkspacePool();
return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}
function getWorkspaceByIdUnfiltered(workspaceId, sourceState = getHubState()) {
const workspaces = getAllWorkspacePool(sourceState);
return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}
function getSafeWorkspaceId(workspaceId, sourceState = getHubState()) {
const workspace = getWorkspaceByIdUnfiltered(workspaceId, sourceState);
if (!workspace) {
return null;
}
const user = getCurrentPlatformUser();
const accessConfig = getWorkspaceAccessConfig(sourceState);
if (!canUserAccessWorkspace(workspace, user, accessConfig)) {
return null;
}
return workspace.id;
}
function getWorkspaceViewId(workspaceId) {
const workspace = getWorkspaceById(workspaceId);
if (!workspace) {
return "home";
}
if (workspace.kind === "simulator") {
return "game-simulator";
}
if (workspace.kind === "dashboard") {
return "home";
}
if (workspace.kind === "profile") {
return "profile";
}
if (workspace.kind === "staff") {
return "staff";
}
if (workspace.kind === "admin") {
return "admin";
}
if (workspace.kind === "medical") {
return "medical-team";
}
if (workspace.kind === "player-profiles") {
return "player-profiles";
}
if (workspace.kind === "idp") {
return "idp";
}
if (workspace.kind === "analysis-room") {
return "analysis-room";
}
if (workspace.kind === "transfer-room") {
return "transfer-room";
}
if (workspace.kind === "scouting") {
return "scouting";
}
if (workspace.kind === "schedule") {
return "schedule";
}
if (workspace.kind === "gameplan") {
return "gameplan";
}
if (workspace.kind === "periodization") {
return "periodization";
}
if (workspace.kind === "session") {
return "session-planner";
}
if (workspace.kind === "set-pieces-room") {
return "set-pieces-room";
}
return "placeholder";
}

return {
getAllWorkspacePool,
normalizeWorkspaceRoleList,
normalizeWorkspaceAccessEntry,
getWorkspaceAccessConfig,
getWorkspaceByIdFromPool,
canUserAccessWorkspace,
canCurrentUserAccessWorkspace,
canUserEditWorkspace,
canCurrentUserEditWorkspace,
canEditScheduleWorkspace,
canEditSessionPlanner,
canEditPeriodizationWorkspace,
canEditGameSimulatorWorkspace,
  canEditScoutingWorkspace,
  getAccessibleWorkspacePool,
  getVisibleWorkspacePool,
  mergeWorkspaceDefinitions,
  cloneHubState,
  clonePersistableWorkspaceHubState,
  repairWorkspaceState,
  getFirstAccessibleWorkspaceId,
  getWorkspaceIdFromUrl,
readRememberedWorkspaceId,
rememberActiveWorkspaceId,
readWorkspaceHubState,
writeWorkspaceHubState,
getWorkspaceById,
getWorkspaceByIdUnfiltered,
getSafeWorkspaceId,
getWorkspaceViewId,
};
}
