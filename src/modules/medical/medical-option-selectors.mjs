export function createMedicalOptionSelectors({
  getMedicalRecommendationActivityContext = () => ({}),
  medicalActualParticipationFallback = "not-logged",
  medicalGateOptions = [],
  medicalParticipationOptions = [],
  medicalRtpPhaseOptions = [],
  medicalStatusActivityLabels = {},
  medicalStatusActivityTones = {},
  medicalStatusOptions = [],
} = {}) {
  function getMedicalStatusOption(statusKey) {
    return medicalStatusOptions.find((status) => status.key === statusKey) ?? medicalStatusOptions[0];
  }

  function getMedicalStatusActivityType(dateValue, rtpPhase = "") {
    const activityContext = getMedicalRecommendationActivityContext(dateValue);
    if (activityContext.type === "match" || activityContext.type === "training") {
      return activityContext.type;
    }
    if (rtpPhase === "match-available") {
      return "match";
    }
    return "training";
  }

  function getMedicalStatusOptionForActivity(statusKey, activityType = "training") {
    const status = getMedicalStatusOption(statusKey);
    const label = medicalStatusActivityLabels[activityType]?.[status.key] ?? status.label;
    const tone = medicalStatusActivityTones[activityType]?.[status.key] ?? status.tone;
    return { ...status, label, tone, activityType };
  }

  function getMedicalStatusOptionForDate(statusKey, dateValue, rtpPhase = "") {
    return getMedicalStatusOptionForActivity(statusKey, getMedicalStatusActivityType(dateValue, rtpPhase));
  }

  function getMedicalRtpPhaseOption(phaseKey) {
    return medicalRtpPhaseOptions.find((phase) => phase.key === phaseKey) ?? medicalRtpPhaseOptions[0];
  }

  function getMedicalGateOption(value) {
    return medicalGateOptions.find((option) => option.key === value) ?? medicalGateOptions[0];
  }

  function getMedicalStatusForParticipation(participation) {
    if (participation === 0) {
      return "unavailable";
    }
    if (participation <= 25) {
      return "rehab";
    }
    if (participation <= 50) {
      return "controlled";
    }
    if (participation < 100) {
      return "modified";
    }
    return "full";
  }

  function getMedicalRtpPhaseForRecommendation(statusKey, participation, activityType = "training") {
    if (statusKey === "unavailable" || participation === 0) {
      return "medical-restriction";
    }
    if (statusKey === "rehab" || participation <= 25) {
      return "rehab";
    }
    if (statusKey === "modified" || statusKey === "controlled" || participation < 100) {
      return "modified-team";
    }
    if (statusKey === "monitor") {
      return "match-available";
    }
    if (activityType === "match" && participation === 100) {
      return "match-available";
    }
    return "full-training";
  }

  function normalizeMedicalParticipation(value, fallback = 100) {
    const numericValue = Number(value);
    return medicalParticipationOptions.includes(numericValue) ? numericValue : fallback;
  }

  function normalizeMedicalActualParticipation(value) {
    if (value === medicalActualParticipationFallback || value === "" || value === null || value === undefined) {
      return medicalActualParticipationFallback;
    }
    const numericValue = Number(value);
    return medicalParticipationOptions.includes(numericValue) ? numericValue : medicalActualParticipationFallback;
  }

  return {
    getMedicalGateOption,
    getMedicalRtpPhaseForRecommendation,
    getMedicalRtpPhaseOption,
    getMedicalStatusActivityType,
    getMedicalStatusForParticipation,
    getMedicalStatusOption,
    getMedicalStatusOptionForActivity,
    getMedicalStatusOptionForDate,
    normalizeMedicalActualParticipation,
    normalizeMedicalParticipation,
  };
}
