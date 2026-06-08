import { createPlatformStructureStateHelpers } from "./structure-state.mjs";
function defaultNormalizePlatformRole(role, fallback = "coach", defaultRoles = []) {
if (Array.isArray(role)) {
return defaultNormalizePlatformRole(role.find((entry) => typeof entry === "string" && entry.trim()) || "", fallback, defaultRoles);
}
if (role && typeof role === "object") {
return defaultNormalizePlatformRole(role?.role || role?.name || role?.value || "", fallback, defaultRoles);
}
const normalizedRole = String(role || "").trim().toLowerCase();
const roleAliases = { "super-admin": "admin", "superadmin": "admin", "administrator": "admin", "platform-admin": "admin", "platform owner": "admin", owner: "admin", "admin-role": "admin" };
const mappedRole = roleAliases[normalizedRole] || normalizedRole;
return defaultRoles.includes(mappedRole) ? mappedRole : fallback;
}
function defaultAssignableRolesForUser(user, defaultRoles = []) {
const role = defaultNormalizePlatformRole(user?.role, "", defaultRoles);
if (role === "admin") return defaultRoles;
if (role === "club-admin") return ["team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
if (role === "team-admin") return ["coach", "scout", "analyst", "performance", "medical", "guest"];
return [];
}
export function createPlatformStructureRuntimeService(options = {}) {
const win = options.window ?? globalThis.window ?? {};
const platformStructureStorageKey = options.storageKey || "football-platform-structure-v1";
const platformDefaultRoles = Array.isArray(options.defaultRoles) && options.defaultRoles.length
? options.defaultRoles
: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
const platformManagementRoleSet = options.managementRoleSet instanceof Set ? options.managementRoleSet : new Set(["admin", "club-admin", "team-admin"]);
const platformDefaultClubId = options.defaultClubId || "club-north-carolina-courage";
const platformDefaultTeamId = options.defaultTeamId || "team-north-carolina-courage";
const platformDefaultClubName = options.defaultClubName || "North Carolina Courage";
const platformDefaultClubShortName = options.defaultClubShortName || "NCC";
const platformDefaultTeamName = options.defaultTeamName || platformDefaultClubName;
const platformDefaultTeamLevel = options.defaultTeamLevel || "First Team";
const legacyPlatformStructureValues = options.legacyValues instanceof Set ? options.legacyValues : new Set();
const canonicalPlatformClubValues = options.canonicalClubValues instanceof Set ? options.canonicalClubValues : new Set();
const canonicalPlatformTeamValues = options.canonicalTeamValues instanceof Set ? options.canonicalTeamValues : new Set();
const getPlatformTeamLogoUrl = typeof options.getPlatformTeamLogoUrl === "function"
? options.getPlatformTeamLogoUrl
: (team = {}) => String(team?.logoUrl || team?.logo_url || team?.logo || team?.badgeUrl || team?.crestUrl || "").trim();
const getPlatformUsers = typeof options.getPlatformUsers === "function" ? options.getPlatformUsers : () => [];
const getCurrentPlatformUser = typeof options.getCurrentPlatformUser === "function" ? options.getCurrentPlatformUser : () => null;
const getPlatformAuthStore = typeof options.getPlatformAuthStore === "function" ? options.getPlatformAuthStore : () => null;
const normalizePlatformRole = typeof options.normalizePlatformRole === "function"
? options.normalizePlatformRole
: (role, fallback = "coach") => defaultNormalizePlatformRole(role, fallback, platformDefaultRoles);
const getAssignableRolesForUser = typeof options.getAssignableRolesForUser === "function"
? options.getAssignableRolesForUser
: (user = getCurrentPlatformUser()) => defaultAssignableRolesForUser(user, platformDefaultRoles);
const isPlatformAdminUser = typeof options.isPlatformAdminUser === "function"
? options.isPlatformAdminUser
: (user = {}) => normalizePlatformRole(user?.role, "") === "admin";
const isPlatformManagementUser = typeof options.isPlatformManagementUser === "function"
? options.isPlatformManagementUser
: (user = {}) => platformManagementRoleSet.has(normalizePlatformRole(user?.role, ""));
const normalizePlatformImageUrl = typeof options.normalizePlatformImageUrl === "function" ? options.normalizePlatformImageUrl : (value = "") => String(value || "").trim();
const logEvent = typeof options.logEvent === "function" ? options.logEvent : () => {};
const platformStructureStateHelpers = createPlatformStructureStateHelpers({
defaultClubId: platformDefaultClubId,
defaultTeamId: platformDefaultTeamId,
defaultClubName: platformDefaultClubName,
defaultClubShortName: platformDefaultClubShortName,
defaultTeamName: platformDefaultTeamName,
defaultTeamLevel: platformDefaultTeamLevel,
legacyValues: legacyPlatformStructureValues,
canonicalClubValues: canonicalPlatformClubValues,
canonicalTeamValues: canonicalPlatformTeamValues,
getTeamLogoUrl: getPlatformTeamLogoUrl,
});
const {
cloneDefaultPlatformStructureState: cloneDefaultPlatformStructureStateFromModule,
createPlatformStructureId: createPlatformStructureIdFromModule,
hasPlatformWorkspaceScope: hasPlatformWorkspaceScopeFromModule,
isCanonicalPlatformClub: isCanonicalPlatformClubFromModule,
isCanonicalPlatformClubValue: isCanonicalPlatformClubValueFromModule,
isCanonicalPlatformTeam: isCanonicalPlatformTeamFromModule,
isCanonicalPlatformTeamValue: isCanonicalPlatformTeamValueFromModule,
isLegacyPlatformClub: isLegacyPlatformClubFromModule,
isLegacyPlatformStructureValue: isLegacyPlatformStructureValueFromModule,
isLegacyPlatformTeam: isLegacyPlatformTeamFromModule,
isLegacyPlatformTeamPlaceholderName: isLegacyPlatformTeamPlaceholderNameFromModule,
normalizePlatformClub: normalizePlatformClubFromModule,
normalizePlatformStructureComparable: normalizePlatformStructureComparableFromModule,
normalizePlatformStructureId: normalizePlatformStructureIdFromModule,
normalizePlatformStructureState: normalizePlatformStructureStateFromModule,
normalizePlatformStructureText: normalizePlatformStructureTextFromModule,
normalizePlatformTeam: normalizePlatformTeamFromModule,
slugifyPlatformStructureValue: slugifyPlatformStructureValueFromModule,
} = platformStructureStateHelpers;
function cloneDefaultPlatformStructureState() { return cloneDefaultPlatformStructureStateFromModule(); }
function normalizePlatformStructureText(value, fallback = "") { return normalizePlatformStructureTextFromModule(value, fallback); }
function normalizePlatformStructureComparable(value = "") { return normalizePlatformStructureComparableFromModule(value); }
function isLegacyPlatformStructureValue(value = "") { return isLegacyPlatformStructureValueFromModule(value); }
function isCanonicalPlatformClubValue(value = "") { return isCanonicalPlatformClubValueFromModule(value); }
function isCanonicalPlatformTeamValue(value = "") { return isCanonicalPlatformTeamValueFromModule(value); }
function isLegacyPlatformClub(candidate = {}) {
return isLegacyPlatformClubFromModule(candidate);
}
function isLegacyPlatformTeam(candidate = {}) {
return isLegacyPlatformTeamFromModule(candidate);
}
function isCanonicalPlatformClub(candidate = {}) {
return isCanonicalPlatformClubFromModule(candidate);
}
function isCanonicalPlatformTeam(candidate = {}) {
return isCanonicalPlatformTeamFromModule(candidate);
}
function hasPlatformWorkspaceScope(user = {}) {
return hasPlatformWorkspaceScopeFromModule(user);
}
function slugifyPlatformStructureValue(value, fallback = "scope") { return slugifyPlatformStructureValueFromModule(value, fallback); }
function normalizePlatformStructureId(value, prefix, fallbackLabel) { return normalizePlatformStructureIdFromModule(value, prefix, fallbackLabel); }
function createPlatformStructureId(prefix, label, usedIds = new Set()) { return createPlatformStructureIdFromModule(prefix, label, usedIds); }
function normalizePlatformClub(club = {}, fallback = {}) {
return normalizePlatformClubFromModule(club, fallback);
}
function normalizePlatformTeam(team = {}, fallback = {}) {
return normalizePlatformTeamFromModule(team, fallback);
}
function normalizePlatformStructureState(candidate = {}) {
return normalizePlatformStructureStateFromModule(candidate);
}
function isLegacyPlatformTeamPlaceholderName(value = "") { return isLegacyPlatformTeamPlaceholderNameFromModule(value); }
function readPlatformStructureState() {
try {
const raw = win.localStorage.getItem(platformStructureStorageKey);
return normalizePlatformStructureState(raw ? JSON.parse(raw) : cloneDefaultPlatformStructureState());
} catch {
return cloneDefaultPlatformStructureState();
}
}
function writePlatformStructureState(nextState) {
try {
win.localStorage.setItem(platformStructureStorageKey, JSON.stringify(normalizePlatformStructureState(nextState)));
} catch {
logEvent("Club and team structure could not be written to local storage.");
}
}
function getPlatformStructureState() { return readPlatformStructureState(); }
function getPlatformClubById(clubId, structure = getPlatformStructureState()) { return structure.clubs.find((club) => club.id === clubId) ?? structure.clubs[0] ?? null; }
function getPlatformTeamById(teamId, structure = getPlatformStructureState()) { return structure.teams.find((team) => team.id === teamId) ?? structure.teams[0] ?? null; }
function findPlatformTeamByName(teamName, structure = getPlatformStructureState()) {
const normalizedName = String(teamName || "").trim().toLowerCase();
return normalizedName && !isLegacyPlatformStructureValue(normalizedName)
? structure.teams.find((team) => team.name.toLowerCase() === normalizedName) ?? null
: null;
}
function syncPlatformStructureWithUsers(users = getPlatformUsers()) {
const structure = readPlatformStructureState();
const clubIds = new Set(structure.clubs.map((club) => club.id));
const teamIds = new Set(structure.teams.map((team) => team.id));
let changed = false;
users.forEach((user) => {
const rawClubName = normalizePlatformStructureText(user.clubName || user.club || "", "");
const rawClubId = normalizePlatformStructureText(user.clubId || user.club_id || "", "");
const useDefaultClub =
isLegacyPlatformStructureValue(rawClubName) ||
isLegacyPlatformStructureValue(rawClubId) ||
isCanonicalPlatformClub({ id: rawClubId, name: rawClubName });
const clubName = useDefaultClub ? platformDefaultClubName : rawClubName;
const fallbackClubId = useDefaultClub
? platformDefaultClubId
: clubName
? normalizePlatformStructureId(user.clubId, "club", clubName)
: platformDefaultClubId;
const clubId = useDefaultClub ? platformDefaultClubId : normalizePlatformStructureText(user.clubId, fallbackClubId);
if (clubId && !clubIds.has(clubId)) {
structure.clubs.push(normalizePlatformClub({ id: clubId, name: clubName || "Club", shortName: user.clubShortName || clubName || "Club" }));
clubIds.add(clubId);
changed = true;
}
const rawTeamName = normalizePlatformStructureText(user.teamName || user.team || "", "");
const rawTeamId = normalizePlatformStructureText(user.teamId || user.team_id || "", "");
const useDefaultTeam =
isLegacyPlatformStructureValue(rawTeamName) ||
isLegacyPlatformStructureValue(rawTeamId) ||
isCanonicalPlatformTeam({ id: rawTeamId, name: rawTeamName });
const teamName = useDefaultTeam ? platformDefaultTeamName : rawTeamName;
const existingTeam = findPlatformTeamByName(teamName, structure);
const fallbackTeamId = useDefaultTeam
? platformDefaultTeamId
: existingTeam?.id || (teamName ? normalizePlatformStructureId(user.teamId, "team", teamName) : platformDefaultTeamId);
const teamId = useDefaultTeam ? platformDefaultTeamId : normalizePlatformStructureText(user.teamId, fallbackTeamId);
if (teamId && !teamIds.has(teamId)) {
structure.teams.push(
normalizePlatformTeam({
id: teamId,
clubId,
name: teamName || "Team",
shortName: user.teamShortName || teamName || "Team",
})
);
teamIds.add(teamId);
changed = true;
}
});
const normalizedStructure = normalizePlatformStructureState(structure);
if (changed) {
writePlatformStructureState(normalizedStructure);
}
return normalizedStructure;
}
function getUserTeamId(user, structure = getPlatformStructureState()) {
const explicitTeamId = normalizePlatformStructureText(user?.teamId || user?.team_id, "");
if (isLegacyPlatformStructureValue(explicitTeamId)) {
return platformDefaultTeamId;
}
if (explicitTeamId && structure.teams.some((team) => team.id === explicitTeamId)) {
return explicitTeamId;
}
const team = findPlatformTeamByName(user?.teamName || user?.team, structure);
return team?.id || platformDefaultTeamId;
}
function getUserClubId(user, structure = getPlatformStructureState()) {
const explicitClubId = normalizePlatformStructureText(user?.clubId || user?.club_id, "");
if (isLegacyPlatformStructureValue(explicitClubId)) {
return platformDefaultClubId;
}
if (explicitClubId && structure.clubs.some((club) => club.id === explicitClubId)) {
return explicitClubId;
}
const team = getPlatformTeamById(getUserTeamId(user, structure), structure);
return team?.clubId || platformDefaultClubId;
}
function getUserTeamName(user, structure = getPlatformStructureState()) {
const explicitTeamName = normalizePlatformStructureText(user?.teamName || user?.team, "");
const explicitTeamId = normalizePlatformStructureText(user?.teamId || user?.team_id, "");
if (explicitTeamId) {
if (isLegacyPlatformStructureValue(explicitTeamId)) {
return platformDefaultTeamName;
}
const team = getPlatformTeamById(explicitTeamId, structure);
if (team?.name) {
return team.name;
}
}
const matchedTeam = findPlatformTeamByName(explicitTeamName, structure);
if (matchedTeam?.name) {
return matchedTeam.name;
}
const fallbackTeam = getPlatformTeamById(platformDefaultTeamId, structure);
return explicitTeamName && !isLegacyPlatformStructureValue(explicitTeamName)
? explicitTeamName
: fallbackTeam?.name || platformDefaultTeamName;
}
function getActivePlatformTeam(structure = getPlatformStructureState()) {
const activeTeam = structure.teams.find((team) => team.id === structure.activeTeamId && team.status !== "archived") ?? null;
if (activeTeam && !isLegacyPlatformTeamPlaceholderName(activeTeam.name)) {
return activeTeam;
}
const defaultTeam = structure.teams.find((team) => team.id === platformDefaultTeamId && team.status !== "archived") ?? null;
if (defaultTeam && !isLegacyPlatformTeamPlaceholderName(defaultTeam.name)) {
return defaultTeam;
}
return (
structure.teams.find((team) => team.status !== "archived" && !isLegacyPlatformTeamPlaceholderName(team.name)) ??
activeTeam ??
structure.teams.find((team) => team.status !== "archived") ??
structure.teams[0] ??
null
);
}
function getPlatformTeamDisplayTeam(user = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
const currentAuthUser = getPlatformAuthStore()?.getCurrentUser?.() ?? null;
const displayUser = currentAuthUser || user || {};
const explicitTeamId = normalizePlatformStructureText(displayUser?.teamId || displayUser?.team_id, "");
if (explicitTeamId) {
const team = structure.teams.find((candidate) => candidate.id === explicitTeamId);
if (team?.name && !isLegacyPlatformTeamPlaceholderName(team.name)) {
return team;
}
}
const activeTeam = getActivePlatformTeam(structure);
if (activeTeam?.name) {
return activeTeam;
}
const matchedTeam = findPlatformTeamByName(displayUser?.teamName || displayUser?.team, structure);
if (matchedTeam?.name && !isLegacyPlatformTeamPlaceholderName(matchedTeam.name)) {
return matchedTeam;
}
return null;
}
function getPlatformTeamDisplayName(user = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
const currentAuthUser = getPlatformAuthStore()?.getCurrentUser?.() ?? null;
const displayUser = currentAuthUser || user || {};
const displayTeam = getPlatformTeamDisplayTeam(displayUser, structure);
if (displayTeam?.name) {
return displayTeam.name;
}
const explicitTeamName = normalizePlatformStructureText(displayUser?.teamName || displayUser?.team, "");
return explicitTeamName && !isLegacyPlatformTeamPlaceholderName(explicitTeamName) ? explicitTeamName : "Team";
}
function writePlatformTeamLogo(teamId, logoUrl) {
const structure = readPlatformStructureState();
const targetTeam = structure.teams.find((team) => team.id === teamId);
if (!targetTeam) {
return null;
}
const nextLogoUrl = normalizePlatformImageUrl(logoUrl);
const nextStructure = {
...structure,
teams: structure.teams.map((team) => (team.id === teamId ? { ...team, logoUrl: nextLogoUrl } : team)),
};
writePlatformStructureState(nextStructure);
return getPlatformTeamById(teamId, readPlatformStructureState());
}
function getUserClubName(user, structure = getPlatformStructureState()) {
const club = getPlatformClubById(getUserClubId(user, structure), structure);
return club?.name || normalizePlatformStructureText(user?.clubName || user?.club, "Club");
}
function getUserScopeLabel(user, structure = getPlatformStructureState()) {
if (hasPlatformWorkspaceScope(user)) {
return "Football Science Live · Platform";
}
const clubName = getUserClubName(user, structure);
const teamName = getUserTeamName(user, structure);
return clubName && teamName && clubName !== teamName ? `${clubName} · ${teamName}` : teamName || clubName;
}
function isSamePlatformClub(firstUser, secondUser, structure = getPlatformStructureState()) { return getUserClubId(firstUser, structure) === getUserClubId(secondUser, structure); }
function isSamePlatformTeam(firstUser, secondUser, structure = getPlatformStructureState()) { return getUserTeamId(firstUser, structure) === getUserTeamId(secondUser, structure); }
function canAdminViewUser(actor, targetUser, structure = getPlatformStructureState()) {
if (!actor || !targetUser) {
return false;
}
if (isPlatformAdminUser(actor) || actor.id === targetUser.id) {
return true;
}
const role = normalizePlatformRole(actor.role, "");
if (role === "club-admin") {
return isSamePlatformClub(actor, targetUser, structure);
}
if (role === "team-admin") {
return isSamePlatformTeam(actor, targetUser, structure);
}
return targetUser.status === "active" && isSamePlatformTeam(actor, targetUser, structure);
}
function canAdminManageUser(actor, targetUser, structure = getPlatformStructureState(), options = {}) {
if (!actor || !targetUser) {
return false;
}
if (isPlatformAdminUser(actor)) {
return options.remove ? actor.id !== targetUser.id : true;
}
if (actor.id === targetUser.id) {
return !options.remove;
}
if (!isPlatformManagementUser(actor)) {
return false;
}
const actorRole = normalizePlatformRole(actor.role, "");
const targetRole = normalizePlatformRole(targetUser.role, "");
if (actorRole === "club-admin") {
return isSamePlatformClub(actor, targetUser, structure) && targetRole !== "admin" && targetRole !== "club-admin";
}
if (actorRole === "team-admin") {
return isSamePlatformTeam(actor, targetUser, structure) && !platformManagementRoleSet.has(targetRole);
}
return false;
}
function getScopedPlatformUsers(users = getPlatformUsers(), actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) { return users.filter((user) => canAdminViewUser(actor, user, structure)); }
function getScopedPlatformClubs(actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
if (isPlatformAdminUser(actor)) {
return structure.clubs;
}
const club = getPlatformClubById(getUserClubId(actor, structure), structure);
return club ? [club] : [];
}
function getScopedPlatformTeams(actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
if (isPlatformAdminUser(actor)) {
return structure.teams;
}
const role = normalizePlatformRole(actor?.role, "");
if (role === "club-admin") {
const clubId = getUserClubId(actor, structure);
return structure.teams.filter((team) => team.clubId === clubId);
}
const team = getPlatformTeamById(getUserTeamId(actor, structure), structure);
return team ? [team] : [];
}
function normalizeAdminUserSubmissionValues(values = {}, actor = getCurrentPlatformUser(), existingUser = null, structure = getPlatformStructureState()) {
const allowedRoles = getAssignableRolesForUser(actor);
const fallbackRole = existingUser?.role || (allowedRoles.includes("coach") ? "coach" : allowedRoles[0] || "coach");
let role = normalizePlatformRole(values.role || fallbackRole, fallbackRole);
if (!allowedRoles.includes(role)) {
role = allowedRoles.includes(fallbackRole) ? fallbackRole : allowedRoles[0] || "coach";
}
if (existingUser?.id && existingUser.id === actor?.id) {
role = existingUser.role;
}
let status = String(values.status || existingUser?.status || "active").trim().toLowerCase() === "paused" ? "paused" : "active";
if (existingUser?.id && existingUser.id === actor?.id) {
status = existingUser.status || "active";
}
const allowedTeams = getScopedPlatformTeams(actor, structure);
const requestedTeamId = values.teamId || existingUser?.teamId || getUserTeamId(actor, structure);
const requestedTeamName = values.team || values.teamName || existingUser?.team || "";
const selectedTeam =
allowedTeams.find((team) => team.id === requestedTeamId) ||
allowedTeams.find((team) => team.name.toLowerCase() === String(requestedTeamName).trim().toLowerCase()) ||
allowedTeams[0] ||
getPlatformTeamById(platformDefaultTeamId, structure);
const selectedClub = getPlatformClubById(selectedTeam?.clubId, structure) || getPlatformClubById(platformDefaultClubId, structure);
return {
...values,
role,
status,
clubId: selectedClub?.id || platformDefaultClubId,
clubName: selectedClub?.name || "North Carolina Courage",
teamId: selectedTeam?.id || platformDefaultTeamId,
teamName: selectedTeam?.name || "North Carolina Courage",
team: selectedTeam?.name || "North Carolina Courage",
};
}
return {
cloneDefaultPlatformStructureState,
normalizePlatformStructureText,
normalizePlatformStructureComparable,
isLegacyPlatformStructureValue,
isCanonicalPlatformClubValue,
isCanonicalPlatformTeamValue,
isLegacyPlatformClub,
isLegacyPlatformTeam,
isCanonicalPlatformClub,
isCanonicalPlatformTeam,
hasPlatformWorkspaceScope,
slugifyPlatformStructureValue,
normalizePlatformStructureId,
createPlatformStructureId,
normalizePlatformClub,
normalizePlatformTeam,
normalizePlatformStructureState,
isLegacyPlatformTeamPlaceholderName,
readPlatformStructureState,
writePlatformStructureState,
getPlatformStructureState,
getPlatformClubById,
getPlatformTeamById,
findPlatformTeamByName,
syncPlatformStructureWithUsers,
getUserTeamId,
getUserClubId,
getUserTeamName,
getActivePlatformTeam,
getPlatformTeamDisplayTeam,
getPlatformTeamDisplayName,
writePlatformTeamLogo,
getUserClubName,
getUserScopeLabel,
isSamePlatformClub,
isSamePlatformTeam,
canAdminViewUser,
canAdminManageUser,
getScopedPlatformUsers,
getScopedPlatformClubs,
getScopedPlatformTeams,
normalizeAdminUserSubmissionValues,
};
}