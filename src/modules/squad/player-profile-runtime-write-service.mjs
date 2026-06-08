const defaultNow = () => new Date().toISOString();

export function createPlayerProfileRuntimeWriteService(options = {}) {
  const getNow = typeof options.getNow === "function" ? options.getNow : defaultNow;
  const getPlayerProfilesState = typeof options.getPlayerProfilesState === "function" ? options.getPlayerProfilesState : () => null;
  const setPlayerProfilesState = typeof options.setPlayerProfilesState === "function" ? options.setPlayerProfilesState : () => {};

  function addPlayerProfile(values = {}) {
    const state = options.ensurePlayerProfilesState();
    const roleGroup = options.getPlayerProfileRoleGroupForRole(values.primaryRole, values.position);
    const result = options.validatePlayerProfileFormValues(
      { ...values, roleGroup },
      { existingPlayers: state.players }
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status || "error",
        errors: result.errors,
        warnings: result.warnings,
        duplicates: result.duplicates,
        player: null,
      };
    }
    const player = result.player;
    if (!player) {
      return {
        ok: false,
        status: "error",
        errors: ["Player could not be normalized."],
        warnings: [],
        duplicates: [],
        player: null,
      };
    }
    state.removedPlayerIds = options.normalizePlayerProfileRemovedIds(state.removedPlayerIds)
      .filter((removedPlayerId) => removedPlayerId !== player.id);
    state.players = [...state.players, player].sort(options.comparePlayerProfiles);
    state.selectedPlayerId = player.id;
    setPlayerProfilesState(state);
    options.recordPlayerProfileChange("player-added", player, [
      { field: "Primary role", from: "-", to: player.primaryRole },
      { field: "Role group", from: "-", to: options.formatPlayerProfileChangeValue(player.roleGroup, { options: options.playerProfileRoleGroupOptions }) },
      { field: "Squad status", from: "-", to: options.formatPlayerProfileChangeValue(player.squadStatus, { options: options.playerProfileSquadStatusOptions }) },
      { field: "Roster type", from: "-", to: options.formatPlayerProfileChangeValue(player.rosterType, { options: options.playerProfileRosterTypeOptions }) },
    ]);
    options.writePlayerProfilesState();
    options.syncMedicalPlayersFromPlayerProfiles([player]);
    return {
      ok: true,
      status: result.status || "success",
      errors: [],
      warnings: result.warnings,
      duplicates: result.duplicates,
      player,
    };
  }

  function updatePlayerProfile(values = {}) {
    const state = options.ensurePlayerProfilesState();
    const playerIndex = state.players.findIndex((player) => player.id === values.playerId);
    if (playerIndex < 0) {
      return {
        ok: false,
        status: "error",
        errors: ["Player profile could not be found."],
        warnings: [],
        duplicates: [],
        player: null,
      };
    }
    const currentPlayer = state.players[playerIndex];
    const currentNaturalRoleGroup = options.getPlayerProfileRoleGroupForRole(currentPlayer.primaryRole, currentPlayer.position);
    const nextPrimaryRole = options.normalizePlayerProfileRole(values.primaryRole, currentPlayer.primaryRole);
    const nextPosition = values.position || currentPlayer.position;
    const nextNaturalRoleGroup = options.getPlayerProfileRoleGroupForRole(nextPrimaryRole, nextPosition);
    const submittedRoleGroup = String(values.roleGroup || "").trim();
    const shouldAutoAlignRoleGroup =
      (!submittedRoleGroup || submittedRoleGroup === currentPlayer.roleGroup) &&
      currentPlayer.roleGroup === currentNaturalRoleGroup &&
      nextNaturalRoleGroup !== currentPlayer.roleGroup;
    const hasSubmittedValue = (key) => Object.prototype.hasOwnProperty.call(values, key);
    const currentRosterType = options.normalizePlayerProfileRosterType(currentPlayer.rosterType, "squad");
    const submittedRosterType = hasSubmittedValue("rosterType")
      ? options.normalizePlayerProfileRosterType(values.rosterType, currentRosterType)
      : currentRosterType;
    const nextRosterType = submittedRosterType;
    const nextCountsInSquad = options.playerProfileRosterTypeCountsInSquad(nextRosterType);
    const nextTemporaryGroup = nextCountsInSquad
      ? ""
      : hasSubmittedValue("temporaryGroup")
        ? values.temporaryGroup
        : currentPlayer.temporaryGroup;
    const nextTemporaryFrom = nextCountsInSquad
      ? ""
      : hasSubmittedValue("temporaryFrom")
        ? values.temporaryFrom
        : currentPlayer.temporaryFrom;
    const nextTemporaryTo = nextCountsInSquad
      ? ""
      : hasSubmittedValue("temporaryTo")
        ? values.temporaryTo
        : currentPlayer.temporaryTo;
    const nextPhotoUrl = hasSubmittedValue("photoUrl") ? values.photoUrl : currentPlayer.photoUrl;
    const nextPlayer = options.normalizePlayerProfile({
      ...currentPlayer,
      ...values,
      primaryRole: nextPrimaryRole,
      roleGroup: shouldAutoAlignRoleGroup ? nextNaturalRoleGroup : submittedRoleGroup || nextNaturalRoleGroup,
      rosterType: nextRosterType,
      countsInSquad: nextCountsInSquad,
      temporaryGroup: nextTemporaryGroup,
      temporaryFrom: nextTemporaryFrom,
      temporaryTo: nextTemporaryTo,
      photoUrl: nextPhotoUrl,
      attributeRatings: {
        ...currentPlayer.attributeRatings,
        ...values.attributeRatings,
      },
      idp: {
        ...currentPlayer.idp,
        ...values.idp,
      },
      futureData: {
        ...currentPlayer.futureData,
        ...values.futureData,
      },
      updatedAt: getNow(),
    });
    const validation = options.validatePlayerProfileFormValues(nextPlayer, {
      existingPlayers: state.players,
      ignorePlayerId: currentPlayer.id,
    });
    if (!validation.ok) {
      return {
        ok: false,
        status: validation.status || "error",
        errors: validation.errors,
        warnings: validation.warnings,
        duplicates: validation.duplicates,
        player: null,
      };
    }
    if (!validation.player) {
      return {
        ok: false,
        status: "error",
        errors: ["Player could not be normalized."],
        warnings: [],
        duplicates: [],
        player: null,
      };
    }
    const normalizedNextPlayer = validation.player;
    const changes = options.getPlayerProfileChangeDiffs(currentPlayer, normalizedNextPlayer);
    const nextPlayers = [...state.players];
    nextPlayers[playerIndex] = normalizedNextPlayer;
    state.players = nextPlayers.sort(options.comparePlayerProfiles);
    state.selectedPlayerId = normalizedNextPlayer.id;
    setPlayerProfilesState(state);
    if (changes.length) {
      options.recordPlayerProfileChange("profile-updated", normalizedNextPlayer, changes);
    }
    options.writePlayerProfilesState();
    options.syncMedicalPlayersFromPlayerProfiles([normalizedNextPlayer]);
    return {
      ok: true,
      status: validation.status || "success",
      errors: [],
      warnings: validation.warnings,
      duplicates: validation.duplicates,
      player: normalizedNextPlayer,
    };
  }

  function removePlayerProfile(playerId) {
    if (!options.isCurrentPlatformUserAdmin()) return false;
    const state = options.ensurePlayerProfilesState();
    const removedPlayer = state.players.find((player) => player.id === playerId) ?? null;
    const removedPlayerIds = options.normalizePlayerProfileRemovedIds(state.removedPlayerIds);
    if (playerId && !removedPlayerIds.includes(playerId)) {
      removedPlayerIds.push(playerId);
    }
    state.removedPlayerIds = removedPlayerIds;
    const nextPlayers = state.players.filter((player) => player.id !== playerId);
    state.players = nextPlayers;
    state.selectedPlayerId = nextPlayers[0]?.id || "";
    setPlayerProfilesState(state);
    if (removedPlayer) {
      options.recordPlayerProfileChange("player-removed", removedPlayer, [
        {
          field: "Squad status",
          from: options.formatPlayerProfileChangeValue(removedPlayer.squadStatus, { options: options.playerProfileSquadStatusOptions }),
          to: "Removed",
        },
      ]);
    }
    options.writePlayerProfilesState();
    options.archiveMedicalPlayersForRemovedPlayerProfile(removedPlayer || { id: playerId });
    return true;
  }

  return {
    addPlayerProfile,
    getPlayerProfilesState,
    removePlayerProfile,
    updatePlayerProfile,
  };
}
