export function createMedicalProfileSummarySelectors({
  getActiveMedicalInjuryPlan = () => null,
  getLatestMedicalRecord = () => null,
  getMedicalCoachComment = () => "",
  getMedicalDaySpan = () => null,
  getMedicalPastWindowDates = () => [],
  getMedicalPlayerInjuryPlans = () => [],
  getMedicalPlayerRecords = () => [],
  getMedicalRecordStatus = (record) => ({ key: record?.status || "not-set", label: record?.status || "Not set" }),
  getMedicalRtpPhaseOption = () => ({ label: "Not set" }),
  isMedicalPlanCleared = () => false,
  isMedicalRestrictedRecommendationRecord = () => false,
  medicalClearanceRoles = [],
  medicalLoadGateOptions = [],
  normalizeMedicalClearance = () => ({}),
  normalizeMedicalLoadGates = () => ({}),
} = {}) {
  function getMedicalPlayerProfileSummary(player, dateValue = "") {
    const currentRecord = getLatestMedicalRecord(player.id, dateValue);
    const manualRecords = getMedicalPlayerRecords(player.id);
    const restrictedManualRecords = manualRecords.filter(isMedicalRestrictedRecommendationRecord);
    const plans = getMedicalPlayerInjuryPlans(player.id);
    const activePlan = getActiveMedicalInjuryPlan(player.id, dateValue);
    const primaryPlan = activePlan ?? plans[0] ?? null;
    const windowRecords = getMedicalPastWindowDates(dateValue)
      .map((windowDate) => getLatestMedicalRecord(player.id, windowDate))
      .filter(Boolean);
    const windowAverage = windowRecords.length
      ? Math.round(windowRecords.reduce((sum, record) => sum + record.participation, 0) / windowRecords.length)
      : null;
    const status = getMedicalRecordStatus(currentRecord);
    const phaseLabel = currentRecord
      ? getMedicalRtpPhaseOption(currentRecord.rtpPhase).label
      : activePlan
        ? getMedicalRtpPhaseOption(activePlan.rtpPhase).label
        : "Not set";
    const clearance = primaryPlan ? normalizeMedicalClearance(primaryPlan.clearance) : {};
    const gates = primaryPlan ? normalizeMedicalLoadGates(primaryPlan.gates) : {};
    const signOffCount = primaryPlan
      ? medicalClearanceRoles.filter((role) => clearance[role.key]).length
      : 0;
    const gatePassCount = primaryPlan
      ? medicalLoadGateOptions.filter((gate) => gates[gate.key] === "pass").length
      : 0;
    const latestManualRecord = restrictedManualRecords[0] ?? null;
    const activeDays = activePlan ? getMedicalDaySpan(activePlan.startDate, dateValue) : null;
    const coachNote = getMedicalCoachComment(currentRecord) || getMedicalCoachComment(latestManualRecord);
    return {
      currentRecord,
      status,
      phaseLabel,
      plans,
      activePlan,
      primaryPlan,
      windowAverage,
      windowLoggedCount: windowRecords.length,
      manualLogCount: restrictedManualRecords.length,
      latestManualRecord,
      activeDays,
      signOffCount,
      gatePassCount,
      coachNote,
      cleared: primaryPlan ? isMedicalPlanCleared(primaryPlan) : false,
    };
  }

  return { getMedicalPlayerProfileSummary };
}
