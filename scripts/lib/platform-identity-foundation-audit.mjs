// Assesses aggregate crosswalk evidence only; never authorizes a migration/restore.
export const FOUNDATION_COLLECTIONS = Object.freeze([
  "squad-players", "medical-players", "medical-records", "medical-plans",
]);
const COUNTS = [
  "items", "distinct_players", "missing_ids", "duplicate_ids", "unmapped",
  "ambiguous", "mapped", "membership_gaps", "missing_medical_source_player",
];
const REQUIRED_SOURCES = ["football-player-profiles-v1", "football-medical-team-v1"];

export function assessIdentityFoundation(evidence, { expectedSources, now = Date.now(), maxAgeMs = 3600000 } = {}) {
  const blockers = [];
  const fail = (code) => blockers.push(code);
  if (evidence?.schema !== "footballscience-identity-foundation-evidence-v1") fail("invalid-schema");
  const observedAt = Date.parse(evidence?.observedAt);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0
    || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > maxAgeMs) fail("stale-or-missing-evidence");
  if (evidence?.legacyOwnerTeams !== 1) fail("legacy-owner-not-unique");
  if (evidence?.canonicalSquadLinks !== 1) fail("squad-link-not-unique");

  const sources = Array.isArray(evidence?.sources) ? evidence.sources : [];
  const expected = Array.isArray(expectedSources) ? expectedSources : [];
  if (sources.length !== REQUIRED_SOURCES.length || expected.length !== REQUIRED_SOURCES.length) fail("source-set-incomplete");
  for (const key of REQUIRED_SOURCES) {
    const matches = sources.filter((source) => source?.key === key);
    const current = expected.filter((source) => source?.key === key);
    const source = matches[0];
    if (matches.length !== 1 || current.length !== 1 || !Number.isSafeInteger(source?.revision)
      || source.revision < 1 || !/^[a-f0-9]{64}$/i.test(source?.valueHash || "")) {
      fail(`invalid-source:${key}`);
    } else if (source.revision !== current[0].revision || source.valueHash !== current[0].valueHash) {
      fail(`source-changed:${key}`);
    }
  }

  const collections = Array.isArray(evidence?.collections) ? evidence.collections : [];
  if (collections.length !== FOUNDATION_COLLECTIONS.length) fail("collection-set-incomplete");
  for (const label of FOUNDATION_COLLECTIONS) {
    const rows = collections.filter((row) => row?.label === label);
    const row = rows[0];
    if (rows.length !== 1 || row?.valid !== true
      || !COUNTS.every((field) => Number.isSafeInteger(row?.[field]) && row[field] >= 0)) {
      fail(`invalid-collection:${label}`);
      continue;
    }
    if (row.mapped + row.unmapped + row.ambiguous !== row.items
      || COUNTS.some((field) => row[field] > row.items) || row.membership_gaps > row.mapped) {
      fail(`inconsistent-counts:${label}`);
    }
    for (const field of ["missing_ids", "duplicate_ids", "unmapped", "ambiguous", "membership_gaps", "missing_medical_source_player"]) {
      if (row[field] !== 0) fail(`${field}:${label}`);
    }
    if (label.endsWith("players") && row.items === 0) fail(`empty-roster:${label}`);
  }
  return {
    crosswalkComplete: blockers.length === 0,
    migrationAuthorized: false,
    recoveryVerified: false,
    blockers,
  };
}

// Planning coverage can be complete while actual target mappings remain incomplete.
export function assessIdentityReview(evidence, options = {}) {
  const foundation = assessIdentityFoundation(evidence, options);
  const blockers = foundation.blockers.filter((code) => !code.startsWith("unmapped:"));
  const groups = Array.isArray(evidence?.identityReview) ? evidence.identityReview : [];
  const collections = Array.isArray(evidence?.collections) ? evidence.collections : [];
  const dimensions = ["label", "roster_type", "archived", "counts_in_squad", "in_squad_source", "target_state"];
  const counts = ["players", "medical_records", "medical_plans", "source_disagreements"];
  const seen = new Set();
  const proposals = [];
  for (const group of groups) {
    if (!["squad-players", "medical-players"].includes(group?.label)
      || !["squad", "academy", "trialist", "guest"].includes(group?.roster_type)
      || !["true", "false"].includes(group?.counts_in_squad)
      || typeof group?.archived !== "boolean" || typeof group?.in_squad_source !== "boolean"
      || !["current-target", "historical-target", "missing-target"].includes(group?.target_state)
      || !counts.every((key) => Number.isSafeInteger(group?.[key]) && group[key] >= 0)
      || group.players === 0 || group.source_disagreements > group.players) {
      blockers.push("invalid-identity-review-group");
      continue;
    }
    const signature = JSON.stringify(dimensions.map((key) => group[key]));
    if (seen.has(signature)) blockers.push("duplicate-identity-review-group");
    seen.add(signature);
    proposals.push({
      source: group.label,
      rosterType: group.roster_type,
      archived: group.archived,
      players: group.players,
      medicalRecords: group.medical_records,
      medicalPlans: group.medical_plans,
      policyDisagreements: group.source_disagreements,
      decision: group.target_state === "current-target" ? "retain-existing-identity"
        : group.target_state === "historical-target" ? "review-historical-identity" : "plan-missing-identity",
      activeRosterChangeAuthorized: false,
    });
  }
  for (const label of ["squad-players", "medical-players"]) {
    const collection = collections.find((row) => row?.label === label);
    const rows = groups.filter((row) => row?.label === label);
    const total = (field, predicate = () => true) => rows.filter(predicate).reduce((sum, row) => sum + row[field], 0);
    if (!rows.length || total("players") !== collection?.items
      || total("players", (row) => row.target_state === "current-target") !== collection?.mapped) {
      blockers.push(`identity-review-coverage:${label}`);
    }
    if (label === "medical-players") {
      for (const [field, reference] of [["medical_records", "medical-records"], ["medical_plans", "medical-plans"]]) {
        if (total(field) !== collections.find((row) => row?.label === reference)?.items) {
          blockers.push(`identity-review-reference-coverage:${reference}`);
        }
      }
    }
  }
  return {
    planningEvidenceComplete: blockers.length === 0,
    crosswalkComplete: foundation.crosswalkComplete,
    migrationAuthorized: false,
    recoveryVerified: false,
    blockers: [...new Set(blockers)],
    proposals: blockers.length ? [] : proposals,
  };
}
