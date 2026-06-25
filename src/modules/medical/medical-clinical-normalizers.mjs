export function createMedicalClinicalNormalizers(deps = {}) {
  const {
    addCalendarDays = (date, days) => {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + Number(days || 0));
      return nextDate;
    },
    clamp = (value, min, max) => Math.min(max, Math.max(min, value)),
    createId = (prefix = "medical") => `${prefix}-${Date.now()}`,
    formatDateValue = (date) => new Date(date).toISOString().slice(0, 10),
    getActivityContext = () => ({ type: "training" }),
    getCurrentUser = () => null,
    getMedicalRtpPhaseForRecommendation = () => "",
    getMedicalRtpPhaseOption = (phaseKey) => ({ key: phaseKey, label: "", status: "", participation: 0 }),
    getMedicalStatusForParticipation = () => "",
    isDateValue = () => false,
    medicalClearanceRoles = [],
    medicalGateOptions = [],
    medicalInjuryPlanStatusOptions = [],
    medicalLoadGateOptions = [],
    medicalRtpPhaseOptions = [],
    medicalStatusOptions = [],
    normalizeMedicalActualParticipation = (value) => value,
    normalizeMedicalParticipation = (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    normalizeMedicalShareValue = (value) => value === true || value === "true" || value === "on" || value === "1",
    normalizeMedicalTimestamp = (value) => {
      const cleanValue = String(value ?? "").trim().slice(0, 40);
      return Number.isFinite(Date.parse(cleanValue)) ? cleanValue : "";
    },
    parseDateValue = (value) => new Date(value),
  } = deps;

  function normalizeMedicalClearance(clearance = {}) {
    return medicalClearanceRoles.reduce((result, role) => {
      const value = clearance?.[role.key];
      result[role.key] = value === true || value === "true" || value === "on" || value === "1";
      return result;
    }, {});
  }

  function normalizeMedicalLoadGates(gates = {}) {
    return medicalLoadGateOptions.reduce((result, gate) => {
      const value = gates?.[gate.key];
      result[gate.key] = medicalGateOptions.some((option) => option.key === value) ? value : "pending";
      return result;
    }, {});
  }

  function getMedicalClearanceValues(values = {}) {
    return medicalClearanceRoles.reduce((result, role) => {
      result[role.key] = values[`clearance.${role.key}`];
      return result;
    }, {});
  }

  function getMedicalLoadGateValues(values = {}) {
    return medicalLoadGateOptions.reduce((result, gate) => {
      result[gate.key] = values[`gates.${gate.key}`];
      return result;
    }, {});
  }

  function normalizeMedicalRecord(record = {}) {
    const playerId = String(record.playerId ?? "").trim();
    const date = isDateValue(record.date) ? record.date : formatDateValue(new Date());
    if (!playerId) {
      return null;
    }
    const participation = normalizeMedicalParticipation(record.participation);
    const statusKey = medicalStatusOptions.some((status) => status.key === record.status)
      ? record.status
      : getMedicalStatusForParticipation(participation);
    const createdAt = normalizeMedicalTimestamp(record.createdAt) || new Date().toISOString();
    const archivedAt = normalizeMedicalTimestamp(record.archivedAt || record.deletedAt);
    return {
      id: record.id || createId("medical-record"),
      playerId,
      date,
      status: statusKey,
      participation,
      actualParticipation: normalizeMedicalActualParticipation(record.actualParticipation),
      comment: String(record.comment ?? "").trim(),
      coachNote: String(record.coachNote ?? "").trim(),
      shareWithCoach: normalizeMedicalShareValue(record.shareWithCoach),
      rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === record.rtpPhase)
        ? record.rtpPhase
        : getMedicalRtpPhaseForRecommendation(statusKey, participation, getActivityContext(date).type),
      createdAt,
      updatedAt: normalizeMedicalTimestamp(record.updatedAt) || archivedAt || createdAt,
      createdBy: record.createdBy || getCurrentUser()?.id || "",
      archivedAt,
      archivedBy: String(record.archivedBy ?? record.deletedBy ?? "").trim(),
      archiveReason: String(record.archiveReason ?? record.deleteReason ?? "").trim().slice(0, 160),
    };
  }

  function addMedicalCalendarMonths(date, months) {
    const nextDate = new Date(date);
    const originalDay = nextDate.getDate();
    nextDate.setMonth(nextDate.getMonth() + months);
    if (nextDate.getDate() !== originalDay) {
      nextDate.setDate(0);
    }
    return nextDate;
  }

  function getMedicalPlanEndDate(startDateValue, duration, durationUnit) {
    const cleanDuration = Math.max(1, Number(duration) || 1);
    const startDate = parseDateValue(startDateValue);
    if (durationUnit === "months") {
      return formatDateValue(addCalendarDays(addMedicalCalendarMonths(startDate, cleanDuration), -1));
    }
    if (durationUnit === "days") {
      return formatDateValue(addCalendarDays(startDate, cleanDuration - 1));
    }
    return formatDateValue(addCalendarDays(startDate, cleanDuration * 7 - 1));
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

  function normalizeMedicalInjuryPlan(plan = {}) {
    const playerId = String(plan.playerId ?? "").trim();
    const startDate = isDateValue(plan.startDate) ? plan.startDate : formatDateValue(new Date());
    const duration = Math.max(1, Number(plan.duration) || 1);
    const durationUnit = ["days", "weeks", "months"].includes(plan.durationUnit) ? plan.durationUnit : "weeks";
    const endDate = isDateValue(plan.endDate) ? plan.endDate : getMedicalPlanEndDate(startDate, duration, durationUnit);
    if (!playerId || endDate < startDate) {
      return null;
    }
    const initialParticipation = normalizeMedicalParticipation(plan.participation, 0);
    const fallbackPhaseKey = getMedicalRtpPhaseForRecommendation(plan.status, initialParticipation);
    const phaseOption = medicalRtpPhaseOptions.some((phase) => phase.key === plan.rtpPhase)
      ? getMedicalRtpPhaseOption(plan.rtpPhase)
      : getMedicalRtpPhaseOption(fallbackPhaseKey);
    const participation = normalizeMedicalParticipation(plan.participation, phaseOption.participation);
    const status = medicalInjuryPlanStatusOptions.some((option) => option.key === plan.status) ? plan.status : phaseOption.status;
    const createdAt = normalizeMedicalTimestamp(plan.createdAt) || new Date().toISOString();
    const archivedAt = normalizeMedicalTimestamp(plan.archivedAt || plan.deletedAt);
    return {
      id: plan.id || createId("medical-injury-plan"),
      playerId,
      injuryType: String(plan.injuryType ?? "").trim() || "Injury",
      bodyArea: String(plan.bodyArea ?? "").trim(),
      startDate,
      endDate,
      duration,
      durationUnit,
      status,
      participation,
      reviewDate: isDateValue(plan.reviewDate) ? plan.reviewDate : "",
      rtpPhase: phaseOption.key,
      phase: String(plan.phase ?? "").trim() || phaseOption.label,
      clearance: normalizeMedicalClearance(plan.clearance),
      gates: normalizeMedicalLoadGates(plan.gates),
      coachNote: String(plan.coachNote ?? "").trim(),
      shareWithCoach: normalizeMedicalShareValue(plan.shareWithCoach),
      comment: String(plan.comment ?? "").trim(),
      rtpLibraryProfileId: String(plan.rtpLibraryProfileId ?? "").trim(),
      rtpLibraryProfileName: String(plan.rtpLibraryProfileName ?? "").trim(),
      rtpLibraryEvidenceLevel: String(plan.rtpLibraryEvidenceLevel ?? "").trim(),
      rtpLibrarySummary: String(plan.rtpLibrarySummary ?? "").trim(),
      rtpProgramPhases: normalizeMedicalTextList(plan.rtpProgramPhases),
      rtpProgramLoadText: normalizeMedicalTextList(plan.rtpProgramLoadText),
      rtpProgramRiskFactors: normalizeMedicalTextList(plan.rtpProgramRiskFactors),
      rtpProgramWarningPoints: normalizeMedicalTextList(plan.rtpProgramWarningPoints),
      rtpProgramGateCriteria: normalizeMedicalTextList(plan.rtpProgramGateCriteria),
      rtpProgramNextSteps: normalizeMedicalTextList(plan.rtpProgramNextSteps),
      rtpProgramHoldRules: normalizeMedicalTextList(plan.rtpProgramHoldRules),
      createdAt,
      updatedAt: normalizeMedicalTimestamp(plan.updatedAt) || archivedAt || createdAt,
      createdBy: plan.createdBy || getCurrentUser()?.id || "",
      archivedAt,
      archivedBy: String(plan.archivedBy ?? plan.deletedBy ?? "").trim(),
      archiveReason: String(plan.archiveReason ?? plan.deleteReason ?? "").trim().slice(0, 160),
    };
  }

  function createDefaultMedicalGovernancePolicy() {
    return {
      schema: "football-medical-governance-v1",
      dataLevel: "private-medical",
      coachShareBoundary: "availability-approved-note",
      consentRequired: true,
      retentionMonths: 24,
      reviewCadenceDays: 30,
      policyOwner: "Medical Lead",
      incidentContact: "Admin",
      lastReviewed: "",
      updatedAt: "",
      updatedBy: "",
    };
  }

  function normalizeMedicalGovernancePolicy(policy = {}) {
    const defaults = createDefaultMedicalGovernancePolicy();
    const retentionMonths = clamp(Number(policy.retentionMonths) || defaults.retentionMonths, 1, 120);
    const reviewCadenceDays = clamp(Number(policy.reviewCadenceDays) || defaults.reviewCadenceDays, 1, 90);
    return {
      ...defaults,
      dataLevel: "private-medical",
      coachShareBoundary: "availability-approved-note",
      consentRequired: normalizeMedicalShareValue(policy.consentRequired ?? defaults.consentRequired),
      retentionMonths: Math.round(retentionMonths),
      reviewCadenceDays: Math.round(reviewCadenceDays),
      policyOwner: String(policy.policyOwner ?? defaults.policyOwner).trim().slice(0, 80) || defaults.policyOwner,
      incidentContact: String(policy.incidentContact ?? defaults.incidentContact).trim().slice(0, 120) || defaults.incidentContact,
      lastReviewed: isDateValue(policy.lastReviewed) ? policy.lastReviewed : "",
      updatedAt: String(policy.updatedAt ?? "").trim(),
      updatedBy: String(policy.updatedBy ?? "").trim(),
    };
  }

  function sanitizeMedicalGovernancePolicyForCoachView() {
    const defaults = createDefaultMedicalGovernancePolicy();
    return {
      schema: defaults.schema,
      dataLevel: "coach-safe",
      coachShareBoundary: defaults.coachShareBoundary,
      consentRequired: true,
      retentionMonths: 0,
      reviewCadenceDays: 0,
      policyOwner: "",
      incidentContact: "",
      lastReviewed: "",
      updatedAt: "",
      updatedBy: "",
    };
  }

  return {
    createDefaultMedicalGovernancePolicy,
    getMedicalClearanceValues,
    getMedicalLoadGateValues,
    normalizeMedicalClearance,
    normalizeMedicalGovernancePolicy,
    normalizeMedicalInjuryPlan,
    normalizeMedicalLoadGates,
    normalizeMedicalRecord,
    sanitizeMedicalGovernancePolicyForCoachView,
  };
}
