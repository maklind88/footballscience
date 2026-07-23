const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const SENSITIVE_REPORT_KEYS = new Set([
  "accesstoken",
  "baselinevalue",
  "blocks",
  "canaryvalue",
  "content",
  "description",
  "displayname",
  "email",
  "firstname",
  "lastname",
  "notes",
  "password",
  "payload",
  "privatesourcestate",
  "record",
  "servicerolekey",
  "sessions",
  "title",
  "value",
]);

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().toLowerCase().slice(0, maxLength);
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : 0;
}

function validHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.origin === url.href.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function addFailure(failures, condition, code) {
  if (!condition) failures.add(code);
}

function expectedScope(options = {}) {
  return {
    target: normalizeText(options.target || "staging", 40),
    projectRef: normalizeText(options.projectRef, 80),
    canonicalProductionProjectRef: normalizeText(
      options.canonicalProductionProjectRef,
      80
    ),
    organizationId: normalizeText(options.organizationId, 120),
    teamId: normalizeText(options.teamId, 120),
    sourceRevision: normalizeInteger(options.sourceRevision),
    sourceHash: normalizeText(options.sourceHash, 64),
    stagingAppOrigin: String(options.stagingAppOrigin || "").replace(/\/$/, ""),
    canonicalProductionAppOrigin: String(
      options.canonicalProductionAppOrigin || ""
    ).replace(/\/$/, ""),
  };
}

function validateExpected(expected, failures) {
  addFailure(failures, expected.target === "staging", "evidence_target_not_staging");
  addFailure(
    failures,
    PROJECT_REF_PATTERN.test(expected.projectRef),
    "evidence_project_ref_invalid"
  );
  addFailure(
    failures,
    PROJECT_REF_PATTERN.test(expected.canonicalProductionProjectRef) &&
      expected.canonicalProductionProjectRef !== expected.projectRef,
    "evidence_production_separation_invalid"
  );
  addFailure(
    failures,
    UUID_PATTERN.test(expected.organizationId),
    "evidence_organization_invalid"
  );
  addFailure(failures, UUID_PATTERN.test(expected.teamId), "evidence_team_invalid");
  addFailure(
    failures,
    expected.sourceRevision > 0,
    "evidence_source_revision_invalid"
  );
  addFailure(
    failures,
    SHA256_PATTERN.test(expected.sourceHash),
    "evidence_source_hash_invalid"
  );
  addFailure(
    failures,
    validHttpsOrigin(expected.stagingAppOrigin) &&
      validHttpsOrigin(expected.canonicalProductionAppOrigin) &&
      expected.stagingAppOrigin !== expected.canonicalProductionAppOrigin,
    "evidence_app_origin_separation_invalid"
  );
}

function validateContentFreeReport(report, failures) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    failures.add("evidence_report_invalid");
    return;
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(report);
  } catch {
    failures.add("evidence_report_not_serializable");
    return;
  }
  if (typeof serialized !== "string") {
    failures.add("evidence_report_not_serializable");
    return;
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_REPORT_BYTES) {
    failures.add("evidence_report_too_large");
  }
  const queue = [report];
  while (queue.length) {
    const current = queue.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (SENSITIVE_REPORT_KEYS.has(key.toLowerCase())) {
        failures.add("evidence_report_contains_sensitive_field");
      }
      if (value && typeof value === "object") queue.push(value);
    }
  }
}

module.exports = {
  SHA256_PATTERN,
  addFailure,
  expectedScope,
  normalizeInteger,
  normalizeText,
  validateContentFreeReport,
  validateExpected,
};
