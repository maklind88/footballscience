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
  const AUTH_SERVER_SESSION_INSTALL_TIMEOUT_MS = 5000;
  const API_CLIENT_CONFIG = "/api/client-config";
  const API_ADMIN_USERS = "/api/admin-users";
  const API_PLATFORM_IDENTITY = "/api/platform-identity";
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
  const CENTRAL_STATE_TRANSITION_FENCE_KEY = "football-data-safety-transition-fence-v1";
  const CENTRAL_STATE_TRANSITION_FENCE_TTL_MS = 30_000;
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
    "football-dashboard-presentation-mode-v1",
    MEDICAL_TEAM_STATE_KEY,
    PLAYER_PROFILES_STATE_KEY,
    SCOUTING_STATE_KEY,
    "football-gameplan-v1",
    "football-set-pieces-room-v1",
    "football-transfer-room-v1",
    "football-simulator-sequence-v1",
    "football-simulator-sequence-library-v2",
  ]);
  const nativeLocalStorageGetItem = window.Storage?.prototype?.getItem;
  const nativeLocalStorageSetItem = window.Storage?.prototype?.setItem;
  const nativeLocalStorageRemoveItem = window.Storage?.prototype?.removeItem;
  const centralStateValues = new Map();
  const CENTRAL_STATE_LARGE_READ_KEYS = new Set([
    SESSION_PLANNER_STATE_KEY,
    MEDICAL_TEAM_STATE_KEY,
    PLAYER_PROFILES_STATE_KEY,
  ]);
  const CENTRAL_STATE_READ_BATCH_SIZE = 8;
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
    hydrationError: "",
    lastError: "",
    lastSyncedAt: "",
    localDev: false,
    metadata: {},
    writeAccess: {},
    reconcileRequired: {},
    autoRetryBlocked: {},
  };
  let centralHydrationStorageSuppressionDepth = 0;
  let centralHydrationStorageSuppressionPrevious = false;
  function beginCentralHydrationStorageSuppression() {
    if (centralHydrationStorageSuppressionDepth === 0) {
      centralHydrationStorageSuppressionPrevious = Boolean(window.__footballScienceCentralHydrating);
    }
    centralHydrationStorageSuppressionDepth += 1;
    window.__footballScienceCentralHydrating = true;
    return { active: true };
  }
  function endCentralHydrationStorageSuppression(token = {}) {
    if (!token.active) {
      return;
    }
    token.active = false;
    centralHydrationStorageSuppressionDepth = Math.max(0, centralHydrationStorageSuppressionDepth - 1);
    if (centralHydrationStorageSuppressionDepth === 0) {
      window.__footballScienceCentralHydrating = centralHydrationStorageSuppressionPrevious;
      centralHydrationStorageSuppressionPrevious = false;
    }
  }
  function resetCentralStateReconcileRequirements() {
    centralState.reconcileRequired = {};
  }
  function getCentralStatePrincipalScope(user = {}) {
    const principal = user && typeof user === "object" ? user : {};
    if (!String(principal.id || "")) {
      return "";
    }
    return [
      principal.id,
      principal.organizationId || "legacy-unscoped",
      principal.clubId,
      principal.teamId,
      String(principal.role || "").trim().toLowerCase(),
      String(principal.status || "").trim().toLowerCase(),
    ]
      .map((value) => String(value || ""))
      .join(":");
  }
  function readCentralStatePrincipalManifest() {
    try {
      const raw = nativeLocalStorageGetItem?.call(window.localStorage, DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : {};
      return {
        ...manifest,
        entries: manifest?.entries && typeof manifest.entries === "object" ? manifest.entries : {},
        principalPending: manifest?.principalPending && typeof manifest.principalPending === "object"
          ? manifest.principalPending
          : {},
      };
    } catch {
      return null;
    }
  }
  function writeCentralStatePrincipalManifest(manifest = {}) {
    try {
      nativeLocalStorageSetItem?.call(
        window.localStorage,
        DATA_SAFETY_MANIFEST_KEY,
        JSON.stringify(manifest)
      );
      return true;
    } catch {
      return false;
    }
  }
  function readCentralStateTransitionFence() {
    try {
      const raw = nativeLocalStorageGetItem?.call(window.localStorage, CENTRAL_STATE_TRANSITION_FENCE_KEY);
      const fence = raw ? JSON.parse(raw) : null;
      if (!fence || typeof fence !== "object" || !String(fence.owner || "")) {
        return null;
      }
      const expiresAt = Number(fence.expiresAt || 0);
      if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
        nativeLocalStorageRemoveItem?.call(window.localStorage, CENTRAL_STATE_TRANSITION_FENCE_KEY);
        return null;
      }
      return fence;
    } catch {
      return null;
    }
  }
  function writeCentralStateTransitionFence(fence = {}) {
    try {
      nativeLocalStorageSetItem?.call(
        window.localStorage,
        CENTRAL_STATE_TRANSITION_FENCE_KEY,
        JSON.stringify(fence)
      );
      const verifiedFence = readCentralStateTransitionFence();
      return verifiedFence?.owner === fence.owner ? verifiedFence : null;
    } catch {
      return null;
    }
  }
  function beginCentralStateTransitionFence(previousScope = "", nextScope = "") {
    const activeFence = readCentralStateTransitionFence();
    if (activeFence?.owner) {
      centralState.lastError = "Local pending data is already being isolated in another tab.";
      return null;
    }
    const owner = [
      "principal-transition",
      String(authPrincipalEpoch || 0),
      String(centralStateHydrationGeneration || 0),
      String(Date.now()),
      Math.random().toString(36).slice(2),
    ].join(":");
    const fence = {
      owner,
      epoch: Number(authPrincipalEpoch || 0),
      previousScope: String(previousScope || ""),
      nextScope: String(nextScope || ""),
      startedAt: Date.now(),
      expiresAt: Date.now() + CENTRAL_STATE_TRANSITION_FENCE_TTL_MS,
    };
    return writeCentralStateTransitionFence(fence);
  }
  function isCentralStateTransitionFenceOwned(fence = {}) {
    const activeFence = readCentralStateTransitionFence();
    return Boolean(activeFence?.owner && activeFence.owner === fence?.owner);
  }
  function releaseCentralStateTransitionFence(fence = {}) {
    try {
      const activeFence = readCentralStateTransitionFence();
      if (activeFence?.owner === fence?.owner) {
        nativeLocalStorageRemoveItem?.call(window.localStorage, CENTRAL_STATE_TRANSITION_FENCE_KEY);
      }
    } catch {}
  }
  function notifyCentralStateTransitionBarrier(phase, payload = {}) {
    try {
      const barrier = window.__footballScienceQaCentralStateTransitionBarrier;
      if (typeof barrier === "function") {
        barrier(String(phase || ""), payload);
      }
    } catch {}
  }
  function getCentralStateRawCacheValue(key) {
    const cachedValue = getCentralCachedValue(key);
    if (typeof cachedValue === "string") {
      return cachedValue;
    }
    return nativeLocalStorageGetItem?.call(window.localStorage, key) ?? null;
  }
  function resetCentralStateForPrincipalTransition() {
    centralStateHydrationGeneration += 1;
    window.__footballScienceCentralHydrating = false;
    centralStateValues.clear();
    centralState.hydrated = false;
    centralState.hydrating = false;
    centralState.hydrationError = "";
    centralState.lastError = "";
    centralState.metadata = {};
    centralState.writeAccess = {};
    centralState.autoRetryBlocked = {};
    resetCentralStateReconcileRequirements();
  }
  function captureCentralStatePrincipalTransitionSnapshot(manifest = {}) {
    return new Map(Array.from(CENTRAL_STATE_KEYS, (key) => [key, {
      entryToken: getCentralPendingSyncGenerationToken(manifest.entries?.[key] || {}),
      rawValue: nativeLocalStorageGetItem?.call(window.localStorage, key) ?? null,
    }]));
  }
  function isCentralStatePrincipalTransitionSnapshotCurrent(snapshot, manifest = {}, expectedScope = "") {
    if (!snapshot || String(manifest.activePrincipalScope || "") !== String(expectedScope || "")) {
      return false;
    }
    return Array.from(CENTRAL_STATE_KEYS).every((key) => {
      const expected = snapshot.get(key);
      return Boolean(
        expected &&
        expected.entryToken === getCentralPendingSyncGenerationToken(manifest.entries?.[key] || {}) &&
        expected.rawValue === (nativeLocalStorageGetItem?.call(window.localStorage, key) ?? null)
      );
    });
  }
  function repairCentralStatePrincipalQuarantineFromRawValues(manifest = {}) {
    if (!manifest || typeof manifest !== "object") {
      return false;
    }
    let changed = false;
    const principalPending = { ...(manifest.principalPending || {}) };
    Array.from(CENTRAL_STATE_KEYS).forEach((key) => {
      const entry = manifest.entries?.[key];
      if (!entry?.pendingCentralSync) {
        return;
      }
      const ownerScope = String(entry.principalScope || "") || "legacy-unscoped";
      const rawValue = entry.deletedAt ? null : nativeLocalStorageGetItem?.call(window.localStorage, key) ?? null;
      const nextRecord = {
        entry: { ...entry, principalScope: ownerScope },
        value: typeof rawValue === "string" ? rawValue : null,
      };
      const previousRecord = principalPending?.[ownerScope]?.[key];
      const recordChanged = Boolean(
        !previousRecord ||
        getCentralPendingSyncGenerationToken(previousRecord.entry || {}) !== getCentralPendingSyncGenerationToken(nextRecord.entry) ||
        previousRecord.value !== nextRecord.value
      );
      if (!recordChanged) {
        return;
      }
      principalPending[ownerScope] = { ...(principalPending[ownerScope] || {}), [key]: nextRecord };
      changed = true;
    });
    if (!changed) {
      return true;
    }
    return writeCentralStatePrincipalManifest({ ...manifest, principalPending });
  }
  function restoreCentralStatePrincipalRawValues(previousRawValues = new Map()) {
    previousRawValues.forEach((value, key) => {
      if (typeof value !== "string") {
        nativeLocalStorageRemoveItem?.call(window.localStorage, key);
        removeCentralCachedValue(key);
        return;
      }
      try {
        nativeLocalStorageSetItem?.call(window.localStorage, key, value);
        setCentralCachedValue(key, value);
      } catch {}
    });
  }
  function verifyCentralStatePrincipalTransitionSnapshot(snapshot, expectedScope = "", fence = {}, message = "") {
    const currentManifest = readCentralStatePrincipalManifest();
    if (
      currentManifest &&
      isCentralStateTransitionFenceOwned(fence) &&
      isCentralStatePrincipalTransitionSnapshotCurrent(snapshot, currentManifest, expectedScope)
    ) {
      return currentManifest;
    }
    if (currentManifest) {
      repairCentralStatePrincipalQuarantineFromRawValues(currentManifest);
    }
    centralState.lastError = message || "Local pending data changed during account isolation. Try the account switch again.";
    return null;
  }
  function transitionCentralStatePrincipal(nextUser = null) {
    const initialManifest = readCentralStatePrincipalManifest();
    if (!initialManifest) {
      centralState.lastError = "Local pending data could not be read safely.";
      return false;
    }
    const currentScope = getCentralStatePrincipalScope(authState.currentUser);
    const previousScope = String(initialManifest.activePrincipalScope || currentScope || "");
    let nextScope = getCentralStatePrincipalScope(nextUser);
    const nextPrincipalId = String(nextUser?.id || "");
    if (
      nextPrincipalId &&
      previousScope.startsWith(`${nextPrincipalId}:`) &&
      !String(nextUser?.clubId || "") &&
      !String(nextUser?.teamId || "")
    ) {
      nextScope = previousScope;
    }
    const fence = beginCentralStateTransitionFence(previousScope, nextScope);
    if (!fence) {
      return false;
    }
    try {
      notifyCentralStateTransitionBarrier("after-fence", { owner: fence.owner, previousScope, nextScope });
      const manifest = readCentralStatePrincipalManifest();
      if (
        !manifest ||
        String(manifest.activePrincipalScope || currentScope || "") !== previousScope ||
        !isCentralStateTransitionFenceOwned(fence)
      ) {
        centralState.lastError = "Local pending data changed before account isolation could start.";
        return false;
      }
      const scopeChanged = previousScope !== nextScope;
      const transitionSnapshot = captureCentralStatePrincipalTransitionSnapshot(manifest);
      const quarantinedByScope = { ...manifest.principalPending };
      const quarantineKeys = new Set();
      for (const key of CENTRAL_STATE_KEYS) {
        const entry = manifest.entries[key];
        const entryOwnerScope = String(entry?.principalScope || "");
        const mustQuarantine = Boolean(
          entry?.pendingCentralSync &&
          (
            scopeChanged ||
            !entryOwnerScope ||
            entryOwnerScope !== nextScope
          )
        );
        if (mustQuarantine) {
          const ownerScope = entryOwnerScope || "legacy-unscoped";
          quarantinedByScope[ownerScope] = { ...(quarantinedByScope[ownerScope] || {}) };
          const durableRecord = quarantinedByScope[ownerScope][key];
          const durableEntry = durableRecord?.entry && typeof durableRecord.entry === "object"
            ? durableRecord.entry
            : null;
          const durableGenerationMatches = Boolean(
            durableEntry &&
            getCentralPendingSyncGenerationToken(durableEntry) === getCentralPendingSyncGenerationToken(entry)
          );
          const nativeRawValue = entry.deletedAt ? null : nativeLocalStorageGetItem?.call(window.localStorage, key) ?? null;
          const exposedValue = typeof nativeRawValue === "string" ? nativeRawValue : entry.deletedAt ? null : getCentralStateRawCacheValue(key);
          const durableRecordIsAuthoritative = Boolean(
            durableEntry &&
            (durableGenerationMatches || (!entry.deletedAt && typeof exposedValue !== "string"))
          );
          const value = durableRecordIsAuthoritative
            ? durableRecord?.value ?? null
            : exposedValue;
          quarantinedByScope[ownerScope][key] = {
            entry: {
              ...(
                !durableRecordIsAuthoritative || !durableEntry
                  ? entry
                  : durableEntry
              ),
              principalScope: ownerScope,
            },
            value:
              typeof value === "string"
                ? value
                : !durableRecordIsAuthoritative && typeof durableRecord?.value === "string"
                  ? durableRecord.value
                  : null,
          };
          quarantineKeys.add(key);
        }
      }

      const durableQuarantineManifest = {
        ...manifest,
        principalPending: quarantinedByScope,
      };
      notifyCentralStateTransitionBarrier("before-quarantine-write", {
        owner: fence.owner,
        previousScope,
        nextScope,
        quarantinedKeys: Array.from(quarantineKeys),
      });
      if (!verifyCentralStatePrincipalTransitionSnapshot(
        transitionSnapshot,
        previousScope,
        fence,
        "Local pending data changed before it could be isolated safely. Try the account switch again."
      )) {
        return false;
      }
      if (quarantineKeys.size && !writeCentralStatePrincipalManifest(durableQuarantineManifest)) {
        centralState.lastError = "Local pending data could not be isolated safely.";
        return false;
      }
      notifyCentralStateTransitionBarrier("after-quarantine-before-checkpoint", {
        owner: fence.owner,
        previousScope,
        nextScope,
        quarantinedKeys: Array.from(quarantineKeys),
      });
      if (!verifyCentralStatePrincipalTransitionSnapshot(
        transitionSnapshot,
        previousScope,
        fence,
        "Local pending data changed during account isolation. Try the account switch again."
      )) {
        return false;
      }

      notifyCentralStateTransitionBarrier("after-checkpoint-before-raw", {
        owner: fence.owner,
        previousScope,
        nextScope,
        quarantinedKeys: Array.from(quarantineKeys),
      });
      if (!verifyCentralStatePrincipalTransitionSnapshot(
        transitionSnapshot,
        previousScope,
        fence,
        "Local pending data changed before local account data could be cleared safely. Try the account switch again."
      )) {
        return false;
      }
      const nextEntries = { ...manifest.entries };
      const previousRawValues = new Map();
      for (const key of CENTRAL_STATE_KEYS) {
        if (scopeChanged || quarantineKeys.has(key)) {
          delete nextEntries[key];
        }
        if (scopeChanged || quarantineKeys.has(key)) {
          previousRawValues.set(key, getCentralStateRawCacheValue(key));
          nativeLocalStorageRemoveItem?.call(window.localStorage, key);
          removeCentralCachedValue(key);
        }
      }
      if (scopeChanged) {
        centralStateValues.clear();
      }

      if (!isCentralStateTransitionFenceOwned(fence)) {
        restoreCentralStatePrincipalRawValues(previousRawValues);
        centralState.lastError = "Local pending data changed during account isolation. Try the account switch again.";
        return false;
      }

      const restoredPending = nextScope ? quarantinedByScope[nextScope] : null;
      if (restoredPending && typeof restoredPending === "object") {
        Object.entries(restoredPending).forEach(([key, record]) => {
          if (!CENTRAL_STATE_KEYS.has(key) || !record?.entry?.pendingCentralSync) {
            return;
          }
          const restoredEntry = { ...record.entry, principalScope: nextScope };
          try {
            if (!restoredEntry.deletedAt && typeof record.value === "string") {
              nativeLocalStorageSetItem?.call(window.localStorage, key, record.value);
              setCentralCachedValue(key, record.value);
            }
            nextEntries[key] = restoredEntry;
            delete restoredPending[key];
          } catch {
            delete nextEntries[key];
            nativeLocalStorageRemoveItem?.call(window.localStorage, key);
            removeCentralCachedValue(key);
          }
        });
        if (!Object.keys(restoredPending).length) {
          delete quarantinedByScope[nextScope];
        }
      }
      Object.keys(quarantinedByScope).forEach((scope) => {
        if (!Object.keys(quarantinedByScope[scope] || {}).length) {
          delete quarantinedByScope[scope];
        }
      });
      const preFinalSnapshot = captureCentralStatePrincipalTransitionSnapshot(
        readCentralStatePrincipalManifest() || durableQuarantineManifest
      );
      notifyCentralStateTransitionBarrier("before-final-commit", {
        owner: fence.owner,
        previousScope,
        nextScope,
        quarantinedKeys: Array.from(quarantineKeys),
      });
      if (!verifyCentralStatePrincipalTransitionSnapshot(
        preFinalSnapshot,
        previousScope,
        fence,
        "Local pending data changed before the account switch could be committed safely. Try the account switch again."
      )) {
        return false;
      }
      const transitionedManifest = {
        ...durableQuarantineManifest,
        entries: nextEntries,
        principalPending: quarantinedByScope,
        activePrincipalScope: nextScope,
      };
      if (!isCentralStateTransitionFenceOwned(fence) || !writeCentralStatePrincipalManifest(transitionedManifest)) {
        const currentManifest = readCentralStatePrincipalManifest();
        if (
          currentManifest &&
          isCentralStateTransitionFenceOwned(fence) &&
          isCentralStatePrincipalTransitionSnapshotCurrent(preFinalSnapshot, currentManifest, previousScope)
        ) {
          restoreCentralStatePrincipalRawValues(previousRawValues);
        } else if (currentManifest) {
          repairCentralStatePrincipalQuarantineFromRawValues(currentManifest);
        }
        centralState.lastError = "Local pending data could not be isolated safely.";
        return false;
      }
      if (scopeChanged) {
        resetCentralStateForPrincipalTransition();
      }
      return true;
    } finally {
      releaseCentralStateTransitionFence(fence);
    }
  }
  let authRefreshTokenPromise = null;
  let authSessionReadPromise = null;
  let authPrincipalEpoch = 0;
  let centralStateHydrationGeneration = 0;
  let authSignOutPromise = null;
  let authLoginAttemptGeneration = 0;
  let pendingServerSessionInstall = null;
  const rejectedAuthAccessTokens = new Set();
  let rejectedAuthSessionCleanup = null;
  let authSessionInstallGeneration = 0;
  let authSessionEventGeneration = 0;
  let currentUserProfileRefreshPromise = null;
  let currentUserProfileRefreshKey = "";
  let userCacheRefreshPromise = null;
  let userCacheRefreshKey = "";
  let postAuthHydrationTimer = 0;
  let postAuthHydrationRunId = 0;
  function advanceAuthPrincipalEpoch() {
    authPrincipalEpoch += 1;
    centralStateHydrationGeneration += 1;
    postAuthHydrationRunId += 1;
    return authPrincipalEpoch;
  }
  function getAuthAuthorizationFingerprint(user = {}) {
    return [
      String(user?.role || "").trim().toLowerCase(),
      String(user?.status || "").trim().toLowerCase(),
    ].join(":");
  }
  function isAuthSignOutActive() {
    return Boolean(authState.isSigningOut || authSignOutPromise);
  }
  function invalidateCentralStateForAuthorizationChange(previousUser, nextUser, options = {}) {
    const previousScope = getCentralStatePrincipalScope(previousUser);
    const nextScope = getCentralStatePrincipalScope(nextUser);
    if (
      !previousScope ||
      getAuthAuthorizationFingerprint(previousUser) === getAuthAuthorizationFingerprint(nextUser)
    ) {
      return false;
    }
    if (previousScope === nextScope) {
      resetCentralStateForPrincipalTransition();
    }
    if (options.advanceEpoch !== false) {
      advanceAuthPrincipalEpoch();
    }
    return true;
  }
  function captureAuthPrincipalContext() {
    return {
      epoch: authPrincipalEpoch,
      accessToken: String(authState.session?.access_token || ""),
      authorizationFingerprint: getAuthAuthorizationFingerprint(authState.currentUser),
      principalScope: getCentralStatePrincipalScope(authState.currentUser),
      userId: String(authState.currentUser?.id || ""),
    };
  }
  function isAuthPrincipalContextCurrent(context = {}) {
    return Boolean(
      Number(context.epoch) === authPrincipalEpoch &&
      String(context.accessToken || "") === String(authState.session?.access_token || "") &&
      String(context.authorizationFingerprint || "") === getAuthAuthorizationFingerprint(authState.currentUser) &&
      String(context.userId || "") === String(authState.currentUser?.id || "") &&
      String(context.principalScope || "") === getCentralStatePrincipalScope(authState.currentUser)
    );
  }
  function isSessionTargetCurrent(session = {}) {
    return Boolean(
      String(session?.access_token || "") &&
      String(session.access_token) === String(authState.session?.access_token || "") &&
      String(session?.user?.id || "") === String(authState.currentUser?.id || "")
    );
  }
  function doAuthSessionsMatch(left = {}, right = {}) {
    return Boolean(
      String(left?.access_token || "") &&
      String(left.access_token) === String(right?.access_token || "") &&
      String(left?.user?.id || "") === String(right?.user?.id || "")
    );
  }
  function beginPendingServerSessionInstall(accessToken, attemptGeneration) {
    const marker = {
      attemptGeneration: Number(attemptGeneration) || 0,
      token: String(accessToken || ""),
    };
    pendingServerSessionInstall = marker.token ? marker : null;
    return pendingServerSessionInstall;
  }
  function isPendingServerSessionInstall(accessToken) {
    return Boolean(
      pendingServerSessionInstall?.token &&
      pendingServerSessionInstall.token === String(accessToken || "")
    );
  }
  function clearPendingServerSessionInstall(marker) {
    if (marker && pendingServerSessionInstall === marker) {
      pendingServerSessionInstall = null;
    }
  }
  async function readAuthoritativeSdkSession() {
    if (!authState.supabase || isAuthSignOutActive()) {
      return { ok: false, session: null };
    }
    try {
      const result = await withTimeout(
        authState.supabase.auth.getSession(),
        8000,
        "Session verification timed out."
      );
      if (result?.error) {
        return { ok: false, session: null };
      }
      return { ok: true, session: result?.data?.session || null };
    } catch {
      return { ok: false, session: null };
    }
  }
  async function waitForAuthSignOutCompletion() {
    if (authSignOutPromise) {
      await authSignOutPromise;
    }
  }
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
      organizationId: String(
        appMeta.organizationId ||
          appMeta.organization_id ||
          user.organizationId ||
          user.organization_id ||
          user.primaryOrganizationId ||
          user.primary_organization_id ||
          ""
      ).trim(),
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
  if (rejectedAuthSessionCleanup || isAuthSignOutActive()) {
    return null;
  }
  if (authState.session?.access_token) {
    return authState.session.access_token;
  }
  if (!authState.supabase) {
    return null;
  }
  const requestedEpoch = authPrincipalEpoch;
  try {
    const { data, authEpoch } = await readSupabaseSession();
    if (isAuthSignOutActive() || authEpoch !== requestedEpoch || authPrincipalEpoch !== requestedEpoch) {
      return null;
    }
    const session = data?.session || null;
    if (!session?.access_token) {
      return null;
    }
    if (rejectedAuthAccessTokens.has(session.access_token)) {
      return null;
    }
    const samePrincipal = String(authState.currentUser?.id || "") === String(session.user?.id || "");
    const sessionUser = samePrincipal ? authState.currentUser : normalizeAuthUser(session.user || null);
    if (!commitAuthenticatedSession(session, sessionUser, { notify: !samePrincipal })) {
      return null;
    }
    return session.access_token;
  } catch (error) {
    console.warn("Supabase session read timed out; using cached session when available.", error);
    return !isAuthSignOutActive() && authPrincipalEpoch === requestedEpoch
      ? authState.session?.access_token || null
      : null;
  }
}
  function isAuthTokenOversized(token) {
    return String(token || "").length > MAX_AUTH_ACCESS_TOKEN_LENGTH;
  }
  async function refreshAccessToken() {
    if (rejectedAuthSessionCleanup || isAuthSignOutActive()) {
      return null;
    }
    if (!authState.supabase) {
      return null;
    }
    if (authRefreshTokenPromise) {
      return authRefreshTokenPromise;
    }
    const requestedEpoch = authPrincipalEpoch;
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
      if (rejectedAuthAccessTokens.has(refreshedSession.access_token)) {
        return null;
      }
      if (isAuthSignOutActive()) {
        return null;
      }
      if (authPrincipalEpoch !== requestedEpoch) {
        return doAuthSessionsMatch(authState.session, refreshedSession) && isSessionTargetCurrent(refreshedSession)
          ? refreshedSession.access_token
          : null;
      }
      const samePrincipal = String(authState.currentUser?.id || "") === String(refreshedSession.user?.id || "");
      const sessionUser = samePrincipal ? authState.currentUser : normalizeAuthUser(refreshedSession.user || null);
      if (!commitAuthenticatedSession(refreshedSession, sessionUser, { notify: !samePrincipal })) {
        return null;
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
    const { timeoutMs = 15000, skipAuth = false, authToken = "", ...fetchOptions } = options || {};
    const usesImplicitAuth = !skipAuth && !String(authToken || "");
    let accessToken = skipAuth ? null : String(authToken || "") || await getActiveAccessToken();
    if (!skipAuth && accessToken && isAuthTokenOversized(accessToken)) {
      const refreshedToken = await refreshAccessToken();
      accessToken = refreshedToken || accessToken;
    }
    const requestAuthContext =
      !skipAuth && accessToken === String(authState.session?.access_token || "")
        ? captureAuthPrincipalContext()
        : null;
    const staleAuthResponse = () => ({
      ok: false,
      status: 0,
      payload: { reason: "The authenticated session changed while the request was running." },
    });
    if (
      (usesImplicitAuth && (!accessToken || !requestAuthContext)) ||
      (requestAuthContext && (isAuthSignOutActive() || !isAuthPrincipalContextCurrent(requestAuthContext)))
    ) {
      return {
        ok: false,
        status: 0,
        payload: { reason: "The authenticated session changed before the request could start." },
      };
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
      if (
        requestAuthContext &&
        (isAuthSignOutActive() || !isAuthPrincipalContextCurrent(requestAuthContext))
      ) {
        return {
          ok: false,
          status: 0,
          payload: { reason: "The authenticated session changed before the request could start." },
        };
      }
      response = await fetch(path, {
        ...fetchOptions,
        headers,
        credentials: "omit",
        cache: "no-store",
        signal: fetchOptions.signal || controller?.signal,
      });
      if (
        requestAuthContext &&
        (isAuthSignOutActive() || !isAuthPrincipalContextCurrent(requestAuthContext))
      ) {
        return staleAuthResponse();
      }
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
    if (
      requestAuthContext &&
      (isAuthSignOutActive() || !isAuthPrincipalContextCurrent(requestAuthContext))
    ) {
      return staleAuthResponse();
    }
    if (
      response.status === 401 &&
      authState.currentUser &&
      requestAuthContext &&
      isAuthPrincipalContextCurrent(requestAuthContext)
    ) {
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
  function buildCentralStateReadBatches() {
    const largeBatches = Array.from(CENTRAL_STATE_LARGE_READ_KEYS)
      .filter((key) => CENTRAL_STATE_KEYS.has(key))
      .map((key) => [key]);
    const remainingKeys = Array.from(CENTRAL_STATE_KEYS)
      .filter((key) => !CENTRAL_STATE_LARGE_READ_KEYS.has(key));
    const remainingBatches = [];
    for (let index = 0; index < remainingKeys.length; index += CENTRAL_STATE_READ_BATCH_SIZE) {
      remainingBatches.push(remainingKeys.slice(index, index + CENTRAL_STATE_READ_BATCH_SIZE));
    }
    return [...largeBatches, ...remainingBatches];
  }
  function buildCentralStateReadPath(keys = [], options = {}) {
    const query = new URLSearchParams();
    query.set("keys", keys.join(","));
    if (options.accessMode) {
      query.set("access", options.accessMode);
    }
    if (options.forceApply || options.fresh) {
      query.set("fresh", "1");
    }
    return `${API_APP_STATE}?${query.toString()}`;
  }
  async function readCentralStateBatches(options = {}) {
    const responses = await Promise.all(buildCentralStateReadBatches().map((keys, index) =>
      apiRequest(buildCentralStateReadPath(keys, {
        ...options,
        accessMode: index === 0 ? "fresh" : "none",
      }), {
        method: "GET",
        timeoutMs: 10000,
        authToken: options.authToken,
        headers: options.forceApply || options.fresh ? { "x-footballscience-fresh-state": "1" } : undefined,
      })
    ));
    const failedResponse = responses.find((response) => !response.ok);
    if (failedResponse) {
      return failedResponse;
    }
    return responses.reduce((combined, response, index) => {
      Object.assign(combined.payload.entries, response.payload?.entries || {});
      Object.assign(combined.payload.metadata, response.payload?.metadata || {});
      if (index === 0) {
        Object.assign(combined.payload.writeAccess, response.payload?.writeAccess || {});
        Object.assign(combined.payload.seedAccess, response.payload?.seedAccess || {});
      }
      return combined;
    }, { ok: true, status: 200, payload: { entries: {}, metadata: {}, writeAccess: {}, seedAccess: {} } });
  }
  function canWriteCentralStateKey(key, writeAccess = {}) {
    return writeAccess?.[key] === true;
  }
  function filterCentralStateWriteEntries(entries = {}, writeAccess = {}) {
    return Object.entries(entries).reduce((filtered, [key, value]) => {
      if (canWriteCentralStateKey(key, writeAccess)) {
        filtered[key] = value;
      }
      return filtered;
    }, {});
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
  function hasCentralHydrationRevisionRegression(pendingEntry = {}, metadataEntry = {}) {
    const centralRevision = Number(metadataEntry?.revision);
    const manifestServerRevision = Number(pendingEntry?.serverRevision);
    return (
      Number.isInteger(centralRevision) &&
      centralRevision > 0 &&
      Number.isInteger(manifestServerRevision) &&
      manifestServerRevision > centralRevision
    );
  }
  function isStorageQuotaError(error) {
    return (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      Number(error?.code) === 22 ||
      Number(error?.code) === 1014 ||
      /quota/i.test(String(error?.message || ""))
    );
  }
  function getCentralCachedValue(key) {
    const normalizedKey = String(key || "");
    return centralStateValues.has(normalizedKey) ? centralStateValues.get(normalizedKey) : undefined;
  }
  function setCentralCachedValue(key, value) {
    const normalizedKey = String(key || "");
    if (!isCentralStateKey(normalizedKey) || typeof value !== "string") {
      return false;
    }
    centralStateValues.set(normalizedKey, value);
    return true;
  }
  function removeCentralCachedValue(key) {
    return centralStateValues.delete(String(key || ""));
  }
  function setCentralCacheFallbackState(key, isFallback) {
    const fallbackKeys = new Set(centralState.cacheFallbackKeys || []);
    if (isFallback) {
      fallbackKeys.add(key);
    } else {
      fallbackKeys.delete(key);
    }
    centralState.cacheFallbackKeys = Array.from(fallbackKeys);
  }
  function cacheCentralStateValue(key, value) {
    setCentralCachedValue(key, value);
    try {
      window.localStorage.setItem(key, value);
      setCentralCacheFallbackState(key, false);
      return true;
    } catch (error) {
      if (!isStorageQuotaError(error)) {
        throw error;
      }
      try {
        nativeLocalStorageRemoveItem?.call(window.localStorage, key);
      } catch {}
      setCentralCacheFallbackState(key, true);
      return false;
    }
  }
  function dispatchCentralStateReady(detail = {}) {
    window.dispatchEvent(
      new CustomEvent("footballscience:central-state-ready", { detail })
    );
  }
  function hasIncomingCentralRevisionAfterPending(pendingEntry = {}, metadataEntry = {}) {
    const centralRevision = Number(metadataEntry?.revision);
    const pendingRevision = Number(pendingEntry?.serverRevision);
    return Boolean(
      pendingEntry?.pendingCentralSync &&
      Number.isInteger(centralRevision) &&
      centralRevision > 0 &&
      Number.isInteger(pendingRevision) &&
      pendingRevision > 0 &&
      centralRevision > pendingRevision
    );
  }
  function shouldPreferIncomingMedicalCentralState(key, pendingEntry = {}, metadataEntry = {}, centralValue = "", options = {}) {
    if (
      key !== MEDICAL_TEAM_STATE_KEY ||
      !pendingEntry?.pendingCentralSync ||
      !Boolean(options.fresh || options.forceApply) ||
      typeof centralValue !== "string"
    ) {
      return false;
    }
    const centralRevision = Number(metadataEntry?.revision);
    const pendingRevision = Number(pendingEntry?.serverRevision);
    return Boolean(
      Number.isInteger(centralRevision) &&
      centralRevision > 0 &&
      Number.isInteger(pendingRevision) &&
      pendingRevision > 0 &&
      centralRevision >= pendingRevision &&
      !doesCentralStateAcknowledgePending(key, pendingEntry, metadataEntry, centralValue)
    );
  }
  function shouldRecoverMedicalCentralState(key, pendingEntry = {}, metadataEntry = {}, options = {}, centralValue = "") {
    return (
      key === MEDICAL_TEAM_STATE_KEY &&
      (
        (
          Boolean(pendingEntry?.pendingCentralSync) &&
          !hasIncomingCentralRevisionAfterPending(pendingEntry, metadataEntry) &&
          !shouldPreferIncomingMedicalCentralState(key, pendingEntry, metadataEntry, centralValue, options)
        ) ||
        Boolean(options.forceApply) ||
        (Boolean(options.fresh) && hasCentralHydrationRevisionRegression(pendingEntry, metadataEntry))
      )
    );
  }
  function shouldRecoverSessionPlannerCentralState(key, pendingEntry = {}, metadataEntry = {}, options = {}) {
    return (
      key === SESSION_PLANNER_STATE_KEY &&
      (
        Boolean(options.forceApply) ||
        (
          !pendingEntry?.pendingCentralSync &&
          Boolean(options.fresh) &&
          hasCentralHydrationRevisionRegression(pendingEntry, metadataEntry)
        )
      )
    );
  }
  function shouldApplyCentralStateEntry(key, pendingEntry = {}, metadataEntry = {}, centralValue = "", options = {}) {
    if (options.forceApply) {
      return true;
    }
    if (
      shouldRecoverMedicalCentralState(key, pendingEntry, metadataEntry, options, centralValue) ||
      shouldRecoverSessionPlannerCentralState(key, pendingEntry, metadataEntry, options) ||
      (key === MEDICAL_TEAM_STATE_KEY && (
        hasIncomingCentralRevisionAfterPending(pendingEntry, metadataEntry) ||
        shouldPreferIncomingMedicalCentralState(key, pendingEntry, metadataEntry, centralValue, options)
      ))
    ) {
      return true;
    }

    const centralRevision = Number(metadataEntry?.revision);
    const manifestServerRevision = Number(pendingEntry?.serverRevision);
    const hasCentralRevision = Number.isInteger(centralRevision) && centralRevision > 0;
    const hasManifestRevision = Number.isInteger(manifestServerRevision) && manifestServerRevision > 0;
    const localValue = window.localStorage.getItem(key);
    const hasLocalValue = localValue !== null;

    if (
      hasCentralRevision &&
      hasManifestRevision &&
      centralRevision < manifestServerRevision &&
      hasLocalValue
    ) {
      return false;
    }

    if (!pendingEntry?.pendingCentralSync) {
      return true;
    }
    return doesCentralStateAcknowledgePending(key, pendingEntry, metadataEntry, centralValue);
  }
  function doesCentralStateAcknowledgePending(key, pendingEntry = {}, metadataEntry = {}, centralValue = "") {
    if (
      !pendingEntry?.pendingCentralSync ||
      String(pendingEntry.principalScope || "") !== getCentralStatePrincipalScope(authState.currentUser)
    ) {
      return false;
    }
    const centralHash = String(metadataEntry.hash || "").trim();
    const localPendingHash = String(pendingEntry.hash || "").trim();
    const localValue = window.localStorage.getItem(key);
    const hasLocalValue = localValue !== null;
    const localUiFields = key === MEDICAL_TEAM_STATE_KEY ? MEDICAL_LOCAL_UI_FIELDS : [];
    const centralMatchesLocal =
      typeof centralValue === "string" &&
      hasLocalValue &&
      normalizeCentralPendingSyncValue(centralValue, localUiFields) ===
        normalizeCentralPendingSyncValue(localValue, localUiFields);
    return centralMatchesLocal || Boolean(centralHash && localPendingHash && centralHash === localPendingHash);
  }
  function getCentralPendingSyncGenerationToken(entry = {}) {
    return JSON.stringify({
      hash: Object.prototype.hasOwnProperty.call(entry, "hash") ? String(entry.hash || "") : null,
      writes: Object.prototype.hasOwnProperty.call(entry, "writes") ? Number(entry.writes) : null,
      updatedAt: Object.prototype.hasOwnProperty.call(entry, "updatedAt") ? String(entry.updatedAt || "") : null,
      deletedAt: Object.prototype.hasOwnProperty.call(entry, "deletedAt") ? String(entry.deletedAt || "") : null,
      principalScope: Object.prototype.hasOwnProperty.call(entry, "principalScope") ? String(entry.principalScope || "") : null,
    });
  }
  function hashCentralPendingSyncValue(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function normalizeCentralPendingSyncValue(value, localUiFields = []) {
    const normalizedValue = String(value ?? "");
    const sharedValue = localUiFields.length
      ? stripCentralStateLocalUiFields(normalizedValue, localUiFields)
      : normalizedValue;
    if (!localUiFields.length) {
      return sharedValue;
    }
    try {
      return JSON.stringify(sortCentralPendingSyncValue(JSON.parse(sharedValue)));
    } catch {
      return sharedValue;
    }
  }
  function sortCentralPendingSyncValue(value) {
    if (Array.isArray(value)) {
      return value.map(sortCentralPendingSyncValue);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    return Object.keys(value).sort().reduce((sorted, key) => {
      sorted[key] = sortCentralPendingSyncValue(value[key]);
      return sorted;
    }, {});
  }
  function captureCentralPendingSyncExpectation(key, value, localUiFields = [], expectedEntry = null) {
    const entry = expectedEntry || readCentralSyncManifestEntries()[key] || {};
    return {
      generationToken: getCentralPendingSyncGenerationToken(entry),
      value: normalizeCentralPendingSyncValue(value, localUiFields),
      localUiFields,
    };
  }
  function clearCentralPendingSyncFlag(key, metadataEntry = {}, expectation = null) {
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : null;
      const entry = manifest?.entries?.[key];
      const localValue = window.localStorage.getItem(key);
      if (
        !entry?.pendingCentralSync ||
        String(entry.principalScope || "") !== getCentralStatePrincipalScope(authState.currentUser) ||
        !expectation ||
        getCentralPendingSyncGenerationToken(entry) !== expectation.generationToken ||
        normalizeCentralPendingSyncValue(localValue, expectation.localUiFields) !== expectation.value
      ) {
        return false;
      }
      const acknowledgedRevision = Number(metadataEntry?.revision);
      const currentRevision = Number(entry.serverRevision);
      entry.pendingCentralSync = false;
      if (Number.isInteger(acknowledgedRevision) && acknowledgedRevision > 0) {
        entry.serverRevision =
          Number.isInteger(currentRevision) && currentRevision > acknowledgedRevision
            ? currentRevision
            : acknowledgedRevision;
      }
      manifest.lastCentralError = "";
      manifest.lastCentralSyncedAt = new Date().toISOString();
      const principalScope = String(entry.principalScope || "");
      if (principalScope && manifest.principalPending?.[principalScope]?.[key]) {
        delete manifest.principalPending[principalScope][key];
        if (!Object.keys(manifest.principalPending[principalScope]).length) {
          delete manifest.principalPending[principalScope];
        }
      }
      window.localStorage.setItem(DATA_SAFETY_MANIFEST_KEY, JSON.stringify(manifest));
      return true;
    } catch {
      return false;
    }
  }
  function preserveCentralPendingSyncEntryAfterHydrationCache(key, pendingEntry = {}, cachedValue = "") {
    if (!pendingEntry?.pendingCentralSync) {
      return false;
    }
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : null;
      if (!manifest?.entries || typeof manifest.entries !== "object") {
        return false;
      }
      const currentEntry = manifest.entries[key] || {};
      if (
        currentEntry.pendingCentralSync &&
        getCentralPendingSyncGenerationToken(currentEntry) === getCentralPendingSyncGenerationToken(pendingEntry)
      ) {
        return true;
      }
      const pendingWrites = Number(pendingEntry.writes);
      const currentWrites = Number(currentEntry.writes);
      const hasPendingWrites =
        Object.prototype.hasOwnProperty.call(pendingEntry, "writes") && Number.isFinite(pendingWrites);
      const isSyntheticHydrationCacheWrite =
        !currentEntry.pendingCentralSync &&
        String(currentEntry.hash || "") === hashCentralPendingSyncValue(cachedValue) &&
        Number(currentEntry.size) === String(cachedValue).length &&
        (!hasPendingWrites || currentWrites === pendingWrites + 1) &&
        !String(currentEntry.deletedAt || "");
      if (!isSyntheticHydrationCacheWrite) {
        return false;
      }
      manifest.entries[key] = {
        ...currentEntry,
        ...pendingEntry,
        pendingCentralSync: true,
      };
      window.localStorage.setItem(DATA_SAFETY_MANIFEST_KEY, JSON.stringify(manifest));
      return true;
    } catch {
      return false;
    }
  }
  function persistCentralHydrationRevisions(revisionEntries = [], options = {}) {
    if (!Array.isArray(revisionEntries) || !revisionEntries.length) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : null;
      if (!manifest?.entries || typeof manifest.entries !== "object") {
        return;
      }
      let changed = false;
      revisionEntries.forEach(([key, metadataEntry, pendingEntry = {}]) => {
        const entry = manifest.entries[key];
        const revision = Number(metadataEntry?.revision);
        const currentRevision = Number(entry?.serverRevision);
        const acceptAuthoritativeRevision =
          Boolean(options.fresh || options.forceApply) &&
          (
            shouldRecoverMedicalCentralState(key, pendingEntry, metadataEntry, options) ||
            shouldRecoverSessionPlannerCentralState(key, pendingEntry, metadataEntry, options)
          );
        if (
          !entry ||
          !Number.isInteger(revision) ||
          revision <= 0 ||
          (
            !acceptAuthoritativeRevision &&
            Number.isInteger(currentRevision) &&
            currentRevision >= revision
          )
        ) {
          return;
        }
        entry.serverRevision = revision;
        changed = true;
      });
      if (changed) {
        window.localStorage.setItem(DATA_SAFETY_MANIFEST_KEY, JSON.stringify(manifest));
      }
    } catch {}
  }
  function clearResolvedCentralHydrationError() {
    try {
      const raw = window.localStorage.getItem(DATA_SAFETY_MANIFEST_KEY);
      const manifest = raw ? JSON.parse(raw) : null;
      if (!manifest || typeof manifest !== "object") {
        return;
      }
      const hasPendingCentralSync = Object.values(manifest.entries || {})
        .some((entry) => entry?.pendingCentralSync);
      if (hasPendingCentralSync || !manifest.lastCentralError) {
        return;
      }
      manifest.lastCentralError = "";
      manifest.lastCentralSyncedAt = new Date().toISOString();
      window.localStorage.setItem(DATA_SAFETY_MANIFEST_KEY, JSON.stringify(manifest));
    } catch {}
  }
  function resolveCentralHydrationMetadata(key, metadataEntry = {}, pendingEntry = {}, currentEntry = {}, options = {}) {
    const incomingRevision = Number(metadataEntry?.revision);
    if (
      Number.isInteger(incomingRevision) &&
      incomingRevision > 0 &&
      Boolean(options.fresh || options.forceApply) &&
      (
        shouldRecoverMedicalCentralState(key, pendingEntry, metadataEntry, options) ||
        shouldRecoverSessionPlannerCentralState(key, pendingEntry, metadataEntry, options)
      )
    ) {
      return { ...metadataEntry, revision: incomingRevision };
    }
    const manifestRevision = Number(pendingEntry?.serverRevision);
    const currentRevision = Number(currentEntry?.revision);
    const highestRevision = Math.max(
      Number.isInteger(incomingRevision) && incomingRevision > 0 ? incomingRevision : 0,
      Number.isInteger(manifestRevision) && manifestRevision > 0 ? manifestRevision : 0,
      Number.isInteger(currentRevision) && currentRevision > 0 ? currentRevision : 0
    );
    if (highestRevision === currentRevision) {
      return { ...currentEntry };
    }
    return {
      ...metadataEntry,
      ...(highestRevision ? { revision: highestRevision } : {}),
    };
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
  const SESSION_PLANNER_LOCAL_UI_FIELDS = ["selectedDate"];
  const MEDICAL_LOCAL_UI_FIELDS = ["selectedDate", "selectedPlayerId"];
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
  function stripCentralStateLocalUiFields(value, fields) {
    const state = parseCentralObjectStateValue(value);
    if (!state) {
      return value;
    }
    let changed = false;
    const sharedState = { ...state };
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(sharedState, field)) {
        return;
      }
      delete sharedState[field];
      changed = true;
    });
    return changed ? JSON.stringify(sharedState) : value;
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
  async function applyCentralStateEntries(entries = {}, metadata = {}, options = {}) {
    const isOperationCurrent = typeof options.isOperationCurrent === "function"
      ? options.isOperationCurrent
      : () => true;
    if (!isOperationCurrent()) {
      return false;
    }
    const normalizedEntries = Object.fromEntries(
      Object.entries(entries || {}).filter(([key, value]) => isCentralStateKey(key) && typeof value === "string")
    );
    const incomingMetadata = Object.entries(metadata || {}).reduce((normalized, [key, value]) => {
      if (isCentralStateKey(key) && value && typeof value === "object") {
        normalized[key] = value;
      }
      return normalized;
    }, {});
    const pendingEntries = readCentralSyncManifestEntries();
    const nextMetadata = {};
    const writeBackEntries = [];
    const requiredWriteBackEntries = [];
    const resolvedPendingKeys = [];
    const hydratedRevisionEntries = [];
    const hydrationStorageSuppression = beginCentralHydrationStorageSuppression();
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (
          shouldRemoveLocalCentralStateKey(key) &&
          !Object.prototype.hasOwnProperty.call(normalizedEntries, key) &&
          !pendingEntries[key]?.pendingCentralSync
        ) {
          window.localStorage.removeItem(key);
          removeCentralCachedValue(key);
        }
      }
      Object.entries(normalizedEntries).forEach(([key, value]) => {
        if (!isOperationCurrent()) {
          return;
        }
        const candidatePendingEntry = pendingEntries[key] || {};
        const pendingEntry =
          !candidatePendingEntry.pendingCentralSync ||
          candidatePendingEntry.principalScope === getCentralStatePrincipalScope(authState.currentUser)
            ? candidatePendingEntry
            : {};
        const metadataEntry = incomingMetadata[key] || {};
        const canWriteEntry = canWriteCentralStateKey(key, options.writeAccess);
        const acknowledgesPending = doesCentralStateAcknowledgePending(key, pendingEntry, metadataEntry, value);
        let requiredWriteBackValue = null;
        nextMetadata[key] = resolveCentralHydrationMetadata(
          key,
          metadataEntry,
          pendingEntry,
          centralState.metadata[key] || {},
          options
        );
        if (!shouldApplyCentralStateEntry(key, pendingEntry, metadataEntry, value, options)) {
          return;
        }
        let valueToApply = value;
        if (key === WORKSPACE_HUB_STATE_KEY) {
          valueToApply = sanitizeWorkspaceHubStateValue(value);
        } else if (key === PERIODIZATION_STATE_KEY) {
          valueToApply = mergePeriodizationCentralStateValues(window.localStorage.getItem(key), value).value;
        } else if (key === SCHEDULE_STATE_KEY) {
          valueToApply = mergeCentralStateLocalUiFields(window.localStorage.getItem(key), value, SCHEDULE_LOCAL_UI_FIELDS).value;
        } else if (key === SESSION_PLANNER_STATE_KEY) {
          const localValue = window.localStorage.getItem(key);
          const sharedValue = stripCentralStateLocalUiFields(value, SESSION_PLANNER_LOCAL_UI_FIELDS);
          valueToApply = mergeCentralStateLocalUiFields(
            localValue,
            sharedValue,
            SESSION_PLANNER_LOCAL_UI_FIELDS
          ).value;
        } else if (!options.forceApply && key === PLAYER_PROFILES_STATE_KEY) {
          const mergedValue = mergeCentralStateMediaValues(window.localStorage.getItem(key), value);
          valueToApply = mergedValue.value;
          if (mergedValue.changed && canWriteEntry) {
            writeBackEntries.push([key, valueToApply]);
          }
        } else if (key === MEDICAL_TEAM_STATE_KEY) {
          const localValue = window.localStorage.getItem(key);
          const sharedValue = stripCentralStateLocalUiFields(value, MEDICAL_LOCAL_UI_FIELDS);
          const shouldPreserveLocalMedical =
            shouldRecoverMedicalCentralState(key, pendingEntry, metadataEntry, options, sharedValue);
          const shouldReplacePendingWithFreshMedical =
            shouldPreferIncomingMedicalCentralState(key, pendingEntry, metadataEntry, sharedValue, options);
          const mergedValue = shouldPreserveLocalMedical
            ? mergeCentralMedicalStateValues(localValue, sharedValue)
            : mergeCentralStateMediaValues(localValue, sharedValue);
          valueToApply = mergeCentralStateLocalUiFields(
            localValue,
            mergedValue.value,
            MEDICAL_LOCAL_UI_FIELDS
          ).value;
          const sharedValueToApply = stripCentralStateLocalUiFields(valueToApply, MEDICAL_LOCAL_UI_FIELDS);
          if (mergedValue.changed && canWriteEntry && sharedValueToApply !== sharedValue) {
            if (shouldPreserveLocalMedical || shouldReplacePendingWithFreshMedical) {
              requiredWriteBackValue = sharedValueToApply;
            } else {
              writeBackEntries.push([
                key,
                sharedValueToApply,
              ]);
            }
          }
        }
        const pendingExpectation = pendingEntry.pendingCentralSync
          ? captureCentralPendingSyncExpectation(
              key,
              valueToApply,
              key === MEDICAL_TEAM_STATE_KEY ? MEDICAL_LOCAL_UI_FIELDS : [],
              pendingEntry
            )
          : null;
        cacheCentralStateValue(key, valueToApply);
        const pendingGenerationPreserved = preserveCentralPendingSyncEntryAfterHydrationCache(
          key,
          pendingEntry,
          valueToApply
        );
        const pendingGenerationSuperseded =
          Boolean(pendingEntry.pendingCentralSync) && !pendingGenerationPreserved;
        if (pendingGenerationSuperseded) {
          const supersedingEntry = readCentralSyncManifestEntries()[key] || {};
          const supersedingRevision = Number(supersedingEntry.serverRevision);
          const requiredRevision = Number(centralState.reconcileRequired[key]);
          centralState.reconcileRequired[key] = Math.max(
            Number.isInteger(requiredRevision) && requiredRevision > 0 ? requiredRevision : 0,
            Number.isInteger(supersedingRevision) && supersedingRevision > 0 ? supersedingRevision : 0
          );
          nextMetadata[key] = resolveCentralHydrationMetadata(
            key,
            metadataEntry,
            supersedingEntry,
            nextMetadata[key],
            {}
          );
        }
        const requiresReconcile = Object.prototype.hasOwnProperty.call(
          centralState.reconcileRequired,
          key
        );
        const requiredRevision = Number(centralState.reconcileRequired[key]);
        const incomingRevision = Number(metadataEntry.revision);
        const pendingGenerationStable =
          !pendingEntry.pendingCentralSync || pendingGenerationPreserved;
        const hasFreshReconcile =
          !requiresReconcile ||
          (
            pendingGenerationStable &&
            Boolean(options.fresh || options.forceApply) &&
            (
              !Number.isInteger(requiredRevision) ||
              requiredRevision <= 0 ||
              (Number.isInteger(incomingRevision) && incomingRevision >= requiredRevision)
            )
          );
        const canAcknowledgePendingGeneration =
          pendingGenerationStable && hasFreshReconcile;
        if (canAcknowledgePendingGeneration && requiresReconcile) {
          nextMetadata[key] = { ...metadataEntry };
        }
        if (acknowledgesPending && canAcknowledgePendingGeneration) {
          resolvedPendingKeys.push([
            key,
            metadataEntry,
            pendingExpectation,
          ]);
        }
        if (requiredWriteBackValue !== null && canAcknowledgePendingGeneration) {
          requiredWriteBackEntries.push([
            key,
            requiredWriteBackValue,
            pendingExpectation,
          ]);
        }
        if (canAcknowledgePendingGeneration) {
          hydratedRevisionEntries.push([key, metadataEntry, pendingEntry]);
        }
      });
    } finally {
      endCentralHydrationStorageSuppression(hydrationStorageSuppression);
    }
    if (!isOperationCurrent()) {
      return false;
    }
    centralState.metadata = nextMetadata;
    persistCentralHydrationRevisions(hydratedRevisionEntries, options);
    for (const [key, value, expectation] of requiredWriteBackEntries) {
      if (!isOperationCurrent()) {
        return false;
      }
      if (centralState.autoRetryBlocked[key]) {
        continue;
      }
      const result = await syncCentralStateKey(key, value, {
        hydrationWriteback: true,
        isGenerationCurrent: isOperationCurrent,
      });
      if (!isOperationCurrent()) {
        return false;
      }
      if (result?.status === 403) {
        continue;
      }
      if (!result?.ok) {
        throw new Error(result?.reason || "Recovered Medical data could not be synced centrally.");
      }
      const acknowledgedMetadata = result.metadata || { revision: result.revision };
      persistCentralHydrationRevisions([[key, acknowledgedMetadata, {}]]);
      clearCentralPendingSyncFlag(key, acknowledgedMetadata, expectation);
    }
    resolvedPendingKeys.forEach(([key, metadataEntry, expectation]) => {
      if (!isOperationCurrent()) {
        return;
      }
      if (clearCentralPendingSyncFlag(key, metadataEntry, expectation)) {
        delete centralState.reconcileRequired[key];
      }
    });
    clearResolvedCentralHydrationError();
    writeBackEntries.forEach(([key, value]) => {
      if (isOperationCurrent() && !centralState.autoRetryBlocked[key]) {
        syncCentralStateKey(key, value, {
          hydrationWriteback: true,
          isGenerationCurrent: isOperationCurrent,
        }).catch(() => {});
      }
    });
    return isOperationCurrent();
  }
  let centralStateHydrationDrainPromise = null;
  let activeCentralStateHydrationOptions = null;
  let queuedCentralStateHydrationRequest = null;
  function mergeCentralStateHydrationOptions(previousOptions = {}, nextOptions = {}) {
    return {
      ...nextOptions,
      fresh: Boolean(nextOptions.fresh || previousOptions.fresh),
      forceApply: Boolean(nextOptions.forceApply || previousOptions.forceApply),
      returnEntries: Boolean(nextOptions.returnEntries || previousOptions.returnEntries),
    };
  }
  function startCentralStateHydrationDrain() {
    if (centralStateHydrationDrainPromise) {
      return centralStateHydrationDrainPromise;
    }
    const drainPromise = (async () => {
      while (queuedCentralStateHydrationRequest) {
        const request = queuedCentralStateHydrationRequest;
        queuedCentralStateHydrationRequest = null;
        activeCentralStateHydrationOptions = request.options;
        const result = await runCentralStateHydration(request.options);
        activeCentralStateHydrationOptions = null;
        request.resolve(result);
      }
    })();
    centralStateHydrationDrainPromise = drainPromise;
    drainPromise.finally(() => {
      if (centralStateHydrationDrainPromise === drainPromise) {
        centralStateHydrationDrainPromise = null;
        activeCentralStateHydrationOptions = null;
      }
      if (queuedCentralStateHydrationRequest) {
        startCentralStateHydrationDrain();
      }
    });
    return drainPromise;
  }
  function shouldSupersedeActiveCentralHydration(options = {}) {
    return Boolean(options.fresh || options.forceApply || options.returnEntries);
  }
  function hydrateCentralState(options = {}) {
    let resolveRequest;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const inheritedOptions = mergeCentralStateHydrationOptions(
      activeCentralStateHydrationOptions || {},
      queuedCentralStateHydrationRequest?.options || {}
    );
    if (queuedCentralStateHydrationRequest) {
      queuedCentralStateHydrationRequest.resolve(false);
    }
    queuedCentralStateHydrationRequest = {
      options: mergeCentralStateHydrationOptions(inheritedOptions, options),
      resolve: resolveRequest,
    };
    if (centralStateHydrationDrainPromise) {
      if (shouldSupersedeActiveCentralHydration(options)) {
        centralStateHydrationGeneration += 1;
      }
    } else {
      startCentralStateHydrationDrain();
    }
    return requestPromise;
  }
  async function runCentralStateHydration(options = {}) {
    if (authState.devMode) {
      centralState.hydrated = true;
      centralState.hydrating = false;
      centralState.hydrationError = "";
      centralState.lastError = "";
      centralState.lastSyncedAt = new Date().toISOString();
      centralState.localDev = true;
      centralState.metadata = {};
      resetCentralStateReconcileRequirements();
      dispatchCentralStateReady({ entries: collectCentralLocalStateEntries(), localDev: true });
      return options.returnEntries
        ? { ok: true, entries: collectCentralLocalStateEntries(), metadata: {}, localDev: true }
        : true;
    }
    if (!authState.session?.access_token) {
      return centralState.hydrated;
    }
    const authContext = captureAuthPrincipalContext();
    const hydrationGeneration = ++centralStateHydrationGeneration;
    const isRequestedGenerationCurrent = typeof options.isGenerationCurrent === "function"
      ? options.isGenerationCurrent
      : () => true;
    const isOperationCurrent = () =>
      hydrationGeneration === centralStateHydrationGeneration &&
      isAuthPrincipalContextCurrent(authContext) &&
      isRequestedGenerationCurrent();
    centralState.hydrating = true;
    centralState.hydrationError = "";
    centralState.lastError = "";
    centralState.writeAccess = {};
    try {
      centralState.localDev = false;
      const response = await readCentralStateBatches({
        ...options,
        authToken: authContext.accessToken,
      });
      if (!isOperationCurrent()) {
        return false;
      }
      if (!response.ok) {
        centralState.lastError = response.payload?.reason || "Central app data could not be loaded.";
        centralState.hydrationError = centralState.lastError;
        return false;
      }
      const entries = response.payload?.entries && typeof response.payload.entries === "object"
        ? response.payload.entries
        : {};
      const metadata = response.payload?.metadata && typeof response.payload.metadata === "object"
        ? response.payload.metadata
        : {};
      const writeAccess = response.payload?.writeAccess && typeof response.payload.writeAccess === "object"
        ? response.payload.writeAccess
        : {};
      centralState.writeAccess = { ...writeAccess };
      const seedAccess = response.payload?.seedAccess && typeof response.payload.seedAccess === "object"
        ? response.payload.seedAccess
        : {};
      const hasCentralEntries = Object.keys(entries).length > 0;
      if (hasCentralEntries) {
        const applied = await applyCentralStateEntries(entries, metadata, {
          ...options,
          writeAccess,
          isOperationCurrent,
        });
        if (!applied || !isOperationCurrent()) {
          return false;
        }
      } else {
        const localEntries = filterCentralStateWriteEntries(collectCentralLocalStateEntries(), seedAccess);
        if (Object.keys(localEntries).length) {
          const seedResponse = await apiRequest(API_APP_STATE, {
            method: "POST",
            authToken: authContext.accessToken,
            body: JSON.stringify({ entries: localEntries }),
          });
          if (!isOperationCurrent()) {
            return false;
          }
          if (!seedResponse.ok) {
            centralState.lastError = seedResponse.payload?.reason || "Central seed failed.";
            centralState.hydrationError = centralState.lastError;
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
      centralState.hydrating = false;
      centralState.lastSyncedAt = new Date().toISOString();
      dispatchCentralStateReady({
        entries: hasCentralEntries ? entries : collectCentralLocalStateEntries(),
      });
      return options.returnEntries ? { ok: true, entries, metadata } : true;
    } catch (error) {
      if (!isOperationCurrent()) {
        return false;
      }
      centralState.lastError = error?.message || "Central load failed.";
      centralState.hydrationError = centralState.lastError;
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
    if (!options.automaticRetry && !options.hydrationWriteback) {
      delete centralState.autoRetryBlocked[key];
    }
    const authContext = captureAuthPrincipalContext();
    const isWriteGenerationCurrent = typeof options.isGenerationCurrent === "function"
      ? options.isGenerationCurrent
      : () => true;
    const isWriteOperationCurrent = () =>
      isAuthPrincipalContextCurrent(authContext) && isWriteGenerationCurrent();
    if (!isWriteOperationCurrent()) {
      return { ok: false, status: 409, conflict: true, reason: "A newer local generation is pending." };
    }
    try {
      centralState.localDev = false;
      const baseMetadata = centralState.metadata?.[key] || {};
      const baseRevision = Number.isInteger(Number(options.baseRevision))
        ? Number(options.baseRevision)
        : getCentralStateBaseRevision(baseMetadata);
      const hydrationPendingExpectation = options.hydrationWriteback
        ? captureCentralPendingSyncExpectation(
            key,
            String(value ?? ""),
            key === MEDICAL_TEAM_STATE_KEY ? MEDICAL_LOCAL_UI_FIELDS : [],
            readCentralSyncManifestEntries()[key] || {}
          )
        : null;
      const response = await apiRequest(API_APP_STATE, {
        method: options.removed ? "DELETE" : "POST",
        authToken: authContext.accessToken,
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
      if (!isWriteOperationCurrent()) {
        return {
          ok: false,
          status: 409,
          conflict: true,
          reason: "Central sync response belonged to an inactive session.",
        };
      }
      if (!response.ok) {
        const reason = response.payload?.reason || "Sync failed.";
        if (response.status === 403) {
          centralState.autoRetryBlocked[key] = true;
        }
        if (!(options.hydrationWriteback && response.status === 403)) {
          centralState.lastError = reason;
        }
        return {
          ok: false,
          status: response.status,
          conflict: response.status === 409,
          currentRevision: response.payload?.currentRevision,
          reason,
        };
      }
      const hasReconcileRequirement = Object.prototype.hasOwnProperty.call(
        centralState.reconcileRequired,
        key
      );
      const requiredReconcileRevision = Number(centralState.reconcileRequired[key]);
      const acknowledgedRevision = Number(
        response.payload?.metadata?.revision ?? response.payload?.revision
      );
      if (
        !Number.isInteger(acknowledgedRevision) ||
        acknowledgedRevision <= baseRevision ||
        String(response.payload?.key || "") !== String(key || "") ||
        (
          hasReconcileRequirement &&
          Number.isInteger(requiredReconcileRevision) &&
          requiredReconcileRevision > 0 &&
          acknowledgedRevision < requiredReconcileRevision
        )
      ) {
        const reason = "Central sync acknowledgement did not prove a newer durable revision.";
        centralState.lastError = reason;
        return {
          ok: false,
          status: 409,
          conflict: true,
          currentRevision: Number.isInteger(acknowledgedRevision) ? acknowledgedRevision : undefined,
          reason,
        };
      }
      centralState.lastError = "";
      delete centralState.autoRetryBlocked[key];
      centralState.lastSyncedAt = new Date().toISOString();
      if (response.payload?.metadata) {
        centralState.metadata = {
          ...centralState.metadata,
          [key]: response.payload.metadata,
        };
      }
      if (hydrationPendingExpectation) {
        clearCentralPendingSyncFlag(
          key,
          response.payload?.metadata || { revision: acknowledgedRevision },
          hydrationPendingExpectation
        );
      }
      delete centralState.reconcileRequired[key];
      if (options.removed) {
        removeCentralCachedValue(key);
      } else if (getCentralCachedValue(key) === undefined) {
        setCentralCachedValue(
          key,
          typeof response.payload?.value === "string" ? response.payload.value : String(value ?? "")
        );
      }
      return { ok: true, ...(response.payload || {}) };
    } catch (error) {
      if (!isWriteOperationCurrent()) {
        return { ok: false, status: 409, conflict: true, reason: "Central sync session changed." };
      }
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
    const shouldSetCurrent = options.setCurrent || authState.currentUser?.id === normalizedUser.id;
    const previousCurrentUser = authState.currentUser;
    const nextCurrentUser = shouldSetCurrent
      ? { ...(previousCurrentUser || {}), ...normalizedUser }
      : previousCurrentUser;
    if (shouldSetCurrent && !transitionCentralStatePrincipal(normalizedUser)) {
      return null;
    }
    const authorizationChanged = shouldSetCurrent
      ? invalidateCentralStateForAuthorizationChange(previousCurrentUser, nextCurrentUser, {
        advanceEpoch: options.advanceAuthorizationEpoch !== false,
      })
      : false;
    const existingIndex = authState.users.findIndex((candidate) => candidate.id === normalizedUser.id);
    if (existingIndex >= 0) {
      authState.users[existingIndex] = { ...normalizeAuthUser(authState.users[existingIndex]), ...normalizedUser };
    } else {
      authState.users = [normalizedUser, ...authState.users];
    }
    if (shouldSetCurrent) {
      authState.currentUser = nextCurrentUser;
      if (options.notify !== false) {
        notifyAuthChange(authState.currentUser);
      }
      if (authorizationChanged && authState.session?.access_token) {
        queuePostAuthHydration(authState.session);
      }
    }
    return normalizedUser;
  }
  async function refreshUserCache() {
    const authContext = captureAuthPrincipalContext();
    const refreshKey = [authContext.userId, authContext.accessToken, authContext.epoch].join(":");
    if (!authContext.userId || !authContext.accessToken) {
      return false;
    }
    if (userCacheRefreshPromise && userCacheRefreshKey === refreshKey) {
      return userCacheRefreshPromise;
    }
    const refreshPromise = (async () => {
    const response = await apiRequest(API_ADMIN_USERS, {
      method: "GET",
      timeoutMs: 9000,
      authToken: authContext.accessToken,
    });
    if (!isAuthPrincipalContextCurrent(authContext)) {
      return false;
    }
    if (response.ok && Array.isArray(response.payload?.users)) {
      const nextUsers = response.payload.users.map((user) => normalizeAuthUser(user)).filter((user) => user.id);
      const nextRoles = Array.isArray(response.payload.roles) ? response.payload.roles : authState.roles;
      const refreshedCurrentUser = nextUsers.find((user) => user.id === authState.currentUser?.id);
      if (refreshedCurrentUser) {
        if (!transitionCentralStatePrincipal(refreshedCurrentUser)) {
          return false;
        }
        invalidateCentralStateForAuthorizationChange(authState.currentUser, refreshedCurrentUser);
        authState.currentUser = refreshedCurrentUser;
        notifyAuthChange(refreshedCurrentUser);
      }
      authState.users = nextUsers;
      authState.roles = nextRoles;
      return true;
    }
    if (!authState.users.length && authState.currentUser) {
      authState.users = [authState.currentUser];
    }
    return false;
    })();
    userCacheRefreshKey = refreshKey;
    userCacheRefreshPromise = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      if (userCacheRefreshPromise === refreshPromise) {
        userCacheRefreshPromise = null;
        userCacheRefreshKey = "";
      }
    }
  }
  async function fetchCurrentUserProfile(sessionUserId = "", accessToken = "") {
    const normalizedSessionUserId = String(sessionUserId || "");
    if (!normalizedSessionUserId || !String(accessToken || "")) {
      return null;
    }
    const [response, identityResponse] = await Promise.all([
      apiRequest(`${API_ADMIN_USERS}?me=1`, {
        method: "GET",
        timeoutMs: 8000,
        authToken: accessToken,
      }),
      apiRequest(API_PLATFORM_IDENTITY, {
        method: "GET",
        timeoutMs: 8000,
        authToken: accessToken,
      }),
    ]);
    const meUser = response.payload?.user || response.payload?.payload?.user || null;
    const identityOrganizationId = String(
      identityResponse.payload?.scope?.primary?.organizationId ||
        identityResponse.payload?.actor?.profile?.primaryOrganizationId ||
        ""
    ).trim();
    if (!response.ok || !meUser || !identityResponse.ok || !identityOrganizationId) {
      return null;
    }
    const nextUser = normalizeAuthUser({ ...meUser, organizationId: identityOrganizationId });
    return nextUser.id === normalizedSessionUserId ? nextUser : null;
  }
  async function refreshCurrentUserProfile(sessionUserId = "", options = {}) {
    const normalizedSessionUserId = String(sessionUserId || "");
    const authContext = captureAuthPrincipalContext();
    if (
      !normalizedSessionUserId ||
      normalizedSessionUserId !== authContext.userId ||
      !authContext.accessToken
    ) {
      return null;
    }
    const refreshKey = [normalizedSessionUserId, authContext.accessToken, authContext.epoch].join(":");
    if (currentUserProfileRefreshPromise && currentUserProfileRefreshKey === refreshKey) {
      return currentUserProfileRefreshPromise;
    }
    const refreshPromise = (async () => {
      const nextUser = await fetchCurrentUserProfile(normalizedSessionUserId, authContext.accessToken);
      if (!nextUser || !isAuthPrincipalContextCurrent(authContext)) {
        return null;
      }
      if (isPausedAccount(nextUser)) {
        await signOut({ scope: "local" });
        return null;
      }
      if (!setCurrentUserFromSession(nextUser, { notify: options.notify !== false })) {
        return null;
      }
      return (
        !isAuthSignOutActive() &&
        String(authState.session?.access_token || "") === String(authContext.accessToken || "") &&
        String(authState.currentUser?.id || "") === normalizedSessionUserId
      ) ? authState.currentUser : null;
    })();
    currentUserProfileRefreshKey = refreshKey;
    currentUserProfileRefreshPromise = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      if (currentUserProfileRefreshPromise === refreshPromise) {
        currentUserProfileRefreshPromise = null;
        currentUserProfileRefreshKey = "";
      }
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
      const refreshedProfile = await refreshCurrentUserProfile(sessionUserId).catch(() => null);
      if (!refreshedProfile) {
        return;
      }
      if (runId !== postAuthHydrationRunId || authState.session?.access_token !== queuedSession.access_token) {
        return;
      }
      await hydrateCentralState({ fresh: true }).catch(() => false);
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
    if (!transitionCentralStatePrincipal(nextUser)) {
      return;
    }
    authState.currentUser = nextUser;
    advanceAuthPrincipalEpoch();
    notifyAuthChange(nextUser);
  }
  function setCurrentUserFromSession(sessionUser, options = {}) {
    const nextUser = normalizeAuthUser(sessionUser);
    if (!nextUser.id) {
      if (!transitionCentralStatePrincipal(null)) {
        return false;
      }
      authState.currentUser = null;
      notifyAuthChange(null);
      return true;
    }
    return Boolean(mergeAuthUser(nextUser, { setCurrent: true, notify: options.notify !== false }));
  }
  function isPausedAccount(user) {
    return String(user?.status || "").trim().toLowerCase() === "paused";
  }
  function commitAuthenticatedSession(session, user, options = {}) {
    if (
      !session?.access_token ||
      !user?.id ||
      String(session?.user?.id || user.id) !== String(user.id)
    ) {
      return null;
    }
    if (!mergeAuthUser(user, {
      setCurrent: true,
      notify: false,
      advanceAuthorizationEpoch: false,
    })) {
      return null;
    }
    authState.session = session;
    advanceAuthPrincipalEpoch();
    if (options.notify !== false) {
      notifyAuthChange(authState.currentUser);
    }
    return authState.currentUser;
  }
  async function hydrateCurrentUser(session = null, options = {}) {
    const nextSession = session?.access_token ? session : null;
    const nextSessionUser = session?.user || null;
    const waitForCentral = options.waitForCentral !== false;
    const waitForProfile = options.waitForProfile !== false;
    const queuePostAuth = options.queuePostAuth !== false;
    const notifyWhenReady = options.notify !== false;
    const isRequestedOperationCurrent = typeof options.isOperationCurrent === "function"
      ? options.isOperationCurrent
      : () => true;
    if (!isRequestedOperationCurrent() || isAuthSignOutActive()) {
      return null;
    }
    if (!nextSession || !nextSessionUser) {
      transitionCentralStatePrincipal(null);
      authState.currentUser = null;
      authState.session = null;
      authState.users = [];
      advanceAuthPrincipalEpoch();
      notifyAuthChange(null);
      return null;
    }
    const sessionUserId = nextSessionUser.id;
    const startingEpoch = authPrincipalEpoch;
    let nextUser = normalizeAuthUser(options.profileUser || nextSessionUser);
    if (waitForProfile) {
      const refreshedProfile = await fetchCurrentUserProfile(sessionUserId, nextSession.access_token);
      if (!refreshedProfile || !isRequestedOperationCurrent() || isAuthSignOutActive()) {
        return null;
      }
      nextUser = refreshedProfile;
      if (authPrincipalEpoch !== startingEpoch && !isSessionTargetCurrent(nextSession)) {
        return null;
      }
    }
    if (isPausedAccount(nextUser)) {
      return null;
    }
    if (rejectedAuthAccessTokens.has(String(nextSession.access_token || ""))) {
      return null;
    }
    if (!isRequestedOperationCurrent() || isAuthSignOutActive()) {
      return null;
    }
    if (!isSessionTargetCurrent(nextSession)) {
      if (!commitAuthenticatedSession(nextSession, nextUser, { notify: false })) {
        return null;
      }
    }
    const committedContext = captureAuthPrincipalContext();
    if (!waitForCentral) {
      if (queuePostAuth) {
        queuePostAuthHydration(nextSession);
      }
      if (notifyWhenReady) {
        notifyAuthChange(authState.currentUser);
      }
      return authState.currentUser;
    }
    try {
      await withTimeout(hydrateCentralState({ fresh: true }), 12000, "Central app data is still loading.");
    } catch {
      hydrateCentralState({ fresh: true }).catch(() => {});
    }
    if (!isAuthPrincipalContextCurrent(committedContext)) {
      return null;
    }
    try {
      await withTimeout(refreshUserCache(), 8000, "User list is still loading.");
    } catch {
      refreshUserCache().catch(() => {});
    }
    if (!isAuthPrincipalContextCurrent(committedContext)) {
      return null;
    }
    if (!authState.currentUser && sessionUserId) {
      setCurrentUserById(sessionUserId);
    }
    if (!authState.currentUser?.id) {
      authState.currentUser = null;
      authState.users = [];
      notifyAuthChange(null);
    } else if (authState.currentUser.id && notifyWhenReady) {
      notifyAuthChange(authState.currentUser);
    }
    return authState.currentUser;
  }
  function rejectDelayedAuthSessionInstall(accessToken, setSessionPromise) {
    const rejectedToken = String(accessToken || "");
    if (!rejectedToken) {
      return;
    }
    const cleanupGeneration = ++authSessionInstallGeneration;
    rejectedAuthAccessTokens.add(rejectedToken);
    rejectedAuthSessionCleanup = {
      generation: cleanupGeneration,
      token: rejectedToken,
    };
    const finishRejectedInstallCleanup = async () => {
      await rejectInstalledSessionIfCurrent(rejectedToken);
      if (rejectedAuthSessionCleanup?.generation === cleanupGeneration) {
        rejectedAuthSessionCleanup = null;
      }
    };
    Promise.resolve(setSessionPromise).then(
      finishRejectedInstallCleanup,
      finishRejectedInstallCleanup
    );
  }
  async function rejectInstalledSessionIfCurrent(accessToken) {
    const rejectedToken = String(accessToken || "");
    if (!rejectedToken) {
      return;
    }
    rejectedAuthAccessTokens.add(rejectedToken);
    let activeSession = null;
    try {
      const result = await withTimeout(
        authState.supabase?.auth?.getSession?.(),
        8000,
        "Session cleanup verification timed out."
      );
      activeSession = result?.data?.session || null;
    } catch {}
    if (String(activeSession?.access_token || "") === rejectedToken) {
      await signOut({ scope: "local" });
    }
  }
  async function signInWithIdentifier(identifier, password) {
    await waitForAuthSignOutCompletion();
    if (rejectedAuthSessionCleanup) {
      return { ok: false, reason: "A previous local session is still being cleaned up. Try again shortly." };
    }
    if (authState.devMode) return signInWithDevAuth(identifier, password);
    if (!authState.supabase) return { ok: false, reason: "Authentication is not ready. Open footballscience.xyz." };
    const cleanIdentifier = String(identifier || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();
    if (!cleanIdentifier || !cleanPassword) return { ok: false, reason: "Username and password are required." };
    const loginAttemptGeneration = ++authLoginAttemptGeneration;
    const loginStartEpoch = authPrincipalEpoch;
    const isServerLoginPreparationCurrent = () =>
      loginAttemptGeneration === authLoginAttemptGeneration &&
      loginStartEpoch === authPrincipalEpoch;
    let email = cleanIdentifier;
    let foundByUsername = false;
    if (!cleanIdentifier.includes("@")) {
      const lookup = await lookupAuthUser(cleanIdentifier);
      if (!isServerLoginPreparationCurrent()) {
        return { ok: false, reason: "A newer authentication operation has started." };
      }
      if (lookup?.email) { foundByUsername = true; email = lookup.email; }
    }
    try {
      const loginResponse = await apiRequest(API_AUTH_LOGIN,{method:"POST",skipAuth:true,timeoutMs:65000,body:JSON.stringify({email,password:cleanPassword})});
      if (!isServerLoginPreparationCurrent()) {
        return { ok: false, reason: "A newer authentication operation has started." };
      }
      if (!loginResponse.ok) {
        const proxyReason = String(loginResponse.payload?.reason || "");
        const shouldTryDirectLogin = [0, 404, 405, 500, 502, 503].includes(Number(loginResponse.status)) ||
          /network|method not allowed|not found|configured/i.test(proxyReason);
        if (shouldTryDirectLogin) {
          const directResult = await withTimeout(
            authState.supabase.auth.signInWithPassword({email,password:cleanPassword}),
            55000,
            "Login is taking too long. Check your network and try again."
          );
          if (loginAttemptGeneration !== authLoginAttemptGeneration) {
            return { ok: false, reason: "A newer authentication operation has started." };
          }
          if (directResult.error) {
            loginResponse.payload = { reason: directResult.error.message || proxyReason || "Invalid username or password." };
          } else if (directResult.data?.session) {
            const directSession = directResult.data.session;
            const isDirectLoginOperationCurrent = () =>
              loginAttemptGeneration === authLoginAttemptGeneration &&
              (
                loginStartEpoch === authPrincipalEpoch ||
                isSessionTargetCurrent(directSession)
              );
            const hydratedUser = await hydrateCurrentUser(
              directSession,
              {
                waitForCentral: false,
                waitForProfile: true,
                isOperationCurrent: isDirectLoginOperationCurrent,
              }
            );
            if (!hydratedUser) {
              await rejectInstalledSessionIfCurrent(directSession.access_token);
              return { ok: false, reason: "Local pending data could not be isolated safely. Reload and sign in again." };
            }
            if (
              loginAttemptGeneration !== authLoginAttemptGeneration ||
              !isSessionTargetCurrent(directSession)
            ) {
              await rejectInstalledSessionIfCurrent(directSession.access_token);
              return { ok: false, reason: "A newer authentication operation has started." };
            }
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
      if (loginAttemptGeneration !== authLoginAttemptGeneration) {
        return { ok: false, reason: "A newer sign-in attempt has started." };
      }
      const isServerLoginSessionCurrent = () =>
        loginAttemptGeneration === authLoginAttemptGeneration &&
        (
          loginStartEpoch === authPrincipalEpoch ||
          isSessionTargetCurrent(session)
        );
      const candidateProfile = await fetchCurrentUserProfile(session.user?.id, session.access_token);
      if (
        !candidateProfile ||
        isPausedAccount(candidateProfile) ||
        !isServerLoginPreparationCurrent()
      ) {
        return { ok: false, reason: "The account profile could not be verified safely." };
      }
      const principalManifest = readCentralStatePrincipalManifest();
      if (!principalManifest || !writeCentralStatePrincipalManifest(principalManifest)) {
        return { ok: false, reason: "Local pending data could not be isolated safely. Reload and sign in again." };
      }
      const previousPrincipalBeforeServerSessionInstall = authState.currentUser;
      let serverPrincipalPrepared = false;
      const restorePreviousPrincipalAfterServerInstallFailure = () => {
        if (!serverPrincipalPrepared) {
          return true;
        }
        return transitionCentralStatePrincipal(previousPrincipalBeforeServerSessionInstall || null);
      };
      if (!transitionCentralStatePrincipal(candidateProfile)) {
        return { ok: false, reason: "Local pending data could not be isolated safely. Reload and sign in again." };
      }
      serverPrincipalPrepared = true;
      const sessionInstallMarker = beginPendingServerSessionInstall(
        session.access_token,
        loginAttemptGeneration
      );
      const setSessionPromise = authState.supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      let setSessionResult = null;
      try {
        setSessionResult = await withTimeout(
          setSessionPromise,
          AUTH_SERVER_SESSION_INSTALL_TIMEOUT_MS,
          "Supabase local session save took too long."
        );
      } catch (error) {
        clearPendingServerSessionInstall(sessionInstallMarker);
        rejectDelayedAuthSessionInstall(session.access_token, setSessionPromise);
        console.warn("Supabase local session save failed after server login.", error);
        restorePreviousPrincipalAfterServerInstallFailure();
        return { ok: false, reason: "The local session could not be saved safely. Sign in again." };
      }
      const installedSession = setSessionResult?.data?.session || null;
      if (
        !setSessionResult ||
        setSessionResult.error ||
        String(installedSession?.access_token || "") !== String(session.access_token || "") ||
        String(installedSession?.user?.id || "") !== String(session.user?.id || "")
      ) {
        clearPendingServerSessionInstall(sessionInstallMarker);
        await rejectInstalledSessionIfCurrent(session.access_token);
        restorePreviousPrincipalAfterServerInstallFailure();
        return { ok: false, reason: "The local session could not be saved safely. Reload and sign in again." };
      }
      if (!isServerLoginSessionCurrent()) {
        clearPendingServerSessionInstall(sessionInstallMarker);
        await rejectInstalledSessionIfCurrent(session.access_token);
        restorePreviousPrincipalAfterServerInstallFailure();
        return { ok: false, reason: "A newer sign-in attempt has started." };
      }
      let hydratedUser = null;
      try {
        hydratedUser = await hydrateCurrentUser(session, {
          waitForCentral: false,
          waitForProfile: false,
          profileUser: candidateProfile,
          queuePostAuth: false,
          notify: false,
          isOperationCurrent: isServerLoginSessionCurrent,
        });
      } finally {
        clearPendingServerSessionInstall(sessionInstallMarker);
      }
      if (!hydratedUser) {
        await rejectInstalledSessionIfCurrent(session.access_token);
        restorePreviousPrincipalAfterServerInstallFailure();
        return { ok: false, reason: "Local pending data could not be isolated safely. Reload and sign in again." };
      }
      if (
        loginAttemptGeneration !== authLoginAttemptGeneration ||
        !isSessionTargetCurrent(session)
      ) {
        await rejectInstalledSessionIfCurrent(session.access_token);
        restorePreviousPrincipalAfterServerInstallFailure();
        return { ok: false, reason: "A newer authentication operation has started." };
      }
      serverPrincipalPrepared = false;
      notifyAuthChange(authState.currentUser);
      queuePostAuthHydration(session);
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
    advanceAuthPrincipalEpoch();
    transitionCentralStatePrincipal(null);
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
    if (authSignOutPromise) {
      return authSignOutPromise;
    }
    const signOutOperation = (async () => {
      authLoginAttemptGeneration += 1;
      const shouldSignOutRemote = options.remote !== false && authState.supabase;
      const remoteScope = options.scope === "local" ? "local" : "global";
      authState.isSigningOut = true;
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
      } else {
        showLogin();
      }
      if (shouldSignOutRemote) {
        try {
          const { error } = await withTimeout(
            authState.supabase.auth.signOut({ scope: remoteScope }),
            5000,
            "Sign out took too long."
          );
          if (error) {
            console.warn("Sign out warning:", error);
          }
        } catch (error) {
          console.warn("Sign out failed:", error);
        }
      }
    })();
    authSignOutPromise = signOutOperation.finally(() => {
      authState.isSigningOut = false;
      if (authSignOutPromise) {
        authSignOutPromise = null;
      }
    });
    return authSignOutPromise;
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
    if (!user?.id || (!authState.devMode && !authState.session?.access_token)) {
      showLogin();
      return;
    }
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
    const readEpoch = authPrincipalEpoch;
    authSessionReadPromise = (async () => {
    try {
      const result = await withTimeout(authState.supabase.auth.getSession(), 8000, "Session lookup timed out.");
      return { ...(result || {}), authEpoch: readEpoch };
    } catch (error) {
      console.warn("Supabase session lookup failed; continuing with cached session.", error);
      return { data: { session: authState.session || null }, error: null, authEpoch: readEpoch };
    } finally {
      authSessionReadPromise = null;
    }
    })();
    return authSessionReadPromise;
  }
  async function hydrateFromExistingSession() {
    const requestedEpoch = authPrincipalEpoch;
    let sessionResult;
    try {
      sessionResult = await readSupabaseSession();
    } catch {
      return;
    }
    const { data, error, authEpoch } = sessionResult || {};
    if (authEpoch !== requestedEpoch || authPrincipalEpoch !== requestedEpoch) {
      return false;
    }
    if (error) {
      await signOut({ remote: false });
      return;
    }
    if (data?.session) {
      const hydratedUser = await hydrateCurrentUser(data.session, { waitForCentral: false, waitForProfile: true });
      if (!hydratedUser) {
        if (authPrincipalEpoch !== requestedEpoch && !isSessionTargetCurrent(data.session)) {
          return false;
        }
        rejectedAuthAccessTokens.add(String(data.session.access_token || ""));
        await signOut({ scope: "local" });
        return false;
      }
      const expiresAtMs = Number(data.session.expires_at || 0) * 1000;
      if (expiresAtMs && expiresAtMs - Date.now() < 60 * 1000) {
        refreshAccessToken().catch(() => null);
      }
      if (isPausedAccount(authState.currentUser)) {
        await signOut();
      }
      return true;
    }
    return false;
  }
  async function handleSignedOutAuthEvent(eventGeneration = authSessionEventGeneration) {
    if (authSignOutPromise || !authState.supabase) {
      return;
    }
    const authContext = captureAuthPrincipalContext();
    let sessionResult;
    try {
      sessionResult = await withTimeout(
        authState.supabase.auth.getSession(),
        8000,
        "Session verification timed out."
      );
    } catch {
      if (isAuthPrincipalContextCurrent(authContext) && eventGeneration === authSessionEventGeneration && !authSignOutPromise) {
        await signOut({ scope: "local" });
        showLogin();
      }
      return;
    }
    if (eventGeneration !== authSessionEventGeneration || authSignOutPromise) {
      return;
    }
    if (sessionResult?.error) {
      await signOut({ scope: "local" });
      showLogin();
      return;
    }
    const activeSdkSession = sessionResult?.data?.session || null;
    if (activeSdkSession?.access_token) {
      const sessionToken = String(activeSdkSession.access_token || "");
      if (rejectedAuthAccessTokens.has(sessionToken)) {
        await rejectInstalledSessionIfCurrent(sessionToken);
        if (!authState.currentUser?.id) {
          showLogin();
        }
        return;
      }
      const isEventCurrent = () =>
        eventGeneration === authSessionEventGeneration &&
        !isAuthSignOutActive() &&
        !rejectedAuthAccessTokens.has(sessionToken);
      const hydratedUser = await hydrateCurrentUser(activeSdkSession, {
        waitForCentral: false,
        waitForProfile: true,
        isOperationCurrent: isEventCurrent,
      });
      if (!isEventCurrent()) {
        return;
      }
      if (!hydratedUser || !isSessionTargetCurrent(activeSdkSession)) {
        rejectedAuthAccessTokens.add(sessionToken);
        await rejectInstalledSessionIfCurrent(sessionToken);
        showLogin();
        return;
      }
      showPlatform(hydratedUser);
      return;
    }
    if (!isAuthPrincipalContextCurrent(authContext)) {
      return;
    }
    await signOut({ remote: false });
  }
  async function handleAuthStateChange(event, session, eventGeneration) {
    if (eventGeneration !== authSessionEventGeneration) {
      return;
    }
    if (session) {
      const sessionToken = String(session.access_token || "");
      const eventEpoch = authPrincipalEpoch;
      if (isPendingServerSessionInstall(sessionToken) || authSignOutPromise) {
        return;
      }
      if (rejectedAuthSessionCleanup || rejectedAuthAccessTokens.has(sessionToken)) {
        const authoritativeResult = await readAuthoritativeSdkSession();
        if (authoritativeResult.ok && doAuthSessionsMatch(authoritativeResult.session, session)) {
          await rejectInstalledSessionIfCurrent(sessionToken);
          if (!authState.currentUser?.id) {
            showLogin();
          }
        }
        return;
      }
      if (authState.session?.access_token === session.access_token && authState.currentUser?.id) {
        queuePostAuthHydration(session);
        showPlatform(authState.currentUser);
        return;
      }
      const authoritativeResult = await readAuthoritativeSdkSession();
      if (eventGeneration !== authSessionEventGeneration || authSignOutPromise) {
        return;
      }
      if (!authoritativeResult.ok) {
        await signOut({ scope: "local" });
        showLogin();
        return;
      }
      if (!doAuthSessionsMatch(authoritativeResult.session, session)) {
        return;
      }
      const isEventCurrent = () =>
        eventGeneration === authSessionEventGeneration &&
        !isAuthSignOutActive();
      const hydratedUser = await hydrateCurrentUser(session, {
        waitForCentral: false,
        waitForProfile: true,
        isOperationCurrent: isEventCurrent,
      });
      if (!hydratedUser) {
        if (
          !isEventCurrent() ||
          (authPrincipalEpoch !== eventEpoch && !isSessionTargetCurrent(session))
        ) {
          return;
        }
        rejectedAuthAccessTokens.add(sessionToken);
        await signOut({ scope: "local" });
        showLogin();
        return;
      }
      if (!isEventCurrent() || !isSessionTargetCurrent(session)) {
        return;
      }
      showPlatform(hydratedUser);
      return;
    }
    if (event === "SIGNED_OUT") {
      await handleSignedOutAuthEvent(eventGeneration);
    }
  }
  function deferAuthStateChange(event, session) {
    const eventGeneration = ++authSessionEventGeneration;
    const task = new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    }).then(() => handleAuthStateChange(event, session, eventGeneration));
    window.__footballScienceLastAuthStateChangePromise = task;
    task.catch(async (error) => {
      if (eventGeneration !== authSessionEventGeneration || isAuthSignOutActive()) {
        return;
      }
      console.warn("Supabase auth event handling failed safely.", error);
      await signOut({ scope: "local" });
      showLogin();
    });
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
    authState.supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token && isPendingServerSessionInstall(session.access_token)) {
        return;
      }
      deferAuthStateChange(event, session);
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
      advanceAuthPrincipalEpoch();
      transitionCentralStatePrincipal(null);
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
  window.footballScienceCentralState={hydrate:hydrateCentralState,syncKey:syncCentralStateKey,isCentralKey:isCentralStateKey,isHydrated:()=>centralState.hydrated,canWriteKey:(key)=>authState.devMode||centralState.writeAccess?.[String(key||"")]===true,canAutoRetryKey:(key)=>authState.devMode||(!Object.prototype.hasOwnProperty.call(centralState.reconcileRequired,String(key||""))&&!Object.prototype.hasOwnProperty.call(centralState.autoRetryBlocked,String(key||""))),getCachedValue:getCentralCachedValue,setCachedValue:setCentralCachedValue,removeCachedValue:removeCentralCachedValue,getStatus:()=>({...centralState,principalEpoch:authPrincipalEpoch,reconcileRequired:{...centralState.reconcileRequired},autoRetryBlocked:{...centralState.autoRetryBlocked}})};
  window.footballScienceAudit={record:recordAuditEvent};
  window.footballScienceMedicalDatabase={record:recordMedicalDatabaseEvent};
  window.platformAuthReadyPromise=bootAuth();
})();
