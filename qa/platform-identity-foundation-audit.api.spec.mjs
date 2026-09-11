import { expect, test } from "@playwright/test";
import { assessIdentityFoundation, assessIdentityReview, FOUNDATION_COLLECTIONS } from "../scripts/lib/platform-identity-foundation-audit.mjs";

const now = Date.parse("2026-09-11T12:00:00Z");
function fixture() {
  return {
    schema: "footballscience-identity-foundation-evidence-v1",
    observedAt: "2026-09-11T11:59:00Z",
    legacyOwnerTeams: 1,
    canonicalSquadLinks: 1,
    sources: ["football-player-profiles-v1", "football-medical-team-v1"].map((key) => ({ key, revision: 12, valueHash: "a".repeat(64) })),
    collections: FOUNDATION_COLLECTIONS.map((label) => ({
      label, valid: true, items: 2, distinct_players: 2, missing_ids: 0,
      duplicate_ids: 0, unmapped: 0, ambiguous: 0, mapped: 2,
      membership_gaps: 0, missing_medical_source_player: 0,
    })),
  };
}
function assess(evidence, expectedSources = evidence?.sources) {
  return assessIdentityFoundation(evidence, { now, expectedSources });
}

test("Complete crosswalk is not a recovery certificate or migration authorization", () => {
  expect(assess(fixture())).toEqual({ crosswalkComplete: true, migrationAuthorized: false, recoveryVerified: false, blockers: [] });
});

test("Missing evidence and missing fresh revision comparison fail closed", () => {
  expect(assess(undefined).crosswalkComplete).toBe(false);
  expect(assessIdentityFoundation(fixture(), { now }).crosswalkComplete).toBe(false);
});

test("Historical and temporary Medical players cannot disappear behind the mapped roster", () => {
  const evidence = fixture();
  evidence.collections[1].mapped = 1;
  evidence.collections[1].unmapped = 1;
  expect(assess(evidence).blockers).toContain("unmapped:medical-players");
});

for (const field of ["missing_ids", "duplicate_ids", "ambiguous", "membership_gaps", "missing_medical_source_player"]) {
  test(`Crosswalk blocks ${field} instead of accepting partial evidence`, () => {
    const evidence = fixture();
    evidence.collections[2][field] = 1;
    expect(assess(evidence).blockers).toContain(`${field}:medical-records`);
  });
}

test("Malformed or absent collection is not an empty healthy dataset", () => {
  for (const invalid of [null, -1, "0", NaN]) {
    const evidence = fixture();
    evidence.collections[0].unmapped = invalid;
    expect(assess(evidence).crosswalkComplete).toBe(false);
  }
  const evidence = fixture();
  evidence.collections[0].valid = false;
  expect(assess(evidence).crosswalkComplete).toBe(false);
  evidence.collections.pop();
  expect(assess(evidence).blockers).toContain("collection-set-incomplete");
});

test("Duplicate collections, unknown owner, and count imbalance fail closed", () => {
  const evidence = fixture();
  evidence.legacyOwnerTeams = 2;
  evidence.canonicalSquadLinks = 0;
  evidence.collections[0].mapped = 1;
  evidence.collections[3] = evidence.collections[2];
  expect(assess(evidence).blockers).toEqual(expect.arrayContaining([
    "legacy-owner-not-unique", "squad-link-not-unique", "inconsistent-counts:squad-players", "invalid-collection:medical-plans",
  ]));
});

test("Stale evidence or a changed source revision/hash requires a new audit", () => {
  const evidence = fixture();
  const latest = structuredClone(evidence.sources);
  latest[0].revision += 1;
  latest[1].valueHash = "b".repeat(64);
  expect(assess(evidence, latest).blockers).toEqual(expect.arrayContaining([
    "source-changed:football-player-profiles-v1", "source-changed:football-medical-team-v1",
  ]));
  for (const observedAt of ["", "2026-09-10T12:00:00Z", "2026-09-12T12:00:00Z"]) {
    expect(assess({ ...evidence, observedAt }).blockers).toContain("stale-or-missing-evidence");
  }
});

test("Assessment is pure and does not expose any supplied clinical content", () => {
  const evidence = fixture();
  evidence.privateNote = "Never include clinical content in audit output";
  const before = JSON.stringify(evidence);
  const result = assess(evidence);
  expect(JSON.stringify(evidence)).toBe(before);
  expect(JSON.stringify(result)).not.toContain(evidence.privateNote);
});

test("Counts are dynamic, not a frozen roster size or a capacity benchmark", () => {
  for (const items of [1, 50, 1000, 1000000]) {
    const evidence = fixture();
    for (const row of evidence.collections) {
      row.items = items;
      row.distinct_players = items;
      row.mapped = items;
    }
    expect(assess(evidence).crosswalkComplete).toBe(true);
    expect(assess(evidence).migrationAuthorized).toBe(false);
  }
});

