import {
  medicalRtpExerciseBankFields,
  medicalRtpExerciseBankRows,
  medicalRtpExerciseEvidenceReferences,
} from "./medical-rtp-exercise-bank-items.mjs";
import { medicalRtpExerciseProfileCoverageRows } from "./medical-rtp-exercise-profile-map.mjs";
import {
  enhanceMedicalRtpExerciseItem,
  getMedicalRtpExerciseCatalogSearchText,
} from "./medical-rtp-exercise-bank-professional-fields.mjs";

const normalizeArray = (value = []) => (Array.isArray(value) ? value : [value]).map((item) => String(item ?? "").trim()).filter(Boolean);

const compactTextList = (items = [], limit = 12) =>
  (Array.isArray(items) ? items : [items])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);

const defaultExercise = {
  id: "",
  name: "",
  family: "",
  intent: "",
  tissueTypes: [],
  phases: [],
  movementPlanes: [],
  footballDemands: [],
  equipment: [],
  riskLevel: "controlled",
  evidenceLevel: "Expert consensus",
  evidenceSummary: "",
  consensusNote: "",
  dosage: "",
  progression: "",
  regression: "",
  holdRules: [],
  medicalNotes: "",
  performanceNotes: "",
  coachSafeLabel: "Exercise starter",
  linkedProfiles: [],
  priority: 3,
  evidenceRefs: [],
};

const arrayFields = new Set([
  "tissueTypes",
  "phases",
  "movementPlanes",
  "footballDemands",
  "equipment",
  "holdRules",
  "linkedProfiles",
  "evidenceRefs",
]);

const createExerciseFromRow = (row = []) =>
  medicalRtpExerciseBankFields.reduce((result, field, index) => {
    const value = row[index];
    result[field] = arrayFields.has(field) ? normalizeArray(value) : value ?? defaultExercise[field];
    return result;
  }, { ...defaultExercise });

export { medicalRtpExerciseEvidenceReferences };

export const medicalRtpExerciseBank = medicalRtpExerciseBankRows.map((row) => enhanceMedicalRtpExerciseItem(createExerciseFromRow(row)));

export const medicalRtpExerciseProfileCoverageMap = new Map(medicalRtpExerciseProfileCoverageRows);

export const medicalRtpExerciseBankFilterOptions = {
  tissueTypes: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.tissueTypes))).sort(),
  phases: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.phases))).sort(),
  movementPlanes: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.movementPlanes))).sort(),
  footballDemands: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.footballDemands))).sort(),
  equipment: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.equipment))).sort(),
  riskLevels: Array.from(new Set(medicalRtpExerciseBank.map((item) => item.riskLevel))).sort(),
  bodyRegions: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.bodyRegions))).sort(),
  mechanismTags: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.mechanismTags))).sort(),
  positionDemands: Array.from(new Set(medicalRtpExerciseBank.flatMap((item) => item.positionDemands))).sort(),
};

export function getMedicalRtpExerciseBankSearchText(exerciseItem = {}) {
  return compactTextList([
    exerciseItem.name,
    exerciseItem.family,
    exerciseItem.intent,
    exerciseItem.tissueTypes,
    exerciseItem.phases,
    exerciseItem.movementPlanes,
    exerciseItem.footballDemands,
    exerciseItem.equipment,
    exerciseItem.riskLevel,
    exerciseItem.evidenceLevel,
    exerciseItem.evidenceSummary,
    exerciseItem.consensusNote,
    exerciseItem.dosage,
    exerciseItem.progression,
    exerciseItem.regression,
    exerciseItem.holdRules,
    exerciseItem.medicalNotes,
    exerciseItem.performanceNotes,
    exerciseItem.coachSafeLabel,
    exerciseItem.bodyRegions,
    exerciseItem.symptomTags,
    exerciseItem.mechanismTags,
    exerciseItem.positionDemands,
    exerciseItem.clinicalTags,
    exerciseItem.setup,
    exerciseItem.execution,
    exerciseItem.coachingCues,
    exerciseItem.qualityChecks,
    exerciseItem.programBuilder?.loadFocus,
    exerciseItem.programBuilder?.gateCriteria,
    exerciseItem.programBuilder?.nextExposure,
    exerciseItem.programBuilder?.holdRules,
  ], 80)
    .join(" ")
    .toLowerCase() || getMedicalRtpExerciseCatalogSearchText(exerciseItem);
}

