export function createMedicalRuntimeStateService(deps = {}) {
  const {
    archiveMedicalPlayersRemovedFromSquad = () => {},
    canEditMedicalTeam = () => false,
    compareMedicalPlayers = () => 0,
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
    rawDataSafetySetItem = (key, value) => win.localStorage?.setItem?.(key, value),
    sanitizeMedicalGovernancePolicyForCoachView = () => ({}),
    setMedicalState = () => {},
    win = globalThis,
  } = deps;

  function getMedicalStatusOptionForDate(statusKey, dateValue = getMedicalState()?.selectedDate, rtpPhase = "") {
    return getMedicalStatusOptionForDateFromHelper(statusKey, dateValue, rtpPhase);
  }

  function syncMedicalPlayerAvailabilityStatusesFromProfiles() {
    const medicalState = getMedicalState();
    if (!medicalState || !Array.isArray(medicalState.players)) {
      return false;
    }
    let changed = false;
    const nextPlayers = medicalState.players.map((player) => {
      const profile = getMedicalLinkedPlayerProfile(player);
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
    const shouldSeedDefaultRoster =
      !Array.isArray(source.players) || (!source.rosterVersion && source.players.length === 0);
    const players = (shouldSeedDefaultRoster ? defaultMedicalPlayers : source.players)
      .map(normalizeMedicalPlayer)
      .filter(Boolean)
      .sort(compareMedicalPlayers);
    const playerIds = new Set(players.map((player) => player.id));
    const records = Array.isArray(source.records)
      ? source.records
        .map(normalizeMedicalRecord)
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
      if (shouldPersistSeededRoster) {
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
    try {
      const coachSafeOnly = !canViewPrivateMedicalDetails();
      const nextState = coachSafeOnly ? sanitizeMedicalStateForCurrentUser(medicalState) : medicalState;
      const nextStateJson = JSON.stringify(nextState);
      const currentStateJson = win.localStorage.getItem(medicalTeamStorageKey);
      if (currentStateJson === nextStateJson) {
        return;
      }
      setMedicalStateStorageValue(nextState, coachSafeOnly);
    } catch {
      logEvent("Medical Team data could not be written to local storage.");
    }
  }

  function ensureMedicalState() {
    if (!getMedicalState()) {
      setMedicalState(readMedicalState());
    }
    archiveMedicalPlayersRemovedFromSquad({ persist: canViewPrivateMedicalDetails() });
    syncMedicalPlayerAvailabilityStatusesFromProfiles();
    return getMedicalState();
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
    syncMedicalPlayerAvailabilityStatusesFromProfiles,
    updateMedicalDatabaseSyncStatus,
    writeMedicalState,
  };
}
