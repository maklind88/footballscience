import { expect, test } from "@playwright/test";
import {
  getMedicalRtpExerciseBankProfileSummary,
  getMedicalRtpExerciseBankSearchText,
  getMedicalRtpExerciseStarterItems,
  getMedicalRtpExercisesForProfile,
  medicalRtpExerciseBank,
  medicalRtpExerciseBankFilterOptions,
  medicalRtpExerciseEvidenceReferences,
  medicalRtpExerciseProfileCoverageMap,
  medicalRtpLibraryProfiles,
} from "../src/modules/medical/index.mjs";

const coreProfileIds = [
  "hamstring-strain",
  "proximal-hamstring-tendinopathy",
  "adductor-strain",
  "soleus-strain",
  "achilles-tendinopathy",
  "acl-reconstruction-rtp",
  "meniscus-injury",
  "lateral-ankle-sprain",
  "syndesmosis-injury",
  "low-back-pain",
  "patellar-tendinopathy",
  "mcl-injury",
  "concussion",
  "fai-syndrome",
  "achilles-partial-tear",
];

test("RTP Exercise Bank exposes structured import-ready metadata", () => {
  const exerciseIds = new Set(medicalRtpExerciseBank.map((item) => item.id));
  const profileIds = new Set(medicalRtpLibraryProfiles.map((profile) => profile.id));

  expect(medicalRtpExerciseBank.length).toBeGreaterThanOrEqual(70);
  expect(exerciseIds.size).toBe(medicalRtpExerciseBank.length);
  expect(medicalRtpExerciseProfileCoverageMap.size).toBe(200);
  expect(medicalRtpExerciseBank.every((item) => item.name && item.intent && item.dosage)).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.tissueTypes.length && item.phases.length && item.movementPlanes.length)).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.footballDemands.length && item.equipment.length)).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => ["controlled", "moderate", "high"].includes(item.riskLevel))).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.evidenceLevel && item.evidenceSummary && item.consensusNote)).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.progression && item.regression && item.holdRules.length)).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.linkedProfiles.every((profileId) => profileIds.has(profileId)))).toBe(true);
  expect(medicalRtpExerciseBank.every((item) => item.evidenceRefs.every((refId) => medicalRtpExerciseEvidenceReferences[refId]))).toBe(true);
  expect(Object.keys(medicalRtpExerciseEvidenceReferences)).toEqual(
    expect.arrayContaining(["rtsContinuum", "paassAnkle", "patellarProgressiveLoading", "concussionConsensus", "boneStressConsensus", "shoulderRts"])
  );
  expect(medicalRtpExerciseBankFilterOptions.tissueTypes).toContain("muscle");
  expect(medicalRtpExerciseBankFilterOptions.phases).toContain("full");
  expect(medicalRtpExerciseBankFilterOptions.footballDemands).toContain("cutting");
});

test("RTP Exercise Bank covers all 200 library profiles without hardcoding UI injury content", () => {
  const uncoveredProfiles = medicalRtpLibraryProfiles
    .map((profile) => ({
      profile,
      exercises: getMedicalRtpExercisesForProfile(profile.id),
    }))
    .filter(({ exercises }) => exercises.length < 4);

  expect(medicalRtpLibraryProfiles).toHaveLength(200);
  expect(uncoveredProfiles).toEqual([]);
  expect(medicalRtpLibraryProfiles.every((profile) => medicalRtpExerciseProfileCoverageMap.has(profile.id))).toBe(true);
});

test("RTP Exercise Bank maps every approved core profile to practical starter exercises", () => {
  coreProfileIds.forEach((profileId) => {
    const exercises = getMedicalRtpExercisesForProfile(profileId);
    const starterItems = getMedicalRtpExerciseStarterItems(profileId);
    const summary = getMedicalRtpExerciseBankProfileSummary(profileId);

    expect(exercises.length, `${profileId} exercise count`).toBeGreaterThanOrEqual(profileId === "concussion" ? 3 : 4);
    expect(starterItems.length).toBeGreaterThan(0);
    expect(summary.total).toBe(exercises.length);
    expect(summary.phases.length).toBeGreaterThan(0);
    expect(starterItems[0]).toContain("phase:");
    expect(starterItems[0]).toContain("hold:");
  });
});

test("RTP Exercise Bank keeps football-specific families searchable", () => {
  const hamstringText = getMedicalRtpExerciseBankSearchText(getMedicalRtpExercisesForProfile("hamstring-strain")[0]);
  const ankleText = getMedicalRtpExercisesForProfile("lateral-ankle-sprain").map(getMedicalRtpExerciseBankSearchText).join(" ");
  const concussionText = getMedicalRtpExercisesForProfile("concussion").map(getMedicalRtpExerciseBankSearchText).join(" ");
  const patellarText = getMedicalRtpExercisesForProfile("patellar-tendinopathy").map(getMedicalRtpExerciseBankSearchText).join(" ");

  expect(hamstringText).toContain("posterior chain");
  expect(getMedicalRtpExercisesForProfile("hamstring-strain").map((item) => item.name)).toContain("Nordic hamstring progression");
  expect(getMedicalRtpExercisesForProfile("adductor-strain").map((item) => item.name)).toContain("Copenhagen adduction short-lever");
  expect(ankleText).toContain("sensorimotor");
  expect(ankleText).toContain("cutting");
  expect(concussionText).toContain("graduated");
  expect(concussionText).toContain("dual-task");
  expect(patellarText).toContain("progressive tendon loading");
});
