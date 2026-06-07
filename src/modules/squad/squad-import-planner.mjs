function defaultCreateId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getImportedSquadPlayersFromPayload(payload = {}) {
  if (Array.isArray(payload.players)) {
    return payload.players;
  }
  if (Array.isArray(payload.sessionPlanner?.players)) {
    return payload.sessionPlanner.players;
  }
  if (Array.isArray(payload.state?.players)) {
    return payload.state.players;
  }
  return [];
}

export function createSquadImportPlanner(options = {}) {
  const {
    ensureState = () => {},
    getPlayers = () => [],
    normalizeProfile = (player) => player,
    normalizeName = (value) => String(value ?? "").trim(),
    validateProfile = () => ({ ok: false, errors: ["Validation unavailable."], warnings: [] }),
    createId = defaultCreateId,
    getNow = () => new Date().toISOString(),
  } = options;

  function normalizeImportedSquadPlayerProfile(source = {}, existingPlayer = {}) {
    const roles = source.roles || {};
    return normalizeProfile({
      ...existingPlayer,
      ...source,
      primaryRole: source.primaryRole || roles.primaryRole || existingPlayer.primaryRole,
      secondaryRoles: source.secondaryRoles || roles.secondaryRoles || existingPlayer.secondaryRoles,
      preferredSide: source.preferredSide || roles.preferredSide || existingPlayer.preferredSide,
      roleGroup: source.roleGroup || roles.roleGroup || existingPlayer.roleGroup,
      rosterType: source.rosterType || source.playerType || existingPlayer.rosterType,
      countsInSquad: typeof source.countsInSquad === "boolean" ? source.countsInSquad : existingPlayer.countsInSquad,
      temporaryGroup: source.temporaryGroup || source.subGroup || existingPlayer.temporaryGroup,
      temporaryFrom: source.temporaryFrom || source.startDate || existingPlayer.temporaryFrom,
      temporaryTo: source.temporaryTo || source.endDate || existingPlayer.temporaryTo,
      attributeRatings: source.attributeRatings || existingPlayer.attributeRatings,
      idp: source.idp || existingPlayer.idp,
      medicalSummary: source.medicalSummary || existingPlayer.medicalSummary,
      futureData: source.futureData || existingPlayer.futureData,
      coachNotes: source.coachNotes || existingPlayer.coachNotes,
    });
  }

  function buildPlayerProfileImportPlan(payload = {}) {
    ensureState();
    const currentPlayers = getPlayers();
    const incomingPlayers = getImportedSquadPlayersFromPayload(payload);
    const sourceRows = Array.isArray(incomingPlayers) ? incomingPlayers.length : 0;
    if (!incomingPlayers.length) {
      return {
        ok: false,
        status: "error",
        sourceRows,
        importedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        duplicateRowsCount: 0,
        errors: [{ row: 0, message: "No players found in import file." }],
        warnings: [],
        rows: [],
        nextPlayers: [...currentPlayers],
        profilesForMedicalSync: [],
        canApply: false,
      };
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let duplicateRowsCount = 0;
    const warnings = [];
    const errors = [];
    const profilesForMedicalSync = [];
    const nextPlayers = [...currentPlayers];
    const seenIncomingRows = new Map();
    const rows = [];

    incomingPlayers.forEach((incomingPlayer, rowIndex) => {
      const row = rowIndex + 1;
      if (!incomingPlayer || typeof incomingPlayer !== "object") {
        errors.push({ row, message: "Import row must be an object." });
        rows.push({
          row,
          action: "skip",
          message: "Import row must be an object.",
        });
        skippedCount += 1;
        return;
      }
      const incomingName = String(incomingPlayer.name ?? "").trim();
      if (!incomingName) {
        errors.push({ row, message: "Player name is required." });
        rows.push({
          row,
          action: "skip",
          message: "Player name is required.",
        });
        skippedCount += 1;
        return;
      }
      const normalizedName = normalizeName(incomingName);
      const normalizedNumber = String(incomingPlayer.number || "").trim();
      const importIdentity = `${normalizedName}|${normalizedNumber}`;
      const previousRow = seenIncomingRows.get(importIdentity);
      if (previousRow) {
        const message = `Duplicate row in import file for ${incomingName}. Keeping row ${previousRow} first.`;
        warnings.push({ row, message });
        rows.push({
          row,
          action: "skip",
          message,
        });
        duplicateRowsCount += 1;
        skippedCount += 1;
        return;
      }
      seenIncomingRows.set(importIdentity, row);
      const existingIndex = nextPlayers.findIndex((player) =>
        (incomingPlayer.id && player.id === incomingPlayer.id) ||
        String(player?.name ?? "").toLowerCase() === incomingName.toLowerCase()
      );
      const existingPlayer = existingIndex >= 0 ? nextPlayers[existingIndex] : {};
      const normalized = normalizeImportedSquadPlayerProfile(incomingPlayer, existingPlayer);
      if (!normalized) {
        errors.push({ row, message: `Could not normalize ${incomingName}.` });
        rows.push({
          row,
          action: "skip",
          message: `Could not normalize ${incomingName}.`,
        });
        skippedCount += 1;
        return;
      }
      const validation = validateProfile(
        {
          ...normalized,
          id: existingPlayer.id || normalized.id || createId("player-profile"),
          updatedAt: getNow(),
        },
        {
          existingPlayers: nextPlayers,
          ignorePlayerId: existingPlayer.id || "",
          blockDuplicate: false,
        }
      );
      if (!validation.ok) {
        validation.errors.forEach((message) => errors.push({ row, message }));
        rows.push({
          row,
          action: "skip",
          message: validation.errors.join(", "),
        });
        skippedCount += 1;
        return;
      }
      const nextPlayer = validation.player;
      if (!nextPlayer) {
        errors.push({ row, message: `Could not normalize ${incomingName}.` });
        rows.push({
          row,
          action: "skip",
          message: `Could not normalize ${incomingName}.`,
        });
        skippedCount += 1;
        return;
      }
      validation.warnings.forEach((message) => warnings.push({ row, message }));
      if (existingIndex >= 0) {
        nextPlayers[existingIndex] = nextPlayer;
        updatedCount += 1;
      } else {
        nextPlayers.push(nextPlayer);
        createdCount += 1;
      }
      profilesForMedicalSync.push(nextPlayer);
      rows.push({
        row,
        action: existingIndex >= 0 ? "update" : "create",
        playerName: nextPlayer.name,
        playerId: nextPlayer.id,
        message: incomingPlayer.id ? `id ${nextPlayer.id}` : "new profile",
        matchType: existingIndex >= 0 ? (incomingPlayer.id ? "id match" : "name match") : "new profile",
      });
    });

    const importedCount = createdCount + updatedCount;
    if (!importedCount) {
      return {
        ok: false,
        status: errors.length ? "error" : "warning",
        sourceRows,
        importedCount,
        createdCount,
        updatedCount,
        skippedCount,
        duplicateRowsCount,
        errors,
        warnings,
        rows,
        nextPlayers,
        profilesForMedicalSync,
        canApply: false,
      };
    }

    return {
      ok: true,
      status: errors.length ? "warning" : "success",
      sourceRows,
      importedCount,
      createdCount,
      updatedCount,
      skippedCount,
      duplicateRowsCount,
      errors,
      warnings,
      rows,
      nextPlayers,
      profilesForMedicalSync,
      canApply: importedCount > 0,
    };
  }

  return {
    buildPlayerProfileImportPlan,
    normalizeImportedSquadPlayerProfile,
  };
}
