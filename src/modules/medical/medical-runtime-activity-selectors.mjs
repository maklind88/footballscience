import {
  createMedicalRtpLibraryStarterDraft,
  getMedicalRtpLibraryProfileById,
  getMedicalRtpLibraryProfiles,
} from "./medical-rtp-library-data.mjs";
import { getMedicalRtpExercisesForProfile } from "./medical-rtp-exercise-bank-data.mjs";
import { normalizeMedicalRtpProgramTracker } from "./medical-rtp-tracker-helpers.mjs";

export function createMedicalRuntimeActivitySelectors(deps = {}) {
  const {
    addCalendarDays,
    canEditMedicalTeam = () => false,
    ensureMedicalState = () => {},
    formatDateValue,
    getCurrentUser = () => null,
    getFormValues = () => ({}),
    getMedicalEntityUpdatedMs = () => 0,
    getMedicalPlayerAvailabilityStatusOption = () => ({ label: "Unavailable" }),
    getMedicalPlayerSquadAvailabilityBlockReason = () => "",
    getMedicalRtpPhaseOption = () => ({ key: "", status: "", participation: 0 }),
    getMedicalState = () => null,
    getMedicalStatusOptionForDate = () => ({ key: "not-set", label: "Not set", tone: "unset", defaultParticipation: null }),
    getMedicalTodayValue = () => formatDateValue(new Date()),
    getPlatformStructureState = () => null,
    getPlatformTeamDisplayName = () => "",
    getRemovedSquadPlayerIdSet = () => new Set(),
    getScheduleEventsForDate = () => [],
    getScheduleMainEvent = () => null,
    isAdmin = () => false,
    isDateValue = () => false,
    isItemArchived = () => false,
    isPlayerBlockedBySquadAvailability = () => false,
    isPlayerRemovedFromSquad = () => false,
    isScheduleSessionEvent = () => false,
    isTemporaryPlayerProfile = () => false,
    medicalActualParticipationFallback = "not-logged",
    medicalClearanceRoles = [],
    medicalInjuryPlanDraftsByPlayerId = new Map(),
    medicalInjuryPlanStatusOptions = [],
    medicalLoadGateOptions = [],
    medicalWindowLength = 7,
    normalizeClearance = (value) => value || {},
    normalizeLoadGates = (value) => value || {},
    normalizeParticipation = (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    normalizePlatformText = (value = "", fallback = "") => String(value || fallback || "").trim(),
    normalizeShareValue = (value) => value === true || value === "true" || value === "on" || value === "1",
    parseDateValue,
    scheduleEventTypes = {},
  } = deps;

  function readState() {
    ensureMedicalState();
    return getMedicalState() || { players: [], records: [], injuryPlans: [], selectedDate: "" };
  }

  function getSelectedDate() {
    return getMedicalState()?.selectedDate || "";
  }

  function getClinicalDateValue() {
    const todayValue = getMedicalTodayValue();
    return isDateValue(todayValue) ? todayValue : formatDateValue(new Date());
  }

  function getMedicalAccessLabel() {
    if (canEditMedicalTeam()) {
      return isAdmin() ? "Admin oversight" : "Medical edit access";
    }
    return "Coach view";
  }

  function getMedicalHeroTeamName() {
    const user = getCurrentUser();
    const teamName = getPlatformTeamDisplayName(user, getPlatformStructureState());
    if (teamName && teamName !== "Team") {
      return teamName;
    }
    return normalizePlatformText(user?.team || user?.teamName || user?.clubName || user?.club, "") || "Medical Team";
  }

  function isMedicalPlayerVisibleForDate(player = {}, dateValue = getSelectedDate()) {
    if (!isTemporaryPlayerProfile(player)) return true;
    return !isPlayerBlockedBySquadAvailability(player, dateValue);
  }

  function getActiveMedicalPlayers() {
    const state = readState();
    const removedPlayerIdSet = getRemovedSquadPlayerIdSet();
    return (state.players || []).filter(
      (player) => !isItemArchived(player) && !isPlayerRemovedFromSquad(player, removedPlayerIdSet)
    );
  }

  function getSelectedMedicalPlayer() {
    const state = readState();
    const activePlayers = getActiveMedicalPlayers();
    return activePlayers.find((player) => player.id === state.selectedPlayerId) ?? activePlayers[0] ?? null;
  }

  function getActiveMedicalPlayersForDate(dateValue = getSelectedDate()) {
    return getActiveMedicalPlayers().filter((player) => isMedicalPlayerVisibleForDate(player, dateValue));
  }

  function isMedicalInjuryPlanActive(plan, dateValue = getSelectedDate()) {
    return Boolean(plan && !isItemArchived(plan) && isDateValue(dateValue) && plan.startDate <= dateValue && plan.endDate >= dateValue);
  }

  function getMedicalPlayerInjuryPlans(playerId, options = {}) {
    const state = readState();
    const includeArchived = Boolean(options.includeArchived);
    const clinicalDate = getClinicalDateValue();
    return (state.injuryPlans || [])
      .filter((plan) => plan.playerId === playerId && (includeArchived || !isItemArchived(plan)))
      .sort((first, second) => {
        const activeComparison =
          Number(isMedicalInjuryPlanActive(second, clinicalDate)) -
          Number(isMedicalInjuryPlanActive(first, clinicalDate));
        if (activeComparison !== 0) {
          return activeComparison;
        }
        const startComparison = second.startDate.localeCompare(first.startDate);
        if (startComparison !== 0) {
          return startComparison;
        }
        return new Date(second.createdAt) - new Date(first.createdAt);
      });
  }

  function getActiveMedicalInjuryPlan(playerId, dateValue = getClinicalDateValue()) {
    const state = readState();
    return (state.injuryPlans || [])
      .filter((plan) => plan.playerId === playerId && isMedicalInjuryPlanActive(plan, dateValue))
      .sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt))[0] ?? null;
  }

  function createMedicalRecordFromSquadAvailabilityBlock(player, dateValue) {
    if (!player || !isDateValue(dateValue) || !isPlayerBlockedBySquadAvailability(player, dateValue)) {
      return null;
    }
    const option = getMedicalPlayerAvailabilityStatusOption(player, dateValue);
    const reason = option.label || "Unavailable";
    return {
      id: `squad-availability:${player.id}:${dateValue}`,
      playerId: player.id,
      date: dateValue,
      status: "unavailable",
      participation: 0,
      actualParticipation: medicalActualParticipationFallback,
      comment: `${reason} in Squad Room`,
      coachNote: `${reason} - not available for team activity`,
      shareWithCoach: true,
      rtpPhase: "medical-restriction",
      createdAt: player.updatedAt || new Date().toISOString(),
      updatedAt: player.updatedAt || new Date().toISOString(),
      createdBy: "squad-room",
      source: "squad-availability",
    };
  }

  function isMedicalPlanCleared(plan) {
    if (!plan) {
      return true;
    }
    const clearance = normalizeClearance(plan.clearance);
    const gates = normalizeLoadGates(plan.gates);
    return medicalClearanceRoles.every((role) => clearance[role.key]) &&
      medicalLoadGateOptions.every((gate) => gates[gate.key] === "pass");
  }

  function getMedicalRecommendationBlockReason(playerId, participation, dateValue) {
    const activityContext = getMedicalRecommendationActivityContext(dateValue);
    if (!activityContext.isRecommendable) {
      return activityContext.blockReason;
    }
    const state = readState();
    const player = (state.players || []).find((candidate) => candidate.id === playerId);
    const squadBlockReason = getMedicalPlayerSquadAvailabilityBlockReason(player, dateValue);
    if (squadBlockReason) {
      return squadBlockReason;
    }
    const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
    if (participation === 100 && activePlan && !isMedicalPlanCleared(activePlan)) {
      return activityContext.type === "match"
        ? "Clearance checklist required before match availability."
        : "Clearance checklist required before full training.";
    }
    return "";
  }

  function getMedicalReviewAlerts(dateValue = getSelectedDate()) {
    const state = readState();
    if (!isDateValue(dateValue)) {
      return [];
    }
    const endDate = formatDateValue(addCalendarDays(parseDateValue(dateValue), 7));
    return (state.injuryPlans || [])
      .filter((plan) => !isItemArchived(plan) && plan.reviewDate && plan.reviewDate <= endDate && plan.endDate >= dateValue)
      .map((plan) => ({
        plan,
        player: (state.players || []).find((player) => player.id === plan.playerId) ?? null,
        isOverdue: plan.reviewDate < dateValue,
      }))
      .filter((item) => item.player)
      .sort((first, second) => {
        if (first.isOverdue !== second.isOverdue) {
          return Number(second.isOverdue) - Number(first.isOverdue);
        }
        return first.plan.reviewDate.localeCompare(second.plan.reviewDate);
      });
  }

  function getMedicalCoachComment(record) {
    if (!record || !record.shareWithCoach) {
      return "";
    }
    return String(record.coachNote ?? "").trim();
  }

  function getMedicalVisibleComment(record) {
    if (!record) {
      return "";
    }
    return canEditMedicalTeam() ? String(record.comment ?? "").trim() : getMedicalCoachComment(record);
  }

  function createMedicalRecordFromInjuryPlan(plan, dateValue) {
    if (!plan) {
      return null;
    }
    const injuryLabel = [plan.injuryType, plan.bodyArea].filter(Boolean).join(" / ");
    const clearancePending = plan.participation === 100 && !isMedicalPlanCleared(plan);
    return {
      id: `injury-plan:${plan.id}:${dateValue}`,
      playerId: plan.playerId,
      date: dateValue,
      status: clearancePending ? "modified" : plan.status,
      participation: clearancePending ? 75 : plan.participation,
      actualParticipation: medicalActualParticipationFallback,
      comment: [injuryLabel, plan.phase, clearancePending ? "Clearance pending" : "", plan.comment].filter(Boolean).join(" - "),
      coachNote: plan.coachNote,
      shareWithCoach: plan.shareWithCoach,
      rtpPhase: plan.rtpPhase,
      clearance: plan.clearance,
      gates: plan.gates,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      createdBy: plan.createdBy,
      source: "injury-plan",
      injuryPlanId: plan.id,
    };
  }

  function getLatestMedicalRecord(playerId, dateValue = getSelectedDate()) {
    const state = readState();
    const player = (state.players || []).find((candidate) => candidate.id === playerId);
    const squadBlockRecord = createMedicalRecordFromSquadAvailabilityBlock(player, dateValue);
    if (squadBlockRecord) {
      return squadBlockRecord;
    }
    const manualRecord = (state.records || [])
      .filter((record) => record.playerId === playerId && record.date === dateValue && !isItemArchived(record))
      .sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt))[0] ?? null;
    const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
    const planRecord = createMedicalRecordFromInjuryPlan(activePlan, dateValue);
    if (manualRecord && planRecord) {
      return getMedicalEntityUpdatedMs(activePlan) >= getMedicalEntityUpdatedMs(manualRecord) ? planRecord : manualRecord;
    }
    return manualRecord || planRecord;
  }

  function getMedicalPlayerRecords(playerId, options = {}) {
    const state = readState();
    const includeArchived = Boolean(options.includeArchived);
    return (state.records || [])
      .filter((record) => record.playerId === playerId && (includeArchived || !isItemArchived(record)))
      .sort((first, second) => {
        const dateComparison = second.date.localeCompare(first.date);
        if (dateComparison !== 0) {
          return dateComparison;
        }
        return new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt);
      });
  }

  function isMedicalRestrictedRecommendationRecord(record) {
    return normalizeParticipation(record?.participation, 100) !== 100;
  }

  function getMedicalPlayerRestrictedLogRecords(playerId, options = {}) {
    return getMedicalPlayerRecords(playerId, options).filter(isMedicalRestrictedRecommendationRecord);
  }

  function getMedicalWindowDates() {
    const state = readState();
    const startDate = parseDateValue(state.selectedDate);
    return Array.from({ length: medicalWindowLength }, (_, index) => formatDateValue(addCalendarDays(startDate, index)));
  }

  function getMedicalPastWindowDates(dateValue = getSelectedDate()) {
    readState();
    const endDate = parseDateValue(dateValue);
    const windowLength = Math.max(1, Number(medicalWindowLength) || 5);
    const targetCount = Math.min(5, windowLength);
    const scanLimit = windowLength;
    const plannedDates = [];
    for (let offset = 0; offset < scanLimit && plannedDates.length < targetCount; offset += 1) {
      const candidateDate = formatDateValue(addCalendarDays(endDate, -offset));
      if (getMedicalRecommendationActivityContext(candidateDate).isRecommendable) {
        plannedDates.push(candidateDate);
      }
    }
    return plannedDates.reverse();
  }

  function getMedicalDaySpan(startDateValue, endDateValue) {
    if (!isDateValue(startDateValue) || !isDateValue(endDateValue)) {
      return null;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((parseDateValue(endDateValue) - parseDateValue(startDateValue)) / dayMs) + 1);
  }

  function getMedicalMonthToDateDates(referenceDate = new Date()) {
    const today = new Date(referenceDate);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const dayCount = getMedicalDaySpan(formatDateValue(monthStart), formatDateValue(today)) ?? 1;
    return Array.from({ length: dayCount }, (_, index) => formatDateValue(addCalendarDays(monthStart, index)))
      .filter((dateValue) => getMedicalRecommendationActivityContext(dateValue).isRecommendable);
  }

  function getMedicalScheduleSummary(dateValue) {
    const events = getScheduleEventsForDate(dateValue);
    const mainEvent = getScheduleMainEvent(events);
    if (!mainEvent) {
      return "No team event";
    }
    return mainEvent.title || scheduleEventTypes[mainEvent.type]?.label || "Team event";
  }

  function getMedicalRecommendationEvent(events = []) {
    const matchEvent = events.find((event) => event?.type === "match");
    if (matchEvent) {
      return { event: matchEvent, type: "match" };
    }
    const trainingEvent = events.find(isScheduleSessionEvent);
    if (trainingEvent) {
      return { event: trainingEvent, type: "training" };
    }
    return { event: getScheduleMainEvent(events) ?? null, type: "none" };
  }

  function getMedicalRecommendationActivityContext(dateValue = getSelectedDate()) {
    const cleanDate = isDateValue(dateValue) ? dateValue : formatDateValue(new Date());
    const events = getScheduleEventsForDate(cleanDate);
    const { event: mainEvent, type: activityType } = getMedicalRecommendationEvent(events);
    const rawType = mainEvent?.type || activityType;
    const isMatch = activityType === "match";
    const isTraining = activityType === "training";
    const isRecommendable = isMatch || isTraining;
    const scheduleLabel = mainEvent?.title || scheduleEventTypes[rawType]?.label || "No team event";
    const activityLabel = isMatch ? "Match" : isTraining ? "Training" : "No team activity";
    return {
      date: cleanDate,
      type: isRecommendable ? activityType : "none",
      rawType,
      mainEvent,
      scheduleLabel,
      isRecommendable,
      activityLabel,
      availabilityLabel: isRecommendable ? `${activityLabel} Availability` : "No Team Activity",
      recommendationLabel: isRecommendable ? `${activityLabel} Recommendation` : "No Team Recommendation",
      quickLabel: isRecommendable ? `Quick ${activityLabel.toLowerCase()} recommendation` : "Locked",
      blockReason: isRecommendable ? "" : "No scheduled training or match for this date.",
    };
  }

  function getMedicalRecordStatus(record) {
    if (!record) {
      return { key: "not-set", label: "Not set", tone: "unset", defaultParticipation: null };
    }
    return getMedicalStatusOptionForDate(record.status, record.date, record.rtpPhase);
  }

  function getDefaultMedicalInjuryPlanDraft(playerId = getMedicalState()?.selectedPlayerId || "") {
    return {
      planId: "",
      playerId: String(playerId ?? "").trim(),
      injuryType: "",
      bodyArea: "",
      startDate: isDateValue(getSelectedDate()) ? getSelectedDate() : formatDateValue(new Date()),
      duration: 4,
      durationUnit: "weeks",
      status: "unavailable",
      rtpPhase: "medical-restriction",
      participation: 0,
      reviewDate: "",
      phase: "",
      comment: "",
      coachNote: "",
      shareWithCoach: false,
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
    };
  }

  function normalizeMedicalTextList(value = []) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 12);
    }
    const text = String(value ?? "").trim();
    if (!text) {
      return [];
    }
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return normalizeMedicalTextList(parsed);
      }
    } catch {
    }
    return text.split(/\n|;/u).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  }

  function normalizeMedicalBoardDraft(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    return {
      pitchMode: String(source.pitchMode || "full-wide").trim() || "full-wide",
      elements: (Array.isArray(source.elements) ? source.elements : []).map((item) => ({ ...item })).slice(0, 40),
      exercises: (Array.isArray(source.exercises) ? source.exercises : []).map((item) => ({ ...item })).slice(0, 24),
      updatedAt: String(source.updatedAt || "").trim(),
    };
  }

  function normalizeMedicalInjuryPlanDraft(draft = {}, playerId = draft.playerId) {
    const defaults = getDefaultMedicalInjuryPlanDraft(playerId);
    const draftPlayerId = String(draft.playerId ?? defaults.playerId).trim() || defaults.playerId;
    const rtpPhase = getMedicalRtpPhaseOption(draft.rtpPhase || defaults.rtpPhase);
    const status = medicalInjuryPlanStatusOptions.some((option) => option.key === draft.status) ? draft.status : rtpPhase.status;
    const durationUnit = ["days", "weeks", "months"].includes(draft.durationUnit) ? draft.durationUnit : defaults.durationUnit;
    const rtpProgramPhases = normalizeMedicalTextList(draft.rtpProgramPhases ?? defaults.rtpProgramPhases);
    const rtpProgramLoadText = normalizeMedicalTextList(draft.rtpProgramLoadText ?? defaults.rtpProgramLoadText);
    const rtpProgramRiskFactors = normalizeMedicalTextList(draft.rtpProgramRiskFactors ?? defaults.rtpProgramRiskFactors);
    const rtpProgramWarningPoints = normalizeMedicalTextList(draft.rtpProgramWarningPoints ?? defaults.rtpProgramWarningPoints);
    const rtpProgramGateCriteria = normalizeMedicalTextList(draft.rtpProgramGateCriteria ?? defaults.rtpProgramGateCriteria);
    const rtpProgramExercises = normalizeMedicalTextList(draft.rtpProgramExercises ?? defaults.rtpProgramExercises);
    const rtpProgramNextSteps = normalizeMedicalTextList(draft.rtpProgramNextSteps ?? defaults.rtpProgramNextSteps);
    const rtpProgramHoldRules = normalizeMedicalTextList(draft.rtpProgramHoldRules ?? defaults.rtpProgramHoldRules);
    const rtpProgramSource = {
      rtpProgramPhases,
      rtpProgramLoadText,
      rtpProgramRiskFactors,
      rtpProgramWarningPoints,
      rtpProgramGateCriteria,
      rtpProgramExercises,
      rtpProgramNextSteps,
      rtpProgramHoldRules,
    };
    return {
      ...defaults,
      planId: String(draft.planId ?? draft.id ?? defaults.planId).trim(),
      playerId: draftPlayerId,
      injuryType: String(draft.injuryType ?? defaults.injuryType).trim(),
      bodyArea: String(draft.bodyArea ?? defaults.bodyArea).trim(),
      startDate: isDateValue(draft.startDate) ? draft.startDate : defaults.startDate,
      duration: Math.max(1, Number(draft.duration) || defaults.duration),
      durationUnit,
      status,
      rtpPhase: rtpPhase.key,
      participation: normalizeParticipation(draft.participation, rtpPhase.participation),
      reviewDate: isDateValue(draft.reviewDate) ? draft.reviewDate : "",
      phase: String(draft.phase ?? defaults.phase).trim(),
      comment: String(draft.comment ?? defaults.comment).trim(),
      coachNote: String(draft.coachNote ?? defaults.coachNote).trim(),
      shareWithCoach: normalizeShareValue(draft.shareWithCoach),
      rtpLibraryProfileId: String(draft.rtpLibraryProfileId ?? defaults.rtpLibraryProfileId).trim(),
      rtpLibraryProfileName: String(draft.rtpLibraryProfileName ?? defaults.rtpLibraryProfileName).trim(),
      rtpLibraryEvidenceLevel: String(draft.rtpLibraryEvidenceLevel ?? defaults.rtpLibraryEvidenceLevel).trim(),
      rtpLibrarySummary: String(draft.rtpLibrarySummary ?? defaults.rtpLibrarySummary).trim(),
      rtpProgramPhases,
      rtpProgramLoadText,
      rtpProgramRiskFactors,
      rtpProgramWarningPoints,
      rtpProgramGateCriteria,
      rtpProgramExercises,
      rtpProgramNextSteps,
      rtpProgramHoldRules,
      rtpProgramTracker: normalizeMedicalRtpProgramTracker(draft.rtpProgramTracker || draft, rtpProgramSource),
      medicalBoard: normalizeMedicalBoardDraft(draft.medicalBoard ?? defaults.medicalBoard),
    };
  }

  function getMedicalInjuryPlanDraft(playerId = getMedicalState()?.selectedPlayerId || "") {
    const draftPlayerId = String(playerId ?? "").trim();
    const draft = normalizeMedicalInjuryPlanDraft(
      medicalInjuryPlanDraftsByPlayerId.get(draftPlayerId) ?? { playerId: draftPlayerId },
      draftPlayerId
    );
    if (draftPlayerId) {
      medicalInjuryPlanDraftsByPlayerId.set(draftPlayerId, draft);
    }
    return draft;
  }

  function setMedicalInjuryPlanDraft(playerId, values = {}) {
    const draftPlayerId = String(playerId ?? values.playerId ?? "").trim();
    if (!draftPlayerId) {
      return null;
    }
    const draft = normalizeMedicalInjuryPlanDraft({ ...values, playerId: draftPlayerId }, draftPlayerId);
    medicalInjuryPlanDraftsByPlayerId.set(draftPlayerId, draft);
    return draft;
  }

  function setMedicalInjuryPlanDraftFromPlan(plan) {
    if (!plan?.playerId) {
      return null;
    }
    return setMedicalInjuryPlanDraft(plan.playerId, { ...plan, planId: plan.id });
  }

  function getMedicalRtpLibraryProfile(profileId = "") {
    return getMedicalRtpLibraryProfileById(profileId);
  }

  function getMedicalRtpLibraryStarterDraft(profileId = "", playerId = getMedicalState()?.selectedPlayerId || "") {
    const starterDraft = createMedicalRtpLibraryStarterDraft(profileId, playerId, getSelectedDate());
    return starterDraft ? normalizeMedicalInjuryPlanDraft(starterDraft, playerId) : null;
  }

  function getMedicalRtpLibraryStarterDraftForPlan(profileId = "", planId = "") {
    const normalizedPlanId = String(planId ?? "").trim();
    const state = getMedicalState();
    const plan = state?.injuryPlans?.find((entry) => entry.id === normalizedPlanId && !isItemArchived(entry));
    if (!plan?.playerId) {
      return null;
    }
    const starterDraft = createMedicalRtpLibraryStarterDraft(profileId, plan.playerId, getSelectedDate());
    if (!starterDraft) {
      return null;
    }
    return normalizeMedicalInjuryPlanDraft(
      {
        ...plan,
        planId: plan.id,
        playerId: plan.playerId,
        injuryType: plan.injuryType || starterDraft.injuryType,
        bodyArea: plan.bodyArea || starterDraft.bodyArea,
        phase: plan.phase || starterDraft.phase,
        coachNote: plan.coachNote || starterDraft.coachNote,
        shareWithCoach: plan.shareWithCoach,
        rtpLibraryProfileId: starterDraft.rtpLibraryProfileId,
        rtpLibraryProfileName: starterDraft.rtpLibraryProfileName,
        rtpLibraryEvidenceLevel: starterDraft.rtpLibraryEvidenceLevel,
        rtpLibrarySummary: starterDraft.rtpLibrarySummary,
        rtpProgramPhases: starterDraft.rtpProgramPhases,
        rtpProgramLoadText: starterDraft.rtpProgramLoadText,
        rtpProgramRiskFactors: starterDraft.rtpProgramRiskFactors,
        rtpProgramWarningPoints: starterDraft.rtpProgramWarningPoints,
        rtpProgramGateCriteria: starterDraft.rtpProgramGateCriteria,
        rtpProgramExercises: starterDraft.rtpProgramExercises,
        rtpProgramNextSteps: starterDraft.rtpProgramNextSteps,
        rtpProgramHoldRules: starterDraft.rtpProgramHoldRules,
      },
      plan.playerId
    );
  }

  function clearMedicalInjuryPlanDraft(playerId) {
    const draftPlayerId = String(playerId ?? "").trim();
    if (draftPlayerId) {
      medicalInjuryPlanDraftsByPlayerId.delete(draftPlayerId);
    }
  }

  function getMedicalInjuryPlanFormDraft(form) {
    if (!form) {
      return null;
    }
    const values = getFormValues(form);
    return {
      ...values,
      playerId: values.playerId || form.querySelector("[name='playerId']")?.value || getMedicalState()?.selectedPlayerId || "",
      shareWithCoach: Boolean(form.querySelector("[name='shareWithCoach']")?.checked),
      rtpProgramTracker: normalizeMedicalRtpProgramTracker(values, values),
    };
  }

  function persistMedicalInjuryPlanDraftFromForm(form) {
    const draft = getMedicalInjuryPlanFormDraft(form);
    if (!draft) {
      return null;
    }
    return setMedicalInjuryPlanDraft(draft.playerId, draft);
  }

  return {
    clearMedicalInjuryPlanDraft,
    createMedicalRecordFromInjuryPlan,
    createMedicalRecordFromSquadAvailabilityBlock,
    getActiveMedicalInjuryPlan,
    getActiveMedicalPlayers,
    getActiveMedicalPlayersForDate,
    getDefaultMedicalInjuryPlanDraft,
    getLatestMedicalRecord,
    getMedicalAccessLabel,
    getMedicalCoachComment,
    getMedicalDaySpan,
    getMedicalHeroTeamName,
    getMedicalInjuryPlanDraft,
    getMedicalInjuryPlanFormDraft,
    getMedicalRtpLibraryProfile,
    getMedicalRtpLibraryProfiles,
    getMedicalRtpExercisesForProfile,
    getMedicalRtpLibraryStarterDraft,
    getMedicalRtpLibraryStarterDraftForPlan,
    getMedicalMonthToDateDates,
    getMedicalPastWindowDates,
    getMedicalPlayerInjuryPlans,
    getMedicalPlayerRecords,
    getMedicalPlayerRestrictedLogRecords,
    getMedicalRecommendationActivityContext,
    getMedicalRecommendationBlockReason,
    getMedicalRecommendationEvent,
    getMedicalRecordStatus,
    getMedicalReviewAlerts,
    getMedicalScheduleSummary,
    getMedicalVisibleComment,
    getMedicalWindowDates,
    getSelectedMedicalPlayer,
    isMedicalInjuryPlanActive,
    isMedicalPlanCleared,
    isMedicalPlayerVisibleForDate,
    isMedicalRestrictedRecommendationRecord,
    normalizeMedicalInjuryPlanDraft,
    persistMedicalInjuryPlanDraftFromForm,
    setMedicalInjuryPlanDraft,
    setMedicalInjuryPlanDraftFromPlan,
  };
}
