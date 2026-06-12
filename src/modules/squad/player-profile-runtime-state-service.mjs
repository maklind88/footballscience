const defaultNow = () => new Date().toISOString();

export function createPlayerProfileRuntimeStateService(options = {}) {
  const win = options.win || globalThis;
  const getNow = typeof options.getNow === "function" ? options.getNow : defaultNow;
  const fetchFn = typeof options.fetchFn === "function" ? options.fetchFn : globalThis.fetch?.bind(globalThis);
  const getPlayerProfilesState = typeof options.getPlayerProfilesState === "function" ? options.getPlayerProfilesState : () => null;
  const setPlayerProfilesState = typeof options.setPlayerProfilesState === "function" ? options.setPlayerProfilesState : () => {};
  const getPlayerProfileAgeCacheState = typeof options.getPlayerProfileAgeCacheState === "function" ? options.getPlayerProfileAgeCacheState : () => null;
  const setPlayerProfileAgeCacheState = typeof options.setPlayerProfileAgeCacheState === "function" ? options.setPlayerProfileAgeCacheState : () => {};
  const getMedicalState = typeof options.getMedicalState === "function" ? options.getMedicalState : () => null;

  function readPlayerProfileAgeCache() {
    try {
      const raw = win.localStorage.getItem(options.playerProfileAgeCacheStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const sourcePlayers = parsed?.players && typeof parsed.players === "object" ? parsed.players : {};
      const players = Object.entries(sourcePlayers).reduce((result, [key, entry]) => {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return result;
        }
        const normalizedEntry = options.normalizePlayerProfileAgeCacheEntry(entry);
        if (normalizedEntry.signature || normalizedEntry.checkedAt || normalizedEntry.birthDate || normalizedEntry.age) {
          result[normalizedKey] = normalizedEntry;
        }
        return result;
      }, {});
      return {
        schemaVersion: "football-squad-age-cache-v1",
        players,
        updatedAt: String(parsed?.updatedAt || "").trim(),
      };
    } catch {
      return { schemaVersion: "football-squad-age-cache-v1", players: {}, updatedAt: "" };
    }
  }
  function ensurePlayerProfileAgeCache() {
    let cache = getPlayerProfileAgeCacheState();
    if (!cache) {
      cache = readPlayerProfileAgeCache();
      setPlayerProfileAgeCacheState(cache);
    }
    return cache;
  }
  function writePlayerProfileAgeCache(cache = getPlayerProfileAgeCacheState()) {
    if (!cache) {
      return;
    }
    const nextCache = {
      schemaVersion: "football-squad-age-cache-v1",
      players: cache.players && typeof cache.players === "object" ? cache.players : {},
      updatedAt: getNow(),
    };
    setPlayerProfileAgeCacheState(nextCache);
    try {
      win.localStorage.setItem(options.playerProfileAgeCacheStorageKey, JSON.stringify(nextCache));
    } catch {
      options.logEvent("Squad age cache could not be written to local storage.");
    }
  }
  function getPlayerProfileAgeCacheEntry(player = {}, cache = ensurePlayerProfileAgeCache()) {
    const key = options.getPlayerProfileAgeCacheKey(player);
    const entry = key ? cache.players?.[key] : null;
    if (!entry) {
      return null;
    }
    const signature = options.getPlayerProfileAgeLookupSignature(player);
    if (entry.signature && entry.signature !== signature) {
      return null;
    }
    return entry;
  }
  function getCurrentSquadActorLabel() {
    const user = options.getCurrentPlatformUser?.();
    const firstName = String(user?.firstName || user?.user_metadata?.firstName || "").trim();
    const lastName = String(user?.lastName || user?.user_metadata?.lastName || "").trim();
    const displayName = String(user?.name || user?.displayName || [firstName, lastName].filter(Boolean).join(" ")).trim();
    return displayName || String(user?.email || "Football Science").trim();
  }

  function recordPlayerProfileChange(type, player = {}, changes = [], recordOptions = {}) {
    const state = ensurePlayerProfilesState();
    const safeChanges = Array.isArray(changes) ? changes.filter(Boolean) : [];
    const summary = recordOptions.summary || options.getSquadChangeSummary(type, player, safeChanges);
    const entry = options.normalizePlayerProfileChangeLogEntry({
      id: options.createDashboardId("squad-change"),
      type,
      playerId: player?.id || recordOptions.playerId || "",
      playerName: player?.name || recordOptions.playerName || "",
      actor: recordOptions.actor || getCurrentSquadActorLabel(),
      summary,
      changes: safeChanges,
      createdAt: recordOptions.createdAt || getNow(),
    });
    state.changeLog = options.normalizePlayerProfileChangeLog([entry, ...(state.changeLog || [])]);
    setPlayerProfilesState(state);
  }
  function getPlayerProfileChangeLog(playerId = "") {
    const state = ensurePlayerProfilesState();
    return options.normalizePlayerProfileChangeLog(state.changeLog).filter((entry) => entry.playerId === playerId);
  }
  function getRecentPlayerProfileChangeLog(limit = 5) {
    const state = ensurePlayerProfilesState();
    return options.normalizePlayerProfileChangeLog(state.changeLog).slice(0, limit);
  }

  function normalizePlayerProfileRemovalName(value = "") {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function getPlayerProfileChangeTimestamp(entry = {}) {
    const timestamp = Date.parse(String(entry.createdAt || entry.updatedAt || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function getPlayerProfileRemovalIdentityKeys(state = {}) {
    const keys = new Set();
    options.normalizePlayerProfileRemovedIds(
      state.removedPlayerIds || state.deletedPlayerIds || state.removedIds
    ).forEach((id) => {
      keys.add(`id:${id}`);
    });

    const latestLifecycleByKey = new Map();
    options.normalizePlayerProfileChangeLog(state.changeLog || state.history || []).forEach((entry) => {
      const type = String(entry.type || "").trim();
      const isRemoval = ["player-removed", "player-deleted", "player-archived"].includes(type);
      const isRestore = ["player-added", "player-restored"].includes(type);
      if (!isRemoval && !isRestore) {
        return;
      }

      const identityKeys = [];
      const playerId = String(entry.playerId || "").trim();
      const playerName = normalizePlayerProfileRemovalName(entry.playerName);
      if (playerId) {
        identityKeys.push(`id:${playerId}`);
      }
      if (playerName) {
        identityKeys.push(`name:${playerName}`);
      }

      const timestamp = getPlayerProfileChangeTimestamp(entry);
      identityKeys.forEach((key) => {
        const current = latestLifecycleByKey.get(key);
        if (!current || timestamp >= current.timestamp) {
          latestLifecycleByKey.set(key, { type, timestamp });
        }
      });
    });

    latestLifecycleByKey.forEach((entry, key) => {
      if (["player-removed", "player-deleted", "player-archived"].includes(entry.type)) {
        keys.add(key);
      }
    });

    return keys;
  }

  function playerProfileMatchesRemovalIdentity(player = {}, identityKeys = new Set()) {
    const id = String(player.id || "").trim();
    const name = normalizePlayerProfileRemovalName(player.name || player.displayName);
    return Boolean((id && identityKeys.has(`id:${id}`)) || (name && identityKeys.has(`name:${name}`)));
  }

  function getPlayerProfileIdentityKeys(source = {}) {
    const keys = [];
    const id = String(source.id || source.playerId || "").trim();
    const name = normalizePlayerProfileRemovalName(source.name || source.playerName || source.displayName);
    if (id) {
      keys.push(`id:${id}`);
    }
    if (name) {
      keys.push(`name:${name}`);
    }
    return keys;
  }

  function getPlayerProfileRosterChangePath(change = {}) {
    const field = String(change.field || "").trim().toLowerCase();
    if (field === "roster type") {
      return "rosterType";
    }
    if (field === "temporary group") {
      return "temporaryGroup";
    }
    if (field === "temporary from") {
      return "temporaryFrom";
    }
    if (field === "temporary to") {
      return "temporaryTo";
    }
    return "";
  }

  function normalizePlayerProfileRosterChangeValue(path = "", value = "") {
    if (path === "rosterType") {
      return options.normalizePlayerProfileRosterType?.(value, "") || "";
    }
    const cleanValue = String(value || "").trim();
    return cleanValue === "-" ? "" : cleanValue;
  }

  function restorePlayerProfileRosterFieldsFromChangeLog(source = {}, player = {}) {
    const playerKeys = new Set(getPlayerProfileIdentityKeys(player));
    if (!playerKeys.size) {
      return player;
    }

    const latestRosterChanges = new Map();
    options.normalizePlayerProfileChangeLog(source.changeLog || source.history || []).forEach((entry) => {
      const entryKeys = getPlayerProfileIdentityKeys(entry);
      if (!entryKeys.some((key) => playerKeys.has(key))) {
        return;
      }

      const timestamp = getPlayerProfileChangeTimestamp(entry);
      (Array.isArray(entry.changes) ? entry.changes : []).forEach((change) => {
        const path = getPlayerProfileRosterChangePath(change);
        if (!path) {
          return;
        }
        const value = normalizePlayerProfileRosterChangeValue(path, change.to);
        if (path === "rosterType" && !value) {
          return;
        }
        const current = latestRosterChanges.get(path);
        if (!current || timestamp >= current.timestamp) {
          latestRosterChanges.set(path, { value, timestamp });
        }
      });
    });

    if (!latestRosterChanges.size) {
      return player;
    }

    const restoredPlayer = { ...player };
    latestRosterChanges.forEach((entry, path) => {
      restoredPlayer[path] = entry.value;
    });
    if (latestRosterChanges.has("rosterType")) {
      restoredPlayer.countsInSquad = options.playerProfileRosterTypeCountsInSquad?.(restoredPlayer.rosterType) !== false;
    }
    return restoredPlayer;
  }

  function clonePlayerProfilesState(source = {}) {
    const removedPlayerIds = options.normalizePlayerProfileRemovedIds(
      source.removedPlayerIds || source.deletedPlayerIds || source.removedIds
    );
    const removedPlayerIdSet = new Set(removedPlayerIds);
    const removedPlayerIdentityKeys = getPlayerProfileRemovalIdentityKeys(source);
    const seededPlayers = options.defaultMedicalPlayers.map((player) =>
      options.normalizePlayerProfile({
        ...player,
        primaryRole: options.getDefaultPlayerProfileRole(player),
        roleGroup: options.getPlayerProfileRoleGroupForRole(options.getDefaultPlayerProfileRole(player), player.position),
      })
    );
    const incomingPlayers = Array.isArray(source.players)
      ? source.players
        .map((player) => restorePlayerProfileRosterFieldsFromChangeLog(source, player))
        .map(options.normalizePlayerProfile)
        .filter(Boolean)
      : [];
    const playersById = new Map();
    seededPlayers.filter(Boolean).forEach((player) => {
      if (removedPlayerIdSet.has(player.id) || playerProfileMatchesRemovalIdentity(player, removedPlayerIdentityKeys)) {
        return;
      }
      playersById.set(player.id, player);
    });
    incomingPlayers.forEach((player) => {
      if (removedPlayerIdSet.has(player.id) || playerProfileMatchesRemovalIdentity(player, removedPlayerIdentityKeys)) {
        return;
      }
      const seededPlayer = playersById.get(player.id);
      playersById.set(player.id, seededPlayer ? { ...seededPlayer, ...player } : player);
    });
    const players = Array.from(playersById.values()).sort(options.comparePlayerProfiles);
    const selectedPlayerId = players.some((player) => player.id === source.selectedPlayerId)
      ? source.selectedPlayerId
      : players[0]?.id || "";
    return {
      selectedPlayerId,
      players,
      removedPlayerIds,
      rosterVersion: source.rosterVersion || options.playerProfilesDefaultRosterVersion,
      changeLog: options.normalizePlayerProfileChangeLog(source.changeLog || source.history || []),
      schemaVersion: options.playerProfilesSchemaVersion,
      updatedAt: source.updatedAt || getNow(),
    };
  }

  function buildPlayerProfileFromMedicalTrainingGuest(medicalPlayer = {}) {
    const rosterType = options.getTemporaryRosterTypeFromPlayerSource(medicalPlayer);
    return options.normalizePlayerProfile({
      ...medicalPlayer,
      rosterType,
      countsInSquad: false,
      temporaryGroup: medicalPlayer.temporaryGroup || medicalPlayer.subGroup || medicalPlayer.trainingGroup || options.getPlayerProfileRosterTypeOption(rosterType).shortLabel,
      temporaryFrom: medicalPlayer.temporaryFrom || medicalPlayer.startDate,
      temporaryTo: medicalPlayer.temporaryTo || medicalPlayer.endDate,
    });
  }

  function syncPlayerProfilesFromMedicalTrainingGuests(syncOptions = {}) {
    const state = getPlayerProfilesState();
    if (!state) {
      return false;
    }
    options.ensureMedicalState();
    const medicalState = getMedicalState();
    const medicalPlayers = Array.isArray(medicalState?.players) ? medicalState.players : [];
    const removedPlayerIdSet = new Set(options.normalizePlayerProfileRemovedIds(state.removedPlayerIds));
    const existingIdentityKeys = new Set();
    (Array.isArray(state.players) ? state.players : []).forEach((player) => {
      options.getPlayerProfileSyncIdentityKeys(player).forEach((key) => existingIdentityKeys.add(key));
    });
    const importedProfiles = [];
    medicalPlayers
      .filter((player) => player && !options.isMedicalItemArchived(player))
      .filter(options.isTemporaryPlayerProfile)
      .forEach((medicalPlayer) => {
        const identityKeys = options.getPlayerProfileSyncIdentityKeys(medicalPlayer);
        const playerId = String(medicalPlayer.id || "").trim();
        if ((playerId && removedPlayerIdSet.has(playerId)) || identityKeys.some((key) => existingIdentityKeys.has(key))) {
          return;
        }
        const profile = buildPlayerProfileFromMedicalTrainingGuest(medicalPlayer);
        if (!profile || options.playerProfileCountsInSquad(profile)) {
          return;
        }
        importedProfiles.push(profile);
        options.getPlayerProfileSyncIdentityKeys(profile).forEach((key) => existingIdentityKeys.add(key));
      });
    if (!importedProfiles.length) {
      return false;
    }
    state.players = [...state.players, ...importedProfiles].sort(options.comparePlayerProfiles);
    if (!state.selectedPlayerId && state.players[0]) {
      state.selectedPlayerId = state.players[0].id;
    }
    setPlayerProfilesState(state);
    if (syncOptions.persist !== false) {
      writePlayerProfilesState();
    }
    return true;
  }
  function readPlayerProfilesState() {
    try {
      const raw = win.localStorage.getItem(options.playerProfilesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const state = clonePlayerProfilesState(parsed);
      if (!raw || parsed?.schemaVersion !== options.playerProfilesSchemaVersion) {
        options.rawDataSafetySetItem(options.playerProfilesStorageKey, JSON.stringify(state));
      }
      return state;
    } catch {
      const state = clonePlayerProfilesState({});
      try {
        options.rawDataSafetySetItem(options.playerProfilesStorageKey, JSON.stringify(state));
      } catch {
        options.logEvent("Player Profiles data could not be written to local storage.");
      }
      return state;
    }
  }
  function writePlayerProfilesState() {
    const state = getPlayerProfilesState();
    if (!state) {
      return;
    }
    try {
      const removedPlayerIdSet = new Set(options.normalizePlayerProfileRemovedIds(state.removedPlayerIds));
      const removedPlayerIdentityKeys = getPlayerProfileRemovalIdentityKeys(state);
      state.removedPlayerIds = Array.from(removedPlayerIdSet);
      state.players = (Array.isArray(state.players) ? state.players : [])
        .filter((player) => !removedPlayerIdSet.has(player?.id) && !playerProfileMatchesRemovalIdentity(player, removedPlayerIdentityKeys));
      state.updatedAt = getNow();
      setPlayerProfilesState(state);
      win.localStorage.setItem(options.playerProfilesStorageKey, JSON.stringify(state));
    } catch {
      options.logEvent("Player Profiles data could not be written to local storage.");
    }
  }

  function getPlayerProfileAgeHydrationCandidates(players = []) {
    const cache = ensurePlayerProfileAgeCache();
    const seenKeys = new Set();
    return (Array.isArray(players) ? players : [])
      .filter((player) => player?.id && player?.name)
      .filter((player) => {
        if (options.getPlayerProfileBirthDateValue(player)) {
          return false;
        }
        const cacheKey = options.getPlayerProfileAgeCacheKey(player);
        if (!cacheKey || seenKeys.has(cacheKey)) {
          return false;
        }
        const cachedEntry = getPlayerProfileAgeCacheEntry(player, cache);
        if (cachedEntry?.birthDate || cachedEntry?.birthDateCheckedAt || (cachedEntry?.checkedAt && !cachedEntry?.age)) {
          return false;
        }
        seenKeys.add(cacheKey);
        return true;
      })
      .map((player) => ({
        profileId: player.id,
        cacheKey: options.getPlayerProfileAgeCacheKey(player),
        signature: options.getPlayerProfileAgeLookupSignature(player),
        name: player.name,
        number: player.number,
        position: player.position,
      }));
  }

  function buildPlayerProfileAgeHydrationPayload(candidates = []) {
    const user = options.getCurrentPlatformUser();
    const platformStructure = options.getPlatformStructureState();
    const squadTeam = options.getPlatformTeamDisplayTeam(user, platformStructure);
    const teamName = squadTeam?.name || options.getPlatformTeamDisplayName(user, platformStructure);
    return {
      schemaVersion: "football-squad-age-hydration-request-v1",
      team: {
        id: squadTeam?.id || user?.teamId || "",
        name: teamName,
        clubId: squadTeam?.clubId || user?.clubId || "",
        clubName: user?.clubName || user?.club || "",
      },
      players: candidates.map((candidate) => ({
        profileId: candidate.profileId,
        name: candidate.name,
        number: candidate.number,
        position: candidate.position,
      })),
    };
  }

  function mergePlayerProfileAgeHydrationResult(candidates = [], payload = {}) {
    const cache = ensurePlayerProfileAgeCache();
    const now = getNow();
    const candidatesByProfileId = new Map(candidates.map((candidate) => [candidate.profileId, candidate]));
    candidates.forEach((candidate) => {
      if (!candidate.cacheKey) {
        return;
      }
      cache.players[candidate.cacheKey] = {
        ...(cache.players[candidate.cacheKey] || {}),
        signature: candidate.signature,
        checkedAt: now,
        birthDateCheckedAt: now,
        source: "squad_players",
      };
    });
    const hydratedPlayers = Array.isArray(payload?.players) ? payload.players : [];
    hydratedPlayers.forEach((entry) => {
      const profileId = String(entry?.profileId || "").trim();
      const candidate = candidatesByProfileId.get(profileId);
      if (!candidate?.cacheKey) {
        return;
      }
      const birthDate = options.normalizePlayerProfileBirthDate(entry.birthDate || entry.dateOfBirth || entry.date_of_birth);
      const age = options.normalizePlayerProfileAgeValue(entry.age);
      if (!birthDate && !age) {
        return;
      }
      cache.players[candidate.cacheKey] = {
        signature: candidate.signature,
        birthDate,
        age,
        databasePlayerId: String(entry.databasePlayerId || entry.playerId || "").trim(),
        source: String(entry.source || "squad_players").trim(),
        checkedAt: now,
        birthDateCheckedAt: now,
      };
    });
    writePlayerProfileAgeCache(cache);
    return hydratedPlayers.length > 0;
  }

  async function hydratePlayerProfileAgesOnce() {
    if (options.getPlayerProfileAgeHydrationPending() || options.getHubState()?.activeWorkspaceId !== "player-profiles") {
      return;
    }
    const state = ensurePlayerProfilesState();
    const candidates = getPlayerProfileAgeHydrationCandidates(state.players);
    if (!candidates.length) {
      return;
    }
    const fingerprint = candidates.map((candidate) => `${candidate.cacheKey}:${candidate.signature}`).join(";");
    if (fingerprint && fingerprint === options.getPlayerProfileAgeHydrationLastFingerprint()) {
      return;
    }
    options.setPlayerProfileAgeHydrationLastFingerprint(fingerprint);
    options.setPlayerProfileAgeHydrationPending(true);
    try {
      const token = await options.getPlatformApiAccessToken();
      if (!token) {
        options.setPlayerProfileAgeHydrationLastFingerprint("");
        return;
      }
      const response = await fetchFn("/api/squad-ages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPlayerProfileAgeHydrationPayload(candidates)),
      });
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = {};
        }
      }
      if (!response.ok || payload?.ok === false) {
        options.setPlayerProfileAgeHydrationLastFingerprint("");
        return;
      }
      const didHydrate = mergePlayerProfileAgeHydrationResult(candidates, payload);
      if (didHydrate && options.getHubState()?.activeWorkspaceId === "player-profiles") {
        options.renderPlayerProfilesRosterListOnly();
      }
    } catch {
      options.setPlayerProfileAgeHydrationLastFingerprint("");
    } finally {
      options.setPlayerProfileAgeHydrationPending(false);
    }
  }

  function queuePlayerProfileAgeHydration() {
    win.clearTimeout(options.getPlayerProfileAgeHydrationTimer());
    const timer = win.setTimeout(() => {
      options.setPlayerProfileAgeHydrationTimer(0);
      hydratePlayerProfileAgesOnce();
    }, 80);
    options.setPlayerProfileAgeHydrationTimer(timer);
  }
  function ensurePlayerProfilesState() {
    let state = getPlayerProfilesState();
    if (!state) {
      state = readPlayerProfilesState();
      setPlayerProfilesState(state);
    }
    return state;
  }

  function canEditPlayerProfiles() {
    return options.canCurrentUserEditWorkspace("player-profiles");
  }

  function getPlayerProfilesAccessLabel() {
    if (canEditPlayerProfiles()) {
      return options.isCurrentPlatformUserAdmin() ? "Admin edit access" : "Coach edit access";
    }
    return "Read only";
  }

  function getSelectedPlayerProfile() {
    const state = ensurePlayerProfilesState();
    return (
      state.players.find((player) => player.id === state.selectedPlayerId) ??
      state.players[0] ??
      null
    );
  }

  function openPlayerProfileModal(playerId) {
    const state = ensurePlayerProfilesState();
    if (!state.players.some((player) => player.id === playerId)) {
      return;
    }
    state.selectedPlayerId = playerId;
    setPlayerProfilesState(state);
    options.setPlayerProfileModalOpen(true);
    options.setPlayerProfileNewPlayerModalOpen(false);
    writePlayerProfilesState();
    options.renderPlayerProfilesWorkspace();
    options.setPlayerProfileAutosaveLastSignature(
      options.getPlayerProfileFormSignature(options.getPlayerProfilesWorkspace()?.querySelector("#playerProfileEditForm"))
    );
  }

  function closePlayerProfileModal() {
    if (!options.getPlayerProfileModalOpen()) {
      return;
    }
    options.flushPlayerProfileAutosave();
    options.setPlayerProfileModalOpen(false);
    options.renderPlayerProfilesWorkspace();
  }

  function openPlayerProfileNewPlayerModal() {
    if (!canEditPlayerProfiles()) {
      return;
    }
    options.setPlayerProfileModalOpen(false);
    options.setPlayerProfileNewPlayerModalOpen(true);
    options.renderPlayerProfilesWorkspace();
  }

  function closePlayerProfileNewPlayerModal() {
    if (!options.getPlayerProfileNewPlayerModalOpen()) {
      return;
    }
    options.setPlayerProfileNewPlayerModalOpen(false);
    options.renderPlayerProfilesWorkspace();
  }

  return {
    buildPlayerProfileAgeHydrationPayload,
    buildPlayerProfileFromMedicalTrainingGuest,
    canEditPlayerProfiles,
    clonePlayerProfilesState,
    closePlayerProfileModal,
    closePlayerProfileNewPlayerModal,
    ensurePlayerProfileAgeCache,
    ensurePlayerProfilesState,
    getCurrentSquadActorLabel,
    getPlayerProfileAgeCacheEntry,
    getPlayerProfileAgeHydrationCandidates,
    getPlayerProfileChangeLog,
    getPlayerProfilesAccessLabel,
    getRecentPlayerProfileChangeLog,
    getSelectedPlayerProfile,
    hydratePlayerProfileAgesOnce,
    mergePlayerProfileAgeHydrationResult,
    openPlayerProfileModal,
    openPlayerProfileNewPlayerModal,
    queuePlayerProfileAgeHydration,
    readPlayerProfileAgeCache,
    readPlayerProfilesState,
    recordPlayerProfileChange,
    syncPlayerProfilesFromMedicalTrainingGuests,
    writePlayerProfileAgeCache,
    writePlayerProfilesState,
  };
}
