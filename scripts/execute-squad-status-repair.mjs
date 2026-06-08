import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || "").trim();
const failures = [];

const expected = {
  expectedCurrentRevision: process.env.EXPECTED_CURRENT_REVISION,
  expectedCurrentSha256: process.env.EXPECTED_CURRENT_SHA256,
  expectedBackupSha256: process.env.EXPECTED_BACKUP_SHA256,
  expectedPlanSha256: process.env.EXPECTED_PLAN_SHA256,
  expectedDryRunSha256: process.env.EXPECTED_DRY_RUN_SHA256,
  expectedCandidateCount: process.env.EXPECTED_CANDIDATE_COUNT,
  expectedFieldWriteCount: process.env.EXPECTED_FIELD_WRITE_COUNT,
  expectedStatusFieldCount: process.env.EXPECTED_STATUS_FIELD_COUNT,
  expectedSquadStatusFieldCount: process.env.EXPECTED_SQUAD_STATUS_FIELD_COUNT,
  allowedFields: ["status", "squadStatus"],
};

function fail(message) {
  failures.push(message);
}

function requiredString(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    fail(`${label} is required.`);
  }
  return text;
}

function requiredSha256(value, label) {
  const text = requiredString(value, label).toLowerCase();
  if (text && !/^[a-f0-9]{64}$/.test(text)) {
    fail(`${label} must be a sha256 hex digest.`);
  }
  return text;
}

function requiredInteger(value, label, minimum = 0) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum) {
    fail(`${label} must be an integer >= ${minimum}.`);
  }
  return numeric;
}

function rejectRawPayload(payloadText) {
  [
    '"entries"',
    '"players"',
    '"changeLog"',
    '"name"',
    '"playerName"',
    '"updatedBy"',
    "service-role",
    "SUPABASE",
    "CRON_SECRET",
  ].forEach((needle) => {
    if (payloadText.includes(needle)) {
      fail(`Squad status repair execution exposed forbidden payload content (${needle}).`);
    }
  });
}

if (!cronSecret) {
  fail("CRON_SECRET is required to execute the Squad status repair.");
}

const expectedCurrentRevision = requiredInteger(expected.expectedCurrentRevision, "EXPECTED_CURRENT_REVISION", 1);
const expectedCandidateCount = requiredInteger(expected.expectedCandidateCount, "EXPECTED_CANDIDATE_COUNT", 1);
const expectedFieldWriteCount = requiredInteger(expected.expectedFieldWriteCount, "EXPECTED_FIELD_WRITE_COUNT", 1);
const expectedStatusFieldCount = requiredInteger(expected.expectedStatusFieldCount, "EXPECTED_STATUS_FIELD_COUNT", 0);
const expectedSquadStatusFieldCount = requiredInteger(
  expected.expectedSquadStatusFieldCount,
  "EXPECTED_SQUAD_STATUS_FIELD_COUNT",
  0
);
const expectedCurrentSha256 = requiredSha256(expected.expectedCurrentSha256, "EXPECTED_CURRENT_SHA256");
const expectedBackupSha256 = requiredSha256(expected.expectedBackupSha256, "EXPECTED_BACKUP_SHA256");
const expectedPlanSha256 = requiredSha256(expected.expectedPlanSha256, "EXPECTED_PLAN_SHA256");
const expectedDryRunSha256 = requiredSha256(expected.expectedDryRunSha256, "EXPECTED_DRY_RUN_SHA256");

if (expectedStatusFieldCount + expectedSquadStatusFieldCount !== expectedFieldWriteCount) {
  fail("Expected field counts do not add up.");
}

