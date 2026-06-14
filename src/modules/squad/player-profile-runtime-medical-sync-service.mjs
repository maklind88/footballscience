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

  function getMedicalRemovedSquadPlayerIdSet() {
    try {
      const profileState = options.ensurePlayerProfilesState();
      return new Set(options.normalizePlayerProfileRemovedIds(profileState?.removedPlayerIds));
    } catch {
      return new Set();
    }
  }

  function normalizeRosterVersion(value) {
    return String(value ?? "").trim();
  }

  function hasSharedRosterContext(profileState = null, medicalState = getMedicalState()) {
    const medicalRosterVersion = normalizeRosterVersion(medicalState?.rosterVersion);
    const profileRosterVersion = normalizeRosterVersion(profileState?.rosterVersion);
    if (!medicalRosterVersion || !profileRosterVersion) {
      return true;
    }
    return medicalRosterVersion === profileRosterVersion;
  }

  function getActiveSquadProfiles() {
    try {
      const profileState = options.ensurePlayerProfilesState();
      if (!hasSharedRosterContext(profileState)) {
        return [];
      }
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

  function hasActiveSquadProfileMatch(player = {}) {
    const identity = getMedicalPlayerProfileIdentity(player);
    const activeProfiles = getActiveSquadProfiles();
    if (!activeProfiles.length || !identity.name) {
      return true;
    }
    if (identity.id && activeProfiles.some((profile) => getMedicalPlayerProfileIdentity(profile).id === identity.id)) {
      return true;
    }
    const nameMatches = activeProfiles.filter((profile) => getMedicalPlayerProfileIdentity(profile).name === identity.name);
    if (!nameMatches.length) {
      return false;
    }
    if (identity.number) {
      return nameMatches.some((profile) => getMedicalPlayerProfileIdentity(profile).number === identity.number);
    }
    return nameMatches.length === 1;
  }

  function isMedicalPlayerRemovedFromSquad(player = {}, removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet()) {
    const identity = getMedicalPlayerProfileIdentity(player);
    if (identity.id && removedPlayerIdSet.has(identity.id)) {
      return true;
    }
    if (!hasActiveSquadProfileMatch(player)) {
      return true;
    }
    return false;
  }

  function archiveMedicalPlayersRemovedFromSquad(archiveOptions = {}) {
    const medicalState = getMedicalState();
    if (!medicalState || !Array.isArray(medicalState.players)) {
      return [];
    }
    const previousSelectedPlayerId = String(medicalState.selectedPlayerId || "").trim();
    const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet();
    const activeSquadProfiles = getActiveSquadProfiles();
    if (!removedPlayerIdSet.size && !activeSquadProfiles.length) {
      return [];
    }
    const activeRemovedPlayers = medicalState.players.filter((player) => {
      if (options.isMedicalItemArchived(player)) {
        return false;
      }
      if (isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)) {
        return true;
      }
      return !hasActiveSquadProfileMatch(player);
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
      (player) => !options.isMedicalItemArchived(player) && !isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)
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
