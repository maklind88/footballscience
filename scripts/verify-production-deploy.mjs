import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const failures = [];
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowLiveHashMismatch = process.env.RELEASE_ALLOW_LIVE_HASH_MISMATCH === "1";
const releaseHashWaitMs = Number(process.env.RELEASE_LIVE_HASH_WAIT_MS || 30_000);
const releaseHashRetryDelayMs = Number(process.env.RELEASE_LIVE_HASH_RETRY_DELAY_MS || 3_000);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function urlFor(pathname) {
  const url = new URL(pathname, baseUrl);
  url.search = `release-check=${Date.now()}`;
  return url;
}

async function readText(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return { response, text };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExpectedApp(url, expectedAppHash) {
  const deadline = Date.now() + Math.max(releaseHashWaitMs, 0);
  let lastApp = await readText(url);
  let lastHash = sha256(lastApp.text);
  while (lastApp.response.ok && lastHash !== expectedAppHash && Date.now() < deadline) {
    await sleep(releaseHashRetryDelayMs);
    lastApp = await readText(urlFor("/app.js"));
    lastHash = sha256(lastApp.text);
  }
  return { app: lastApp, hash: lastHash };
}

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

console.log(`Production verification: ${baseUrl.origin}`);

const home = await readText(urlFor("/"));
expect(home.response.ok, `Home did not return 2xx: ${home.response.status}`);
expect(home.text.includes("platformAuthReadyPromise"), "Home HTML is missing auth boot marker.");
expect(home.text.includes("Loading..."), "Home HTML is missing premium loading marker.");

const expectedAppSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const expectedAppHash = sha256(expectedAppSource);
const { app, hash: liveAppHash } = allowLiveHashMismatch
  ? await (async () => {
      const liveApp = await readText(urlFor("/app.js"));
      return { app: liveApp, hash: sha256(liveApp.text) };
    })()
  : await waitForExpectedApp(urlFor("/app.js"), expectedAppHash);
expect(app.response.ok, `app.js did not return 2xx: ${app.response.status}`);
expect(app.text.includes("workspaceLastActiveStorageKey"), "app.js is missing refresh workspace persistence.");
expect(app.text.includes("__lastRenderedMarkup"), "app.js is missing top menu rerender guard.");
expect(app.text.includes("football-dashboard-chat-v1"), "app.js is missing chat storage contract key.");
if (!allowLiveHashMismatch) {
  expect(
    liveAppHash === expectedAppHash,
    `Live app.js hash does not match this release. expected=${expectedAppHash} live=${liveAppHash}`
  );
}

const clientConfigResponse = await fetch(new URL("/api/client-config", baseUrl), { cache: "no-store" });
const clientConfig = await clientConfigResponse.json().catch(() => ({}));
expect(clientConfigResponse.ok, `/api/client-config did not return 2xx: ${clientConfigResponse.status}`);
expect(clientConfig.ok === true, "/api/client-config did not return ok:true.");
expect(Boolean(clientConfig.url && clientConfig.anonKey), "/api/client-config is missing Supabase browser config.");
expect(clientConfig.hasServiceRoleKey === true, "/api/client-config reports missing service role key.");

const backupResponse = await fetch(new URL("/api/app-state-backup", baseUrl), { cache: "no-store" });
const backupText = await backupResponse.text();
expect(!backupResponse.ok, "/api/app-state-backup must not allow anonymous success.");
expect(backupText.includes("Admin sign-in") || backupText.includes("cron secret"), "/api/app-state-backup did not return the expected protection message.");

const backupStatusResponse = await fetch(new URL("/api/app-state-backup-status", baseUrl), { cache: "no-store" });
const backupStatusText = await backupStatusResponse.text();
expect(!backupStatusResponse.ok, "/api/app-state-backup-status must not allow anonymous success.");
expect(
  backupStatusText.includes("Admin sign-in") || backupStatusText.includes("cron secret"),
  "/api/app-state-backup-status did not return the expected protection message."
);

if (failures.length) {
  console.error("\nProduction verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("- home: ok");
  console.log("- app.js: ok");
  console.log(`- app.js hash: ${liveAppHash}`);
  if (allowLiveHashMismatch && liveAppHash !== expectedAppHash) {
    console.log(`- app.js release hash match: skipped for monitor mode (checkout=${expectedAppHash})`);
  }
  console.log("- client config: ok");
  console.log("- backup protection: ok");
  console.log("- backup status protection: ok");
}
