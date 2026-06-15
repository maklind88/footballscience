import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const failures = [];
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowLiveHashMismatch = process.env.RELEASE_ALLOW_LIVE_HASH_MISMATCH === "1";
const releaseHashWaitMs = Number(process.env.RELEASE_LIVE_HASH_WAIT_MS || 90_000);
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

async function waitForExpectedAsset(pathname, expectedHash, label) {
  const url = urlFor(pathname);
  const deadline = Date.now() + Math.max(releaseHashWaitMs, 0);
  let lastApp = await readText(url);
  let lastHash = sha256(lastApp.text);
  let announcedWait = false;
  while (lastApp.response.ok && lastHash !== expectedHash && Date.now() < deadline) {
    if (!announcedWait) {
      console.log(
        `- waiting for live ${label} hash to match release for up to ${Math.round(releaseHashWaitMs / 1000)}s`,
      );
      announcedWait = true;
    }
    await sleep(releaseHashRetryDelayMs);
    lastApp = await readText(urlFor(pathname));
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
const expectedRuntimeSource = fs.readFileSync(path.join(rootDir, "app-runtime.js"), "utf8");
const expectedRuntimeHash = sha256(expectedRuntimeSource);
const expectedNavigationControllerSource = fs.readFileSync(
  path.join(rootDir, "src/modules/platform/navigation-controller.mjs"),
  "utf8"
);
const expectedNavigationControllerHash = sha256(expectedNavigationControllerSource);
const { app, hash: liveAppHash } = allowLiveHashMismatch
  ? await (async () => {
      const liveApp = await readText(urlFor("/app.js"));
      return { app: liveApp, hash: sha256(liveApp.text) };
    })()
  : await waitForExpectedAsset("/app.js", expectedAppHash, "app.js");
const { app: runtime, hash: liveRuntimeHash } = allowLiveHashMismatch
  ? await (async () => {
      const liveRuntime = await readText(urlFor("/app-runtime.js"));
      return { app: liveRuntime, hash: sha256(liveRuntime.text) };
    })()
  : await waitForExpectedAsset("/app-runtime.js", expectedRuntimeHash, "app-runtime.js");
const { app: navigationController, hash: liveNavigationControllerHash } = allowLiveHashMismatch
  ? await (async () => {
      const liveNavigationController = await readText(urlFor("/src/modules/platform/navigation-controller.mjs"));
      return { app: liveNavigationController, hash: sha256(liveNavigationController.text) };
    })()
  : await waitForExpectedAsset(
      "/src/modules/platform/navigation-controller.mjs",
      expectedNavigationControllerHash,
      "navigation-controller.mjs"
    );
expect(app.response.ok, `app.js did not return 2xx: ${app.response.status}`);
expect(runtime.response.ok, `app-runtime.js did not return 2xx: ${runtime.response.status}`);
expect(
  navigationController.response.ok,
  `navigation-controller.mjs did not return 2xx: ${navigationController.response.status}`
);
expect(app.text.includes("app-runtime.js"), "app.js is missing runtime loader.");
expect(runtime.text.includes("workspaceLastActiveStorageKey"), "app-runtime.js is missing refresh workspace persistence.");
expect(
  runtime.text.includes("createPlatformNavigationController"),
  "app-runtime.js is missing platform navigation controller wiring."
);
expect(
  navigationController.text.includes("__lastRenderedMarkup"),
  "navigation-controller.mjs is missing top menu rerender guard."
);
expect(runtime.text.includes("football-dashboard-chat-v1"), "app-runtime.js is missing chat storage contract key.");
if (!allowLiveHashMismatch) {
  expect(
    liveAppHash === expectedAppHash,
    `Live app.js hash does not match this release. expected=${expectedAppHash} live=${liveAppHash}`
  );
  expect(
    liveRuntimeHash === expectedRuntimeHash,
    `Live app-runtime.js hash does not match this release. expected=${expectedRuntimeHash} live=${liveRuntimeHash}`
  );
  expect(
    liveNavigationControllerHash === expectedNavigationControllerHash,
    `Live navigation-controller.mjs hash does not match this release. expected=${expectedNavigationControllerHash} live=${liveNavigationControllerHash}`
  );
}

const clientConfigResponse = await fetch(new URL("/api/client-config", baseUrl), { cache: "no-store" });
const clientConfig = await clientConfigResponse.json().catch(() => ({}));
expect(clientConfigResponse.ok, `/api/client-config did not return 2xx: ${clientConfigResponse.status}`);
expect(clientConfig.ok === true, "/api/client-config did not return ok:true.");
expect(Boolean(clientConfig.url && clientConfig.anonKey), "/api/client-config is missing Supabase browser config.");
expect(clientConfig.hasServiceRoleKey === true, "/api/client-config reports missing service role key.");

const authHealthResponse = await fetch(new URL("/api/auth-health", baseUrl), { cache: "no-store" });
const authHealth = await authHealthResponse.json().catch(() => ({}));
expect(
  authHealth.service === "supabase-auth",
  `/api/auth-health did not return the expected service marker: ${authHealthResponse.status}`
);
expect(
  authHealthResponse.status === 200 || authHealthResponse.status === 503,
  `/api/auth-health returned an unexpected status: ${authHealthResponse.status}`
);

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
  console.log("- app-runtime.js: ok");
  console.log(`- app-runtime.js hash: ${liveRuntimeHash}`);
  console.log("- navigation-controller.mjs: ok");
  console.log(`- navigation-controller.mjs hash: ${liveNavigationControllerHash}`);
  if (
    allowLiveHashMismatch &&
    (
      liveAppHash !== expectedAppHash ||
      liveRuntimeHash !== expectedRuntimeHash ||
      liveNavigationControllerHash !== expectedNavigationControllerHash
    )
  ) {
    console.log(
      `- app asset release hash match: skipped for monitor mode (app=${expectedAppHash}, runtime=${expectedRuntimeHash}, navigation=${expectedNavigationControllerHash})`
    );
  }
  console.log("- client config: ok");
  console.log(`- auth health endpoint: ${authHealth.ok === true ? "ok" : "warning"}`);
  console.log("- backup protection: ok");
  console.log("- backup status protection: ok");
}
