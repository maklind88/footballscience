import { expect, test } from "@playwright/test";
import {
  createMedicalRtpLibraryStarterDraft,
  getMedicalRtpExerciseCatalogItems,
  getMedicalRtpExercisesForProfile,
  medicalRtpExerciseBank,
  medicalRtpExerciseBankFilterOptions,
  getMedicalRtpLibraryClinicalSearchGroups,
  getMedicalRtpLibraryClinicalSearchText,
  getMedicalRtpLibraryProfileById,
  getMedicalRtpLibrarySearchText,
  medicalRtpLibraryFilterOptions,
  medicalRtpLibraryProfiles,
} from "../src/modules/medical/index.mjs";
import { RTP_GOLD_STANDARD_SECTION_TITLES, RTP_LIBRARY_RESEARCH_AUDIT_SCOPE } from "../src/modules/medical/medical-rtp-library-profile-factory.mjs";

test("Medical RTP Library provides searchable medical-safe injury profiles", () => {
  const profiles = medicalRtpLibraryProfiles;
  const hamstring = getMedicalRtpLibraryProfileById("hamstring-strain");
  const distalHamstring = getMedicalRtpLibraryProfileById("distal-hamstring-injury");

  expect(profiles).toHaveLength(200);
  expect(new Set(profiles.map((profile) => profile.id)).size).toBe(200);
  expect(profiles.every((profile) => profile.family)).toBe(true);
  expect(profiles.every((profile) => profile.goldStandardSections.length === 37)).toBe(true);
  expect(profiles.every((profile) => profile.goldStandardSections.map((section) => section.title).join("|") === RTP_GOLD_STANDARD_SECTION_TITLES.join("|"))).toBe(true);
  expect(profiles.every((profile) => profile.summary && profile.evidence && profile.experience)).toBe(true);
  expect(profiles.every((profile) => profile.criteria.length >= 4 && profile.redFlags.length >= 4)).toBe(true);
  expect(RTP_LIBRARY_RESEARCH_AUDIT_SCOPE.displaySourcesInUi).toBe(false);
  expect(RTP_LIBRARY_RESEARCH_AUDIT_SCOPE.scope).toContain("RTP continuum and criteria-based progression");
  expect(profiles.every((profile) => profile.researchAuditStatus === "research-informed-clinical-hardening-v2")).toBe(true);
  expect(profiles.every((profile) => profile.researchAuditReviewedAt === "2026-06-29")).toBe(true);
  expect(profiles.every((profile) => profile.researchAuditFamily === profile.family)).toBe(true);
  expect(hamstring).toMatchObject({
    name: "Hamstring Strain",
    system: "Muscle",
    bodyArea: "Posterior thigh",
    family: "hamstring",
    evidenceLevel: "Moderate to high",
  });
  expect(hamstring.goldStandardSections).toHaveLength(37);
  expect(hamstring.goldStandardSections.map((section) => section.title)).toContain("RTP Risk Score");
  expect(distalHamstring).toMatchObject({
    name: "Distal Hamstring Injury",
    system: "Muscle",
    bodyArea: "Distal posterior thigh",
  });
  expect(distalHamstring.goldStandardSections).toHaveLength(37);
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("sprint exposure gap");
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("posterior thigh pain");
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("mechanism of injury");
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("position specific football demands");
  expect(getMedicalRtpLibrarySearchText(distalHamstring)).toContain("distal tendon involvement");
  expect(medicalRtpLibraryFilterOptions.positions).toContain("winger");
  expect(medicalRtpLibraryFilterOptions.movementPlanes).toContain("deceleration");
});

test("Medical RTP Library exposes structured clinical search domains", () => {
  const hamstring = getMedicalRtpLibraryProfileById("hamstring-strain");
  const clinicalSearchText = getMedicalRtpLibraryClinicalSearchText(hamstring);
  const clinicalGroups = getMedicalRtpLibraryClinicalSearchGroups(hamstring);

  expect(clinicalSearchText).toContain("posterior thigh pain");
  expect(clinicalSearchText).toContain("high speed running injury");
  expect(clinicalSearchText).toContain("palpable defect");
  expect(clinicalSearchText).toContain("sagittal");
  expect(clinicalSearchText).toContain("muscle");
  expect(clinicalSearchText).toContain("winger");
  expect(clinicalGroups.symptoms).toContain("posterior thigh pain");
  expect(clinicalGroups.bodyArea).toContain("Posterior thigh");
  expect(clinicalGroups.redFlags).toContain("palpable defect or extensive bruising");
  expect(clinicalGroups.movementPlane).toContain("sagittal");
  expect(clinicalGroups.tissueType).toContain("Muscle");
  expect(clinicalGroups.positionDemand.join(" ")).toContain("winger");
});

