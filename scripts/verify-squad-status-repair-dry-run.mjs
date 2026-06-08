import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const failures = [];
const allowedFields = new Set(["status", "squadStatus"]);

function fail(message) {
  failures.push(message);
}

function numberAtLeast(value, minimum, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum) {
    fail(`${label} is invalid.`);
  }
  return numeric;
}

function stringPresent(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    fail(`${label} is missing.`);
  }
  return text;
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
      fail(`Squad status repair dry-run exposed forbidden payload content (${needle}).`);
    }
  });
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to run the Squad status repair dry-run.");
}

if (!failures.length) {
  const dryRunUrl = new URL("/api/app-state-backup", baseUrl);
  dryRunUrl.searchParams.set("mode", "squad-status-repair-dry-run");
  const response = await fetch(dryRunUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  const payloadText = JSON.stringify(payload);

  if (!response.ok || payload.ok !== true) {
    fail(`Squad status repair dry-run endpoint failed (${response.status}): ${payload.reason || "unknown error"}`);
  }

  rejectRawPayload(payloadText);

  if (payload.schema !== "footballscience-squad-status-repair-dry-run-v1") {
    fail("Squad status repair dry-run returned an unexpected schema.");
  }

  if (payload.dryRun !== true || payload.writes !== false) {
    fail("Squad status repair dry-run must be read-only.");
  }

  stringPresent(payload.dryRunSha256, "dryRunSha256");

  const current = payload.current || {};
  const latestBackup = payload.latestBackup || {};
  const repairDryRun = payload.repairDryRun || {};
  const rollbackPlan = payload.rollbackPlan || {};

  if (current.present !== true) {
    fail("Squad player profile app-state entry is missing.");
  }
  stringPresent(current.valueSha256, "current.valueSha256");
  numberAtLeast(current.revision, 1, "current.revision");
  numberAtLeast(current.valueBytes, 1, "current.valueBytes");

  if (latestBackup.present !== true || latestBackup.hasPlayerProfilesEntry !== true) {
    fail("Latest backup does not include the Squad player profile key.");
  }
  if (latestBackup.backupMatchesPointer !== true) {
    fail("Latest backup pointer does not match the stored backup object.");
  }
  stringPresent(latestBackup.pointerContentSha256, "latestBackup.pointerContentSha256");
  stringPresent(latestBackup.playerProfilesValueSha256, "latestBackup.playerProfilesValueSha256");

  const candidateCount = numberAtLeast(repairDryRun.candidateCount, 1, "repairDryRun.candidateCount");
  const statusCount = numberAtLeast(repairDryRun.fieldCounts?.status, 0, "repairDryRun.fieldCounts.status");
  const squadStatusCount = numberAtLeast(
    repairDryRun.fieldCounts?.squadStatus,
    0,
    "repairDryRun.fieldCounts.squadStatus"
  );
  const totalFieldCount = numberAtLeast(repairDryRun.totalFieldCount, 1, "repairDryRun.totalFieldCount");
  if (statusCount + squadStatusCount !== totalFieldCount) {
    fail("Squad status repair dry-run field counts do not add up.");
  }

  if (repairDryRun.allCandidateFieldsAllowed !== true) {
    fail("Squad status repair dry-run includes fields outside status/squadStatus.");
  }
  if (repairDryRun.allCandidatesRestorableFromTrustedSource !== true) {
    fail("Squad status repair dry-run includes candidates without a trusted changeLog source.");
  }
  if (repairDryRun.snapshotGuardReady !== true || repairDryRun.backupGuardReady !== true) {
    fail("Squad status repair dry-run guard readiness is not satisfied.");
  }
  if (repairDryRun.safeToExecuteAsSeparateRepair !== true) {
    fail("Squad status repair dry-run could not prove that separate repair execution is safe.");
  }
  stringPresent(repairDryRun.planSha256, "repairDryRun.planSha256");

  const candidates = Array.isArray(repairDryRun.candidates) ? repairDryRun.candidates : [];
  if (candidates.length !== candidateCount) {
    fail("Squad status repair dry-run candidate list length does not match candidate count.");
  }

  candidates.forEach((candidate, index) => {
    stringPresent(candidate.candidateSha256, `candidate[${index}].candidateSha256`);
    if (candidate.allFieldsAllowed !== true || candidate.restorableFromTrustedSource !== true) {
      fail(`Squad status repair dry-run candidate ${index} is not allowed/restorable.`);
    }
    const fields = Array.isArray(candidate.fields) ? candidate.fields : [];
    if (fields.length < 1 || fields.length > allowedFields.size) {
      fail(`Squad status repair dry-run candidate ${index} has an invalid field count.`);
    }
    fields.forEach((field) => {
      if (!allowedFields.has(field.field)) {
        fail(`Squad status repair dry-run candidate ${index} includes unsupported field ${field.field}.`);
      }
      if (field.trustedSource !== "latest-explicit-changeLog-entry" || field.restorable !== true) {
        fail(`Squad status repair dry-run candidate ${index} has an untrusted source.`);
      }
    });
  });

  if (rollbackPlan.available !== true || rollbackPlan.restoreRequiresSeparateApproval !== true) {
    fail("Squad status repair dry-run rollback plan is not ready for a separate repair decision.");
  }

  if (!failures.length) {
    console.log(
      [
        "Squad status repair dry-run: ok",
        `candidates=${candidateCount}`,
        `statusFields=${statusCount}`,
        `squadStatusFields=${squadStatusCount}`,
        `totalFields=${totalFieldCount}`,
        `currentRevision=${current.revision}`,
        `currentSha256=${current.valueSha256}`,
        `backupSha256=${latestBackup.pointerContentSha256}`,
        `planSha256=${repairDryRun.planSha256}`,
        `dryRunSha256=${payload.dryRunSha256}`,
        `safeSeparateRepair=${repairDryRun.safeToExecuteAsSeparateRepair === true}`,
      ].join(" ")
    );
  }
}

if (failures.length) {
  console.error("Squad status repair dry-run failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