if (!failures.length) {
  const executeUrl = new URL("/api/app-state-backup", baseUrl);
  executeUrl.searchParams.set("mode", "squad-status-repair-execute");
  const response = await fetch(executeUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expectedCurrentRevision,
      expectedCurrentSha256,
      expectedBackupSha256,
      expectedPlanSha256,
      expectedDryRunSha256,
      expectedCandidateCount,
      expectedFieldWriteCount,
      expectedStatusFieldCount,
      expectedSquadStatusFieldCount,
      allowedFields: ["status", "squadStatus"],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const payloadText = JSON.stringify(payload);
  rejectRawPayload(payloadText);

  if (!response.ok || payload.ok !== true) {
    fail(`Squad status repair execution failed (${response.status}): ${payload.reason || "unknown error"}`);
    if (Array.isArray(payload.guardFailures) && payload.guardFailures.length) {
      fail(`Guard failures: ${payload.guardFailures.join(",")}`);
    }
  }

  if (payload.schema !== "footballscience-squad-status-repair-execution-v1") {
    fail("Squad status repair execution returned an unexpected schema.");
  }
  if (payload.dryRun !== false || payload.writes !== true || payload.executed !== true) {
    fail("Squad status repair execution did not report exactly one protected write path.");
  }
  if (payload.targetKey !== "football-player-profiles-v1") {
    fail("Squad status repair execution targeted an unexpected state key.");
  }

  const fieldsOnly = Array.isArray(payload.fieldsOnly) ? payload.fieldsOnly : [];
  if (fieldsOnly.length !== 2 || !fieldsOnly.includes("status") || !fieldsOnly.includes("squadStatus")) {
    fail("Squad status repair execution included unsupported fields.");
  }

  const repairedFieldCounts = payload.repairedFieldCounts || {};
  if (Number(payload.repairedCandidateCount) !== expectedCandidateCount) {
    fail("Squad status repair execution candidate count mismatch.");
  }
  if (Number(payload.repairedTotalFieldCount) !== expectedFieldWriteCount) {
    fail("Squad status repair execution field count mismatch.");
  }
  if (Number(repairedFieldCounts.status) !== expectedStatusFieldCount) {
    fail("Squad status repair execution status field count mismatch.");
  }
  if (Number(repairedFieldCounts.squadStatus) !== expectedSquadStatusFieldCount) {
    fail("Squad status repair execution squadStatus field count mismatch.");
  }

  const before = payload.before || {};
  const after = payload.after || {};
  const snapshot = payload.preWriteSnapshot || {};
  const postWriteAudit = payload.postWriteAudit || {};
  const rollbackPlan = payload.rollbackPlan || {};

  if (Number(before.revision) !== expectedCurrentRevision || before.valueSha256 !== expectedCurrentSha256) {
    fail("Squad status repair execution before guard mismatch.");
  }
  if (before.backupSha256 !== expectedBackupSha256 || before.planSha256 !== expectedPlanSha256) {
    fail("Squad status repair execution backup/plan guard mismatch.");
  }
  if (before.dryRunSha256 !== expectedDryRunSha256) {
    fail("Squad status repair execution dry-run guard mismatch.");
  }
  if (Number(after.revision) !== expectedCurrentRevision + 1) {
    fail("Squad status repair execution did not advance the revision by one.");
  }
  requiredSha256(after.valueSha256, "after.valueSha256");
  requiredSha256(snapshot.contentSha256, "preWriteSnapshot.contentSha256");
  requiredSha256(snapshot.pathSha256, "preWriteSnapshot.pathSha256");
  requiredString(snapshot.path, "preWriteSnapshot.path");

  if (
    Number(postWriteAudit.candidateCount) !== 0 ||
    Number(postWriteAudit.totalFieldCount) !== 0 ||
    postWriteAudit.cleared !== true
  ) {
    fail("Squad status repair execution post-write audit did not clear repair candidates.");
  }
  requiredSha256(postWriteAudit.dryRunSha256, "postWriteAudit.dryRunSha256");

  if (
    rollbackPlan.available !== true ||
    rollbackPlan.restoreKey !== "football-player-profiles-v1" ||
    rollbackPlan.restoreRequiresSeparateApproval !== true ||
    rollbackPlan.rawBackupExposed !== false
  ) {
    fail("Squad status repair execution rollback plan is not properly constrained.");
  }

  if (!failures.length) {
    console.log(
      [
        "Squad status repair execution: ok",
        `repairedCandidates=${payload.repairedCandidateCount}`,
        `statusFields=${repairedFieldCounts.status}`,
        `squadStatusFields=${repairedFieldCounts.squadStatus}`,
        `totalFields=${payload.repairedTotalFieldCount}`,
        `beforeRevision=${before.revision}`,
        `afterRevision=${after.revision}`,
        `beforeSha256=${before.valueSha256}`,
        `afterSha256=${after.valueSha256}`,
        `snapshotSha256=${snapshot.contentSha256}`,
        `snapshotPathSha256=${snapshot.pathSha256}`,
        `postWriteCandidates=${postWriteAudit.candidateCount}`,
        `postWriteDryRunSha256=${postWriteAudit.dryRunSha256}`,
      ].join(" ")
    );
  }
}

if (failures.length) {
  console.error("Squad status repair execution failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
