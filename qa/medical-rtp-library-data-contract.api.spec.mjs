import { expect, test } from "@playwright/test";
import {
  createMedicalRtpLibraryStarterDraft,
  getMedicalRtpLibraryProfileById,
  getMedicalRtpLibrarySearchText,
  medicalRtpLibraryFilterOptions,
  medicalRtpLibraryProfiles,
} from "../src/modules/medical/index.mjs";

test("Medical RTP Library provides searchable medical-safe injury profiles", () => {
  const profiles = medicalRtpLibraryProfiles;
  const hamstring = getMedicalRtpLibraryProfileById("hamstring-strain");

  expect(profiles.length).toBeGreaterThanOrEqual(15);
  expect(hamstring).toMatchObject({
    name: "Hamstring Strain",
    system: "Muscle",
    bodyArea: "Posterior thigh",
    evidenceLevel: "Moderate to high",
  });
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("sprint exposure gap");
  expect(getMedicalRtpLibrarySearchText(hamstring)).toContain("posterior thigh pain");
  expect(medicalRtpLibraryFilterOptions.positions).toContain("winger");
  expect(medicalRtpLibraryFilterOptions.movementPlanes).toContain("deceleration");
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
});
