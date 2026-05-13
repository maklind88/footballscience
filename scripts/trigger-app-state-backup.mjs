import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || "").trim();
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!cronSecret) {
  fail("CRON_SECRET is required to trigger app-state backup.");
}

if (!failures.length) {
  const backupUrl = new URL("/api/app-state-backup", baseUrl);
  const response = await fetch(backupUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok !== true) {
    fail(`Backup trigger failed (${response.status}): ${payload.reason || "unknown error"}`);
  }

  if (!failures.length) {
    console.log(
      `App-state backup triggered: ${payload.path || "unknown path"} (${Number(payload.entryCount || 0)} entries).`
    );
  }
}

if (failures.length) {
  console.error("App-state backup trigger failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
