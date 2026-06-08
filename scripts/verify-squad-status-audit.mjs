import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const failures = [];

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

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to run the Squad status audit.");
}

if (!failures.length) {
  const auditUrl = new URL("/api/app-state-backup", baseUrl);
  auditUrl.searchParams.set("mode", "squad-status-audit");
  const response = await fetch(auditUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok !== true) {
    fail(`Squad status audit endpoint failed (${response.status}): ${payload.reason || "unknown error"}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entries")) {
    fail("Squad status audit must not expose raw backup entries.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "players")) {
    fail("Squad status audit must not expose raw player records.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "changeLog")) {
    fail("Squad status audit must not expose raw changeLog entries.");
  }

  const current = payload.current || {};
  const latestBackup = payload.latestBackup || {};
  const comparison = payload.backupComparison || {};

  if (payload.schema !== "footballscience-squad-status-audit-v1") {
    fail("Squad status audit returned an unexpected schema.");
  }

  if (payload.dryRun !== true || payload.writes !== false) {
    fail("Squad status audit must be read-only.");
  }

  if (current.present !== true) {
    fail("Squad player profile app-state entry is missing.");
  }

  numberAtLeast(current.playerCount, 1, "current.playerCount");
  numberAtLeast(current.changeLogCount, 0, "current.changeLogCount");
  numberAtLeast(current.explicitStatusChangeCount, 0, "current.explicitStatusChangeCount");
  numberAtLeast(current.explicitSquadStatusChangeCount, 0, "current.explicitSquadStatusChangeCount");
  numberAtLeast(current.playersWithSelfHealCandidates, 0, "current.playersWithSelfHealCandidates");

  if (latestBackup.present !== true || latestBackup.hasPlayerProfilesEntry !== true) {
    fail("Latest backup does not include the Squad player profile key.");
  }

  if (latestBackup.backupMatchesPointer !== true) {
    fail("Latest backup pointer does not match the stored backup object.");
  }

  numberAtLeast(comparison.comparablePlayers, 1, "backupComparison.comparablePlayers");
  numberAtLeast(comparison.statusDifferenceCount, 0, "backupComparison.statusDifferenceCount");
  numberAtLeast(comparison.squadStatusDifferenceCount, 0, "backupComparison.squadStatusDifferenceCount");

  if (payload.dataRepairLikelyRequired === true) {
    fail(
      `Squad status audit found ${current.playersWithSelfHealCandidates} player(s) with restorable Squad/Status drift; stop before data write and run a repair dry-run.`
    );
  }

  if (payload.codeReleaseLikelyEnough !== true) {
    fail("Squad status audit could not prove that code release alone is enough.");
  }

  if (!failures.length) {
    console.log(
      [
        "Squad status audit: ok",
        `players=${current.playerCount}`,
        `changeLog=${current.changeLogCount}`,
        `statusChanges=${current.explicitStatusChangeCount}`,
        `squadStatusChanges=${current.explicitSquadStatusChangeCount}`,
        `selfHealCandidates=${current.playersWithSelfHealCandidates}`,
        `backupComparablePlayers=${comparison.comparablePlayers}`,
      ].join(" ")
    );
  }
}

if (failures.length) {
  console.error("Squad status audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
