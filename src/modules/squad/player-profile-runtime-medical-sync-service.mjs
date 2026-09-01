const defaultNow = () => new Date().toISOString();

export function createPlayerProfileRuntimeMedicalSyncService(options = {}) {
  const getNow = typeof options.getNow === "function" ? options.getNow : defaultNow;
  const getMedicalState = typeof options.getMedicalState === "function" ? options.getMedicalState : () => null;
  const setMedicalState = typeof options.setMedicalState === "function" ? options.setMedicalState : () => {};

  function buildMedicalPlayerFromPlayerProfile(player = {}) {
    const now = getNow();
    const createdAt = String(player.createdAt || "").trim() || now;
    const updatedAt = String(player.updatedAt || "").trim() || now;
    return options.normalizeMedicalPlayer({
      id: player.id || options.createDashboardId("medical-player"),
      name: player.name,
      number: player.number,
      position: player.position,
      status: player.status,
      primaryRole: player.primaryRole,
      secondaryRoles: player.secondaryRoles,
      roleGroup: player.roleGroup,
      photoUrl: player.photoUrl,
      sourceUrl: player.sourceUrl,
      rosterType: player.rosterType,
      countsInSquad: player.countsInSquad,
      temporaryGroup: player.temporaryGroup,
      temporaryFrom: player.temporaryFrom,
      temporaryTo: player.temporaryTo,
      rosterOrder: player.rosterOrder,
      createdAt,
      updatedAt,
    });
  }

  function syncMedicalPlayersFromPlayerProfiles(players = []) {
    if (!Array.isArray(players) || !players.length) {
      return;
    }
    const medicalPlayers = players
      .map(buildMedicalPlayerFromPlayerProfile)
      .filter((player) => player && player.id && player.name);
    if (!medicalPlayers.length) {
      return;
    }
    options.upsertMedicalPlayers(medicalPlayers);
  }

  function getMedicalPlayersMatchingPlayerProfile(playerProfile = {}) {
    options.ensureMedicalState();
    const medicalState = getMedicalState();
    const targetId = String(playerProfile.id || playerProfile.playerId || playerProfile.profileId || "").trim();
    const targetName = options.normalizePlayerProfileName(playerProfile.name || playerProfile.displayName || "");
    const targetNumber = String(playerProfile.number || playerProfile.shirtNumber || playerProfile.shirt_number || "").trim().toLowerCase();
    const activePlayers = medicalState.players.filter((player) => !options.isMedicalItemArchived(player));
    const matchesById = new Map();
    activePlayers.forEach((medicalPlayer) => {
      const medicalId = String(medicalPlayer.id || medicalPlayer.playerId || medicalPlayer.profileId || "").trim();
      const medicalName = options.normalizePlayerProfileName(medicalPlayer.name || medicalPlayer.displayName || "");
      const medicalNumber = String(medicalPlayer.number || medicalPlayer.shirtNumber || medicalPlayer.shirt_number || "").trim().toLowerCase();
      if (targetId && medicalId === targetId) {
        matchesById.set(medicalPlayer.id, medicalPlayer);
        return;
      }
      if (targetName && targetNumber && medicalName === targetName && medicalNumber === targetNumber) {
        matchesById.set(medicalPlayer.id, medicalPlayer);
      }
    });
    if (matchesById.size || !targetName || targetNumber) {
      return Array.from(matchesById.values());
    }
    const nameMatches = activePlayers.filter((medicalPlayer) => options.normalizePlayerProfileName(medicalPlayer.name || medicalPlayer.displayName || "") === targetName);
    return nameMatches.length === 1 ? nameMatches : [];
  }

  function getPlayerProfilesStateForMedicalSync() {
    try {
      return options.ensurePlayerProfilesState();
    } catch {
      return null;
    }
  }

  function getMedicalRemovedSquadPlayerIdSet(profileState = getPlayerProfilesStateForMedicalSync()) {
    try {
      return new Set(options.normalizePlayerProfileRemovedIds(profileState?.removedPlayerIds));
    } catch {
      return new Set();
    }
  }

  function getRemovedSquadPlayerNames(
    profileState = getPlayerProfilesStateForMedicalSync(),
    removedIds = getMedicalRemovedSquadPlayerIdSet(profileState)
  ) {
    try {
      const names = new Set();
      (Array.isArray(profileState?.players) ? profileState.players : []).forEach((player) => {
        const id = String(player?.id || "").trim();
        const name = options.normalizePlayerProfileName(player?.name || player?.displayName || "");
        if (id && removedIds.has(id) && name) {
          names.add(name);
        }
      });
      (Array.isArray(profileState?.changeLog) ? profileState.changeLog : []).forEach((entry) => {
        const type = String(entry?.type || "").trim();
        if (!type.includes("removed")) {
          return;
        }
        const name = options.normalizePlayerProfileName(entry?.playerName || entry?.name || entry?.displayName || "");
        if (name) {
          names.add(name);
        }
      });
      return names;
    } catch {
      return new Set();
    }
  }

  function getActiveSquadProfiles(profileState = getPlayerProfilesStateForMedicalSync()) {
    try {
      return (Array.isArray(profileState?.players) ? profileState.players : [])
        .filter((player) => !options.isMedicalItemArchived(player))
        .filter((player) => player.countsInSquad !== false && String(player.rosterType || "squad").trim() === "squad");
    } catch {
      return [];
    }
  }

  function getMedicalPlayerProfileIdentity(player = {}) {
    const id = String(player?.id || player?.playerId || player?.profileId || "").trim();
    const name = options.normalizePlayerProfileName(player?.name || player?.displayName || "");
    const number = String(player?.number || player?.shirtNumber || player?.shirt_number || "").trim().toLowerCase();
    return { id, name, number };
  }

  function buildActiveSquadProfileIdentityIndex(activeProfiles = []) {
    const ids = new Set();
    const profilesByName = new Map();
    activeProfiles.forEach((profile) => {
      const identity = getMedicalPlayerProfileIdentity(profile);
      if (identity.id) {
        ids.add(identity.id);
      }
      if (!identity.name) {
        return;
      }
      const matches = profilesByName.get(identity.name) || [];
      matches.push(identity);
      profilesByName.set(identity.name, matches);
    });
    return { ids, profilesByName };
  }

  function isTemporaryMedicalPlayer(player = {}) {
    const rosterType = String(player?.rosterType || "").trim().toLowerCase();
    return Boolean(rosterType && rosterType !== "squad");
  }

  function hasActiveSquadProfileMatch(player = {}, context = {}) {
    if (isTemporaryMedicalPlayer(player)) {
      return true;
    }
    const identity = getMedicalPlayerProfileIdentity(player);
    const profileState = context.profileState || getPlayerProfilesStateForMedicalSync();
    const activeProfiles = Array.isArray(context.activeProfiles) ? context.activeProfiles : getActiveSquadProfiles(profileState);
    const identityIndex = context.identityIndex || buildActiveSquadProfileIdentityIndex(activeProfiles);
    if (!activeProfiles.length || !identity.name) {
      return true;
    }
    if (identity.id && identityIndex.ids.has(identity.id)) {
      return true;
    }
    const nameMatches = identityIndex.profilesByName.get(identity.name) || [];
    if (!nameMatches.length) {
      return false;
    }
    if (
      identity.number &&
      nameMatches.some((profile) => getMedicalPlayerProfileIdentity(profile).number === identity.number)
    ) {
      return true;
    }
    return nameMatches.length === 1;
  }

  function isMedicalPlayerRemovedFromSquad(player = {}, removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet(), context = {}) {
    if (isTemporaryMedicalPlayer(player)) {
      return false;
    }
    const profileState = context.profileState || getPlayerProfilesStateForMedicalSync();
    const removedNames = context.removedNames || getRemovedSquadPlayerNames(profileState, removedPlayerIdSet);
    const identity = getMedicalPlayerProfileIdentity(player);
    const activeProfiles = Array.isArray(context.activeProfiles)
      ? context.activeProfiles
      : getActiveSquadProfiles(profileState);
    const activeProfileMatch = hasActiveSquadProfileMatch(
      player,
      context.profileState
        ? { ...context, activeProfiles }
        : { ...context, profileState, activeProfiles }
    );
    if (identity.name && activeProfiles.length && activeProfileMatch) {
      return false;
    }
    if (identity.id && removedPlayerIdSet.has(identity.id)) {
      return true;
    }
    if (identity.name && removedNames.has(identity.name)) {
      return true;
    }
    return activeProfiles.length > 0;
  }

  function archiveMedicalPlayersRemovedFromSquad(archiveOptions = {}) {
    const medicalState = getMedicalState();
    if (!medicalState || !Array.isArray(medicalState.players)) {
      return [];
    }
    const previousSelectedPlayerId = String(medicalState.selectedPlayerId || "").trim();
    const profileState = getPlayerProfilesStateForMedicalSync();
    const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet(profileState);
    const removedNames = getRemovedSquadPlayerNames(profileState, removedPlayerIdSet);
    const activeSquadProfiles = getActiveSquadProfiles(profileState);
    const hasRemovalAuthority = Boolean(removedPlayerIdSet.size || removedNames.size);
    const hasRosterAuthority = Boolean(activeSquadProfiles.length);
    if (!hasRemovalAuthority && (!activeSquadProfiles.length || !hasRosterAuthority)) {
      return [];
    }
    const syncContext = {
      profileState,
      removedNames,
      activeProfiles: activeSquadProfiles,
      identityIndex: buildActiveSquadProfileIdentityIndex(activeSquadProfiles),
    };
    const activeRemovedPlayers = medicalState.players.filter((player) => {
      if (options.isMedicalItemArchived(player)) {
        return false;
      }
      if (isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet, syncContext)) {
        return true;
      }
      return hasRosterAuthority && !hasActiveSquadProfileMatch(player, syncContext);
    });
    if (!activeRemovedPlayers.length) {
      return [];
    }
    const archivedAt = getNow();
    const archivedBy = options.getCurrentMedicalActorId();
    const archivedIds = new Set(activeRemovedPlayers.map((player) => String(player.id || "").trim()).filter(Boolean));
    const archivedPlayers = [];
    medicalState.players = medicalState.players.map((player) => {
      if (!archivedIds.has(String(player.id || "").trim()) || options.isMedicalItemArchived(player)) {
        return player;
      }
      const archivedPlayer = options.normalizeMedicalPlayer({
        ...player,
        updatedAt: archivedAt,
        archivedAt,
        archivedBy,
        archiveReason: "Removed from Squad Room",
      });
      if (archivedPlayer) {
        archivedPlayers.push(archivedPlayer);
        return archivedPlayer;
      }
      return player;
    });
    medicalState.records = medicalState.records.map((record) =>
      archivedIds.has(String(record.playerId || "").trim()) && !options.isMedicalItemArchived(record)
        ? options.normalizeMedicalRecord({
            ...record,
            updatedAt: archivedAt,
            archivedAt,
            archivedBy,
            archiveReason: "Player removed from Squad Room",
          }) || record
        : record
    );
    medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
      archivedIds.has(String(plan.playerId || "").trim()) && !options.isMedicalItemArchived(plan)
        ? options.normalizeMedicalInjuryPlan({
            ...plan,
            updatedAt: archivedAt,
            archivedAt,
            archivedBy,
            archiveReason: "Player removed from Squad Room",
          }) || plan
        : plan
    );
    const nextActivePlayers = medicalState.players.filter(
      (player) => !options.isMedicalItemArchived(player) && !isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet, syncContext)
    );
    medicalState.selectedPlayerId =
      nextActivePlayers.find((player) => player.id === previousSelectedPlayerId)?.id ||
      nextActivePlayers[0]?.id ||
      "";
    setMedicalState(medicalState);
    if (archiveOptions.persist !== false && options.canViewPrivateMedicalDetails()) {
      options.writeMedicalState();
    }
    return archivedPlayers;
  }

  function archiveMedicalPlayersForRemovedPlayerProfile(playerProfile = {}) {
    const matchingPlayers = getMedicalPlayersMatchingPlayerProfile(playerProfile);
    if (!matchingPlayers.length) {
      return [];
    }
    const medicalState = getMedicalState();
    const archivedAt = getNow();
    const matchingPlayerIds = new Set(matchingPlayers.map((player) => String(player.id || "").trim()).filter(Boolean));
    const archivedPlayers = [];
    medicalState.players = medicalState.players.map((medicalPlayer) => {
      if (!matchingPlayerIds.has(String(medicalPlayer.id || "").trim()) || options.isMedicalItemArchived(medicalPlayer)) {
        return medicalPlayer;
      }
      const archivedPlayer = options.normalizeMedicalPlayer({
        ...medicalPlayer,
        updatedAt: archivedAt,
        archivedAt,
        archivedBy: options.getCurrentMedicalActorId(),
        archiveReason: "Removed from Squad Room",
      });
      if (archivedPlayer) {
        archivedPlayers.push(archivedPlayer);
        return archivedPlayer;
      }
      return medicalPlayer;
    });
    medicalState.records = medicalState.records.map((record) =>
      matchingPlayerIds.has(String(record.playerId || "").trim()) && !options.isMedicalItemArchived(record)
        ? options.normalizeMedicalRecord({
            ...record,
            updatedAt: archivedAt,
            archivedAt,
            archivedBy: options.getCurrentMedicalActorId(),
            archiveReason: "Player removed from Squad Room",
          }) || record
        : record
    );
    medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
      matchingPlayerIds.has(String(plan.playerId || "").trim()) && !options.isMedicalItemArchived(plan)
        ? options.normalizeMedicalInjuryPlan({
            ...plan,
            updatedAt: archivedAt,
            archivedAt,
            archivedBy: options.getCurrentMedicalActorId(),
            archiveReason: "Player removed from Squad Room",
          }) || plan
        : plan
    );
    medicalState.selectedPlayerId = options.getActiveMedicalPlayers()[0]?.id || "";
    setMedicalState(medicalState);
    options.commitMedicalClinicalState(
      "player-removed-from-squad",
      `${archivedPlayers.map((player) => player.name).join(", ")} archived after Squad Room removal.`
    );
    return archivedPlayers;
  }

  return {
    archiveMedicalPlayersForRemovedPlayerProfile,
    archiveMedicalPlayersRemovedFromSquad,
    buildMedicalPlayerFromPlayerProfile,
    getMedicalPlayersMatchingPlayerProfile,
    getMedicalRemovedSquadPlayerIdSet,
    isMedicalPlayerRemovedFromSquad,
    syncMedicalPlayersFromPlayerProfiles,
  };
}
