import { getSquadTrainingAvailabilitySummary } from "./squad-training-availability-summary.mjs";

export function createSquadMedicalStatusService(deps = {}) {
  const {
    ensureMedicalState = () => {},
    formatDateValue = (value) => String(value || ""),
    formatMedicalDateLabel = (value) => String(value || ""),
    getActiveMedicalInjuryPlan = () => null,
    getLatestMedicalRecord = () => null,
    getMedicalRecommendationActivityContext = () => null,
    getMedicalRecordStatus = () => ({ label: "" }),
    getMedicalRtpPhaseOption = () => ({ label: "" }),
    getMedicalState = () => ({ records: [] }),
    getPlayerAvailabilityStatusForDate = () => "",
    getTeamTrainingDateValues = () => [],
    medicalActualParticipationFallback = "not-logged",
  } = deps;

  function getLatestManualMedicalLog(playerId, options = {}) {
    if (options.medicalStateReady !== true) {
      ensureMedicalState();
    }
    return (getMedicalState().records || [])
      .filter((record) => record.playerId === playerId)
      .sort((first, second) => {
        const dateComparison = second.date.localeCompare(first.date);
        if (dateComparison !== 0) {
          return dateComparison;
        }
        return new Date(second.createdAt) - new Date(first.createdAt);
      })[0] ?? null;
  }

  function getPlayerProfileMedicalStatusOverride(snapshot = {}) {
    if (snapshot.medicalSource === "squad-availability" && !snapshot.hasActivePlan) {
      return "";
    }
    const statusKey = String(snapshot.medicalStatusKey || snapshot.tone || "").trim();
    const participation = Number(snapshot.participation);
    if (snapshot.hasActivePlan && Number.isFinite(participation) && participation < 100) {
      return "injured";
    }
    if (statusKey === "unavailable" || statusKey === "rehab") {
      return "injured";
    }
    if (statusKey === "modified" || statusKey === "controlled") {
      return "managed";
    }
    return "";
  }

  function getPlayerProfileEffectiveStatusFromSnapshot(player = {}, snapshot = {}) {
    return getPlayerProfileMedicalStatusOverride(snapshot) || player.status || "available";
  }

  function getPlayerProfileEffectiveStatus(player = {}, dateValue = formatDateValue(new Date())) {
    return getPlayerProfileEffectiveStatusFromSnapshot(player, getPlayerProfileMedicalSnapshot(player.id, dateValue));
  }

  function getPlayerProfileMedicalSnapshot(playerId, dateValue = formatDateValue(new Date()), options = {}) {
    if (options.medicalStateReady !== true) {
      ensureMedicalState();
    }
    const currentRecord = getLatestMedicalRecord(playerId, dateValue);
    const latestLog = getLatestManualMedicalLog(playerId, { medicalStateReady: true });
    const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
    const openEndedLog =
      !currentRecord &&
      !activePlan &&
      latestLog &&
      latestLog.date <= dateValue &&
      ["unavailable", "rehab", "modified", "controlled"].includes(latestLog.status)
        ? latestLog
        : null;
    const medicalStatusKey = currentRecord?.status || activePlan?.status || openEndedLog?.status || "";
    const participation = currentRecord?.participation ?? activePlan?.participation ?? openEndedLog?.participation ?? null;
    const medicalSource = currentRecord?.source || (activePlan ? "injury-plan" : openEndedLog ? "manual-log" : "");
    const availabilityLabel = currentRecord
      ? `${getMedicalRecordStatus(currentRecord).label} / ${currentRecord.participation}%`
      : activePlan
        ? `${getMedicalRtpPhaseOption(activePlan.rtpPhase).label} / ${activePlan.participation}%`
        : openEndedLog
          ? `${getMedicalRecordStatus(openEndedLog).label} / ${openEndedLog.participation}% ongoing`
          : "Not logged today";
    const rtpStatus = activePlan
      ? getMedicalRtpPhaseOption(activePlan.rtpPhase).label
      : currentRecord
        ? getMedicalRtpPhaseOption(currentRecord.rtpPhase).label
        : openEndedLog
          ? getMedicalRtpPhaseOption(openEndedLog.rtpPhase).label
          : "No RTP restriction";
    const coachNote = currentRecord?.coachNote || activePlan?.coachNote || latestLog?.coachNote || "";
    const latestLogSummary = latestLog
      ? `${formatMedicalDateLabel(latestLog.date)} - ${getMedicalRecordStatus(latestLog).label} / ${latestLog.participation}%`
      : activePlan
        ? `${formatMedicalDateLabel(dateValue)} - ${getMedicalRtpPhaseOption(activePlan.rtpPhase).label}`
        : "No medical log yet";
    const returnDate = activePlan?.endDate || "";
    const returnDateLabel = returnDate ? formatMedicalDateLabel(returnDate) : "";
    const activeInjuryLabel = activePlan ? [activePlan.injuryType, activePlan.bodyArea].filter(Boolean).join(" / ") : "";
    const trainingAvailability = getSquadTrainingAvailabilitySummary({
      playerId,
      records: getMedicalState().records || [],
      referenceDateValue: dateValue,
      medicalActualParticipationFallback,
      getActivityContext: getMedicalRecommendationActivityContext,
      getActiveMedicalInjuryPlan,
      getPlayerAvailabilityStatusForDate,
      getTeamTrainingDateValues,
    });
    return {
      currentAvailability: availabilityLabel,
      rtpStatus,
      coachNote,
      latestLogDate: latestLog?.date || "",
      latestLogSummary,
      returnDate,
      returnDateLabel,
      returnLabel: returnDateLabel ? `Expected back ${returnDateLabel}` : "",
      activeInjuryLabel,
      tone: medicalStatusKey || "unset",
      participation,
      medicalStatusKey,
      medicalSource,
      hasActivePlan: Boolean(activePlan),
      isOpenEndedMedicalStatus: Boolean(openEndedLog),
      trainingAvailability,
    };
  }

  return {
    getLatestManualMedicalLog,
    getPlayerProfileEffectiveStatus,
    getPlayerProfileEffectiveStatusFromSnapshot,
    getPlayerProfileMedicalSnapshot,
    getPlayerProfileMedicalStatusOverride,
  };
}
