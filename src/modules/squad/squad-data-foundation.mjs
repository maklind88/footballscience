function defaultDownloadTextFile(filename, contents, type = "text/plain") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function createSquadDataFoundationHelpers(options = {}) {
  const {
    ensureState = () => {},
    getPlayers = () => [],
    getStorageKey = () => "",
    getNow = () => new Date().toISOString(),
    getFileDate = () => new Date().toISOString().slice(0, 10),
    getDataQualityFlags = () => [],
    getPlayerCompleteness = () => 0,
    getRoleOptions = () => [],
    getRoleDnaScore = () => 0,
    getRoleFitScore = getRoleDnaScore,
    getRoleDnaBestMatches = () => [],
    getMedicalSnapshot = () => ({}),
    getEffectiveStatus = (player) => player?.status || "",
    getRosterSummary = () => ({ squadCount: 0, temporaryCount: 0 }),
    getAttributeGroups = () => [],
    normalizeChangeLog = (changeLog) => changeLog || [],
    getChangeLog = () => [],
    formatDateValue = (date) => date?.toISOString?.().slice(0, 10) || "",
    isMedicalDateValue = (value) => Boolean(value),
    downloadTextFile = defaultDownloadTextFile,
  } = options;

  function getCurrentPlayers() {
    ensureState();
    return getPlayers();
  }

  function buildSquadDataQualityReport() {
    const players = getCurrentPlayers();
    const playerReports = players.map((player) => {
      const flags = getDataQualityFlags(player);
      return {
        player,
        flags,
        criticalCount: flags.filter((flag) => flag.severity === "critical").length,
        watchCount: flags.filter((flag) => flag.severity === "watch").length,
        completeness: getPlayerCompleteness(player),
      };
    });
    const totalFlags = playerReports.reduce((total, report) => total + report.flags.length, 0);
    const criticalFlags = playerReports.reduce((total, report) => total + report.criticalCount, 0);
    const sessionPlannerReady = playerReports.filter((report) =>
      report.player.name &&
      report.player.primaryRole &&
      report.player.roleGroup &&
      report.player.preferredSide &&
      report.completeness >= 70
    ).length;
    return {
      playerReports,
      totalFlags,
      criticalFlags,
      sessionPlannerReady,
      reviewPlayers: playerReports
        .filter((report) => report.flags.length)
        .sort((first, second) =>
          second.criticalCount - first.criticalCount ||
          second.flags.length - first.flags.length ||
          first.completeness - second.completeness
        ),
    };
  }

  function buildSquadSessionPlannerContracts() {
    const roleOptions = getRoleOptions();
    return getCurrentPlayers().map((player) => {
      const roleScores = roleOptions.reduce((scores, role) => {
        scores[role] = getRoleDnaScore(player, role);
        return scores;
      }, {});
      const bestRoleMatches = getRoleDnaBestMatches(player, 4).map((match) => ({
        role: match.role,
        score: match.score,
        label: match.definition.label,
      }));
      const medicalSnapshot = getMedicalSnapshot(player.id);
      const effectiveStatus = getEffectiveStatus(player, medicalSnapshot);
      return {
        id: player.id,
        name: player.name,
        number: player.number,
        position: player.position,
        primaryRole: player.primaryRole,
        secondaryRoles: player.secondaryRoles,
        preferredSide: player.preferredSide,
        roleGroup: player.roleGroup,
        status: effectiveStatus,
        profileStatus: player.status,
        squadStatus: player.squadStatus,
        rosterType: player.rosterType,
        countsInSquad: player.countsInSquad,
        temporaryGroup: player.temporaryGroup,
        temporaryFrom: player.temporaryFrom,
        temporaryTo: player.temporaryTo,
        availability: medicalSnapshot.currentAvailability,
        rtpStatus: medicalSnapshot.rtpStatus,
        roleDnaScores: roleScores,
        bestRoleMatches,
        dataQualityFlags: getDataQualityFlags(player).map((flag) => flag.key),
        updatedAt: player.updatedAt,
      };
    });
  }

  function buildSquadDataFoundationPayload() {
    const players = getCurrentPlayers();
    const dataQuality = buildSquadDataQualityReport();
    const rosterSummary = getRosterSummary(players);
    const roleOptions = getRoleOptions();
    return {
      schemaVersion: 3,
      module: "player-profiles",
      source: "football-science",
      exportedAt: getNow(),
      storageKey: getStorageKey(),
      supabaseReady: {
        recommendedTables: [
          "players",
          "player_roles",
          "player_attribute_ratings",
          "player_role_dna",
          "player_idp",
          "player_medical_summary_links",
          "player_future_data",
          "player_change_log",
        ],
        primaryKey: "players.id",
        sessionPlannerContract: "sessionPlanner.players.v2",
      },
      schema: {
        players: [
          "id",
          "name",
          "number",
          "position",
          "photoUrl",
          "status",
          "squadStatus",
          "careerPhase",
          "rosterType",
          "countsInSquad",
          "temporaryGroup",
          "temporaryFrom",
          "temporaryTo",
        ],
        roles: ["primaryRole", "secondaryRoles", "preferredSide", "roleGroup"],
        attributeRatings: getAttributeGroups().map((group) => group.key),
        roleDna: roleOptions,
        idp: ["status", "primaryFocus", "strengths", "focusAreas", "nextAction", "reviewDate"],
        medicalSummary: ["currentAvailability", "rtpStatus", "coachNote", "latestLogDate", "latestLogSummary"],
        futureData: ["matchData", "load", "minutes", "performanceNotes", "scoutingNotes", "analysisNotes"],
        changeLog: ["id", "type", "playerId", "actor", "summary", "changes", "createdAt"],
      },
      dataQuality: {
        totalFlags: dataQuality.totalFlags,
        criticalFlags: dataQuality.criticalFlags,
        sessionPlannerReady: dataQuality.sessionPlannerReady,
        totalPlayers: players.length,
        squadPlayers: rosterSummary.squadCount,
        temporaryPlayers: rosterSummary.temporaryCount,
      },
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        position: player.position,
        photoUrl: player.photoUrl,
        sourceUrl: player.sourceUrl,
        status: player.status,
        squadStatus: player.squadStatus,
        careerPhase: player.careerPhase,
        rosterType: player.rosterType,
        countsInSquad: player.countsInSquad,
        temporaryGroup: player.temporaryGroup,
        temporaryFrom: player.temporaryFrom,
        temporaryTo: player.temporaryTo,
        roles: {
          primaryRole: player.primaryRole,
          secondaryRoles: player.secondaryRoles,
          preferredSide: player.preferredSide,
          roleGroup: player.roleGroup,
        },
        attributeRatings: player.attributeRatings,
        roleDna: {
          bestMatches: getRoleDnaBestMatches(player, 4).map((match) => ({
            role: match.role,
            label: match.definition.label,
            score: match.score,
          })),
          scores: roleOptions.reduce((scores, role) => {
            scores[role] = getRoleDnaScore(player, role);
            return scores;
          }, {}),
        },
        idp: player.idp,
        medicalSummary: getMedicalSnapshot(player.id),
        futureData: player.futureData,
        coachNotes: player.coachNotes,
        dataQualityFlags: getDataQualityFlags(player),
        rosterOrder: player.rosterOrder,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt,
      })),
      changeLog: normalizeChangeLog(getChangeLog()),
      sessionPlanner: {
        players: buildSquadSessionPlannerContracts(),
      },
    };
  }

  function getSquadFoundationFileStamp() {
    return getFileDate();
  }

  function downloadSquadFoundationTextFile(filename, contents, type = "text/plain") {
    downloadTextFile(filename, contents, type);
  }

  function exportSquadDataFoundationJson() {
    const payload = buildSquadDataFoundationPayload();
    downloadSquadFoundationTextFile(
      `football-science-squad-data-${getSquadFoundationFileStamp()}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
      "application/json"
    );
  }

  function exportSquadSessionPlannerCsv() {
    const contracts = buildSquadSessionPlannerContracts();
    const headers = [
      "id",
      "name",
      "number",
      "primaryRole",
      "secondaryRoles",
      "preferredSide",
      "roleGroup",
      "status",
      "rosterType",
      "countsInSquad",
      "temporaryGroup",
      "availability",
      "bestRoleMatches",
    ];
    const rows = contracts.map((player) => [
      player.id,
      player.name,
      player.number,
      player.primaryRole,
      player.secondaryRoles.join("|"),
      player.preferredSide,
      player.roleGroup,
      player.status,
      player.rosterType,
      player.countsInSquad ? "true" : "false",
      player.temporaryGroup,
      player.availability,
      player.bestRoleMatches.map((match) => `${match.role}:${match.score}`).join("|"),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
    downloadSquadFoundationTextFile(
      `football-science-session-planner-contract-${getSquadFoundationFileStamp()}.csv`,
      `${csv}\n`,
      "text/csv"
    );
  }

  function createSessionPlannerPlayerProfileContract(player, dateValue = formatDateValue(new Date())) {
    if (!player) {
      return null;
    }
    const medicalSnapshot = getMedicalSnapshot(player.id, dateValue);
    const effectiveStatus = getEffectiveStatus(player, medicalSnapshot);
    return {
      id: player.id,
      name: player.name,
      number: player.number,
      position: player.position,
      status: effectiveStatus,
      profileStatus: player.status,
      squadStatus: player.squadStatus,
      careerPhase: player.careerPhase,
      rosterType: player.rosterType,
      countsInSquad: player.countsInSquad,
      temporaryGroup: player.temporaryGroup,
      temporaryFrom: player.temporaryFrom,
      temporaryTo: player.temporaryTo,
      roleGroup: player.roleGroup,
      primaryRole: player.primaryRole,
      secondaryRoles: [...player.secondaryRoles],
      preferredSide: player.preferredSide,
      roleFit: Object.fromEntries(
        getRoleOptions().map((role) => [role, getRoleFitScore(player, role)])
      ),
      idp: {
        status: player.idp?.status || "none",
        primaryFocus: player.idp?.primaryFocus || "",
        nextAction: player.idp?.nextAction || "",
        reviewDate: player.idp?.reviewDate || "",
      },
      medical: {
        availability: medicalSnapshot.currentAvailability,
        rtpStatus: medicalSnapshot.rtpStatus,
        coachNote: medicalSnapshot.coachNote,
        latestLogSummary: medicalSnapshot.latestLogSummary,
        participation: medicalSnapshot.participation,
        status: medicalSnapshot.medicalStatusKey,
        tone: medicalSnapshot.tone,
        medicalSource: medicalSnapshot.medicalSource,
        hasActivePlan: medicalSnapshot.hasActivePlan,
        returnDate: medicalSnapshot.returnDate,
        returnDateLabel: medicalSnapshot.returnDateLabel,
        returnLabel: medicalSnapshot.returnLabel,
        activeInjuryLabel: medicalSnapshot.activeInjuryLabel,
      },
    };
  }

  function getSessionPlannerPlayerProfileContracts(options = {}) {
    const dateValue = isMedicalDateValue(options.dateValue)
      ? options.dateValue
      : formatDateValue(new Date());
    return getCurrentPlayers()
      .map((player) => createSessionPlannerPlayerProfileContract(player, dateValue))
      .filter(Boolean);
  }

  function getSessionPlannerPlayerProfileContract(playerId, options = {}) {
    const player = getCurrentPlayers().find((candidate) => candidate.id === playerId) ?? null;
    return createSessionPlannerPlayerProfileContract(
      player,
      isMedicalDateValue(options.dateValue) ? options.dateValue : formatDateValue(new Date())
    );
  }

  return {
    buildSquadDataQualityReport,
    buildSquadSessionPlannerContracts,
    buildSquadDataFoundationPayload,
    getSquadFoundationFileStamp,
    downloadSquadFoundationTextFile,
    exportSquadDataFoundationJson,
    exportSquadSessionPlannerCsv,
    createSessionPlannerPlayerProfileContract,
    getSessionPlannerPlayerProfileContracts,
    getSessionPlannerPlayerProfileContract,
  };
}
