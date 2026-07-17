import { expect, test } from "@playwright/test";
import {
  rankMedicalRtpClinicalCards,
  scoreMedicalRtpClinicalCard,
} from "../src/modules/medical/medical-rtp-library-search.mjs";

const card = (dataset) => ({ dataset });

test("clinical search ranks structured symptom and mechanism matches above generic text", () => {
  const generic = card({
    libraryOrder: "0",
    profileName: "General lower-limb guide",
    search: "posterior thigh pain high speed running",
  });
  const hamstring = card({
    libraryOrder: "1",
    profileName: "Hamstring Strain",
    clinicalSymptoms: "posterior thigh pain",
    clinicalBodyArea: "posterior thigh",
    clinicalMechanism: "high speed running sprint acceleration",
    clinicalTissue: "hamstring muscle",
  });

  const ranked = rankMedicalRtpClinicalCards([generic, hamstring], "posterior thigh pain");
  expect(ranked.map(({ card: item }) => item)).toEqual([hamstring, generic]);
  expect(scoreMedicalRtpClinicalCard(hamstring, "sprint acceleration")).toBeGreaterThan(0);
});

test("clinical search requires all meaningful terms and restores library order without a query", () => {
  const first = card({ libraryOrder: "0", profileName: "Hamstring Strain", clinicalSymptoms: "posterior thigh pain" });
  const second = card({ libraryOrder: "1", profileName: "Syndesmosis Injury", clinicalMechanism: "rotation braking" });

  expect(rankMedicalRtpClinicalCards([first, second], "rotation braking").map(({ card: item }) => item)).toEqual([second]);
  expect(rankMedicalRtpClinicalCards([second, first], "").map(({ card: item }) => item)).toEqual([first, second]);
});
