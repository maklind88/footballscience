import { expect, test } from "@playwright/test";
import {
  calculateFootballScienceDbPlayerAge,
  createFootballScienceDbScoutingAdapter,
  defaultScoutingRecordIndex as recordIndex,
  footballSciencePlayerToScoutingRecord,
  getFootballScienceDbReadiness,
  mapScoutingPositionToFootballScienceDbGroup,
} from "../src/modules/scouting/index.mjs";

const normalizeText = (value = "", limit = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const normalizeDateValue = (value = "") => (/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value, 40)) ? normalizeText(value, 40) : "");
const now = () => Date.parse("2026-06-13T00:00:00Z");

test("Football Science DB adapter maps scouting positions to server groups", () => {
  expect(mapScoutingPositionToFootballScienceDbGroup("GK")).toBe("GK");
  expect(mapScoutingPositionToFootballScienceDbGroup("RCB")).toBe("DEF");
  expect(mapScoutingPositionToFootballScienceDbGroup("DMF")).toBe("MID");
  expect(mapScoutingPositionToFootballScienceDbGroup("RW")).toBe("WING");
  expect(mapScoutingPositionToFootballScienceDbGroup("ST")).toBe("FW");
  expect(mapScoutingPositionToFootballScienceDbGroup("ALL")).toBe("");
});

test("Football Science DB adapter calculates stable player ages", () => {
  expect(calculateFootballScienceDbPlayerAge("2000-06-14", null, { normalizeDateValue, now })).toBe(25);
  expect(calculateFootballScienceDbPlayerAge("2000-06-13", null, { normalizeDateValue, now })).toBe(26);
  expect(calculateFootballScienceDbPlayerAge("", 2001, { now })).toBe(25);
  expect(calculateFootballScienceDbPlayerAge("1900-01-01", null, { normalizeDateValue, now })).toBe("");
});

test("Football Science DB adapter normalizes readiness safely", () => {
  expect(getFootballScienceDbReadiness({}, { normalizeText })).toEqual({
    tier: "identity_only",
    label: "Identity only",
    spiderReady: false,
    statsReady: false,
    rosterReady: false,
    missing: [],
  });
  expect(
    getFootballScienceDbReadiness(
      {
        dataReadiness: {
          tier: " trusted_stats ",
          label: " Trusted stats ",
          spiderReady: true,
          statsReady: true,
          rosterReady: false,
          missing: [" nationality ", ""],
        },
      },
      { normalizeText }
    )
  ).toMatchObject({
    tier: "trusted_stats",
    label: "Trusted stats",
    spiderReady: true,
    statsReady: true,
    missing: ["nationality"],
  });
});

test("Football Science DB adapter converts source players into scouting records", () => {
  const record = footballSciencePlayerToScoutingRecord(
    {
      id: "player-1",
      fsdbId: "fsdb-1",
      fullName: "Ada Example",
      currentTeam: "North Carolina FC",
      currentCompetition: "NWSL",
      primaryPosition: "RW",
      dateOfBirth: "2000-06-14",
      birthCountry: "Norway",
      nationality: "Norway",
      heightCm: "172",
      weightKg: "65",
      nameQuality: "full",
      identityStatus: "verified",
      sourceConfidence: 91,
      sourceLinkCount: 4,
      rosterEntryCount: 2,
      seasonStatCount: 3,
      metricCount: 20,
      dedupeKeyPresent: true,
      dataReadiness: { tier: "trusted_stats", label: "Trusted stats", spiderReady: true },
    },
    { normalizeDateValue, normalizeText, now, recordIndex }
  );

  expect(record[recordIndex.id]).toBe("fsdb:fsdb-1");
  expect(record[recordIndex.player]).toBe("Ada Example");
  expect(record[recordIndex.team]).toBe("North Carolina FC");
  expect(record[recordIndex.league]).toBe("NWSL");
  expect(record[recordIndex.position]).toBe("RW");
  expect(record[recordIndex.age]).toBe(25);
  expect(record[recordIndex.sourceSystem]).toBe("football-science-db");
  expect(record[recordIndex.sourceRecordId]).toBe("player-1");
  expect(record[recordIndex.playerIdentityId]).toBe("fsdb-1");
  expect(record[recordIndex.dateOfBirth]).toBe("2000-06-14");
  expect(record[recordIndex.sourceTrace].footballScienceDb).toMatchObject({
    id: "player-1",
    fsdbId: "fsdb-1",
    sourceConfidence: 91,
    metricCount: 20,
    dedupeKeyPresent: true,
  });
});

test("Football Science DB adapter factory preserves workspace dependencies", () => {
  const adapter = createFootballScienceDbScoutingAdapter({ normalizeDateValue, normalizeText, now, recordIndex });

  expect(adapter.mapPositionToGroup("CB")).toBe("DEF");
  expect(adapter.calculateAgeFromBirthDate("2002-01-01")).toBe(24);
  expect(adapter.getReadiness({}).label).toBe("Identity only");
  expect(adapter.playerToScoutingRecord({ displayName: "Fallback Name" })[recordIndex.id]).toBe(`fsdb:${now()}`);
});
