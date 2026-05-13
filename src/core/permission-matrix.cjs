const platformRoles = Object.freeze(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"]);
const staffRoles = Object.freeze(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const managerRoles = Object.freeze(["admin", "club-admin", "team-admin", "coach"]);
const scopedAdminRoles = Object.freeze(["admin", "club-admin", "team-admin"]);
const medicalAccessRoles = Object.freeze(["admin", "club-admin", "team-admin", "coach", "performance", "medical"]);
const medicalWriteRoles = Object.freeze(["admin", "club-admin", "team-admin", "medical", "performance"]);
const simulatorWriteRoles = Object.freeze(["admin", "club-admin", "team-admin", "coach", "scout", "analyst"]);
const allAuthenticatedRoles = Object.freeze([...platformRoles]);
const permissionActions = Object.freeze(["read", "write", "delete", "export", "restore", "admin", "observe"]);

function freezePermissions(permissions) {
  return Object.freeze(
    Object.fromEntries(
      permissionActions.map((action) => [action, Object.freeze([...(permissions[action] || [])])])
    )
  );
}

function moduleContract(moduleId, label, scope, permissions, options = {}) {
  return Object.freeze({
    moduleId,
    label,
    scope,
    storageKeys: Object.freeze([...(options.storageKeys || [])]),
    routes: Object.freeze([...(options.routes || [])]),
    permissions: freezePermissions(permissions),
  });
}

const platformPermissionMatrix = Object.freeze([
  moduleContract("platform-shell", "Platform Shell", "organization", {
    read: allAuthenticatedRoles,
    write: ["admin"],
    delete: ["admin"],
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin"],
  }, {
    storageKeys: ["football-workspace-hub-v3", "football-platform-structure-v1"],
  }),
  moduleContract("home", "Home", "team", {
    read: allAuthenticatedRoles,
    write: staffRoles,
    delete: managerRoles,
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    storageKeys: [
      "football-dashboard-tasks-v1",
      "football-dashboard-notification-seen-v1",
      "football-dashboard-tutorial-prefs-v1",
      "football-dashboard-news-seen-v1",
    ],
  }),
  moduleContract("chat", "Team Chat", "team", {
    read: staffRoles,
    write: staffRoles,
    delete: managerRoles,
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    storageKeys: ["football-dashboard-chat-v1"],
    routes: ["/api/chat"],
  }),
  moduleContract("schedule", "Schedule", "team", {
    read: allAuthenticatedRoles,
    write: managerRoles,
    delete: managerRoles,
    export: ["admin", "coach"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    storageKeys: ["football-schedule-v1"],
    routes: ["/api/app-state"],
  }),
  moduleContract("exercise-library", "Exercise Library", "team", {
    read: staffRoles,
    write: managerRoles,
    delete: managerRoles,
    export: ["admin", "coach"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    storageKeys: [
      "football-session-exercise-library-v1",
      "football-session-exercise-library-backup-v1",
      "football-session-exercise-library-folders-v1",
      "football-session-exercise-library-folders-backup-v1",
    ],
  }),
  moduleContract("session-planner", "Session Planner", "team", {
    read: staffRoles,
    write: managerRoles,
    delete: managerRoles,
    export: ["admin", "coach"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    storageKeys: ["football-session-planner-v3"],
    routes: ["/api/session-history"],
  }),
  moduleContract("periodization", "Periodization", "team", {
    read: staffRoles,
    write: ["admin", "club-admin", "team-admin", "coach", "performance"],
    delete: managerRoles,
    export: ["admin", "coach", "performance"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach", "performance"],
  }, {
    storageKeys: ["football-periodization-v2"],
  }),
  moduleContract("medical-team", "Medical Team", "team", {
    read: medicalAccessRoles,
    write: medicalWriteRoles,
    delete: medicalWriteRoles,
    export: ["admin", "medical"],
    restore: ["admin", "medical"],
    admin: ["admin"],
    observe: ["admin", "medical"],
  }, {
    storageKeys: ["football-medical-team-v1"],
    routes: ["/api/medical"],
  }),
  moduleContract("player-profiles", "Squad", "team", {
    read: ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
    write: ["admin", "club-admin", "team-admin", "coach", "scout"],
    delete: managerRoles,
    export: ["admin", "coach", "scout"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach", "scout"],
  }, {
    storageKeys: ["football-player-profiles-v1"],
    routes: ["/api/squad-ages"],
  }),
  moduleContract("scouting", "Scouting", "team", {
    read: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
    write: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
    delete: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
    export: ["admin", "coach", "scout", "analyst"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach", "scout", "analyst"],
  }, {
    storageKeys: ["football-scouting-v1"],
    routes: ["/api/scouting"],
  }),
  moduleContract("game-simulator", "Game Simulator", "team", {
    read: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance"],
    write: simulatorWriteRoles,
    delete: simulatorWriteRoles,
    export: ["admin", "coach", "scout", "analyst"],
    restore: ["admin", "coach"],
    admin: ["admin"],
    observe: ["admin", "coach", "scout", "analyst"],
  }, {
    storageKeys: ["football-simulator-sequence-v1", "football-simulator-sequence-library-v2"],
  }),
  moduleContract("app-state", "Central App State", "organization", {
    read: allAuthenticatedRoles,
    write: staffRoles,
    delete: managerRoles,
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin"],
  }, {
    routes: ["/api/app-state", "/api/app-state-backup", "/api/app-state-backup-status"],
  }),
  moduleContract("admin-users", "User Administration", "organization", {
    read: staffRoles,
    write: allAuthenticatedRoles,
    delete: scopedAdminRoles,
    export: ["admin"],
    restore: ["admin"],
    admin: scopedAdminRoles,
    observe: scopedAdminRoles,
  }, {
    routes: ["/api/admin-users", "/api/send-reset", "/api/user-lookup"],
  }),
  moduleContract("profile", "Profile", "user", {
    read: allAuthenticatedRoles,
    write: allAuthenticatedRoles,
    delete: ["admin"],
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin"],
  }, {
    routes: ["/api/profile-image"],
  }),
  moduleContract("audit-log", "Audit Log", "organization", {
    read: ["admin"],
    write: staffRoles,
    delete: ["admin"],
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin"],
  }, {
    routes: ["/api/audit-log"],
  }),
  moduleContract("presence", "Presence", "team", {
    read: staffRoles,
    write: staffRoles,
    delete: ["admin"],
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin", "coach"],
  }, {
    routes: ["/api/presence"],
  }),
  moduleContract("auth", "Authentication", "user", {
    read: allAuthenticatedRoles,
    write: allAuthenticatedRoles,
    delete: ["admin"],
    export: ["admin"],
    restore: ["admin"],
    admin: ["admin"],
    observe: ["admin"],
  }, {
    routes: ["/api/client-config"],
  }),
]);

const platformPermissionMatrixByModule = Object.freeze(
  Object.fromEntries(platformPermissionMatrix.map((entry) => [entry.moduleId, entry]))
);

const apiRouteSecurity = Object.freeze({
  "/api/admin-users": Object.freeze({
    moduleId: "admin-users",
    actions: Object.freeze({ GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" }),
    rateLimits: Object.freeze({ read: 80, write: 30, delete: 10 }),
    enforcePermission: false,
  }),
  "/api/app-state": Object.freeze({
    moduleId: "app-state",
    actions: Object.freeze({ GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" }),
    rateLimits: Object.freeze({ read: 90, write: 45, delete: 15 }),
    enforcePermission: true,
  }),
  "/api/app-state-backup": Object.freeze({
    moduleId: "app-state",
    actions: Object.freeze({ GET: "restore", POST: "export" }),
    rateLimits: Object.freeze({ restore: 20, export: 8 }),
    enforcePermission: true,
  }),
  "/api/app-state-backup-status": Object.freeze({
    moduleId: "app-state",
    actions: Object.freeze({ GET: "restore" }),
    rateLimits: Object.freeze({ restore: 20 }),
    enforcePermission: true,
  }),
  "/api/audit-log": Object.freeze({
    moduleId: "audit-log",
    actions: Object.freeze({ GET: "read", POST: "write" }),
    rateLimits: Object.freeze({ read: 40, write: 30 }),
    enforcePermission: true,
  }),
  "/api/chat": Object.freeze({
    moduleId: "chat",
    actions: Object.freeze({ GET: "read", POST: "write" }),
    rateLimits: Object.freeze({ read: 120, write: 90 }),
    enforcePermission: true,
  }),
  "/api/client-config": Object.freeze({
    moduleId: "auth",
    public: true,
    actions: Object.freeze({ GET: "read", POST: "write" }),
    rateLimits: Object.freeze({ read: 80, write: 12 }),
    enforcePermission: false,
  }),
  "/api/medical": Object.freeze({
    moduleId: "medical-team",
    actions: Object.freeze({ GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" }),
    rateLimits: Object.freeze({ read: 80, write: 40, delete: 10 }),
    enforcePermission: true,
  }),
  "/api/scouting": Object.freeze({
    moduleId: "scouting",
    actions: Object.freeze({ GET: "read", POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" }),
    rateLimits: Object.freeze({ read: 100, write: 35, delete: 10 }),
    enforcePermission: true,
  }),
  "/api/squad-ages": Object.freeze({
    moduleId: "player-profiles",
    actions: Object.freeze({ POST: "read" }),
    rateLimits: Object.freeze({ read: 30 }),
    enforcePermission: true,
  }),
  "/api/presence": Object.freeze({
    moduleId: "presence",
    actions: Object.freeze({ GET: "read", POST: "write" }),
    rateLimits: Object.freeze({ read: 180, write: 120 }),
    enforcePermission: true,
  }),
  "/api/profile-image": Object.freeze({
    moduleId: "profile",
    actions: Object.freeze({ POST: "write", PUT: "write", PATCH: "write", DELETE: "delete" }),
    rateLimits: Object.freeze({ write: 12, delete: 8 }),
    enforcePermission: true,
  }),
  "/api/send-reset": Object.freeze({
    moduleId: "admin-users",
    actions: Object.freeze({ POST: "admin" }),
    rateLimits: Object.freeze({ admin: 8 }),
    enforcePermission: true,
  }),
  "/api/session-history": Object.freeze({
    moduleId: "session-planner",
    actions: Object.freeze({ GET: "restore", POST: "restore" }),
    rateLimits: Object.freeze({ restore: 20 }),
    enforcePermission: true,
  }),
  "/api/user-lookup": Object.freeze({
    moduleId: "admin-users",
    public: true,
    actions: Object.freeze({ GET: "read" }),
    rateLimits: Object.freeze({ read: 20 }),
    enforcePermission: false,
  }),
});

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAction(value) {
  const action = String(value || "").trim().toLowerCase();
  return permissionActions.includes(action) ? action : "read";
}

function normalizeRoute(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw, "https://footballscience.local").pathname.replace(/\/$/, "") || "/";
  } catch {
    return raw.split("?", 1)[0].replace(/\/$/, "") || "/";
  }
}

function actionForMethod(method, fallback = "read") {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return "read";
  }
  if (normalizedMethod === "DELETE") {
    return "delete";
  }
  if (normalizedMethod === "POST" || normalizedMethod === "PUT" || normalizedMethod === "PATCH") {
    return "write";
  }
  return normalizeAction(fallback);
}

function getModulePermissionContract(moduleId) {
  return platformPermissionMatrixByModule[String(moduleId || "")] || null;
}

function hasModulePermission(actor, moduleId, action) {
  const role = normalizeRole(actor?.role || actor?.appRole || "");
  if (!role) {
    return false;
  }
  const contract = getModulePermissionContract(moduleId);
  if (!contract) {
    return false;
  }
  const roles = contract.permissions[normalizeAction(action)] || [];
  return roles.includes(role);
}

function getApiRouteSecurityConfig(route) {
  const normalizedRoute = normalizeRoute(route);
  return apiRouteSecurity[normalizedRoute] || null;
}

function getApiActionForMethod(route, method) {
  const config = getApiRouteSecurityConfig(route);
  const normalizedMethod = String(method || "GET").toUpperCase();
  return normalizeAction(config?.actions?.[normalizedMethod] || actionForMethod(normalizedMethod));
}

module.exports = {
  actionForMethod,
  apiRouteSecurity,
  getApiActionForMethod,
  getApiRouteSecurityConfig,
  getModulePermissionContract,
  hasModulePermission,
  normalizeAction,
  normalizeRole,
  normalizeRoute,
  permissionActions,
  platformPermissionMatrix,
  platformPermissionMatrixByModule,
  platformRoles,
};
