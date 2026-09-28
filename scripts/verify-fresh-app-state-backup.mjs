import { pathToFileURL } from "node:url";
import { dataSafetyRegistry } from "../src/core/data-safety-contracts.mjs";

const targets = Object.freeze({
  staging: { origin: "https://staging.footballscience.xyz", project: "pokrksgempkuraueglpu" },
  production: { origin: "https://footballscience.xyz", project: "bustidorxevacosqhkcz" },
});
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

// Credentials stay in the runner; neither server bodies nor tokens enter logs.
export async function verifyFreshBackup({ target, expectedBuildId, username, password, cronSecret, fetchImpl = fetch }) {
  const config = targets[target];
  requireCondition(config && /^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]+)$/.test(expectedBuildId || ""), "Valid target and exact deployed build identity required.");
  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetchImpl(new URL(path, config.origin), {
        ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(75_000),
      });
    } catch {
      throw new Error(`Backup verification transport failed at ${path.split("?")[0]}.`);
    }
    requireCondition(response.ok, `Backup verification HTTP ${response.status} at ${path.split("?")[0]}.`);
    let payload;
    try { payload = await response.json(); } catch { throw new Error("Backup verification returned invalid JSON."); }
    requireCondition(payload.ok === true, "Backup verification response was not successful.");
    return payload;
  };
  const checkIdentity = async () => {
    const identity = await request("/api/client-config");
    requireCondition(identity.buildId === expectedBuildId, "Deployed build does not match backup verification target.");
    requireCondition(identity.url === `https://${config.project}.supabase.co`, "Backup verification database identity mismatch.");
  };
  await checkIdentity();
  let token = target === "production" ? cronSecret : "";
  if (!token) {
    requireCondition(username && password, "Existing QA credentials are required for backup verification.");
    const login = await request("/api/client-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
    });
    token = login.session?.access_token;
    requireCondition(typeof token === "string" && token.length > 0, "QA login did not return a session.");
  }
  const headers = { Authorization: `Bearer ${token}` };
  const started = Date.now();
  const created = await request("/api/app-state-backup", { method: "POST", headers });
  requireCondition(/^[a-f0-9]{64}$/.test(created.contentSha256 || ""), "Fresh backup has no valid content hash.");
  requireCondition(Date.parse(created.createdAt) >= started - 60_000, "Created backup is not fresh.");
  const status = await request("/api/app-state-backup?mode=status", { headers });
  requireCondition(status.backupMatchesPointer === true && status.latest?.contentSha256 === created.contentSha256
    && status.backup?.contentSha256 === created.contentSha256 && status.latest?.path === created.path,
  "Fresh backup pointer or content verification failed.");
  const drill = await request("/api/app-state-backup?mode=restore-drill", { headers });
  const result = drill.restoreDrill;
  requireCondition(drill.latest?.contentSha256 === created.contentSha256 && result?.restorable === true
    && result.dryRun === true && result.restored === false, "Fresh backup restore drill failed.");
  requireCondition(result.keyCount === dataSafetyRegistry.keys().length
    && Number.isInteger(result.entryCount) && result.entryCount >= 0
    && [result.declaredEntryCount, result.pointerEntryCount, result.parsedEntryCount, created.entryCount]
      .every((count) => count === result.entryCount), "Backup restore counts do not match.");
  for (const field of ["unknownEntryKeys", "missingEntryKeys", "unexpectedEntryKeys", "invalidEntries"]) {
    requireCondition(Array.isArray(result[field]) && result[field].length === 0, "Backup restore validation found incomplete data.");
  }
  await checkIdentity();
  return { ok: true, elapsedMs: Date.now() - started };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const staging = process.env.BACKUP_VERIFY_TARGET === "staging";
  try {
    const result = await verifyFreshBackup({ target: process.env.BACKUP_VERIFY_TARGET,
      expectedBuildId: process.env.BACKUP_EXPECTED_BUILD_ID,
      username: staging ? process.env.STAGING_QA_USERNAME : process.env.LIVE_QA_USERNAME,
      password: staging ? process.env.STAGING_QA_PASSWORD : process.env.LIVE_QA_PASSWORD,
      cronSecret: staging ? "" : process.env.CRON_SECRET });
    console.log(`Fresh backup and read-only restore verification passed (${result.elapsedMs} ms).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