test("RTP Gold Standard Template includes research-informed decision domains", () => {
  const hamstring = getMedicalRtpLibraryProfileById("hamstring-strain");
  const overview = hamstring.goldStandardSections.find((section) => section.title === "Overview");
  const testing = hamstring.goldStandardSections.find((section) => section.title === "Objective RTP Testing Battery");
  const women = hamstring.goldStandardSections.find((section) => section.title === "Women's Football Considerations");
  const risk = hamstring.goldStandardSections.find((section) => section.title === "RTP Risk Score");

  expect(overview.items).toContain("Use the return-to-participation, return-to-sport and return-to-performance continuum rather than one clearance moment.");
  expect(testing.items).toContain("Recommended: athlete confidence, psychological readiness and fear/apprehension screen.");
  expect(testing.content).toContain("clinically safe");
  expect(women.content).toContain("energy availability");
  expect(risk.content).toContain("low confidence");
});

test("expanded RTP Library profiles use injury-family specific clinical language", () => {
  const rectusFemoris = getMedicalRtpLibraryProfileById("rectus-femoris-strain");
  const navicularStress = getMedicalRtpLibraryProfileById("navicular-stress-fracture");
  const achillesRepair = getMedicalRtpLibraryProfileById("achilles-tendon-repair-rtp");
  const cardiacRedFlag = getMedicalRtpLibraryProfileById("cardiac-symptoms-red-flag");
  const goalkeeperLoad = getMedicalRtpLibraryProfileById("goalkeeper-hip-groin-load");

  expect(rectusFemoris).toMatchObject({ family: "quadriceps" });
  expect(rectusFemoris.summary).toContain("anterior-thigh");
  expect(rectusFemoris.criteria).toContain("kicking volume tolerated");
  expect(getMedicalRtpLibrarySearchText(rectusFemoris)).toContain("strike volume");

  expect(navicularStress).toMatchObject({ family: "bone stress" });
  expect(navicularStress.summary).toContain("energy availability");
  expect(navicularStress.criteria).toContain("energy availability and bone-health risks addressed");
  expect(navicularStress.redFlags).toContain("high-risk bone site");
  expect(navicularStress.imaging).toContain("MRI");

  expect(achillesRepair).toMatchObject({ family: "surgical" });
  expect(achillesRepair.summary).toContain("surgeon protocol");
  expect(achillesRepair.criteria).toContain("surgeon and Medical restrictions satisfied");

  expect(cardiacRedFlag).toMatchObject({ family: "medical" });
  expect(cardiacRedFlag.summary).toContain("Medical-governed");
  expect(cardiacRedFlag.criteria).toContain("energy availability or recovery risks considered when relevant");
  expect(cardiacRedFlag.redFlags).toContain("chest pain, palpitations or syncope");

  expect(goalkeeperLoad).toMatchObject({ family: "goalkeeper" });
  expect(goalkeeperLoad.summary).toContain("goalkeeper-specific RTP");
  expect(goalkeeperLoad.trainingChecklist).toContain("controlled dives");
});

test("expanded RTP Library profiles now carry profile-specific clinical decision logic", () => {
  const expandedProfiles = medicalRtpLibraryProfiles.slice(15);
  const normalizedSummaryGroups = new Map();

  for (const profile of expandedProfiles) {
    const specificity = profile.clinicalSpecificity;
    expect(specificity?.decisionFocus).toContain(profile.name);
    expect(specificity?.primarySymptom).toBeTruthy();
    expect(specificity?.primaryExposure).toBeTruthy();
    expect(specificity?.primaryRisk).toBeTruthy();
    expect(profile.summary).toContain("Profile-specific decision focus:");
    expect(profile.goldStandardSections.find((section) => section.title === "Overview")?.items).toContain(specificity.decisionFocus);
    expect(profile.goldStandardSections.find((section) => section.title === "Assessment Protocols")?.items).toContain(specificity.measurementFocus);
    expect(profile.redFlags.some((item) => item.startsWith("progression before ") || item.startsWith("worsening ") || item.includes("Medical"))).toBe(true);
    const normalizedSummary = profile.summary
      .replaceAll(profile.name, "{name}")
      .replaceAll(profile.bodyArea, "{bodyArea}");
    normalizedSummaryGroups.set(normalizedSummary, (normalizedSummaryGroups.get(normalizedSummary) || 0) + 1);
  }

  expect(expandedProfiles).toHaveLength(185);
  expect(Math.max(...normalizedSummaryGroups.values())).toBe(1);
});

test("medical red-flag RTP profiles keep Medical clearance ahead of performance exposure", () => {
  const cardiac = getMedicalRtpLibraryProfileById("cardiac-symptoms-red-flag");
  const syncope = getMedicalRtpLibraryProfileById("dizziness-syncope-red-flag");
  const compartment = getMedicalRtpLibraryProfileById("compartment-syndrome-concern");

  for (const profile of [cardiac, syncope, compartment]) {
    expect(profile.criteria.some((item) => item.includes("Medical clearance documented before any"))).toBe(true);
    expect(profile.matchChecklist).toContain("no match availability until Medical has cleared participation");
    expect(profile.loadText.some((item) => item.includes("hold until Medical clears"))).toBe(true);
    expect(profile.mistakes.join(" ")).toContain("before Medical clearance");
  }
});

