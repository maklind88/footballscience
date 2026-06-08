import { createMedicalClinicalNormalizers } from "./medical-clinical-normalizers.mjs";

function defaultNormalizeText(value = "") {
  return String(value ?? "").trim();
}

function defaultCreateId(prefix = "medical") {
  return `${prefix}-${Date.now()}`;
}

export function createMedicalRuntimeHelpers(deps = {}) {
  const {
    addCalendarDays = (date, days) => {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + Number(days || 0));
      return nextDate;
    },
    clamp = (value, min, max) => Math.min(max, Math.max(min, value)),
    createId = defaultCreateId,
    formatDateValue = (date) => new Date(date).toISOString().slice(0, 10),
    getActivityContext = () => ({ type: "training" }),
    getCurrentUser = () => null,
    getPlayerProfilesState = () => null,
    isDateValue = () => false,
    medicalClearanceRoles = [],
    medicalDataSafetySyncStatusOptions = new Set(["idle", "pending", "stored", "legacy", "duplicate", "failed"]),
    medicalGateOptions = [],
    medicalInjuryPlanStatusOptions = [],
    medicalLoadGateOptions = [],
    medicalOptionSelectors = {},
    medicalPositionAliases = {},
    medicalPositionOrder = {},
    medicalRtpPhaseOptions = [],
    medicalStatusOptions = [],
    parseDateValue = (value) => new Date(value),
    playerProfileStatusOptions = [],
    normalizePlayerProfileName = defaultNormalizeText,
    normalizePlayerProfileRole = (value, fallback = "") => String(value || fallback || "").trim(),
    normalizePlayerProfileRoleList = (value = []) => (Array.isArray(value) ? value : []),
    normalizePlayerProfileRosterType = (value, fallback = "squad") => String(value || fallback || "squad").trim(),
    normalizePlayerProfileTemporaryDate = (value = "") => String(value || "").trim(),
    playerProfileRosterTypeCountsInSquad = () => true,
  } = deps;

  const medicalSquadAvailabilityBlockStatusKeys = new Set(
    [
      ...playerProfileStatusOptions.map((option) => option.key),
      "unknown",
    ].filter((status) => status && status !== "available")
  );

  function getMedicalStatusOption(statusKey) { return medicalOptionSelectors.getMedicalStatusOption(statusKey); }
  function getMedicalStatusActivityType(dateValue, rtpPhase = "") { return medicalOptionSelectors.getMedicalStatusActivityType(dateValue, rtpPhase); }
  function getMedicalStatusOptionForActivity(statusKey, activityType = "training") { return medicalOptionSelectors.getMedicalStatusOptionForActivity(statusKey, activityType); }
  function getMedicalStatusOptionForDate(statusKey, dateValue, rtpPhase = "") { return medicalOptionSelectors.getMedicalStatusOptionForDate(statusKey, dateValue, rtpPhase); }
  function getMedicalRtpPhaseOption(phaseKey) { return medicalOptionSelectors.getMedicalRtpPhaseOption(phaseKey); }
  function getMedicalGateOption(value) { return medicalOptionSelectors.getMedicalGateOption(value); }
  function getMedicalStatusForParticipation(participation) { return medicalOptionSelectors.getMedicalStatusForParticipation(participation); }
  function getMedicalRtpPhaseForRecommendation(statusKey, participation, activityType = "training") { return medicalOptionSelectors.getMedicalRtpPhaseForRecommendation(statusKey, participation, activityType); }
  function normalizeMedicalParticipation(value, fallback = 100) { return medicalOptionSelectors.normalizeMedicalParticipation(value, fallback); }
  function normalizeMedicalActualParticipation(value) { return medicalOptionSelectors.normalizeMedicalActualParticipation(value); }

  function normalizeMedicalPlayerAvailabilityStatus(value, fallback = "available") {
    const status = String(value ?? "").trim().toLowerCase();
    return playerProfileStatusOptions.some((option) => option.key === status) || status === "unknown" ? status : fallback;
  }

  function getMedicalLinkedPlayerProfile(player = {}) {
    const profileState = getPlayerProfilesState();
    const profiles = Array.isArray(profileState?.players) ? profileState.players : [];
    if (!profiles.length) {
      return null;
    }
    const playerIds = new Set(
      [player.id, player.playerId, player.profileId, player.medicalPlayerId]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    );
    if (playerIds.size) {
      const profile = profiles.find((candidate) => playerIds.has(String(candidate?.id ?? "").trim()));
      if (profile) {
        return profile;
      }
    }
    const targetName = normalizePlayerProfileName(player.name || player.displayName || "");
    const targetNumber = String(player.number || player.shirtNumber || player.shirt_number || "").trim().toLowerCase();
    if (!targetName) {
      return null;
    }
    if (targetNumber) {
      const profile = profiles.find((candidate) => {
        const candidateName = normalizePlayerProfileName(candidate?.name || candidate?.displayName || "");
        const candidateNumber = String(candidate?.number || candidate?.shirtNumber || candidate?.shirt_number || "").trim().toLowerCase();
        return candidateName === targetName && candidateNumber === targetNumber;
      });
      if (profile) {
        return profile;
      }
    }
    const nameMatches = profiles.filter((candidate) => normalizePlayerProfileName(candidate?.name || candidate?.displayName || "") === targetName);
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function getMedicalPlayerAvailabilityStatus(player = {}) {
    const profile = getMedicalLinkedPlayerProfile(player);
    const profileStatus = normalizeMedicalPlayerAvailabilityStatus(
      profile?.status || profile?.availabilityStatus || profile?.availability_status,
      ""
    );
    if (profileStatus && medicalSquadAvailabilityBlockStatusKeys.has(profileStatus)) {
      return profileStatus;
    }
    return normalizeMedicalPlayerAvailabilityStatus(
      player.status || player.availabilityStatus || player.availability_status,
      profileStatus || "available"
    );
  }

  function getMedicalPlayerAvailabilityStatusOption(player = {}) {
    const statusKey = getMedicalPlayerAvailabilityStatus(player);
    return (
      playerProfileStatusOptions.find((option) => option.key === statusKey) || {
        key: statusKey,
        label: statusKey ? statusKey.replace(/-/g, " ") : "Available",
        tone: "unavailable",
      }
    );
  }

  function isMedicalPlayerBlockedBySquadAvailability(player = {}) {
    return medicalSquadAvailabilityBlockStatusKeys.has(getMedicalPlayerAvailabilityStatus(player));
  }

  function getMedicalPlayerSquadAvailabilityBlockReason(player = {}) {
    if (!isMedicalPlayerBlockedBySquadAvailability(player)) {
      return "";
    }
    const option = getMedicalPlayerAvailabilityStatusOption(player);
    return `${player.name || "Player"} is marked ${option.label} in Squad Room and should not receive a team-activity recommendation.`;
  }

  function normalizeMedicalPositionText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getMedicalCanonicalPositionFromText(value) {
    const normalizedText = normalizeMedicalPositionText(value);
    if (!normalizedText) {
      return "";
    }
    const compactText = normalizedText.replace(/\s+/g, "");
    const parts = normalizedText.split(/\s+/).filter(Boolean);
    return (
      Object.entries(medicalPositionAliases).find(([, aliases]) =>
        aliases.some((alias) => compactText === alias || parts.includes(alias) || (alias.length >= 4 && compactText.includes(alias)))
      )?.[0] || ""
    );
  }

  function normalizeMedicalPlayerPosition(value, player = {}) {
    const fields = [
      value,
      player.position,
      player.roleGroup,
      player.primaryRole,
      player.role,
      player.squadRole,
      ...(Array.isArray(player.secondaryRoles) ? player.secondaryRoles : []),
    ];
    for (const field of fields) {
      const position = getMedicalCanonicalPositionFromText(field);
      if (position) {
        return position;
      }
    }
    return "Midfielder";
  }

  function normalizeMedicalTimestamp(value) {
    const cleanValue = String(value ?? "").trim().slice(0, 40);
    return Number.isFinite(Date.parse(cleanValue)) ? cleanValue : "";
  }

  function normalizeMedicalPlayer(player = {}) {
    const name = String(player.name ?? "").trim();
    if (!name) {
      return null;
    }
    const rosterOrder = Number(player.rosterOrder);
    const rosterType = normalizePlayerProfileRosterType(player.rosterType || player.playerType || player.squadType);
    const position = normalizeMedicalPlayerPosition(player.position, player);
    return {
      id: player.id || createId("medical-player"),
      name,
      number: String(player.number ?? "").trim(),
      position,
      photoUrl: String(player.photoUrl ?? "").trim(),
      sourceUrl: String(player.sourceUrl ?? "").trim(),
      status: normalizeMedicalPlayerAvailabilityStatus(player.status || player.availabilityStatus || player.availability_status),
      rosterType,
      countsInSquad: typeof player.countsInSquad === "boolean"
        ? player.countsInSquad
        : playerProfileRosterTypeCountsInSquad(rosterType),
      temporaryGroup: String(player.temporaryGroup ?? player.subGroup ?? player.trainingGroup ?? "").trim(),
      temporaryFrom: normalizePlayerProfileTemporaryDate(player.temporaryFrom || player.startDate),
      temporaryTo: normalizePlayerProfileTemporaryDate(player.temporaryTo || player.endDate),
      primaryRole: normalizePlayerProfileRole(player.primaryRole, ""),
      secondaryRoles: normalizePlayerProfileRoleList(player.secondaryRoles),
      roleGroup: String(player.roleGroup ?? "").trim(),
      rosterOrder: Number.isFinite(rosterOrder) ? rosterOrder : null,
      createdAt: player.createdAt || new Date().toISOString(),
      updatedAt: player.updatedAt || new Date().toISOString(),
      archivedAt: normalizeMedicalTimestamp(player.archivedAt || player.deletedAt),
      archivedBy: String(player.archivedBy ?? player.deletedBy ?? "").trim(),
      archiveReason: String(player.archiveReason ?? player.deleteReason ?? "").trim().slice(0, 160),
    };
  }

  function normalizeMedicalShareValue(value) { return value === true || value === "true" || value === "on" || value === "1"; }
  function getMedicalTimestampMs(value, fallback = 0) {
    const cleanValue = normalizeMedicalTimestamp(value);
    if (!cleanValue) {
      return fallback;
    }
    const timestamp = Date.parse(cleanValue);
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }
  function getMedicalEntityUpdatedMs(entity = {}) {
    return Math.max(getMedicalTimestampMs(entity.updatedAt), getMedicalTimestampMs(entity.createdAt));
  }
  function isMedicalItemArchived(item = {}) {
    return Boolean(normalizeMedicalTimestamp(item.archivedAt || item.deletedAt));
  }
  function getCurrentMedicalActorId() {
    const user = getCurrentUser();
    return String(user?.id || user?.username || user?.email || "").trim();
  }
  function getMedicalDataSafetyCounts(source = {}) {
    const players = Array.isArray(source.players) ? source.players : [];
    const records = Array.isArray(source.records) ? source.records : [];
    const injuryPlans = Array.isArray(source.injuryPlans) ? source.injuryPlans : [];
    return {
      archivedPlayers: players.filter(isMedicalItemArchived).length,
      archivedRecords: records.filter(isMedicalItemArchived).length,
      archivedPlans: injuryPlans.filter(isMedicalItemArchived).length,
    };
  }
  function normalizeMedicalDataSafety(dataSafety = {}, source = {}) {
    const counts = getMedicalDataSafetyCounts(source);
    const syncStatus = String(dataSafety.lastDatabaseSyncStatus ?? "idle").trim().toLowerCase();
    return {
      schema: "footballscience-medical-data-safety-v1",
      lastClinicalChangeAt: normalizeMedicalTimestamp(dataSafety.lastClinicalChangeAt),
      lastClinicalChangeBy: String(dataSafety.lastClinicalChangeBy ?? "").trim().slice(0, 160),
      lastClinicalChangeType: String(dataSafety.lastClinicalChangeType ?? "").trim().slice(0, 80),
      lastClinicalChangeSummary: String(dataSafety.lastClinicalChangeSummary ?? "").trim().slice(0, 220),
      lastDatabaseSyncAt: normalizeMedicalTimestamp(dataSafety.lastDatabaseSyncAt),
      lastDatabaseSyncStatus: medicalDataSafetySyncStatusOptions.has(syncStatus) ? syncStatus : "idle",
      lastDatabaseSyncEvent: String(dataSafety.lastDatabaseSyncEvent ?? "").trim().slice(0, 80),
      lastPayloadHash: String(dataSafety.lastPayloadHash ?? "").trim().slice(0, 80),
      archivedRecordCount: counts.archivedRecords,
      archivedPlanCount: counts.archivedPlans,
      archivedPlayerCount: counts.archivedPlayers,
    };
  }

  const medicalClinicalNormalizers = createMedicalClinicalNormalizers({
    addCalendarDays,
    clamp,
    createId,
    formatDateValue,
    getActivityContext,
    getCurrentUser,
    getMedicalRtpPhaseForRecommendation,
    getMedicalRtpPhaseOption,
    getMedicalStatusForParticipation,
    isDateValue,
    medicalClearanceRoles,
    medicalGateOptions,
    medicalInjuryPlanStatusOptions,
    medicalLoadGateOptions,
    medicalRtpPhaseOptions,
    medicalStatusOptions,
    normalizeMedicalActualParticipation,
    normalizeMedicalParticipation,
    normalizeMedicalShareValue,
    normalizeMedicalTimestamp,
    parseDateValue,
  });
  function getMedicalPlayerNumberRank(player) {
    const value = String(player?.number ?? "").trim();
    if (!/^\d+$/.test(value)) {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  function getMedicalPlayerRosterOrder(player) {
    const rosterOrder = Number(player?.rosterOrder);
    return Number.isFinite(rosterOrder) ? rosterOrder : null;
  }
  function getMedicalPlayerPositionRank(player) { return medicalPositionOrder[normalizeMedicalPlayerPosition(player?.position, player)] ?? 99; }
  function compareMedicalPlayers(first, second) {
    const firstNumber = getMedicalPlayerNumberRank(first);
    const secondNumber = getMedicalPlayerNumberRank(second);
    if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
      return firstNumber - secondNumber;
    }
    if (firstNumber !== null || secondNumber !== null) {
      return firstNumber !== null ? -1 : 1;
    }
    const firstOrder = getMedicalPlayerRosterOrder(first);
    const secondOrder = getMedicalPlayerRosterOrder(second);
    if (firstOrder !== null && secondOrder !== null && firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }
    if (firstOrder !== null || secondOrder !== null) {
      return firstOrder !== null ? -1 : 1;
    }
    const positionComparison = getMedicalPlayerPositionRank(first) - getMedicalPlayerPositionRank(second);
    if (positionComparison !== 0) {
      return positionComparison;
    }
    return first.name.localeCompare(second.name);
  }

  return {
    compareMedicalPlayers,
    ...medicalClinicalNormalizers,
    getCurrentMedicalActorId,
    getMedicalCanonicalPositionFromText,
    getMedicalDataSafetyCounts,
    getMedicalEntityUpdatedMs,
    getMedicalGateOption,
    getMedicalLinkedPlayerProfile,
    getMedicalPlayerAvailabilityStatus,
    getMedicalPlayerAvailabilityStatusOption,
    getMedicalPlayerNumberRank,
    getMedicalPlayerPositionRank,
    getMedicalPlayerRosterOrder,
    getMedicalPlayerSquadAvailabilityBlockReason,
    getMedicalRtpPhaseForRecommendation,
    getMedicalRtpPhaseOption,
    getMedicalStatusActivityType,
    getMedicalStatusForParticipation,
    getMedicalStatusOption,
    getMedicalStatusOptionForActivity,
    getMedicalStatusOptionForDate,
    getMedicalTimestampMs,
    isMedicalItemArchived,
    isMedicalPlayerBlockedBySquadAvailability,
    normalizeMedicalActualParticipation,
    normalizeMedicalDataSafety,
    normalizeMedicalParticipation,
    normalizeMedicalPlayer,
    normalizeMedicalPlayerAvailabilityStatus,
    normalizeMedicalPlayerPosition,
    normalizeMedicalPositionText,
    normalizeMedicalShareValue,
    normalizeMedicalTimestamp,
  };
}
