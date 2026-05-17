import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fsdb = require("../api/_lib/football-science-db.js");

test("Football Science DB API caps pages and uses cursor pagination", () => {
  expect(fsdb.asLimit(5000)).toBe(50);
  expect(fsdb.asLimit(0)).toBe(25);

  const cursor = fsdb.encodePlayerCursor({ id: "11111111-1111-4111-8111-111111111111" });
  expect(fsdb.decodePlayerCursor(cursor)).toEqual({ id: "11111111-1111-4111-8111-111111111111" });

  const { params, limit } = fsdb.buildPlayerSearchParams({
    query: "Morgan",
    gender: "women",
    positionGroup: "FW",
    currentTeam: "San Diego",
    limit: 500,
    cursor,
  });

  expect(limit).toBe(50);
  expect(params.get("limit")).toBe("51");
  expect(params.get("search_text")).toBe("ilike.*Morgan*");
  expect(params.get("gender_segment")).toBe("eq.women");
  expect(params.get("position_group")).toBe("eq.FW");
  expect(params.get("current_team_name")).toBe("ilike.*San Diego*");
  expect(params.get("id")).toBe("gt.11111111-1111-4111-8111-111111111111");
  expect(params.has("offset")).toBe(false);
});

test("Football Science DB normalizes source records without leaking raw provider shape", () => {
  const record = fsdb.normalizePlayerRecord({
    reepId: "reep_pabc12345",
    name: "Ada Example",
    fullName: "Ada Lovelace Example",
    dateOfBirth: "2001-04-12",
    genderSegment: "women",
    nationality: "Norway",
    position: "forward",
    positionGroup: "FW",
    heightCm: "171",
    sourceSystem: "Reep",
    sourceConfidence: 90,
    metadata: { source: "qa" },
  });

  expect(record).toMatchObject({
    canonical_name: "Ada Lovelace Example",
    full_name: "Ada Lovelace Example",
    name_quality: "full",
    date_of_birth: "2001-04-12",
    birth_year: 2001,
    gender_segment: "women",
    nationality: "Norway",
    primary_position: "forward",
    position_group: "FW",
    height_cm: 171,
    source_priority: "reep",
    source_confidence: 90,
    identity_status: "unverified",
  });
  expect(record.fsdb_id).toMatch(/^fsdb_p[a-f0-9]{16}$/);
  expect(record.dedupe_key).toContain("name:ada lovelace example");
});

test("Football Science DB dedupe does not trust initial-only scouting names", () => {
  expect(fsdb.isInitialOnlyName("A. Morgan")).toBe(true);
  expect(fsdb.isInitialOnlyName("A Morgan")).toBe(true);
  expect(fsdb.isInitialOnlyName("Alex Morgan")).toBe(false);

  expect(
    fsdb.buildStrongPlayerDedupeKey({
      name: "A. Morgan",
      dateOfBirth: "1989-07-02",
      nationality: "United States",
      genderSegment: "women",
    })
  ).toBe(null);

  const resolved = fsdb.normalizePlayerRecord({
    name: "A. Morgan",
    fullName: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
    positionGroup: "FW",
  });
  const duplicate = fsdb.normalizePlayerRecord({
    name: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
    positionGroup: "FW",
  });

  expect(resolved).toMatchObject({
    canonical_name: "Alex Morgan",
    full_name: "Alex Morgan",
    name_quality: "full",
  });
  expect(resolved.dedupe_key).toBe(duplicate.dedupe_key);
  expect(resolved.fsdb_id).toBe(duplicate.fsdb_id);
});

test("Football Science DB readiness only unlocks spider data with metric depth", () => {
  const identityOnly = fsdb.getPlayerDataReadiness({
    fsdb_id: "fsdb_pidentity",
    canonical_name: "Identity Player",
  });
  expect(identityOnly).toMatchObject({
    tier: "identity_only",
    spiderReady: false,
  });

  const spiderReady = fsdb.getPlayerDataReadiness({
    fsdb_id: "fsdb_pspider",
    canonical_name: "Spider Player",
    date_of_birth: "2001-04-12",
    nationality: "Norway",
    position_group: "FW",
    current_team_name: "Example FC",
    season_stat_count: 1,
    metric_count: 4,
  });
  expect(spiderReady).toMatchObject({
    tier: "spider_ready",
    profileReady: true,
    rosterReady: true,
    statsReady: true,
    spiderReady: true,
  });
});

test("Football Science DB route permissions separate readers from import writers", () => {
  expect(fsdb.footballScienceDbStatus({ role: "coach" })).toMatchObject({
    canRead: true,
    canWrite: false,
    maxPageSize: 50,
  });
  expect(fsdb.footballScienceDbStatus({ role: "scout" })).toMatchObject({
    canRead: true,
    canWrite: true,
  });
  expect(fsdb.footballScienceDbStatus({ role: "guest" })).toMatchObject({
    canRead: false,
    canWrite: false,
  });
});