test("Creating a player after the audit invalidates the old source evidence", () => {
  const evidence = fixture();
  const current = structuredClone(evidence.sources);
  current[0].revision += 1;
  current[0].valueHash = "c".repeat(64);
  expect(assess(evidence, current).blockers).toContain("source-changed:football-player-profiles-v1");
  evidence.sources = current;
  evidence.collections[0].items += 1;
  evidence.collections[0].distinct_players += 1;
  evidence.collections[0].unmapped += 1;
  expect(assess(evidence, current).blockers).toContain("unmapped:squad-players");
  evidence.collections[0].unmapped -= 1;
  evidence.collections[0].mapped += 1;
  expect(assess(evidence, current).crosswalkComplete).toBe(true);
});

function reviewFixture() {
  const evidence = fixture();
  evidence.identityReview = ["squad-players", "medical-players"].map((label) => ({
    label, roster_type: "squad", archived: false, counts_in_squad: "true",
    in_squad_source: true, target_state: "current-target", players: 2,
    medical_records: 2, medical_plans: 2, source_disagreements: 0,
  }));
  return evidence;
}
function review(evidence) {
  return assessIdentityReview(evidence, { now, expectedSources: evidence?.sources });
}

test("Identity review separates a complete proposal from actual mapping and recovery", () => {
  const evidence = reviewFixture();
  const group = evidence.identityReview[1];
  Object.assign(group, { roster_type: "guest", archived: true, in_squad_source: false, target_state: "missing-target" });
  Object.assign(evidence.collections[1], { mapped: 0, unmapped: 2 });
  const result = review(evidence);
  expect(result).toMatchObject({ planningEvidenceComplete: true, crosswalkComplete: false, migrationAuthorized: false, recoveryVerified: false });
  expect(result.proposals[1]).toMatchObject({ decision: "plan-missing-identity", archived: true, activeRosterChangeAuthorized: false, medicalRecords: 2 });
});

test("A changed roster classification retains an existing ID and reports policy drift", () => {
  const evidence = reviewFixture();
  Object.assign(evidence.identityReview[1], { roster_type: "trialist", counts_in_squad: "false", source_disagreements: 1 });
  expect(review(evidence).proposals[1]).toMatchObject({
    decision: "retain-existing-identity", policyDisagreements: 1, activeRosterChangeAuthorized: false,
  });
});

test("Historical target is reviewed, never replaced or automatically reactivated", () => {
  const evidence = reviewFixture();
  Object.assign(evidence.identityReview[1], { archived: true, target_state: "historical-target" });
  Object.assign(evidence.collections[1], { mapped: 0, unmapped: 2 });
  expect(review(evidence).proposals[1]).toMatchObject({ decision: "review-historical-identity", activeRosterChangeAuthorized: false });
});

test("Omitted players or recommendation histories block a partial review", () => {
  for (const field of ["players", "medical_records", "medical_plans"]) {
    const evidence = reviewFixture();
    evidence.identityReview[1][field] -= 1;
    expect(review(evidence)).toMatchObject({ planningEvidenceComplete: false, proposals: [] });
  }
});

test("Unknown and ambiguous identity groups cannot become actionable proposals", () => {
  for (const [field, value] of [["roster_type", "unknown"], ["target_state", "ambiguous"], ["counts_in_squad", "unknown"], ["archived", "false"], ["players", -1]]) {
    const evidence = reviewFixture();
    evidence.identityReview[1][field] = value;
    expect(review(evidence)).toMatchObject({ planningEvidenceComplete: false, proposals: [] });
  }
});

test("Missing, duplicate or malformed identity evidence fails closed without throwing", () => {
  for (const evidence of [null, {}, { ...reviewFixture(), collections: {} }, { ...reviewFixture(), collections: [null] }, { ...reviewFixture(), identityReview: [null] }]) {
    expect(review(evidence).planningEvidenceComplete).toBe(false);
  }
  const evidence = reviewFixture();
  evidence.identityReview.push({ ...evidence.identityReview[0] });
  expect(review(evidence).blockers).toContain("duplicate-identity-review-group");
});

test("New player and source revision require refreshed planning evidence", () => {
  const evidence = reviewFixture();
  evidence.collections[1].items += 1;
  evidence.collections[1].unmapped += 1;
  expect(review(evidence).blockers).toContain("identity-review-coverage:medical-players");
  evidence.identityReview.push({ ...evidence.identityReview[1], roster_type: "academy", players: 1, target_state: "missing-target", medical_records: 0, medical_plans: 0 });
  expect(review(evidence).planningEvidenceComplete).toBe(true);
  const expectedSources = structuredClone(evidence.sources);
  expectedSources[0].revision += 1;
  expect(assessIdentityReview(evidence, { now, expectedSources }).planningEvidenceComplete).toBe(false);
});

test("Review output contains no source identifiers or private contents and never mutates input", () => {
  const evidence = reviewFixture();
  evidence.identityReview[1].name = "Private example";
  evidence.identityReview[1].legacyId = "private-player-id";
  const before = JSON.stringify(evidence);
  const output = JSON.stringify(review(evidence));
  expect(JSON.stringify(evidence)).toBe(before);
  expect(output).not.toContain("Private example");
  expect(output).not.toContain("private-player-id");
});
