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
