import { expect, test } from "@playwright/test";
import {
  createMedicalRtpLibraryStarterDraft,
  getMedicalRtpLibraryProfileById,
  getMedicalRtpLibrarySearchText,
  medicalRtpLibraryFilterOptions,
  medicalRtpLibraryProfiles,
} from "../src/modules/medical/index.mjs";
import { RTP_GOLD_STANDARD_SECTION_TITLES } from "../src/modules/medical/medical-rtp-library-profile-factory.mjs";

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
  expect(getMedicalRtpLibrarySearchText(distalHamstring)).toContain("distal tendon involvement");
  expect(medicalRtpLibraryFilterOptions.positions).toContain("winger");
  expect(medicalRtpLibraryFilterOptions.movementPlanes).toContain("deceleration");
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
  expect(navicularStress.redFlags).toContain("high-risk bone site");
  expect(navicularStress.imaging).toContain("MRI");

  expect(achillesRepair).toMatchObject({ family: "surgical" });
  expect(achillesRepair.summary).toContain("surgeon protocol");
  expect(achillesRepair.criteria).toContain("surgeon and Medical restrictions satisfied");

  expect(cardiacRedFlag).toMatchObject({ family: "medical" });
  expect(cardiacRedFlag.summary).toContain("Medical-governed");
  expect(cardiacRedFlag.redFlags).toContain("chest pain, palpitations or syncope");

  expect(goalkeeperLoad).toMatchObject({ family: "goalkeeper" });
  expect(goalkeeperLoad.summary).toContain("goalkeeper-specific RTP");
  expect(goalkeeperLoad.trainingChecklist).toContain("controlled dives");
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
  expect(draft.coachNote).not.toContain("cleared");
  expect(draft.rtpProgramPhases).toContain("Rehab: restore pain-free range, trunk-pelvis control, and isometric strength.");
  expect(draft.rtpProgramGateCriteria).toContain("pain-free maximal isometric contraction");
  expect(draft.rtpProgramNextSteps).toContain("linear sprint exposure");
  expect(draft.rtpProgramHoldRules).toEqual(draft.rtpProgramWarningPoints);
});
