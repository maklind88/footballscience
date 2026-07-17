export function createMedicalPlanSelectors({
  formatMedicalDateLabel = (value) => String(value ?? ""),
  getLatestMedicalRecord = () => null,
  getMedicalDaySpan = () => null,
  getMedicalPastWindowDates = () => [],
  getSelectedDate = () => "",
  isMedicalDateValue = () => false,
  isMedicalPlanCleared = () => false,
  medicalActualParticipationFallback = "not-logged",
  medicalClearanceRoles = [],
  medicalLoadGateOptions = [],
  normalizeMedicalClearance = () => ({}),
  normalizeMedicalLoadGates = () => ({}),
  parseDateValue = (value) => new Date(value),
} = {}) {
  const getMedicalPlanTotalDays = (plan) => {
    if (!plan) {
      return 0;
    }
    return getMedicalDaySpan(plan.startDate, plan.endDate) ?? 0;
  };

  const getMedicalPlanElapsedDays = (plan, dateValue = getSelectedDate()) => {
    if (!plan || !isMedicalDateValue(dateValue) || plan.startDate > dateValue) {
      return 0;
    }
    const endDate = plan.endDate < dateValue ? plan.endDate : dateValue;
    return getMedicalDaySpan(plan.startDate, endDate) ?? 0;
  };

  const getMedicalPlanDaysRemaining = (plan, dateValue = getSelectedDate()) => {
    if (!plan || !isMedicalDateValue(dateValue) || plan.endDate < dateValue) {
      return 0;
    }
    const startDate = plan.startDate > dateValue ? plan.startDate : dateValue;
    return getMedicalDaySpan(startDate, plan.endDate) ?? 0;
  };

  const getMedicalPlanSeverity = (plan) => {
    const totalDays = getMedicalPlanTotalDays(plan);
    if (plan?.participation === 0 && totalDays >= 28) {
      return { key: "major", label: "Major", tone: "high", weight: 4 };
    }
    if (plan?.participation === 0 || totalDays >= 14) {
      return { key: "moderate", label: "Moderate", tone: "medium", weight: 3 };
    }
    if (plan?.participation < 100 || totalDays >= 7) {
      return { key: "minor", label: "Minor", tone: "low", weight: 2 };
    }
    return { key: "light", label: "Light", tone: "clear", weight: 1 };
  };

  const getMedicalPlanClearanceSummary = (plan) => {
    const clearance = normalizeMedicalClearance(plan?.clearance);
    const gates = normalizeMedicalLoadGates(plan?.gates);
    const signOffCount = medicalClearanceRoles.filter((role) => clearance[role.key]).length;
    const gatePassCount = medicalLoadGateOptions.filter((gate) => gates[gate.key] === "pass").length;
    const gateFailCount = medicalLoadGateOptions.filter((gate) => gates[gate.key] === "fail").length;
    const gateMonitorCount = medicalLoadGateOptions.filter((gate) => gates[gate.key] === "monitor").length;
    return {
      signOffCount,
      gatePassCount,
      gateFailCount,
      gateMonitorCount,
      isCleared: isMedicalPlanCleared(plan),
    };
  };

  const getMedicalPlanReviewState = (plan, dateValue = getSelectedDate()) => {
    if (!plan?.reviewDate || !isMedicalDateValue(dateValue)) {
      return { key: "none", label: "No review date", severity: 0 };
    }
    const reviewDate = plan.reviewDate;
    const daysUntil = Math.round((parseDateValue(reviewDate) - parseDateValue(dateValue)) / (24 * 60 * 60 * 1000));
    if (daysUntil < 0) {
      return { key: "overdue", label: "Review overdue", severity: 3, daysUntil };
    }
    if (daysUntil <= 7) {
      return { key: "due", label: `Review ${formatMedicalDateLabel(reviewDate)}`, severity: 2, daysUntil };
    }
    return { key: "scheduled", label: `Review ${formatMedicalDateLabel(reviewDate)}`, severity: 0, daysUntil };
  };

  const getMedicalTrailingRecommendationSummary = (playerId, dateValue = getSelectedDate()) => {
    const records = getMedicalPastWindowDates(dateValue)
      .map((windowDate) => getLatestMedicalRecord(playerId, windowDate))
      .filter(Boolean);
    const modifiedDays = records.filter((record) => record.participation > 0 && record.participation < 100).length;
    const unavailableDays = records.filter((record) => record.participation === 0).length;
    const loggedActual = records.filter((record) => record.actualParticipation !== medicalActualParticipationFallback);
    const exceededCount = loggedActual.filter((record) => Number(record.actualParticipation) > record.participation).length;
    const actualParticipations = loggedActual
      .map((record) => Number(record.actualParticipation))
      .filter((participation) => Number.isFinite(participation));
    return {
      records,
      modifiedDays,
      unavailableDays,
      exceededCount,
      average: actualParticipations.length
        ? Math.round(actualParticipations.reduce((sum, participation) => sum + participation, 0) / actualParticipations.length)
        : null,
    };
  };

  return {
    getMedicalPlanClearanceSummary,
    getMedicalPlanDaysRemaining,
    getMedicalPlanElapsedDays,
    getMedicalPlanReviewState,
    getMedicalPlanSeverity,
    getMedicalPlanTotalDays,
    getMedicalTrailingRecommendationSummary,
  };
}