export function getMedicalRtpExerciseCatalogItems(options = {}) {
  const query = String(options.query || options.search || "").trim().toLowerCase();
  const phase = String(options.phase || "").trim().toLowerCase();
  const tissueType = String(options.tissueType || options.tissue || "").trim().toLowerCase();
  const demand = String(options.demand || options.footballDemand || "").trim().toLowerCase();
  const riskLevel = String(options.riskLevel || options.risk || "").trim().toLowerCase();
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : Number.POSITIVE_INFINITY;
  return medicalRtpExerciseBank
    .filter((item) => !query || getMedicalRtpExerciseCatalogSearchText(item).includes(query))
    .filter((item) => !phase || item.phases.some((value) => value.toLowerCase() === phase))
    .filter((item) => !tissueType || item.tissueTypes.some((value) => value.toLowerCase() === tissueType))
    .filter((item) => !demand || item.footballDemands.some((value) => value.toLowerCase().includes(demand)))
    .filter((item) => !riskLevel || item.riskLevel.toLowerCase() === riskLevel)
    .sort((first, second) => first.priority - second.priority || first.name.localeCompare(second.name))
    .slice(0, limit);
}

export function getMedicalRtpExercisesForProfile(profileOrId = "", options = {}) {
  const profileId = String(typeof profileOrId === "object" ? profileOrId.id : profileOrId || "").trim().toLowerCase();
  if (!profileId) return [];
  const phaseFilter = String(options.phase || "").trim().toLowerCase();
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : Number.POSITIVE_INFINITY;
  const coverageIds = medicalRtpExerciseProfileCoverageMap.get(profileId) || [];
  const coverageRank = new Map(coverageIds.map((exerciseId, index) => [exerciseId, index]));
  return medicalRtpExerciseBank
    .filter((item) => item.linkedProfiles.includes(profileId) || coverageRank.has(item.id))
    .filter((item) => !phaseFilter || item.phases.includes(phaseFilter))
    .sort((first, second) => {
      const firstRank = coverageRank.has(first.id) ? coverageRank.get(first.id) : Number.POSITIVE_INFINITY;
      const secondRank = coverageRank.has(second.id) ? coverageRank.get(second.id) : Number.POSITIVE_INFINITY;
      if (firstRank !== secondRank) return firstRank - secondRank;
      return first.priority - second.priority || first.name.localeCompare(second.name);
    })
    .slice(0, limit);
}

export function getMedicalRtpExerciseStarterItems(profileOrId = "", options = {}) {
  return getMedicalRtpExercisesForProfile(profileOrId, { limit: options.limit ?? 6 }).map((item) =>
    [
      item.name,
      item.phases.length ? `phase: ${item.phases.join("/")}` : "",
      item.footballDemands.length ? `demand: ${item.footballDemands.slice(0, 2).join(", ")}` : "",
      item.riskLevel ? `risk: ${item.riskLevel}` : "",
      item.dosage ? `dose: ${item.dosage}` : "",
      item.holdRules.length ? `hold: ${item.holdRules[0]}` : "",
    ].filter(Boolean).join(" | ")
  );
}

export function getMedicalRtpExerciseBankProfileSummary(profileOrId = "") {
  const exercises = getMedicalRtpExercisesForProfile(profileOrId);
  return {
    total: exercises.length,
    controlled: exercises.filter((item) => item.riskLevel === "controlled").length,
    moderate: exercises.filter((item) => item.riskLevel === "moderate").length,
    high: exercises.filter((item) => item.riskLevel === "high").length,
    phases: Array.from(new Set(exercises.flatMap((item) => item.phases))).sort(),
    footballDemands: Array.from(new Set(exercises.flatMap((item) => item.footballDemands))).sort(),
  };
}
