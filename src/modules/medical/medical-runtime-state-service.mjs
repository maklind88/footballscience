export function createMedicalRuntimeStateService(deps = {}) {
  const {
    archiveMedicalPlayersRemovedFromSquad = () => {},
    canEditMedicalTeam = () => false,
    compareMedicalPlayers = () => 0,
    createMedicalLinkedPlayerProfileIndex = () => null,
    defaultMedicalPlayers = [],
    formatDateValue = (date) => new Date(date).toISOString().slice(0, 10),
    getCurrentMedicalActorId = () => "",
    getCurrentPlatformUser = () => null,
    getMedicalLinkedPlayerProfile = () => null,
    getMedicalRecommendationActivityContext = () => ({ type: "" }),
    getMedicalRtpPhaseForRecommendation = () => "",
    getMedicalState = () => null,
    getMedicalStatusForParticipation = () => "not-set",
    getMedicalStatusOptionForDateFromHelper = (statusKey) => ({ key: statusKey }),
    isMedicalDateValue = () => false,
    logEvent = () => {},
    medicalActualParticipationFallback = "not-logged",
    medicalDefaultRosterVersion = "",
    medicalRtpPhaseOptions = [],
    medicalStatusOptions = [],
    medicalTeamStorageKey = "",
    normalizeMedicalDataSafety = (value) => value || {},
    normalizeMedicalGovernancePolicy = (value) => value || {},
    normalizeMedicalInjuryPlan = (value) => value || null,
    normalizeMedicalParticipation = (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    normalizeMedicalPlayer = (value) => value || null,
    normalizeMedicalPlayerAvailabilityStatus = (value, fallback = "") => String(value || fallback || "").trim(),
    normalizeMedicalRecord = (value) => value || null,
    normalizeMedicalShareValue = (value) => value === true || value === "true" || value === "on" || value === "1",
    normalizePlayerProfileRosterType = (value, fallback = "squad") => String(value || fallback || "squad").trim(),
    playerProfileRosterTypeCountsInSquad = (value) => String(value || "squad").trim() === "squad",
    queueCentralStateWrite = () => {},
    rawDataSafetySetItem = (key, value) => win.localStorage?.setItem?.(key, value),
    sanitizeMedicalGovernancePolicyForCoachView = () => ({}),
    setMedicalState = () => {},
    win = globalThis,
  } = deps;
  let medicalReadBatchDepth = 0;

  function isStorageQuotaError(error) {
    return (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      Number(error?.code) === 22 ||
      Number(error?.code) === 1014 ||
      /quota/i.test(String(error?.message || ""))
    );
  }

  function getMedicalStatusOptionForDate(statusKey, dateValue = getMedicalState()?.selectedDate, rtpPhase = "") {
    return getMedicalStatusOptionForDateFromHelper(statusKey, dateValue, rtpPhase);
  }

  function getMedicalTodayValue() {
    const todayValue = formatDateValue(new Date());
    return isMedicalDateValue(todayValue) ? todayValue : new Date().toISOString().slice(0, 10);
  }

  function shouldAutoCloseMedicalActual(record = {}, rawRecord = {}, todayValue = getMedicalTodayValue()) {
    if (!record || record.archivedAt || record.deletedAt || rawRecord.source || rawRecord.injuryPlanId) {
      return false;
    }
    if (!isMedicalDateValue(record.date) || record.date >= todayValue) {
      return false;
    }
    return (record.actualParticipation ?? medicalActualParticipationFallback) === medicalActualParticipationFallback
      && Number.isFinite(Number(record.participation));
  }

  function normalizeMedicalRecordForState(rawRecord = {}, todayValue = getMedicalTodayValue()) {
    const record = normalizeMedicalRecord(rawRecord);
    if (!record) {
      return null;
    }
    if (!shouldAutoCloseMedicalActual(record, rawRecord, todayValue)) {
      if (!Object.prototype.hasOwnProperty.call(rawRecord, "actualParticipation")) {
        const { actualParticipation, ...legacyRecord } = record;
        return legacyRecord;
      }
      return record;
    }
    return {
      ...record,
      actualParticipation: normalizeMedicalParticipation(record.participation, record.participation),
    };
  }

  function hasAutoClosedMedicalActualRecords(rawRecords = [], records = [], todayValue = getMedicalTodayValue()) {
    if (!Array.isArray(rawRecords) || !Array.isArray(records)) {
      return false;
    }
    const rawById = new Map(rawRecords.filter((record) => record?.id).map((record) => [record.id, record]));
    return records.some((record) => {
      const rawRecord = rawById.get(record.id) || {};
      return shouldAutoCloseMedicalActual(
        {
          ...record,
          actualParticipation: rawRecord.actualParticipation ?? medicalActualParticipationFallback,
        },
        rawRecord,
        todayValue
      );
    });
  }

  function syncMedicalPlayerAvailabilityStatusesFromProfiles() {
    const medicalState = getMedicalState();
    if (!medicalState || !Array.isArray(medicalState.players)) {
      return false;
    }
    let changed = false;
    const linkedProfileIndex = createMedicalLinkedPlayerProfileIndex();
    const nextPlayers = medicalState.players.map((player) => {
      const profile = getMedicalLinkedPlayerProfile(player, linkedProfileIndex);
      const profileStatus = normalizeMedicalPlayerAvailabilityStatus(
        profile?.status || profile?.availabilityStatus || profile?.availability_status,
        ""
      );
      const playerStatus = normalizeMedicalPlayerAvailabilityStatus(
        player.status || player.availabilityStatus || player.availability_status,
        ""
      );
      if (!profileStatus || profileStatus === playerStatus) {
        return player;
      }
      changed = true;
      return {
        ...player,
        status: profileStatus,
        availabilityStatus: profileStatus,
        availability_status: profileStatus,
      };
    });
    if (changed) {
      medicalState.players = nextPlayers;
    }
    return changed;
  }

  function getProfileMedicalIdentity(profile = {}) {
    const id = String(profile?.id || profile?.playerId || profile?.profileId || "").trim();
    const name = String(profile?.name || profile?.displayName || "").trim();
    const number = String(profile?.number || profile?.shirtNumber || profile?.shirt_number || "").trim();
    return {
      id,
      name,
      number,
      signature: `${name.toLowerCase()}\u0000${number.toLowerCase()}`,
    };
  }

  function isActiveSquadProfileForMedicalRoster(profile = {}) {
    if (!profile || profile.archivedAt || profile.deletedAt) {
      return false;
    }
    const rosterType = normalizePlayerProfileRosterType(
      profile.rosterType || profile.playerType || profile.squadType,
      profile.countsInSquad === false ? "guest" : "squad"
    );
    const countsInSquad =
      typeof profile.countsInSquad === "boolean"
        ? profile.countsInSquad
        : playerProfileRosterTypeCountsInSquad(rosterType);
    return countsInSquad === true && rosterType === "squad";
  }

  function buildMedicalPlayerFromProfile(profile = {}, existingPlayer = null) {
    const now = new Date().toISOString();
    const profileStatus = normalizeMedicalPlayerAvailabilityStatus(
      profile.status || profile.availabilityStatus || profile.availability_status,
      existingPlayer?.status || existingPlayer?.availabilityStatus || existingPlayer?.availability_status || ""
    );
    return normalizeMedicalPlayer({
      ...(existingPlayer || {}),
      id: existingPlayer?.id || profile.id,
      name: profile.name || profile.displayName,
      number: profile.number || profile.shirtNumber || profile.shirt_number,
      position: profile.position,
      status: profileStatus,
      availabilityStatus: profileStatus,
      availability_status: profileStatus,
      primaryRole: profile.primaryRole,
      secondaryRoles: profile.secondaryRoles,
      roleGroup: profile.roleGroup,
      photoUrl: profile.photoUrl,
      sourceUrl: profile.sourceUrl,
      rosterType: "squad",
      countsInSquad: true,
      temporaryGroup: "",
      temporaryFrom: "",
      temporaryTo: "",
      rosterOrder: profile.rosterOrder,
      createdAt: existingPlayer?.createdAt || profile.createdAt || now,
      updatedAt: profile.updatedAt || existingPlayer?.updatedAt || now,
      archivedAt: "",
      archivedBy: "",
      archiveReason: "",
    });
  }

  function hasMedicalRosterProfileFieldChanges(previousPlayer = {}, nextPlayer = {}) {
    const comparableFields = [
      "name",
      "number",
      "position",
      "photoUrl",
      "sourceUrl",
      "status",
      "availabilityStatus",
      "availability_status",
      "rosterType",
      "countsInSquad",
      "primaryRole",
      "roleGroup",
      "rosterOrder",
      "archivedAt",
      "archivedBy",
      "archiveReason",
    ];
    if (comparableFields.some((field) => previousPlayer[field] !== nextPlayer[field])) {
      return true;
    }
    return JSON.stringify(previousPlayer.secondaryRoles || []) !== JSON.stringify(nextPlayer.secondaryRoles || []);
  }

  function syncMedicalRosterFromPlayerProfiles() {
    const medicalState = getMedicalState();
    if (!medicalState || !Array.isArray(medicalState.players)) {
      return false;
    }
    const profileIndex = createMedicalLinkedPlayerProfileIndex();
    const profiles = (Array.isArray(profileIndex?.profiles) ? profileIndex.profiles : [])
      .filter(isActiveSquadProfileForMedicalRoster);
    if (!profiles.length) {
      return false;
    }
    let changed = false;
    const nextPlayers = [...medicalState.players];
    const existingById = new Map();
    const existingBySignature = new Map();
    nextPlayers.forEach((player, index) => {
      const identity = getProfileMedicalIdentity(player);
      if (identity.id && !existingById.has(identity.id)) {
        existingById.set(identity.id, { index, player });
      }
      if (identity.name && !existingBySignature.has(identity.signature)) {
        existingBySignature.set(identity.signature, { index, player });
      }
    });
    profiles.forEach((profile) => {
      const identity = getProfileMedicalIdentity(profile);
      if (!identity.name) {
        return;
      }
      const existingEntry =
        (identity.id && existingById.get(identity.id)) ||
        existingBySignature.get(identity.signature) ||
        null;
      const nextPlayer = buildMedicalPlayerFromProfile(profile, existingEntry?.player || null);
      if (!nextPlayer) {
        return;
      }
      if (existingEntry) {
        if (!hasMedicalRosterProfileFieldChanges(existingEntry.player, nextPlayer)) {
          return;
        }
        nextPlayers[existingEntry.index] = nextPlayer;
        changed = true;
        return;
      }
      const index = nextPlayers.push(nextPlayer) - 1;
      const nextIdentity = getProfileMedicalIdentity(nextPlayer);
      if (nextIdentity.id) {
        existingById.set(nextIdentity.id, { index, player: nextPlayer });
      }
      if (nextIdentity.name) {
        existingBySignature.set(nextIdentity.signature, { index, player: nextPlayer });
      }
      changed = true;
    });
    if (changed) {
      medicalState.players = nextPlayers.sort(compareMedicalPlayers);
      if (!medicalState.selectedPlayerId) {
        medicalState.selectedPlayerId = medicalState.players.find((player) => !player.archivedAt)?.id || "";
      }
    }
    return changed;
  }

  function markMedicalClinicalChange(changeType, summary) {
    ensureMedicalState();
    const medicalState = getMedicalState();
    medicalState.dataSafety = normalizeMedicalDataSafety(
      {
        ...medicalState.dataSafety,
        lastClinicalChangeAt: new Date().toISOString(),
        lastClinicalChangeBy: getCurrentMedicalActorId(),
        lastClinicalChangeType: changeType,
        lastClinicalChangeSummary: summary,
        lastDatabaseSyncStatus: "pending",
        lastDatabaseSyncEvent: changeType,
      },
      medicalState
    );
  }

  function commitMedicalClinicalState(changeType, summary) {
    markMedicalClinicalChange(changeType, summary);
    writeMedicalState();
  }

  function updateMedicalDatabaseSyncStatus(eventType, result = {}) {
    const medicalState = getMedicalState();
    if (!medicalState) {
      return;
    }
    const status = result.ok
      ? result.stored
        ? "stored"
        : result.duplicate
          ? "duplicate"
          : result.enabled === false || result.localDev
            ? "legacy"
            : "legacy"
      : "failed";
    medicalState.dataSafety = normalizeMedicalDataSafety(
      {
        ...medicalState.dataSafety,
        lastDatabaseSyncAt: new Date().toISOString(),
        lastDatabaseSyncStatus: status,
        lastDatabaseSyncEvent: eventType,
        lastPayloadHash: result.payloadHash || medicalState.dataSafety?.lastPayloadHash || "",
      },
      medicalState
    );
    writeMedicalState();
  }

  function cloneMedicalState(source = {}) {
    const todayValue = getMedicalTodayValue();
    const shouldAutoCloseActual = source.__medicalAutoCloseActual !== false;
    const shouldSeedDefaultRoster =
      !Array.isArray(source.players) || (!source.rosterVersion && source.players.length === 0);
    const players = (shouldSeedDefaultRoster ? defaultMedicalPlayers : source.players)
      .map(normalizeMedicalPlayer)
      .filter(Boolean)
      .sort(compareMedicalPlayers);
    const playerIds = new Set(players.map((player) => player.id));
    const records = Array.isArray(source.records)
      ? source.records
        .map((record) => shouldAutoCloseActual ? normalizeMedicalRecordForState(record, todayValue) : normalizeMedicalRecord(record))
        .filter((record) => record && playerIds.has(record.playerId))
        .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
      : [];
    const injuryPlans = Array.isArray(source.injuryPlans)
      ? source.injuryPlans
        .map(normalizeMedicalInjuryPlan)
        .filter((plan) => plan && playerIds.has(plan.playerId))
        .sort((first, second) => {
          const startComparison = second.startDate.localeCompare(first.startDate);
          if (startComparison !== 0) {
            return startComparison;
          }
          return new Date(second.createdAt) - new Date(first.createdAt);
        })
      : [];
    const selectedDate = isMedicalDateValue(source.selectedDate)
      ? source.selectedDate
      : formatDateValue(new Date());
    const activePlayers = players.filter((player) => !player.archivedAt);
    const selectedPlayerId = activePlayers.some((player) => player.id === source.selectedPlayerId)
      ? source.selectedPlayerId
      : activePlayers[0]?.id || "";
    return {
      selectedDate,
      selectedPlayerId,
      players,
      records,
      injuryPlans,
      dataSafety: normalizeMedicalDataSafety(source.dataSafety, { players, records, injuryPlans }),
      policy: normalizeMedicalGovernancePolicy(source.policy),
      rosterVersion: source.rosterVersion || medicalDefaultRosterVersion,
    };
  }

  function canViewPrivateMedicalDetails() { return canEditMedicalTeam(); }

  function sanitizeMedicalRecordForCoachView(record = {}) {
    const participation = normalizeMedicalParticipation(record.participation, 100);
    const statusKey = medicalStatusOptions.some((status) => status.key === record.status)
      ? record.status
      : getMedicalStatusForParticipation(participation);
    return {
      ...record,
      status: statusKey,
      participation,
      actualParticipation: medicalActualParticipationFallback,
      comment: "",
      coachNote: record.shareWithCoach ? String(record.coachNote ?? "").trim() : "",
      shareWithCoach: normalizeMedicalShareValue(record.shareWithCoach),
      rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === record.rtpPhase)
        ? record.rtpPhase
        : getMedicalRtpPhaseForRecommendation(
          statusKey,
          participation,
          getMedicalRecommendationActivityContext(record.date).type
        ),
      clearance: {},
      gates: {},
      createdBy: "coach-safe",
    };
  }

  function sanitizeMedicalInjuryPlanForCoachView(plan = {}) {
    const participation = normalizeMedicalParticipation(plan.participation, 0);
    const statusKey = medicalStatusOptions.some((status) => status.key === plan.status)
      ? plan.status
      : getMedicalStatusForParticipation(participation);
    return {
      ...plan,
      injuryType: "Availability plan",
      bodyArea: "",
      status: statusKey,
      participation,
      reviewDate: "",
      rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === plan.rtpPhase)
        ? plan.rtpPhase
        : getMedicalRtpPhaseForRecommendation(statusKey, participation),
      phase: "Coach-safe availability plan",
      clearance: {},
      gates: {},
      coachNote: plan.shareWithCoach ? String(plan.coachNote ?? "").trim() : "",
      shareWithCoach: normalizeMedicalShareValue(plan.shareWithCoach),
      comment: "",
      rtpLibraryProfileId: "",
      rtpLibraryProfileName: "",
      rtpLibraryEvidenceLevel: "",
      rtpLibrarySummary: "",
      rtpProgramPhases: [],
      rtpProgramLoadText: [],
      rtpProgramRiskFactors: [],
      rtpProgramWarningPoints: [],
      rtpProgramGateCriteria: [],
      rtpProgramExercises: [],
      rtpProgramNextSteps: [],
      rtpProgramHoldRules: [],
      rtpProgramTracker: {},
      medicalBoard: { pitchMode: "full-wide", elements: [], exercises: [], updatedAt: "" },
      createdBy: "coach-safe",
    };
  }

  function sanitizeMedicalStateForCurrentUser(state = {}) {
    if (getCurrentPlatformUser() && canViewPrivateMedicalDetails()) {
      return state;
    }
    return cloneMedicalState({
      ...state,
      __medicalAutoCloseActual: false,
      records: Array.isArray(state.records) ? state.records.map(sanitizeMedicalRecordForCoachView) : [],
      injuryPlans: Array.isArray(state.injuryPlans) ? state.injuryPlans.map(sanitizeMedicalInjuryPlanForCoachView) : [],
      policy: sanitizeMedicalGovernancePolicyForCoachView(),
    });
  }

  function setMedicalStateStorageValue(state = getMedicalState(), suppressCentralSync = false) {
    if (suppressCentralSync) {
      rawDataSafetySetItem(medicalTeamStorageKey, JSON.stringify(state));
      return;
    }
    win.localStorage.setItem(medicalTeamStorageKey, JSON.stringify(state));
  }

  function readMedicalState() {
    try {
      const raw = win.localStorage.getItem(medicalTeamStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const state = sanitizeMedicalStateForCurrentUser(cloneMedicalState(parsed));
      const shouldPersistSeededRoster =
        !raw || (!parsed?.rosterVersion && Array.isArray(parsed?.players) && parsed.players.length === 0);
      const shouldPersistAutoClosedActual = canViewPrivateMedicalDetails()
        && hasAutoClosedMedicalActualRecords(parsed?.records, state.records);
      if (shouldPersistSeededRoster || shouldPersistAutoClosedActual) {
        setMedicalStateStorageValue(state, true);
      }
      return state;
    } catch {
      const state = sanitizeMedicalStateForCurrentUser(cloneMedicalState({}));
      try {
        setMedicalStateStorageValue(state, true);
      } catch {
        logEvent("Medical Team data could not be written to local storage.");
      }
      return state;
    }
  }

  function writeMedicalState() {
    const medicalState = getMedicalState();
    if (!medicalState) {
      return;
    }
    let nextStateJson = "";
    try {
      const coachSafeOnly = !canViewPrivateMedicalDetails();
      const nextState = coachSafeOnly ? sanitizeMedicalStateForCurrentUser(medicalState) : medicalState;
      nextStateJson = JSON.stringify(nextState);
      const currentStateJson = win.localStorage.getItem(medicalTeamStorageKey);
      if (currentStateJson === nextStateJson) {
        return;
      }
      setMedicalStateStorageValue(nextState, coachSafeOnly);
    } catch (error) {
      if (nextStateJson && canViewPrivateMedicalDetails() && isStorageQuotaError(error)) {
        queueCentralStateWrite(medicalTeamStorageKey, nextStateJson, { automatic: false });
        logEvent("Medical Team browser cache is full; the protected state was queued directly for central sync.");
        return;
      }
      logEvent("Medical Team data could not be written to local storage.");
    }
  }

  function ensureMedicalState() {
    if (medicalReadBatchDepth > 0 && getMedicalState()) {
      return getMedicalState();
    }
    if (!getMedicalState()) {
      setMedicalState(readMedicalState());
    }
    archiveMedicalPlayersRemovedFromSquad({ persist: canViewPrivateMedicalDetails() });
    const rosterChanged = syncMedicalRosterFromPlayerProfiles();
    const availabilityChanged = syncMedicalPlayerAvailabilityStatusesFromProfiles();
    if (canViewPrivateMedicalDetails() && (rosterChanged || availabilityChanged)) {
      writeMedicalState();
    }
    return getMedicalState();
  }

  function withMedicalStateReadBatch(callback) {
    ensureMedicalState();
    medicalReadBatchDepth += 1;
    try {
      return typeof callback === "function" ? callback(getMedicalState()) : getMedicalState();
    } finally {
      medicalReadBatchDepth = Math.max(0, medicalReadBatchDepth - 1);
    }
  }

  return {
    canViewPrivateMedicalDetails,
    cloneMedicalState,
    commitMedicalClinicalState,
    ensureMedicalState,
    getMedicalStatusOptionForDate,
    markMedicalClinicalChange,
    readMedicalState,
    sanitizeMedicalInjuryPlanForCoachView,
    sanitizeMedicalRecordForCoachView,
    sanitizeMedicalStateForCurrentUser,
    setMedicalStateStorageValue,
    syncMedicalRosterFromPlayerProfiles,
    syncMedicalPlayerAvailabilityStatusesFromProfiles,
    updateMedicalDatabaseSyncStatus,
    withMedicalStateReadBatch,
    writeMedicalState,
  };
}
