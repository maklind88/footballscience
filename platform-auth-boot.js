(() => {
  const DEFAULT_ROLES = ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
  const ROLE_ALIAS_MAP = Object.freeze({
    "super-admin": "admin",
    "superadmin": "admin",
    "administrator": "admin",
    "platform-admin": "admin",
    "platform owner": "admin",
    "owner": "admin",
    "admin-role": "admin",
  });
  const DEFAULT_CLUB_ID = "club-ncc";
  const DEFAULT_TEAM_ID = "team-ncc-first";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  const API_CLIENT_CONFIG = "/api/client-config";
  const API_ADMIN_USERS = "/api/admin-users";
  const API_AUTH_LOGIN = "/api/client-config";
  const API_PROFILE_IMAGE = "/api/profile-image";
  const API_USER_LOOKUP = "/api/user-lookup";
  const API_SEND_RESET = "/api/send-reset";
  const API_APP_STATE = "/api/app-state";
  const API_AUDIT_LOG = "/api/audit-log";
  const API_MEDICAL = "/api/medical";
  const API_SESSION_HISTORY = "/api/session-history";
  const API_PRESENCE = "/api/presence";
  const DATA_SAFETY_MANIFEST_KEY = "football-data-safety-v1";
  const ONLINE_APP_URL = "https://footballscience.xyz/";
  const DEV_AUTH_SESSION_KEY = "football-science-dev-auth-session-v1";
  const DEV_AUTH_PASSWORD = "courage";
  const WORKSPACE_HUB_STATE_KEY = "football-workspace-hub-v3";
  const PLATFORM_STRUCTURE_STATE_KEY = "football-platform-structure-v1";
  const SESSION_PLANNER_STATE_KEY = "football-session-planner-v3";
  const PLAYER_PROFILES_STATE_KEY = "football-player-profiles-v1";
  const MEDICAL_TEAM_STATE_KEY = "football-medical-team-v1";
  const SCOUTING_STATE_KEY = "football-scouting-v1";
  const CLIENT_CONFIG_CACHE_KEY = "footballscience-client-config-v1";
  const CLIENT_CONFIG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const SESSION_PLANNER_REDUCTION_GUARD_KEY = "blockReductionGuard";
  const SESSION_PLANNER_REDUCTION_WINDOW_MS = 30 * 60 * 1000;
  const SESSION_PLANNER_BLOCK_FIELD_META_KEY = "fieldUpdatedAt";
  const SESSION_PLANNER_BLOCK_MERGE_FIELDS = [
    "label",
    "title",
    "focus",
    "phase",
    "subPhase",
    "minutes",
    "time",
    "intensity",
    "pitchSize",
    "material",
    "objective",
    "why",
    "organization",
    "principles",
    "diagram",
    "tacticalPitchMode",
    "playerBoardLayoutMode",
    "visualImage",
    "playerBoardPositions",
    "playerBoardColors",
    "tacticalElements",
  ];
  const SESSION_PLANNER_BLOCK_MERGE_FIELD_SET = new Set(SESSION_PLANNER_BLOCK_MERGE_FIELDS);
  const PERIODIZATION_STATE_KEY = "football-periodization-v2";
  const SCHEDULE_STATE_KEY = "football-schedule-v1";
  const CENTRAL_STATE_KEYS = new Set([
    WORKSPACE_HUB_STATE_KEY,
    PLATFORM_STRUCTURE_STATE_KEY,
    "football-platform-appearance-v1",
    PERIODIZATION_STATE_KEY,
    SCHEDULE_STATE_KEY,
    SESSION_PLANNER_STATE_KEY,
    "football-session-exercise-library-v1",
    "football-session-exercise-library-backup-v1",
    "football-session-exercise-library-folders-v1",
    "football-session-exercise-library-folders-backup-v1",
    "football-dashboard-tasks-v1",
    "football-dashboard-notification-seen-v1",
    "football-dashboard-tutorial-prefs-v1",
    "football-dashboard-news-seen-v1",
    MEDICAL_TEAM_STATE_KEY,
    PLAYER_PROFILES_STATE_KEY,
    SCOUTING_STATE_KEY,
    "football-gameplan-v1",
    "football-transfer-room-v1",
    "football-simulator-sequence-v1",
    "football-simulator-sequence-library-v2",
  ]);
  const RETIRED_CENTRAL_STATE_KEYS = new Set([
    "football-workspace-hub-v1",
    "football-workspace-hub-v2",
    "football-periodization-v1",
    "football-session-planner-v1",
    "football-session-planner-v2",
    "football-dashboard-chat-v1",
    "football-simulator-sequence-library-v1",
    "mak-coaching-platform-users-v1",
    "mak-coaching-platform-session-v1",
  ]);
  const MAX_PROFILE_IMAGE_URL_LENGTH = 1800;
  const MAX_AUTH_ACCESS_TOKEN_LENGTH = 6000;
  const authState = {
    supabase: null,
    session: null,
    currentUser: null,
    users: [],
    roles: [...DEFAULT_ROLES],
    isReady: false,
    isSigningOut: false,
    devMode: false,
  };
  const centralState = {
    hydrated: false,
    hydrating: false,
    lastError: "",
    lastSyncedAt: "",
    localDev: false,
    metadata: {},
  };
  let authRefreshTokenPromise = null;
  let authSessionReadPromise = null;
  let currentUserProfileRefreshPromise = null;
  let currentUserProfileRefreshUserId = "";
  let userCacheRefreshPromise = null;
  let postAuthHydrationTimer = 0;
  let postAuthHydrationRunId = 0;
  function normalizeRoleForAuth(rawRole, fallback = "coach") {
    if (Array.isArray(rawRole)) {
      return normalizeRoleForAuth(rawRole.find((entry) => typeof entry === "string" && entry.trim()) || "", fallback);
    }
    if (rawRole && typeof rawRole === "object") {
      return normalizeRoleForAuth(rawRole?.role || rawRole?.name || rawRole?.value || "", fallback);
    }
    const role = String(rawRole || "").trim().toLowerCase();
    const mapped = ROLE_ALIAS_MAP[role] || role;
    return DEFAULT_ROLES.includes(mapped) ? mapped : fallback;
  }
  function normalizeProfileImageValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:image/")) return raw.length <= 2e6 ? raw : "";
    if (raw.length > MAX_PROFILE_IMAGE_URL_LENGTH) return "";
    try { const parsed = new URL(raw); return /^https?:$/.test(parsed.protocol) ? raw : ""; } catch { return ""; }
  }
  function normalizeAuthUser(user = {}) {
    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const role = normalizeRoleForAuth(
      appMeta.role || meta.role || user.role || appMeta.roleHierarchy || meta.roleHierarchy || user.roleHierarchy,
      "coach"
    );
    const status = String(appMeta.status || meta.status || user.status || "active").trim().toLowerCase();
    return {
      id: String(user.id || ""),
      email: String(user.email || "").toLowerCase(),
      firstName: String(meta.firstName || meta.first_name || user.firstName || user.first_name || "New").trim(),
      lastName: String(meta.lastName || meta.last_name || user.lastName || user.last_name || "User").trim(),
      username:
        String(meta.username || meta.user_name || user.username || user.user_name || user.email || "")
          .split("@", 1)[0]
          .trim()
          .toLowerCase() || "user",
      role: DEFAULT_ROLES.includes(role) ? role : "coach",
      title: String(meta.title || user.title || "Coach").trim(),
      department: String(meta.department || user.department || "Football").trim(),
      clubId: String(meta.clubId || meta.club_id || user.clubId || user.club_id || DEFAULT_CLUB_ID).trim(),
      clubName: String(meta.clubName || meta.club_name || user.clubName || user.club_name || "North Carolina Courage").trim(),
      teamId: String(meta.teamId || meta.team_id || user.teamId || user.team_id || DEFAULT_TEAM_ID).trim(),
      teamName: String(meta.teamName || meta.team_name || user.teamName || user.team_name || meta.team || user.team || "North Carolina Courage").trim(),
      team: String(meta.team || user.team || meta.teamName || meta.team_name || user.teamName || user.team_name || "North Carolina Courage").trim(),
      status: status === "paused" ? "paused" : "active",
      profileImageUrl: normalizeProfileImageValue(
        meta.profileImageUrl ||
          meta.profile_image_url ||
          meta.avatarUrl ||
          meta.avatar_url ||
          user.profileImageUrl ||
          user.profile_image_url ||
          user.avatarUrl ||
          user.avatar_url ||
          ""
      ),
      createdAt: user.created_at || user.createdAt || new Date().toISOString(),
      updatedAt: user.updated_at || user.updatedAt || "",
      lastSignInAt: user.last_sign_in_at || user.lastSignInAt || "",
    };
  }
  function toFormError(message, isError = false) {
    const loginError = document.getElementById("loginError");
    if (!loginError) {
      return;
    }
    loginError.textContent = message;
    loginError.hidden = !message;
    loginError.classList.toggle("login-error", isError);
    loginError.classList.toggle("login-success", !isError);
  }
  function setLoginBusy(isBusy, message = "") {
    const loginForm = document.getElementById("loginForm");
    const submitButton = loginForm?.querySelector('button[type="submit"]');
    if (!submitButton) {
      return;
    }
    if (!submitButton.dataset.defaultText) {
      submitButton.dataset.defaultText = submitButton.textContent || "Sign in";
    }
    submitButton.disabled = Boolean(isBusy);
    submitButton.textContent = isBusy ? message || "Signing in..." : submitButton.dataset.defaultText;
  }
  function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(timeoutMessage || "The request took too long. Try again."));
        }, timeoutMs);
      }),
    ]);
  }
  function isLocalFileHost() {
    return window.location.protocol === "file:";
  }
  function isLocalDevHost() {
    const host = window.location.hostname || "";
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  }
  function isLocalDevelopmentSurface() {
    return isLocalDevHost() && !window.__footballScienceQaForceCentralState;
  }
  function shouldForceCanonicalHost() {
    return false;
  }
  function redirectToCanonicalHost() {
    const nextUrl = `https://footballscience.xyz${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    window.location.replace(nextUrl);
  }
  function getPasswordResetRedirectUrl() {
    const fallback = "https://footballscience.xyz/";
    try {
      const host = window.location.hostname || "";
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
        return `${window.location.origin}/`;
      }
    } catch {
      return fallback;
    }
    return fallback;
  }
  function purgeLegacyLocalAccountStorage() {
    try {
      window.localStorage.removeItem("mak-coaching-platform-users-v1");
      window.localStorage.removeItem("mak-coaching-platform-session-v1");
    } catch {}
  }
  function readCachedClientConfig() {
    try {
      const raw = window.localStorage.getItem(CLIENT_CONFIG_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed?.url || !parsed?.anonKey) {
        return null;
      }
      const savedAt = Number(parsed.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > CLIENT_CONFIG_CACHE_MAX_AGE_MS) {
        window.localStorage.removeItem(CLIENT_CONFIG_CACHE_KEY);
        return null;
      }
      return {
        ok: true,
        url: String(parsed.url),
        anonKey: String(parsed.anonKey),
        hasServiceRoleKey: Boolean(parsed.hasServiceRoleKey),
        buildId: parsed.buildId ? String(parsed.buildId) : "",
      };
    } catch {
      return null;
    }
  }
  function writeCachedClientConfig(responsePayload = null) {
    try {
      if (!responsePayload?.url || !responsePayload?.anonKey) {
        return;
      }
      const payload = {
        ok: true,
        url: String(responsePayload.url),
        anonKey: String(responsePayload.anonKey),
        hasServiceRoleKey: Boolean(responsePayload.hasServiceRoleKey),
        buildId: responsePayload.buildId ? String(responsePayload.buildId) : "",
        savedAt: Date.now(),
      };
      window.localStorage.setItem(CLIENT_CONFIG_CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }
  function setForgotPasswordMessage(message, isError = false) {
    const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
    if (!forgotPasswordMessage) {
      return;
    }
    if (message) {
      forgotPasswordMessage.textContent = message;
      forgotPasswordMessage.hidden = false;
      forgotPasswordMessage.classList.toggle("login-error", isError);
      forgotPasswordMessage.classList.toggle("login-success", !isError);
    } else {
      forgotPasswordMessage.hidden = true;
      forgotPasswordMessage.textContent = "";
      forgotPasswordMessage.classList.remove("login-error", "login-success");
    }
  }
  function requestWorkspaceOpen(workspaceId) {
    if (!workspaceId) {
      return;
    }
    window.__pendingWorkspaceId = workspaceId;
    window.dispatchEvent(
      new CustomEvent("platform:open-workspace", {
        detail: { workspaceId },
      })
    );
  }
  function notifyAuthChange(user) {
    window.platformSession = user;
    window.dispatchEvent(new CustomEvent("platform:user-change", { detail: { user } }));
  }
  function getDevAuthUsers() {
    return [
      normalizeAuthUser({
        id: "dev-user-mak",
        email: "mak@footballscience.local",
        user_metadata: {
          firstName: "Mak",
          lastName: "Lind",
          username: "mak",
          title: "Head Coach",
          department: "Football",
          clubId: DEFAULT_CLUB_ID,
          clubName: "North Carolina Courage",
          teamId: DEFAULT_TEAM_ID,
          teamName: "North Carolina Courage",
          team: "North Carolina Courage",
        },
        app_metadata: {
          role: "admin",
          status: "active",
        },
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ];
  }
  function writeDevAuthSession(userId = "") {
    try {
      if (userId) {
        window.localStorage.setItem(DEV_AUTH_SESSION_KEY, userId);
      } else {
        window.localStorage.removeItem(DEV_AUTH_SESSION_KEY);
      }
    } catch {}
  }
  function readDevAuthSessionUserId() {
    try {
      return window.localStorage.getItem(DEV_AUTH_SESSION_KEY) || "";
    } catch {
      return "";
    }
  }
  function initializeDevAuth() {
    authState.devMode = true;
    authState.supabase = null;
    authState.session = null;
    authState.roles = [...DEFAULT_ROLES];
    authState.users = getDevAuthUsers();
    const savedUserId = readDevAuthSessionUserId() || authState.users[0]?.id || "";
    if (savedUserId) {
      setCurrentUserById(savedUserId);
      writeDevAuthSession(savedUserId);
    }
    if (authState.currentUser) {
      showPlatform(authState.currentUser);
    } else {
      showLogin();
      toFormError("Local dev mode: use mak / courage.");
    }
    authState.isReady = true;
  }
  async function signInWithDevAuth(identifier, password) {
    const cleanIdentifier = String(identifier || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();
    const user = authState.users.find(
      (candidate) => candidate.username === cleanIdentifier || candidate.email === cleanIdentifier
    );
    if (!user || cleanPassword !== DEV_AUTH_PASSWORD) {
      return { ok: false, reason: "Incorrect local dev username or password." };
    }
    authState.currentUser = user;
    authState.session = null;
    writeDevAuthSession(user.id);
    notifyAuthChange(user);
    return { ok: true };
  }
  async function ensureDomReady() {
    if (document.readyState !== "loading") {
      return;
    }
    await new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }
  async function loadScript(src) {
    await new Promise((resolve, reject) => {
      const fail = () => reject();
      window.setTimeout(fail, 15000);
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (window.supabase) {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", fail, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  async function readJsonResponse(response) {
    if (!response) {
      return null;
    }
    try {
      const text = await response.text();
      if (!text) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        return { message: text.slice(0, 400) };
      }
    } catch {
      return null;
    }
  }
async function getActiveAccessToken() {
  if (authState.session?.access_token) {
    return authState.session.access_token;
  }
  if (!authState.supabase) {
    return null;
  }
  try {
    const { data } = await readSupabaseSession();
    const session = data?.session || null;
    if (!session?.access_token) {
      return null;
    }
    authState.session = session;
    if (!authState.currentUser?.id || authState.currentUser.id !== session.user?.id) {
      setCurrentUserFromSession(session.user || null);
    }
    return session.access_token;
  } catch (error) {
    console.warn("Supabase session read timed out; using cached session when available.", error);
    return authState.session?.access_token || null;
  }
}
  function isAuthTokenOversized(token) {
    return String(token || "").length > MAX_AUTH_ACCESS_TOKEN_LENGTH;
  }
  async function refreshAccessToken() {
    if (!authState.supabase) {
      return null;
    }
    if (authRefreshTokenPromise) {
      return authRefreshTokenPromise;
    }
    authRefreshTokenPromise = (async () => {
    try {
      const refreshResult = await withTimeout(
        authState.supabase.auth.refreshSession(),
        12000,
        "Session refresh took too long."
      );
      if (refreshResult?.error) {
        return null;
      }
      const refreshedSession = refreshResult?.data?.session || null;
      if (!refreshedSession?.access_token) {
        return null;
      }
      authState.session = refreshedSession;
      if (!authState.currentUser?.id || authState.currentUser.id !== refreshedSession.user?.id) {
        setCurrentUserFromSession(refreshedSession.user || null);
      }
      return refreshedSession.access_token;
    } catch {
      return null;
    } finally {
      authRefreshTokenPromise = null;
    }
    })();
    return authRefreshTokenPromise;
  }
  async function apiRequest(path, options = {}) {
    const { timeoutMs = 15000, skipAuth = false, ...fetchOptions } = options || {};
    let accessToken = skipAuth ? null : await getActiveAccessToken();
    if (!skipAuth && accessToken && isAuthTokenOversized(accessToken)) {
      const refreshedToken = await refreshAccessToken();
      accessToken = refreshedToken || accessToken;
    }
    if (!skipAuth && accessToken && isAuthTokenOversized(accessToken)) {
      await signOut();
      return {
        ok: false,
        status: 0,
        payload: {
          reason: "Your session was too large and has been reset. Sign in again and try again.",
        },
      };
    }
    const headers = new Headers(fetchOptions.headers || {});
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    let response = null;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller && timeoutMs > 0
        ? window.setTimeout(() => {
            controller.abort();
          }, timeoutMs)
        : 0;
    try {
      response = await fetch(path, {
        ...fetchOptions,
        headers,
        credentials: "omit",
        cache: "no-store",
        signal: fetchOptions.signal || controller?.signal,
      });
    } catch (error) {
      return {
        ok: false,
        status: 0,
        payload: {
          reason:
            error?.name === "AbortError"
              ? "Request timed out. Try again."
              : error?.message || "Network error. Try again.",
        },
      };
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
    const payload = await readJsonResponse(response);
    if (response.status === 401 && authState.currentUser) {
      await signOut();
    }
    return {
      ok: response.ok,
      status: response.status,
      payload: payload || {},
    };
  }
  function isCentralStateKey(key) {
    return CENTRAL_STATE_KEYS.has(String(key || ""));
  }
  function shouldRemoveLocalCentralStateKey(key) {
    const normalizedKey = String(key || "");
    return isCentralStateKey(normalizedKey) || RETIRED_CENTRAL_STATE_KEYS.has(normalizedKey);
  }
  function collectCentralLocalStateEntries() {
    const entries = {};
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (isCentralStateKey(key)) {
          entries[key] = window.localStorage.getItem(key) ?? "";
        }
      }
    } catch {
      return {};
    }
    return entries;
  }
  function readCentralSyncManifestEntries() {
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {};
    } catch {
      return {};
    }
  }
  function parseCentralSyncTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  function shouldApplyCentralStateEntry(key, pendingEntry = {}, metadataEntry = {}, options = {}) {
    if (key === MEDICAL_TEAM_STATE_KEY) {
      return true;
    }
    if (options.forceApply || !pendingEntry?.pendingCentralSync || key === MEDICAL_TEAM_STATE_KEY) {
      return true;
    }
    const centralHash = String(metadataEntry.hash || "").trim();
    const localPendingHash = String(pendingEntry.hash || "").trim();
    return Boolean(centralHash && localPendingHash && centralHash === localPendingHash);
  }
  function clearCentralPendingSyncFlag(key) {
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : null;
      const entry = manifest?.entries?.[key];
      if (!entry?.pendingCentralSync) {
        return;
      }
      entry.pendingCentralSync = false;
      manifest.lastCentralError = "";
      manifest.lastCentralSyncedAt = new Date().toISOString();
      window.localStorage.setItem(DATA_SAFETY_MANIFEST_KEY, JSON.stringify(manifest));
    } catch {}
  }
  function getCentralStateBaseRevision(metadata = {}) {
    const revision = Number(metadata?.revision);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }
  function parseSessionPlannerStateValue(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function getSessionPlannerStateSessions(state) {
    return state?.sessions && typeof state.sessions === "object" && !Array.isArray(state.sessions)
      ? state.sessions
      : {};
  }
  function getSessionPlannerStateBlockCount(session) {
    return Array.isArray(session?.blocks) ? session.blocks.length : 0;
  }
  function parseSessionPlannerReductionGuardTime(value) {
    const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  function getSessionPlannerReductionGuards(state) {
    const guard = state?.[SESSION_PLANNER_REDUCTION_GUARD_KEY];
    if (!guard || typeof guard !== "object" || Array.isArray(guard)) {
      return {};
    }
    const now = Date.now();
    return Object.entries(guard).reduce((freshGuards, [dateValue, timestampValue]) => {
      const timestamp = parseSessionPlannerReductionGuardTime(timestampValue);
      if (timestamp && now - timestamp <= SESSION_PLANNER_REDUCTION_WINDOW_MS) {
        freshGuards[dateValue] = timestamp;
      }
      return freshGuards;
    }, {});
  }
  function canReduceSessionPlannerStateBlocks(state, dateValue) {
    return Boolean(getSessionPlannerReductionGuards(state)[dateValue]);
  }
  function normalizeSessionPlannerBlockFieldMeta(source = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {};
    }
    return Object.entries(source).reduce((normalizedMeta, [field, timestampValue]) => {
      if (!SESSION_PLANNER_BLOCK_MERGE_FIELD_SET.has(field)) {
        return normalizedMeta;
      }
      const timestamp = parseSessionPlannerReductionGuardTime(timestampValue);
      if (timestamp) {
        normalizedMeta[field] = new Date(timestamp).toISOString();
      }
      return normalizedMeta;
    }, {});
  }
  function getSessionPlannerBlockFieldUpdatedAtMs(block = {}, field) {
    return parseSessionPlannerReductionGuardTime(block?.[SESSION_PLANNER_BLOCK_FIELD_META_KEY]?.[field]);
  }
  function cloneSessionPlannerMergeValue(value) {
    if (!value || typeof value !== "object") {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return Array.isArray(value) ? [...value] : { ...value };
    }
  }
  function isSessionPlannerEmptyMergeValue(value) {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === "string") {
      return value.trim() === "";
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length === 0;
    }
    return false;
  }
  function getSessionPlannerBlockId(block = {}) {
    return typeof block?.id === "string" && block.id.trim() ? block.id.trim() : "";
  }
  function mergeSessionPlannerBlocks(existingBlock = {}, incomingBlock = {}) {
    const merged = {
      ...existingBlock,
      ...incomingBlock,
      id: getSessionPlannerBlockId(incomingBlock) || getSessionPlannerBlockId(existingBlock),
    };
    const mergedMeta = {
      ...normalizeSessionPlannerBlockFieldMeta(existingBlock[SESSION_PLANNER_BLOCK_FIELD_META_KEY]),
      ...normalizeSessionPlannerBlockFieldMeta(incomingBlock[SESSION_PLANNER_BLOCK_FIELD_META_KEY]),
    };
    SESSION_PLANNER_BLOCK_MERGE_FIELDS.forEach((field) => {
      const existingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(existingBlock, field);
      const incomingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(incomingBlock, field);
      const existingValue = existingBlock[field];
      const incomingValue = incomingBlock[field];
      if (existingTimestamp && (!incomingTimestamp || existingTimestamp > incomingTimestamp)) {
        merged[field] = cloneSessionPlannerMergeValue(existingValue);
        mergedMeta[field] = new Date(existingTimestamp).toISOString();
        return;
      }
      if (!existingTimestamp && !incomingTimestamp && isSessionPlannerEmptyMergeValue(incomingValue) && !isSessionPlannerEmptyMergeValue(existingValue)) {
        merged[field] = cloneSessionPlannerMergeValue(existingValue);
        return;
      }
      merged[field] = cloneSessionPlannerMergeValue(incomingValue);
      if (incomingTimestamp) {
        mergedMeta[field] = new Date(incomingTimestamp).toISOString();
      }
    });
    const newestFieldTimestamp = Object.values(mergedMeta).reduce(
      (latest, timestampValue) => Math.max(latest, parseSessionPlannerReductionGuardTime(timestampValue)),
      0
    );
    const newestBlockTimestamp = Math.max(
      parseSessionPlannerReductionGuardTime(existingBlock.updatedAt),
      parseSessionPlannerReductionGuardTime(incomingBlock.updatedAt),
      newestFieldTimestamp
    );
    merged[SESSION_PLANNER_BLOCK_FIELD_META_KEY] = mergedMeta;
    if (newestBlockTimestamp) {
      merged.updatedAt = new Date(newestBlockTimestamp).toISOString();
    }
    return merged;
  }
  function mergeSessionPlannerSessions(existingSession = {}, incomingSession = {}, dateValue, canReduceBlocks = false) {
    const existingBlocks = Array.isArray(existingSession.blocks) ? existingSession.blocks : [];
    const incomingBlocks = Array.isArray(incomingSession.blocks) ? incomingSession.blocks : [];
    const existingById = new Map(existingBlocks.map((block) => [getSessionPlannerBlockId(block), block]).filter(([id]) => id));
    const incomingIds = new Set();
    const blocks = incomingBlocks.map((incomingBlock) => {
      const blockId = getSessionPlannerBlockId(incomingBlock);
      if (blockId) {
        incomingIds.add(blockId);
      }
      const existingBlock = existingById.get(blockId);
      return existingBlock ? mergeSessionPlannerBlocks(existingBlock, incomingBlock) : cloneSessionPlannerMergeValue(incomingBlock);
    });
    if (!canReduceBlocks) {
      existingBlocks.forEach((existingBlock) => {
        const blockId = getSessionPlannerBlockId(existingBlock);
        if (!blockId || !incomingIds.has(blockId)) {
          blocks.push(cloneSessionPlannerMergeValue(existingBlock));
        }
      });
    }
    const hasIncomingSelection = blocks.some((block) => getSessionPlannerBlockId(block) === incomingSession.selectedBlockId);
    const hasExistingSelection = blocks.some((block) => getSessionPlannerBlockId(block) === existingSession.selectedBlockId);
    return {
      ...existingSession,
      ...incomingSession,
      date: incomingSession.date || existingSession.date || dateValue,
      title: isSessionPlannerEmptyMergeValue(incomingSession.title) && !isSessionPlannerEmptyMergeValue(existingSession.title)
        ? existingSession.title
        : incomingSession.title,
      theme: isSessionPlannerEmptyMergeValue(incomingSession.theme) && !isSessionPlannerEmptyMergeValue(existingSession.theme)
        ? existingSession.theme
        : incomingSession.theme,
      selectedBlockId: hasIncomingSelection
        ? incomingSession.selectedBlockId
        : hasExistingSelection
          ? existingSession.selectedBlockId
          : getSessionPlannerBlockId(blocks[0]) || "",
      blocks,
    };
  }
  function mergeSessionPlannerStateValues(localValue, centralValue) {
    const localState = parseSessionPlannerStateValue(localValue);
    const centralStateValue = parseSessionPlannerStateValue(centralValue);
    if (!localState || !centralStateValue) {
      return { value: centralValue, changed: false };
    }
    const localSessions = getSessionPlannerStateSessions(localState);
    const centralSessions = getSessionPlannerStateSessions(centralStateValue);
    const mergedState = {
      ...centralStateValue,
      sessions: {},
    };
    const sessionDates = new Set([
      ...Object.keys(centralSessions),
      ...Object.keys(localSessions),
    ]);
    sessionDates.forEach((dateValue) => {
      const centralSession = centralSessions[dateValue];
      const localSession = localSessions[dateValue];
      if (centralSession && localSession) {
        mergedState.sessions[dateValue] = mergeSessionPlannerSessions(
          centralSession,
          localSession,
          dateValue,
          canReduceSessionPlannerStateBlocks(localState, dateValue)
        );
        return;
      }
      if (localSession) {
        mergedState.sessions[dateValue] = localSession;
        return;
      }
      if (centralSession) {
        mergedState.sessions[dateValue] = centralSession;
      }
    });
    const guards = getSessionPlannerReductionGuards(localState);
    if (Object.keys(guards).length) {
      mergedState[SESSION_PLANNER_REDUCTION_GUARD_KEY] = {
        ...getSessionPlannerReductionGuards(centralStateValue),
        ...guards,
      };
    } else {
      delete mergedState[SESSION_PLANNER_REDUCTION_GUARD_KEY];
    }
    const mergedValue = JSON.stringify(mergedState);
    return { value: mergedValue, changed: mergedValue !== centralValue };
  }
  const CENTRAL_STATE_MEDIA_FIELDS = [
    "photoUrl",
    "sourceUrl",
    "profileImageUrl",
    "avatarUrl",
    "imageUrl",
    "portraitUrl",
  ];
  function parseCentralObjectStateValue(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  const SCHEDULE_LOCAL_UI_FIELDS = ["selectedYear", "selectedMonthIndex", "selectedDate", "viewMode", "overviewSpan"];
  const PERIODIZATION_LOCAL_UI_FIELDS = ["selectedYear", "selectedMonthIndex", "selectedDate"];
  const PERIODIZATION_FIELD_META_KEY = "fieldUpdatedAt";
  const PERIODIZATION_SCALAR_FIELDS = [
    "seasonPhase",
    "daySchedule",
    "matchDay",
    "sessionType",
    "physicalLoad",
    "pitchSize",
    "preTrainingVideo",
    "preTrainingNotes",
    "psychologicalFocus",
    "psychologicalNotes",
    "mainFocus",
    "gkFocus",
    "warmUp",
    "block1",
    "block2",
    "block3",
    "block4",
    "sessionNotes",
    "sessionPlanLink",
    "sessionVideoLink",
    "sessionGpsReportLink",
  ];
  const PERIODIZATION_MULTI_FIELDS = ["matchPhases", "subPhases", "teamPrinciples", "miniGamePrinciples"];
  const PERIODIZATION_FIELD_SET = new Set([...PERIODIZATION_SCALAR_FIELDS, ...PERIODIZATION_MULTI_FIELDS]);
  function mergeCentralStateLocalUiFields(localValue, centralValue, fields) {
    const localState = parseCentralObjectStateValue(localValue);
    const centralStateValue = parseCentralObjectStateValue(centralValue);
    if (!localState || !centralStateValue) {
      return { value: centralValue, changed: false };
    }
    let changed = false;
    const mergedState = { ...centralStateValue };
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(localState, field)) {
        return;
      }
      if (mergedState[field] !== localState[field]) {
        changed = true;
      }
      mergedState[field] = localState[field];
    });
    return {
      value: changed ? JSON.stringify(mergedState) : centralValue,
      changed: false,
    };
  }
  function normalizePeriodizationCentralMultiValue(value) {
    const rawValues = Array.isArray(value) ? value : String(value ?? "").split("|");
    return [...new Set(rawValues.map((item) => String(item).trim()).filter(Boolean))];
  }
  function normalizePeriodizationCentralDay(day = {}) {
    const normalized = {};
    PERIODIZATION_SCALAR_FIELDS.forEach((field) => {
      const value = String(day?.[field] ?? "").trim();
      normalized[field] = field === "matchDay" && value.toUpperCase() === "N/A" ? "" : value;
    });
    PERIODIZATION_MULTI_FIELDS.forEach((field) => {
      normalized[field] = normalizePeriodizationCentralMultiValue(day?.[field]);
    });
    const fieldUpdatedAt = {};
    if (day?.[PERIODIZATION_FIELD_META_KEY] && typeof day[PERIODIZATION_FIELD_META_KEY] === "object") {
      Object.entries(day[PERIODIZATION_FIELD_META_KEY]).forEach(([field, timestampValue]) => {
        if (!PERIODIZATION_FIELD_SET.has(field)) {
          return;
        }
        const timestamp = new Date(timestampValue || 0).getTime();
        if (Number.isFinite(timestamp) && timestamp > 0) {
          fieldUpdatedAt[field] = new Date(timestamp).toISOString();
        }
      });
    }
    if (Object.keys(fieldUpdatedAt).length) {
      normalized[PERIODIZATION_FIELD_META_KEY] = fieldUpdatedAt;
    }
    return normalized;
  }
  function getPeriodizationCentralFieldUpdatedAtMs(day = {}, field = "") {
    const timestamp = new Date(day?.[PERIODIZATION_FIELD_META_KEY]?.[field] || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  function isEmptyPeriodizationCentralValue(value) {
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return String(value ?? "").trim() === "";
  }
  function mergePeriodizationCentralDay(localDay = {}, centralDay = {}) {
    const local = normalizePeriodizationCentralDay(localDay);
    const central = normalizePeriodizationCentralDay(centralDay);
    const merged = { ...central };
    const mergedMeta = {
      ...(central[PERIODIZATION_FIELD_META_KEY] || {}),
      ...(local[PERIODIZATION_FIELD_META_KEY] || {}),
    };
    PERIODIZATION_FIELD_SET.forEach((field) => {
      const localTimestamp = getPeriodizationCentralFieldUpdatedAtMs(local, field);
      const centralTimestamp = getPeriodizationCentralFieldUpdatedAtMs(central, field);
      if (localTimestamp && (!centralTimestamp || localTimestamp >= centralTimestamp)) {
        merged[field] = Array.isArray(local[field]) ? [...local[field]] : local[field];
        mergedMeta[field] = new Date(localTimestamp).toISOString();
        return;
      }
      if (centralTimestamp && (!localTimestamp || centralTimestamp > localTimestamp)) {
        merged[field] = Array.isArray(central[field]) ? [...central[field]] : central[field];
        mergedMeta[field] = new Date(centralTimestamp).toISOString();
        return;
      }
      if (isEmptyPeriodizationCentralValue(central[field]) && !isEmptyPeriodizationCentralValue(local[field])) {
        merged[field] = Array.isArray(local[field]) ? [...local[field]] : local[field];
      }
    });
    if (Object.keys(mergedMeta).length) {
      merged[PERIODIZATION_FIELD_META_KEY] = mergedMeta;
    }
    return normalizePeriodizationCentralDay(merged);
  }
  function mergePeriodizationCentralStateValues(localValue, centralValue) {
    const localState = parseCentralObjectStateValue(localValue);
    const centralStateValue = parseCentralObjectStateValue(centralValue);
    if (!localState || !centralStateValue) {
      return { value: centralValue, changed: false };
    }
    const localDays = localState.days && typeof localState.days === "object" && !Array.isArray(localState.days)
      ? localState.days
      : {};
    const centralDays = centralStateValue.days && typeof centralStateValue.days === "object" && !Array.isArray(centralStateValue.days)
      ? centralStateValue.days
      : {};
    const mergedDays = {};
    const dateValues = new Set([...Object.keys(centralDays), ...Object.keys(localDays)]);
    dateValues.forEach((dateValue) => {
      if (centralDays[dateValue] && localDays[dateValue]) {
        mergedDays[dateValue] = mergePeriodizationCentralDay(localDays[dateValue], centralDays[dateValue]);
        return;
      }
      if (centralDays[dateValue]) {
        mergedDays[dateValue] = normalizePeriodizationCentralDay(centralDays[dateValue]);
        return;
      }
      if (localDays[dateValue]) {
        mergedDays[dateValue] = normalizePeriodizationCentralDay(localDays[dateValue]);
      }
    });
    const mergedState = { ...centralStateValue, days: mergedDays };
    PERIODIZATION_LOCAL_UI_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(localState, field)) {
        mergedState[field] = localState[field];
      }
    });
    const mergedValue = JSON.stringify(mergedState);
    return { value: mergedValue, changed: mergedValue !== centralValue };
  }
  function getCentralStateRecordMergeKey(record = {}) {
    const id = String(record?.id || record?.userId || record?.playerId || "").trim();
    if (id) {
      return `id:${id}`;
    }
    const name = String(record?.name || record?.fullName || "").trim().toLowerCase();
    return name ? `name:${name}` : "";
  }
  function preserveCentralStateMediaFields(record = {}, fallbackRecord = {}) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { record, changed: false };
    }
    let changed = false;
    const mergedRecord = CENTRAL_STATE_MEDIA_FIELDS.reduce((merged, field) => {
      const currentValue = String(merged?.[field] || "").trim();
      const fallbackValue = String(fallbackRecord?.[field] || "").trim();
      if (!currentValue && fallbackValue) {
        changed = true;
        return { ...merged, [field]: fallbackValue };
      }
      return merged;
    }, record);
    return { record: mergedRecord, changed };
  }
  function mergeCentralStateMediaValues(localValue, centralValue) {
    const localState = parseCentralObjectStateValue(localValue);
    const centralStateValue = parseCentralObjectStateValue(centralValue);
    if (!localState || !centralStateValue || !Array.isArray(localState.players) || !Array.isArray(centralStateValue.players)) {
      return { value: centralValue, changed: false };
    }
    const localPlayersByKey = new Map();
    localState.players.forEach((player) => {
      const key = getCentralStateRecordMergeKey(player);
      if (key) {
        localPlayersByKey.set(key, player);
      }
    });
    let changed = false;
    const mergedPlayers = centralStateValue.players.map((centralPlayer) => {
      const key = getCentralStateRecordMergeKey(centralPlayer);
      const localPlayer = key ? localPlayersByKey.get(key) : null;
      if (!localPlayer) {
        return centralPlayer;
      }
      const merged = preserveCentralStateMediaFields(centralPlayer, localPlayer);
      changed = changed || merged.changed;
      return merged.record;
    });
    if (!changed) {
      return { value: centralValue, changed: false };
    }
    return {
      value: JSON.stringify({ ...centralStateValue, players: mergedPlayers }),
      changed: true,
    };
  }
  const mergeCentralMedicalStateValues = window.createCentralMedicalStateMerger({ parseCentralObjectStateValue, preserveCentralStateMediaFields });
  function sanitizeWorkspaceHubStateValue(value) {
    const state = parseCentralObjectStateValue(value);
    if (!state) {
      return value;
    }
    const { activeWorkspaceId, ...sharedState } = state;
    return JSON.stringify(sharedState);
  }
  function applyCentralStateEntries(entries = {}, metadata = {}, options = {}) {
    const normalizedEntries = Object.fromEntries(
      Object.entries(entries || {}).filter(([key, value]) => isCentralStateKey(key) && typeof value === "string")
    );
    centralState.metadata = Object.entries(metadata || {}).reduce((normalized, [key, value]) => {
      if (isCentralStateKey(key) && value && typeof value === "object") {
        normalized[key] = value;
      }
      return normalized;
    }, {});
    const pendingEntries = readCentralSyncManifestEntries();
    const writeBackEntries = [];
    const resolvedPendingKeys = [];
    window.__footballScienceCentralHydrating = true;
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (
          shouldRemoveLocalCentralStateKey(key) &&
          !Object.prototype.hasOwnProperty.call(normalizedEntries, key) &&
          !pendingEntries[key]?.pendingCentralSync
        ) {
          window.localStorage.removeItem(key);
        }
      }
      Object.entries(normalizedEntries).forEach(([key, value]) => {
        const pendingEntry = pendingEntries[key] || {};
        const metadataEntry = centralState.metadata[key] || {};
        if (!shouldApplyCentralStateEntry(key, pendingEntry, metadataEntry, options)) {
          return;
        }
        if (pendingEntry?.pendingCentralSync) {
          resolvedPendingKeys.push(key);
        }
        let valueToApply = value;
        if (key === WORKSPACE_HUB_STATE_KEY) {
          valueToApply = sanitizeWorkspaceHubStateValue(value);
        } else if (key === PERIODIZATION_STATE_KEY) {
          valueToApply = mergePeriodizationCentralStateValues(window.localStorage.getItem(key), value).value;
        } else if (key === SCHEDULE_STATE_KEY) {
          valueToApply = mergeCentralStateLocalUiFields(window.localStorage.getItem(key), value, SCHEDULE_LOCAL_UI_FIELDS).value;
        } else if (key === SESSION_PLANNER_STATE_KEY && !options.forceApply) {
          const mergedValue = mergeSessionPlannerStateValues(window.localStorage.getItem(key), value);
          valueToApply = mergedValue.value;
          if (mergedValue.changed) {
            writeBackEntries.push([key, valueToApply]);
          }
        } else if (!options.forceApply && key === PLAYER_PROFILES_STATE_KEY) {
          const mergedValue = mergeCentralStateMediaValues(window.localStorage.getItem(key), value);
          valueToApply = mergedValue.value;
          if (mergedValue.changed) {
            writeBackEntries.push([key, valueToApply]);
          }
        } else if (key === MEDICAL_TEAM_STATE_KEY) {
          const shouldPreserveLocalMedical = Boolean(pendingEntry?.pendingCentralSync) || Boolean(options.forceApply);
          const mergedValue = shouldPreserveLocalMedical
            ? mergeCentralMedicalStateValues(window.localStorage.getItem(key), value)
            : mergeCentralStateMediaValues(window.localStorage.getItem(key), value);
          valueToApply = mergedValue.value;
          if (mergedValue.changed) {
            writeBackEntries.push([key, valueToApply]);
          }
        }
        window.localStorage.setItem(key, valueToApply);
      });
    } finally {
      window.__footballScienceCentralHydrating = false;
    }
    resolvedPendingKeys.forEach(clearCentralPendingSyncFlag);
    writeBackEntries.forEach(([key, value]) => {
      syncCentralStateKey(key, value).catch(() => {});
    });
  }
  async function hydrateCentralState(options = {}) {
    if (authState.devMode) {
      centralState.hydrated = true;
      centralState.hydrating = false;
      centralState.lastError = "";
      centralState.lastSyncedAt = new Date().toISOString();
      centralState.localDev = true;
      centralState.metadata = {};
      window.dispatchEvent(
        new CustomEvent("footballscience:central-state-ready", {
          detail: { entries: collectCentralLocalStateEntries(), localDev: true },
        })
      );
      return true;
    }
    if (centralState.hydrating || !authState.session?.access_token) {
      return centralState.hydrated;
    }
    centralState.hydrating = true;
    centralState.lastError = "";
    try {
      centralState.localDev = false;
      const response = await apiRequest(API_APP_STATE, { method: "GET", timeoutMs: 10000 });
      if (!response.ok) {
        centralState.lastError = response.payload?.reason || "Central app data could not be loaded.";
        return false;
      }
      const entries = response.payload?.entries && typeof response.payload.entries === "object"
        ? response.payload.entries
        : {};
      const metadata = response.payload?.metadata && typeof response.payload.metadata === "object"
        ? response.payload.metadata
        : {};
      const hasCentralEntries = Object.keys(entries).length > 0;
      if (hasCentralEntries) {
        applyCentralStateEntries(entries, metadata, options);
      } else {
        const localEntries = collectCentralLocalStateEntries();
        if (Object.keys(localEntries).length) {
          const seedResponse = await apiRequest(API_APP_STATE, {
            method: "POST",
            body: JSON.stringify({ entries: localEntries }),
          });
          if (!seedResponse.ok) {
          centralState.lastError = seedResponse.payload?.reason || "Central seed failed.";
            return false;
          }
          if (Array.isArray(seedResponse.payload?.results)) {
            centralState.metadata = seedResponse.payload.results.reduce((normalized, result) => {
              if (isCentralStateKey(result?.key) && result?.metadata) {
                normalized[result.key] = result.metadata;
              }
              return normalized;
            }, {});
          }
        }
      }
      centralState.hydrated = true;
      centralState.lastSyncedAt = new Date().toISOString();
      window.dispatchEvent(
        new CustomEvent("footballscience:central-state-ready", {
          detail: { entries: hasCentralEntries ? entries : collectCentralLocalStateEntries() },
        })
      );
      return true;
    } catch (error) {
      centralState.lastError = error?.message || "Central load failed.";
      return false;
    } finally {
      centralState.hydrating = false;
    }
  }
  async function syncCentralStateKey(key, value, options = {}) {
    if (authState.devMode) {
      centralState.lastError = "";
      centralState.lastSyncedAt = new Date().toISOString();
      centralState.localDev = true;
      return { ok: true, localDev: true };
    }
    if (!authState.session?.access_token || !isCentralStateKey(key)) {
      return { ok: false, reason: "Sync not ready." };
    }
    try {
      centralState.localDev = false;
      const baseMetadata = centralState.metadata?.[key] || {};
      const baseRevision = Number.isInteger(Number(options.baseRevision))
        ? Number(options.baseRevision)
        : getCentralStateBaseRevision(baseMetadata);
      const response = await apiRequest(API_APP_STATE, {
        method: options.removed ? "DELETE" : "POST",
        body: JSON.stringify({
          key,
          value: String(value ?? ""),
          removed: Boolean(options.removed),
          baseRevision,
          baseHash: baseMetadata.hash || "",
          baseUpdatedAt: baseMetadata.updatedAt || "",
          metadata: {
            baseRevision,
            revision: baseRevision,
            hash: baseMetadata.hash || "",
            updatedAt: baseMetadata.updatedAt || "",
          },
        }),
      });
      if (!response.ok) {
        centralState.lastError = response.payload?.reason || "Sync failed.";
        return {
          ok: false,
          status: response.status,
          conflict: response.status === 409,
          currentRevision: response.payload?.currentRevision,
          reason: centralState.lastError,
        };
      }
      centralState.lastError = "";
      centralState.lastSyncedAt = new Date().toISOString();
      if (response.payload?.metadata) {
        centralState.metadata = {
          ...centralState.metadata,
          [key]: response.payload.metadata,
        };
      }
      return { ok: true, ...(response.payload || {}) };
    } catch (error) {
      centralState.lastError = error?.message || "Sync failed.";
      return { ok: false, reason: centralState.lastError };
    }
  }
  async function lookupAuthUser(identifier) {
    if (!identifier) {
      return null;
    }
    const response = await apiRequest(`${API_USER_LOOKUP}?identifier=${encodeURIComponent(identifier)}`, {
      method: "GET",
      skipAuth: true,
      timeoutMs: 8000,
    });
    return response.ok ? response.payload?.user ?? null : null;
  }
  function mergeAuthUser(nextUser, options = {}) {
    const normalizedUser = normalizeAuthUser(nextUser);
    if (!normalizedUser.id) {
      return null;
    }
    const existingIndex = authState.users.findIndex((candidate) => candidate.id === normalizedUser.id);
    if (existingIndex >= 0) {
      authState.users[existingIndex] = { ...normalizeAuthUser(authState.users[existingIndex]), ...normalizedUser };
    } else {
      authState.users = [normalizedUser, ...authState.users];
    }
    if (options.setCurrent || authState.currentUser?.id === normalizedUser.id) {
      authState.currentUser = { ...(authState.currentUser || {}), ...normalizedUser };
      notifyAuthChange(authState.currentUser);
    }
    return normalizedUser;
  }
  async function refreshUserCache() {
    if (userCacheRefreshPromise) {
      return userCacheRefreshPromise;
    }
    userCacheRefreshPromise = (async () => {
    const response = await apiRequest(API_ADMIN_USERS, {
      method: "GET",
      timeoutMs: 9000,
    });
    if (response.ok && Array.isArray(response.payload?.users)) {
      authState.users = response.payload.users.map((user) => normalizeAuthUser(user)).filter((user) => user.id);
      authState.roles = Array.isArray(response.payload.roles) ? response.payload.roles : authState.roles;
      const refreshedCurrentUser = authState.users.find((user) => user.id === authState.currentUser?.id);
      if (refreshedCurrentUser) {
        authState.currentUser = refreshedCurrentUser;
        notifyAuthChange(refreshedCurrentUser);
      }
      return true;
    }
    if (!authState.users.length && authState.currentUser) {
      authState.users = [authState.currentUser];
    }
    return false;
    })();
    try {
      return await userCacheRefreshPromise;
    } finally {
      userCacheRefreshPromise = null;
    }
  }
  async function refreshCurrentUserProfile(sessionUserId = "") {
    const normalizedSessionUserId = String(sessionUserId || "");
    if (currentUserProfileRefreshPromise && currentUserProfileRefreshUserId === normalizedSessionUserId) {
      return currentUserProfileRefreshPromise;
    }
    currentUserProfileRefreshUserId = normalizedSessionUserId;
    currentUserProfileRefreshPromise = (async () => {
    const response = await apiRequest(`${API_ADMIN_USERS}?me=1`, {
      method: "GET",
      timeoutMs: 8000,
    });
    const meUser = response.payload?.user || response.payload?.payload?.user || null;
    if (!response.ok || !meUser) {
      return null;
    }
    const nextUser = normalizeAuthUser(meUser);
    if (sessionUserId && nextUser.id !== sessionUserId) {
      return null;
    }
    setCurrentUserFromSession(nextUser);
    return authState.currentUser;
    })();
    try {
      return await currentUserProfileRefreshPromise;
    } finally {
      currentUserProfileRefreshPromise = null;
      currentUserProfileRefreshUserId = "";
    }
  }
  function queuePostAuthHydration(session = authState.session) {
    const queuedSession = session?.access_token ? session : authState.session;
    const sessionUserId = queuedSession?.user?.id || "";
    if (!queuedSession?.access_token || !sessionUserId) {
      return;
    }
    if (postAuthHydrationTimer) {
      window.clearTimeout(postAuthHydrationTimer);
    }
    const runId = ++postAuthHydrationRunId;
    postAuthHydrationTimer = window.setTimeout(async () => {
      postAuthHydrationTimer = 0;
      if (runId !== postAuthHydrationRunId || authState.session?.access_token !== queuedSession.access_token) {
        return;
      }
      await refreshCurrentUserProfile(sessionUserId).catch(() => null);
      if (runId !== postAuthHydrationRunId || authState.session?.access_token !== queuedSession.access_token) {
        return;
      }
      await hydrateCentralState().catch(() => false);
      if (runId !== postAuthHydrationRunId || authState.session?.access_token !== queuedSession.access_token) {
        return;
      }
      await refreshUserCache().catch(() => false);
      if (runId !== postAuthHydrationRunId) {
        return;
      }
      const refreshedUser = authState.users.find((candidate) => candidate.id === sessionUserId);
      if (refreshedUser) {
        setCurrentUserFromSession(refreshedUser);
      } else if (authState.currentUser?.id) {
        notifyAuthChange(authState.currentUser);
      }
    }, 0);
  }
  function setCurrentUserById(userId) {
    const nextUser = authState.users.find((candidate) => candidate.id === userId) || null;
    if (!nextUser) {
      return;
    }
    authState.currentUser = nextUser;
    notifyAuthChange(nextUser);
  }
  function setCurrentUserFromSession(sessionUser) {
    const nextUser = normalizeAuthUser(sessionUser);
    if (!nextUser.id) {
      authState.currentUser = null;
      notifyAuthChange(null);
      return;
    }
    mergeAuthUser(nextUser, { setCurrent: true });
  }
  function isPausedAccount(user) {
    return String(user?.status || "").trim().toLowerCase() === "paused";
  }
  async function hydrateCurrentUser(session = null, options = {}) {
    const nextSession = session?.access_token ? session : null;
    const nextSessionUser = session?.user || null;
    const waitForCentral = options.waitForCentral !== false;
    const waitForProfile = options.waitForProfile !== false;
    if (!nextSession || !nextSessionUser) {
      authState.currentUser = null;
      authState.session = null;
      authState.users = [];
      notifyAuthChange(null);
      return null;
    }
    authState.session = nextSession;
    const sessionUserId = nextSessionUser.id;
    setCurrentUserFromSession(nextSessionUser);
    if (waitForProfile) {
      await refreshCurrentUserProfile(sessionUserId);
    }
    if (!waitForCentral) {
      queuePostAuthHydration(nextSession);
      return authState.currentUser;
    }
    try {
      await withTimeout(hydrateCentralState(), 12000, "Central app data is still loading.");
    } catch {
      hydrateCentralState().catch(() => {});
    }
    try {
      await withTimeout(refreshUserCache(), 8000, "User list is still loading.");
    } catch {
      refreshUserCache().catch(() => {});
    }
    if (!authState.currentUser && sessionUserId) {
      setCurrentUserById(sessionUserId);
    }
    if (!authState.currentUser?.id) {
      authState.currentUser = null;
      authState.users = [];
      notifyAuthChange(null);
    } else if (authState.currentUser.id) {
      notifyAuthChange(authState.currentUser);
    }
    return authState.currentUser;
  }
  async function signInWithIdentifier(identifier, password) {
    if (authState.devMode) return signInWithDevAuth(identifier, password);
    if (!authState.supabase) return { ok: false, reason: "Authentication is not ready. Open footballscience.xyz." };
    const cleanIdentifier = String(identifier || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();
    if (!cleanIdentifier || !cleanPassword) return { ok: false, reason: "Username and password are required." };
    let email = cleanIdentifier;
    let foundByUsername = false;
    if (!cleanIdentifier.includes("@")) {
      const lookup = await lookupAuthUser(cleanIdentifier);
      if (lookup?.email) { foundByUsername = true; email = lookup.email; }
    }
    try {
      const loginResponse = await apiRequest(API_AUTH_LOGIN,{method:"POST",skipAuth:true,timeoutMs:35000,body:JSON.stringify({email,password:cleanPassword})});
      if (!loginResponse.ok) {
        const proxyReason = String(loginResponse.payload?.reason || "");
        const shouldTryDirectLogin = [0, 404, 405, 500, 502, 503, 504].includes(Number(loginResponse.status)) ||
          /network|method not allowed|not found|configured/i.test(proxyReason);
        if (shouldTryDirectLogin) {
          const directResult = await withTimeout(
            authState.supabase.auth.signInWithPassword({email,password:cleanPassword}),
            30000,
            "Login is taking too long. Check your network and try again."
          );
          if (directResult.error) {
            loginResponse.payload = { reason: directResult.error.message || proxyReason || "Invalid username or password." };
          } else if (directResult.data?.session) {
            await hydrateCurrentUser(directResult.data.session, { waitForCentral: false, waitForProfile: true });
            if (isPausedAccount(authState.currentUser)) { await signOut(); return { ok: false, reason: "This account is paused. Contact an admin." }; }
            return { ok: true };
          }
        }
        const message = String(loginResponse.payload?.reason || "").toLowerCase();
          if (foundByUsername && message.includes("invalid")) return {ok:false,reason:"Incorrect username or password."};
          if (!cleanIdentifier.includes("@") && message.includes("invalid")) return {ok:false,reason:"Incorrect username or password. Try email or reset password."};
        if (message.includes("invalid")) return {ok:false,reason:"Invalid login credentials."};
        return { ok: false, reason: loginResponse.payload?.reason || "Invalid username or password." };
      }
      const session = loginResponse.payload?.session || null;
      if (!session?.access_token || !session?.refresh_token) return { ok: false, reason: "Could not start a session." };
      authState.session = session;
      withTimeout(
        authState.supabase.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}),
        5000,
        "Supabase local session save took too long."
      ).catch((error) => {
        console.warn("Supabase local session save failed after server login.", error);
      });
      await hydrateCurrentUser(session, { waitForCentral: false, waitForProfile: true });
      if (isPausedAccount(authState.currentUser)) { await signOut(); return { ok: false, reason: "This account is paused. Contact an admin." }; }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error?.message || "Sign in failed." };
    }
  }
  async function resetPasswordFor(identifier) {
    if (authState.devMode) {
      return { ok: true, localDev: true };
    }
    if (!authState.supabase) {
      return { ok: false, reason: "Authentication is not initialized. Open the app through footballscience.xyz." };
    }
    const cleanIdentifier = String(identifier || "").trim().toLowerCase();
    if (!cleanIdentifier) {
      return { ok: false, reason: "Enter a username or email." };
    }
    const lookup = cleanIdentifier.includes("@") ? { email: cleanIdentifier } : await lookupAuthUser(cleanIdentifier);
    const email = lookup?.email || cleanIdentifier;
    if (!email) {
      return { ok: false, reason: "No matching account found." };
    }
    const redirectTo = getPasswordResetRedirectUrl();
    const result = await authState.supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (result.error) {
      return { ok: false, reason: result.error.message || "We could not send a reset link." };
    }
    return { ok: true };
  }
  async function adminCreateUser(values = {}) {
    if (authState.devMode) {
      const now = new Date().toISOString();
      const createdUser = normalizeAuthUser({
        id: `dev-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        email: values.email,
        firstName: values.firstName || "New",
        lastName: values.lastName || "User",
        username: values.username || values.email,
        role: values.role || "coach",
        title: values.title || "Coach",
        department: values.department || "Football",
        clubId: values.clubId || DEFAULT_CLUB_ID,
        clubName: values.clubName || "North Carolina Courage",
        teamId: values.teamId || DEFAULT_TEAM_ID,
        teamName: values.teamName || values.team || "North Carolina Courage",
        team: values.team || values.teamName || "North Carolina Courage",
        status: values.status || "active",
        createdAt: now,
      });
      authState.users = [createdUser, ...authState.users];
      return { ok: true, status: 200, user: createdUser, generatedPassword: DEV_AUTH_PASSWORD };
    }
    const response = await apiRequest(API_ADMIN_USERS, {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const reasonFromPayload =
        response.payload?.reason ||
        response.payload?.error_description ||
        response.payload?.error ||
        response.payload?.message ||
        "";
      return {
        ok: false,
        status: response.status,
        reason: reasonFromPayload
          ? `Create user failed (${response.status}): ${reasonFromPayload}`
          : `Create user failed (${response.status}).`,
      };
    }
    const createdUser = response.payload?.user || null;
    if (createdUser?.id) {
      mergeAuthUser(createdUser);
    }
    await refreshUserCache();
    return {
      ok: true,
      status: response.status,
      user: createdUser,
      generatedPassword: response.payload?.generatedPassword || null,
    };
  }
  async function adminUpdateUser(userId, values = {}) {
    if (!String(userId || "").trim()) {
      return { ok: false, reason: "Missing user id." };
    }
    if (authState.devMode) {
      const existingUser = authState.users.find((user) => user.id === userId);
      if (!existingUser) {
        return { ok: false, reason: "User could not be found." };
      }
      const updatedUser = normalizeAuthUser({
        ...existingUser,
        ...values,
        user_metadata: {
          ...existingUser,
          ...values,
        },
        app_metadata: {
          role: values.role || existingUser.role,
          status: values.status || existingUser.status,
        },
      });
      authState.users = authState.users.map((user) => (user.id === userId ? updatedUser : user));
      if (authState.currentUser?.id === userId) {
        authState.currentUser = updatedUser;
        notifyAuthChange(updatedUser);
      }
      return { ok: true, user: updatedUser, generatedPassword: null };
    }
    const response = await apiRequest(`${API_ADMIN_USERS}?userId=${encodeURIComponent(userId)}`, {
      method: "PUT",
      timeoutMs: 20000,
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: response.payload?.reason || `Could not save the change (${response.status}).`,
      };
    }
    const updatedUser = response.payload?.user || null;
    if (updatedUser?.id) {
      mergeAuthUser(updatedUser, { setCurrent: updatedUser.id === authState.currentUser?.id });
    }
    try {
      await withTimeout(refreshUserCache(), 9000, "User list refresh took too long.");
    } catch {
      refreshUserCache().catch(() => {});
    }
    return {
      ok: true,
      user: updatedUser,
      generatedPassword: response.payload?.generatedPassword || null,
    };
  }
  async function uploadProfileImage(userId, imageDataUrl, values = {}) {
    if (!String(userId || "").trim()) {
      return { ok: false, reason: "Missing user id." };
    }
    if (!String(imageDataUrl || "").startsWith("data:image/")) {
      return { ok: false, reason: "Choose an image file." };
    }
    if (authState.devMode) {
      const existingUser = authState.users.find((user) => user.id === userId);
      if (!existingUser) {
        return { ok: false, reason: "User could not be found." };
      }
      const updatedUser = {
        ...existingUser,
        ...values,
        profileImageUrl: imageDataUrl,
        updatedAt: new Date().toISOString(),
      };
      authState.users = authState.users.map((user) => (user.id === userId ? updatedUser : user));
      if (authState.currentUser?.id === userId) {
        authState.currentUser = updatedUser;
        notifyAuthChange(updatedUser);
      }
      return { ok: true, user: updatedUser, profileImageUrl: imageDataUrl };
    }
    const response = await apiRequest(API_PROFILE_IMAGE, {
      method: "POST",
      timeoutMs: 26000,
      body: JSON.stringify({
        userId,
        imageDataUrl,
        profile: values,
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: response.payload?.reason || `Profile image could not be saved (${response.status}).`,
      };
    }
    const updatedUser = response.payload?.user || null;
    if (updatedUser?.id) {
      mergeAuthUser(updatedUser, { setCurrent: updatedUser.id === authState.currentUser?.id });
    }
    return {
      ok: true,
      status: response.status,
      user: updatedUser,
      profileImageUrl: response.payload?.profileImageUrl || updatedUser?.profileImageUrl || "",
    };
  }
  async function removeProfileImage(userId) {
    if (!String(userId || "").trim()) {
      return { ok: false, reason: "Missing user id." };
    }
    if (authState.devMode) {
      return adminUpdateUser(userId, { profileImageUrl: "" });
    }
    const response = await apiRequest(API_PROFILE_IMAGE, {
      method: "DELETE",
      timeoutMs: 18000,
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: response.payload?.reason || `Profile image could not be removed (${response.status}).`,
      };
    }
    const updatedUser = response.payload?.user || null;
    if (updatedUser?.id) {
      mergeAuthUser(updatedUser, { setCurrent: updatedUser.id === authState.currentUser?.id });
    }
    return {
      ok: true,
      status: response.status,
      user: updatedUser,
    };
  }
  async function adminRemoveUser(userId) {
    if (authState.devMode) {
      if (authState.currentUser?.id === userId) {
        await signOut();
        return { ok: true };
      }
      authState.users = authState.users.filter((user) => user.id !== userId);
      return { ok: true };
    }
    const response = await apiRequest(`${API_ADMIN_USERS}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "User could not be removed." };
    }
    if (authState.currentUser?.id === userId) {
      await signOut();
      return { ok: true };
    }
    authState.users = authState.users.filter((user) => user.id !== userId);
    await refreshUserCache();
    return { ok: true };
  }
  async function adminSendReset(userId) {
    if (authState.devMode) {
      return { ok: true, userId };
    }
    const response = await apiRequest(API_SEND_RESET, {
      method: "POST",
      body: JSON.stringify({ userId, redirectTo: getPasswordResetRedirectUrl() }),
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Reset email could not be sent." };
    }
    return { ok: true };
  }
  async function adminGetAuditLog(limit = 80) {
    if (authState.devMode) {
      return { ok: true, entries: [], updatedAt: "" };
    }
    const response = await apiRequest(`${API_AUDIT_LOG}?limit=${encodeURIComponent(limit)}`, {
      method: "GET",
      timeoutMs: 9000,
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Audit log could not be loaded." };
    }
    return {
      ok: true,
      entries: Array.isArray(response.payload?.entries) ? response.payload.entries : [],
      updatedAt: response.payload?.updatedAt || "",
    };
  }
  async function recordAuditEvent(event = {}) {
    if (authState.devMode) {
      return { ok: true, localDev: true };
    }
    const response = await apiRequest(API_AUDIT_LOG, {
      method: "POST",
      body: JSON.stringify(event || {}),
      timeoutMs: 9000,
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Audit event could not be saved." };
    }
    return { ok: true };
  }
  async function recordMedicalDatabaseEvent(event = {}) {
    if (authState.devMode) {
      return { ok: true, localDev: true, stored: false };
    }
    const response = await apiRequest(API_MEDICAL, {
      method: "POST",
      body: JSON.stringify(event || {}),
      timeoutMs: 9000,
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Medical database event could not be saved." };
    }
    return {
      ok: true,
      stored: Boolean(response.payload?.stored),
      enabled: response.payload?.enabled !== false,
      duplicate: Boolean(response.payload?.duplicate),
      payloadHash: response.payload?.payloadHash || "",
    };
  }
  async function getSessionHistory(date, limit = 50) {
    if (authState.devMode) {
      return { ok: true, entries: [], updatedAt: "" };
    }
    const params = new URLSearchParams();
    if (date) {
      params.set("date", date);
    }
    params.set("limit", String(limit));
    const response = await apiRequest(`${API_SESSION_HISTORY}?${params.toString()}`, {
      method: "GET",
      timeoutMs: 9000,
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Session history could not be loaded." };
    }
    return {
      ok: true,
      entries: Array.isArray(response.payload?.entries) ? response.payload.entries : [],
      updatedAt: response.payload?.updatedAt || "",
    };
  }
  async function restoreSessionHistory(entryId, mode = "before") {
    if (authState.devMode) {
      return { ok: false, reason: "Session history restore is only available online." };
    }
    const response = await apiRequest(API_SESSION_HISTORY, {
      method: "POST",
      timeoutMs: 20000,
      body: JSON.stringify({
        action: "restore",
        entryId,
        mode,
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Session could not be restored." };
    }
    return {
      ok: true,
      date: response.payload?.date || "",
      value: response.payload?.value || "",
      updatedAt: response.payload?.updatedAt || "",
    };
  }
  async function getPresence() {
    if (authState.devMode) {
      return { ok: true, entries: [], updatedAt: "" };
    }
    const response = await apiRequest(API_PRESENCE, {
      method: "GET",
      timeoutMs: 7000,
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Presence could not be loaded." };
    }
    return {
      ok: true,
      entries: Array.isArray(response.payload?.entries) ? response.payload.entries : [],
      updatedAt: response.payload?.updatedAt || "",
    };
  }
  async function updatePresence(status = "online", values = {}) {
    if (authState.devMode) {
      return { ok: true, entries: [], updatedAt: new Date().toISOString(), localDev: true };
    }
    const response = await apiRequest(API_PRESENCE, {
      method: "POST",
      timeoutMs: 7000,
      body: JSON.stringify({
        status,
        lastActivityAt: values.lastActivityAt || new Date().toISOString(),
        workspaceId: values.workspaceId || "",
        typingThreadId: values.typingThreadId || "",
        typingAt: values.typingAt || "",
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: response.payload?.reason || "Presence could not be updated." };
    }
    return {
      ok: true,
      entries: Array.isArray(response.payload?.entries) ? response.payload.entries : [],
      updatedAt: response.payload?.updatedAt || "",
    };
  }
  function clearAuthState() {
    authState.currentUser = null;
    authState.session = null;
    authState.users = [];
    notifyAuthChange(null);
  }
  function clearStoredAuthArtifacts() {
    if (typeof window === "undefined") {
      return;
    }
    const clearStorage = (storage) => {
      if (!storage) {
        return;
      }
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key) {
          continue;
        }
        const lowered = key.toLowerCase();
        if (lowered.startsWith("sb-") || lowered.includes("supabase")) {
          storage.removeItem(key);
        }
      }
    };
    try {
      clearStorage(window.localStorage);
      clearStorage(window.sessionStorage);
    } catch {}
    try {
      const cookieBits = document.cookie ? document.cookie.split(";") : [];
      cookieBits.forEach((cookie) => {
        const name = cookie.split("=")[0]?.trim();
        if (!name) {
          return;
        }
        if (!name.toLowerCase().includes("supabase")) {
          return;
        }
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
    } catch {}
  }
  async function signOut(options = {}) {
    const shouldSignOutRemote = options.remote !== false && authState.supabase && !authState.isSigningOut;
    const remoteSignOut = shouldSignOutRemote
      ? (async () => {
          authState.isSigningOut = true;
          try {
            const { error } = await withTimeout(
              authState.supabase.auth.signOut({ scope: "global" }),
              5000,
              "Sign out took too long."
            );
            if (error) {
              console.warn("Sign out warning:", error);
            }
          } catch (error) {
            console.warn("Sign out failed:", error);
          } finally {
            authState.isSigningOut = false;
          }
        })()
      : Promise.resolve();
    clearAuthState();
    if (authState.devMode) {
      authState.users = getDevAuthUsers();
      const devUser = authState.users[0] || null;
      if (devUser) {
        authState.currentUser = devUser;
        writeDevAuthSession(devUser.id);
      }
    }
    clearStoredAuthArtifacts();
    purgeLegacyLocalAccountStorage();
    setProfileMenuOpen(false);
    if (authState.devMode && authState.currentUser) {
      showPlatform(authState.currentUser);
      return;
    }
    showLogin();
    remoteSignOut.catch((error) => {
      if (error) {
        console.warn("Sign out cleanup failed:", error);
      }
    });
  }
  function setProfileMenuOpen(isOpen) {
    const profileMenuButton = document.getElementById("profileMenuButton");
    const profileMenu = document.getElementById("profileMenu");
    if (!profileMenuButton || !profileMenu) {
      return;
    }
    profileMenu.hidden = !isOpen;
    profileMenuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  function isProfileMenuOpen() {
    const profileMenu = document.getElementById("profileMenu");
    return Boolean(profileMenu && !profileMenu.hidden);
  }
  function revealPlatformShell(user = authState.currentUser) {
    document.body.classList.remove("is-auth-locked");
    document.body.classList.remove("is-booting");
    document.body.classList.add("is-authenticated");
    const loginScreen = document.getElementById("loginScreen");
    const hubShell = document.getElementById("hubShell");
    if (loginScreen) {
      loginScreen.hidden = true;
    }
    if (hubShell) {
      hubShell.hidden = false;
    }
    notifyAuthChange(user);
    window.dispatchEvent(new Event("resize"));
  }
  function showPlatform(user) {
    document.body.classList.remove("is-auth-locked");
    document.body.classList.add("is-authenticated");
    const loginScreen = document.getElementById("loginScreen");
    const hubShell = document.getElementById("hubShell");
    if (loginScreen) {
      loginScreen.hidden = true;
    }
    if (window.__footballScienceAppReady) {
      revealPlatformShell(user);
      return;
    }
    document.body.classList.add("is-booting");
    if (hubShell) {
      hubShell.hidden = true;
    }
    notifyAuthChange(user);
  }
  function showLogin() {
    const password = document.getElementById("loginPassword");
    const username = document.getElementById("loginUsername");
    document.body.classList.add("is-auth-locked");
    document.body.classList.remove("is-authenticated");
    document.body.classList.remove("is-booting");
    document.getElementById("loginScreen").hidden = false;
    document.getElementById("hubShell").hidden = true;
    if (password) {
      password.value = "";
    }
    if (username) {
      username.focus();
    }
  }
  window.platformMarkAppReady=()=>{window.__footballScienceAppReady=true;if(authState.currentUser){document.getElementById("hubShell").hidden=false;requestAnimationFrame(()=>revealPlatformShell(authState.currentUser));}};
  async function readSupabaseSession() {
    if (authSessionReadPromise) {
      return authSessionReadPromise;
    }
    authSessionReadPromise = (async () => {
    try {
      return await withTimeout(authState.supabase.auth.getSession(), 8000, "Session lookup timed out.");
    } catch (error) {
      console.warn("Supabase session lookup failed; continuing with cached session.", error);
      return { data: { session: authState.session || null }, error: null };
    } finally {
      authSessionReadPromise = null;
    }
    })();
    return authSessionReadPromise;
  }
  async function hydrateFromExistingSession() {
    let sessionResult;
    try {
      sessionResult = await readSupabaseSession();
    } catch {
      return;
    }
    const { data, error } = sessionResult || {};
    if (error) {
      await signOut({ remote: false });
      return;
    }
    if (data?.session) {
      authState.session = data.session;
      await hydrateCurrentUser(data.session, { waitForCentral: false, waitForProfile: true });
      const expiresAtMs = Number(data.session.expires_at || 0) * 1000;
      if (expiresAtMs && expiresAtMs - Date.now() < 60 * 1000) {
        refreshAccessToken().catch(() => null);
      }
      if (isPausedAccount(authState.currentUser)) {
        await signOut();
      }
    }
  }
  async function bootAuth() {
    if (isLocalFileHost()) {
      window.location.replace(ONLINE_APP_URL);
      return;
    }
    if (shouldForceCanonicalHost()) {
      redirectToCanonicalHost();
      return;
    }
    await ensureDomReady();
    purgeLegacyLocalAccountStorage();
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const logoutButton = document.getElementById("logoutButton");
    const profileMenuButton = document.getElementById("profileMenuButton");
    const profileMenu = document.getElementById("profileMenu");
    const forgotPasswordToggle = document.getElementById("forgotPasswordToggle");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const forgotPasswordIdentifier = document.getElementById("forgotPasswordIdentifier");
    setLoginBusy(true, "Loading...");
    const loginInitSafetyTimer = window.setTimeout(() => {
      if (!authState.isReady && !authState.supabase && !authState.devMode) {
        toFormError("Authentication is still loading. Reload the page and try again.", true);
        setLoginBusy(false);
      }
    }, 12000);
    const attachSharedAuthUiHandlers = () => {
      forgotPasswordToggle?.addEventListener("click", () => {
        if (!forgotPasswordForm || !forgotPasswordToggle) {
          return;
        }
        forgotPasswordForm.hidden = !forgotPasswordForm.hidden;
        forgotPasswordToggle.setAttribute("aria-expanded", forgotPasswordForm.hidden ? "false" : "true");
        if (!forgotPasswordForm.hidden) {
          forgotPasswordIdentifier?.focus();
        }
      });
      document.getElementById("forgotPasswordCancel")?.addEventListener("click", () => {
        if (!forgotPasswordForm || !forgotPasswordToggle) {
          return;
        }
        forgotPasswordForm.hidden = true;
        forgotPasswordToggle.setAttribute("aria-expanded", "false");
        setForgotPasswordMessage("");
        if (forgotPasswordIdentifier) {
          forgotPasswordIdentifier.value = "";
        }
      });
      forgotPasswordForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!forgotPasswordIdentifier) {
          return;
        }
        const result = await resetPasswordFor(forgotPasswordIdentifier.value);
        if (!result?.ok) {
          setForgotPasswordMessage(result.reason || "Could not send reset link.", true);
          return;
        }
        setForgotPasswordMessage(
          authState.devMode
            ? "Local dev mode uses mak / courage."
            : "Password reset link sent. Check inbox for your link."
        );
        forgotPasswordIdentifier.value = "";
      });
      profileMenuButton?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setProfileMenuOpen(!isProfileMenuOpen());
      });
      profileMenu?.addEventListener("click", (event) => {
        const workspaceTrigger = event.target.closest("[data-open-workspace]");
        if (!workspaceTrigger) {
          return;
        }
        setProfileMenuOpen(false);
        requestWorkspaceOpen(workspaceTrigger.dataset.openWorkspace);
      });
      document.addEventListener("click", (event) => {
        if (!isProfileMenuOpen() || event.target.closest(".platform-account-menu")) {
          return;
        }
        setProfileMenuOpen(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !isProfileMenuOpen()) {
          return;
        }
        setProfileMenuOpen(false);
        profileMenuButton?.focus();
      });
      document.addEventListener("click", (event) => {
        const workspaceTrigger = event.target.closest("[data-open-workspace]");
        if (!workspaceTrigger) {
          return;
        }
        requestWorkspaceOpen(workspaceTrigger.dataset.openWorkspace);
      });
      logoutButton?.addEventListener("click", async () => {
        setProfileMenuOpen(false);
        await signOut();
      });
    };
    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!usernameInput || !passwordInput) {
        toFormError("Login form is not ready yet.");
        return;
      }
      const identifier = usernameInput.value;
      setLoginBusy(true, "Signing in...");
      toFormError("Checking login...");
      try {
        const result = await withTimeout(
          signInWithIdentifier(identifier, passwordInput.value),
          30000,
          "Login is taking too long. Reload the page and try again."
        );
        if (!result?.ok) {
          toFormError(result.reason || "Login failed.", true);
          return;
        }
        toFormError("");
        showPlatform(authState.currentUser);
      } catch (error) {
        toFormError(error?.message || "Login failed.", true);
      } finally {
        setLoginBusy(false);
      }
    });
    attachSharedAuthUiHandlers();
    if (isLocalDevelopmentSurface()) {
      initializeDevAuth();
      setLoginBusy(false);
      return;
    }
    let clientConfigResponse = null;
    const cachedClientConfig = readCachedClientConfig();
    try {
      const configResponse = await withTimeout(fetch(API_CLIENT_CONFIG,{credentials:"omit",cache:"no-store"}),12000,"Auth settings timed out.");
      const configPayload = await readJsonResponse(configResponse);
      if (!configPayload?.ok || !configPayload.url || !configPayload.anonKey) {
        throw new Error(configPayload?.reason || "Supabase settings are not available.");
      }
      clientConfigResponse = configPayload;
      writeCachedClientConfig(clientConfigResponse);
    } catch (error) {
      if (cachedClientConfig) {
        clientConfigResponse = cachedClientConfig;
        toFormError("Using cached authentication configuration.", false);
      } else {
        window.clearTimeout(loginInitSafetyTimer);
        toFormError(error?.message || "Could not initialize authentication.", true);
        showLogin();
        authState.isReady = true;
        setLoginBusy(false);
        return;
      }
    }
    if (!clientConfigResponse) {
      window.clearTimeout(loginInitSafetyTimer);
      toFormError("Could not initialize authentication.", true);
      showLogin();
      authState.isReady = true;
      setLoginBusy(false);
      return;
    }
    try {
      await withTimeout(loadScript(SUPABASE_CDN), 15000, "Auth client took too long to load.");
    } catch (error) {
      window.clearTimeout(loginInitSafetyTimer);
      toFormError(error?.message || "Auth client failed.", true);
      showLogin();
      authState.isReady = true;
      setLoginBusy(false);
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      window.clearTimeout(loginInitSafetyTimer);
      toFormError("Auth client failed.");
      showLogin();
      authState.isReady = true;
      setLoginBusy(false);
      return;
    }
    authState.supabase = window.supabase.createClient(clientConfigResponse.url, clientConfigResponse.anonKey, {auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
    await hydrateFromExistingSession();
    if (!authState.currentUser) {
      showLogin();
    } else {
      showPlatform(authState.currentUser);
    }
    authState.isReady = true;
    window.clearTimeout(loginInitSafetyTimer);
    setLoginBusy(false);
    authState.supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if (authState.session?.access_token === session.access_token && authState.currentUser?.id) {
          queuePostAuthHydration(session);
          showPlatform(authState.currentUser);
          return;
        }
        await hydrateCurrentUser(session, { waitForCentral: false, waitForProfile: true });
        if (authState.currentUser) {
          showPlatform(authState.currentUser);
        } else {
          showLogin();
        }
        return;
      }
      if (event === "SIGNED_OUT") {
        await signOut({ remote: false });
      }
    });
  }
  window.platformAuthStore = {
    createUser: adminCreateUser,
    updateUser: adminUpdateUser,
    uploadProfileImage,
    removeProfileImage,
    removeUser: adminRemoveUser,
    sendPasswordReset: adminSendReset,
    getAuditLog: adminGetAuditLog,
    getSessionHistory,
    restoreSessionHistory,
    getPresence,
    updatePresence,
    getUsers: () => authState.users,
    getAccessToken: getActiveAccessToken,
    refreshAccessToken,
    getSupabaseClient: () => authState.supabase,
    isDevMode: () => Boolean(authState.devMode),
    writeUsers: (users) => {
      authState.users = Array.isArray(users) ? users : [];
      return authState.users;
    },
    getCurrentUser: () => authState.currentUser,
    setCurrentUser: setCurrentUserById,
    clearCurrentUser: () => {
      authState.currentUser = null;
      authState.users = [];
      authState.session = null;
      if (authState.devMode) {
        writeDevAuthSession("");
      }
      notifyAuthChange(null);
    },
    isAdmin: () => ["admin", "club-admin", "team-admin"].includes(normalizeRoleForAuth(authState.currentUser?.role, "")),
    roles: authState.roles,
  };
  window.footballScienceCentralState={hydrate:hydrateCentralState,syncKey:syncCentralStateKey,isCentralKey:isCentralStateKey,isHydrated:()=>centralState.hydrated,getStatus:()=>({...centralState})};
  window.footballScienceAudit={record:recordAuditEvent};
  window.footballScienceMedicalDatabase={record:recordMedicalDatabaseEvent};
  window.platformAuthReadyPromise=bootAuth();
})();