test("core RTP profiles retain hand-written specificity while adopting research audit updates", () => {
  const acl = getMedicalRtpLibraryProfileById("acl-reconstruction-rtp");
  const ankle = getMedicalRtpLibraryProfileById("lateral-ankle-sprain");
  const concussion = getMedicalRtpLibraryProfileById("concussion");
  const meniscus = getMedicalRtpLibraryProfileById("meniscus-injury");

  expect(acl.evidence).toContain("psychological readiness");
  expect(acl.criteria).toContain("psychological readiness reviewed");
  expect(ankle.evidence).toContain("athlete perception");
  expect(ankle.criteria).toContain("athlete confidence stable");
  expect(concussion.evidence).toContain("cognitive load progression");
  expect(concussion.criteria).toContain("return-to-learn/workload considered");
  expect(meniscus.evidence).toContain("criterion-based progression");
  expect(meniscus.criteria).toContain("repair or tissue-protection rules respected where relevant");
});

test("Medical RTP Library starter drafts stay medical-owned and evidence-separated", () => {
  const draft = createMedicalRtpLibraryStarterDraft("hamstring-strain", "player-1", "2026-06-24");

  expect(draft).toMatchObject({
    playerId: "player-1",
    injuryType: "Hamstring Strain",
    shareWithCoach: false,
    rtpLibraryProfileId: "hamstring-strain",
  });
  expect(draft.comment).toContain("Evidence:");
  expect(draft.comment).toContain("Experience/consensus:");
  expect(draft.comment).toContain("RTP phases:");
  expect(draft.comment).toContain("Hold rules:");
  expect(draft.comment).toContain("Exercise starters:");
  expect(draft.coachNote).not.toContain("cleared");
  expect(draft.rtpProgramPhases).toContain("Rehab: restore pain-free range, trunk-pelvis control, and isometric strength.");
  expect(draft.rtpProgramGateCriteria).toContain("pain-free maximal isometric contraction");
  expect(draft.rtpProgramExercises.join(" ")).toContain("Nordic hamstring progression");
  expect(draft.rtpProgramNextSteps).toContain("linear sprint exposure");
  expect(draft.rtpProgramHoldRules).toEqual(draft.rtpProgramWarningPoints);
});

test("Medical RTP Exercise Bank is a professional catalog linked across all RTP profiles", () => {
  expect(medicalRtpExerciseBank.length).toBeGreaterThanOrEqual(70);
  expect(medicalRtpExerciseBankFilterOptions.bodyRegions.length).toBeGreaterThan(0);
  expect(medicalRtpExerciseBankFilterOptions.mechanismTags).toContain("sprint exposure");
  expect(medicalRtpExerciseBankFilterOptions.positionDemands.length).toBeGreaterThan(0);

  for (const exercise of medicalRtpExerciseBank) {
    expect(exercise.bodyRegions.length).toBeGreaterThan(0);
    expect(exercise.mechanismTags.length).toBeGreaterThan(0);
    expect(exercise.positionDemands.length).toBeGreaterThan(0);
    expect(exercise.clinicalTags.length).toBeGreaterThan(0);
    expect(exercise.programBuilder.loadFocus).toBeTruthy();
    expect(exercise.programBuilder.gateCriteria.length).toBeGreaterThanOrEqual(2);
    expect(exercise.programBuilder.nextExposure).toBeTruthy();
    expect(exercise.programBuilder.holdRules.length).toBeGreaterThan(0);
    expect(exercise.thumbnail.diagramKey).toBeTruthy();
    expect(exercise.mediaStatus).toBe("placeholder");
  }

  for (const profile of medicalRtpLibraryProfiles) {
    const exercises = getMedicalRtpExercisesForProfile(profile.id);
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.some((exercise) => exercise.programBuilder?.gateCriteria?.length)).toBe(true);
  }
});

test("Medical RTP Exercise Bank supports clinical catalog search without loading player data", () => {
  const sprintCatalog = getMedicalRtpExerciseCatalogItems({ search: "sprint", phase: "full", limit: 12 });
  const tendonCatalog = getMedicalRtpExerciseCatalogItems({ tissue: "tendon", risk: "moderate", limit: 12 });

  expect(sprintCatalog.length).toBeGreaterThan(0);
  expect(sprintCatalog.length).toBeLessThanOrEqual(12);
  expect(sprintCatalog.every((exercise) => exercise.phases.includes("full"))).toBe(true);
  expect(sprintCatalog.some((exercise) => exercise.footballDemands.join(" ").toLowerCase().includes("sprint"))).toBe(true);
  expect(tendonCatalog.length).toBeGreaterThan(0);
  expect(tendonCatalog.every((exercise) => exercise.tissueTypes.includes("tendon"))).toBe(true);
  expect(tendonCatalog.every((exercise) => exercise.riskLevel === "moderate")).toBe(true);
});
