import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

if (process.argv.includes("--load-check")) {
  console.log("macOS packaged verifier loaded.");
  process.exit(0);
}
if (process.platform !== "darwin") throw new Error("Packaged macOS verification must run on macOS.");

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = resolve(packageRoot, "artifacts", "macos");
const logRoot = resolve(artifactRoot, "logs");
const appBinary = resolve(packageRoot, "src-tauri", "target", "release", "bundle", "macos", "FS Desktop Architecture Spike.app", "Contents", "MacOS", "fs-desktop-architecture-spike");
const probePath = resolve(tmpdir(), "fs-desktop-spike-hosted.json");
const evidencePath = resolve(artifactRoot, "macos-packaged-evidence.json");
const publicEnvironment = JSON.parse(readFileSync(resolve(packageRoot, "generated", "test-release-public-env.json"), "utf8"));
const normalBuildId = publicEnvironment.releases.normal.buildId;
const hangingBuildId = publicEnvironment.releases.hanging.buildId;
mkdirSync(logRoot, { recursive: true });

const evidence = {
  schema: "fs-desktop-macos-packaged-evidence-v1",
  architecture: process.arch,
  startedAt: new Date().toISOString(),
  packagePath: "FS Desktop Architecture Spike.app",
  productionCredentialsUsed: false,
  productionDataUsed: false,
  productionSigningKeysUsed: false,
  published: false,
  results: [],
};

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const removeProbe = () => { if (existsSync(probePath)) unlinkSync(probePath); };

function portOpen() {
  return new Promise((resolvePort) => {
    const socket = connect({ host: "127.0.0.1", port: 47842 });
    socket.setTimeout(300);
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    const closed = () => { socket.destroy(); resolvePort(false); };
    socket.once("error", closed);
    socket.once("timeout", closed);
  });
}

async function waitForPort(open, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await portOpen()) === open) return;
    await delay(200);
  }
  throw new Error(`Synthetic source did not become ${open ? "available" : "unavailable"}.`);
}

function startServer(mode = "normal") {
  const descriptor = openSync(resolve(logRoot, `source-${mode}.log`), "a");
  const child = spawn(process.execPath, [resolve(packageRoot, "tools", "hosted-server.mjs")], {
    cwd: packageRoot,
    env: { ...process.env, FS_DESKTOP_MANIFEST_MODE: mode },
    stdio: ["ignore", descriptor, descriptor],
  });
  child.logDescriptor = descriptor;
  return child;
}

function startApp() {
  const descriptor = openSync(resolve(logRoot, "packaged-app.log"), "a");
  const child = spawn(appBinary, [], { cwd: dirname(appBinary), stdio: ["ignore", descriptor, descriptor] });
  child.logDescriptor = descriptor;
  return child;
}

async function stop(child) {
  if (!child) return;
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), delay(2_000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  if (Number.isInteger(child.logDescriptor)) closeSync(child.logDescriptor);
}

async function waitForProbe(predicate, app, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app?.exitCode !== null) throw new Error(`Packaged application exited early (${app.exitCode}).`);
    if (existsSync(probePath)) {
      try {
        const value = JSON.parse(readFileSync(probePath, "utf8"));
        if (predicate(value)) return value;
      } catch {}
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for packaged macOS probe evidence.");
}

function validate(probe, bootMode) {
  if (probe?.probe?.candidate !== "hosted" || probe.probe.bootMode !== bootMode) throw new Error(`Unexpected packaged boot mode: ${probe?.probe?.bootMode}`);
  if (probe.probe.payloadBuildId !== normalBuildId || probe.nativeEvidence?.activeBuildId !== normalBuildId) throw new Error("Active signed generation changed unexpectedly.");
  if (probe.probe.cacheVersion !== "fs-desktop-native-shell-cache-v2") throw new Error("Native cache version mismatch.");
  if (probe.probe.serviceWorkerControlled !== false || probe.probe.unauthorizedCommandRejected !== true) throw new Error("WebView boundary evidence failed.");
  if (probe.nativeEvidence?.localSchemaVersion !== 3 || probe.nativeEvidence?.syncProtocolVersion !== 1) throw new Error("Local compatibility mismatch.");
  if (probe.nativeEvidence?.contentOrigin !== "fs-active://localhost" || probe.nativeEvidence?.customProtocol !== true) throw new Error("macOS custom-protocol origin mismatch.");
  if (probe.nativeEvidence?.activeIsolationProofSchema !== "fs-desktop-candidate-isolation-v1") throw new Error("Candidate isolation proof is missing.");
  if (probe.nativeEvidence?.localProjectionLoaded !== true || probe.nativeEvidence?.partitionValidated !== true) throw new Error("Local projection evidence is missing.");
  return probe;
}

function expectedBoot(value, bootMode) {
  return value?.probe?.bootMode === bootMode
    && value?.probe?.payloadBuildId === normalBuildId
    && value?.nativeEvidence?.activeBuildId === normalBuildId;
}

function pass(name, detail = {}) {
  evidence.results.push({ name, result: "passed", ...detail });
  console.log(`PASS ${name}`);
}

let server = null;
let app = null;
try {
  if (!existsSync(appBinary)) throw new Error(`Packaged binary is missing: ${appBinary}`);
  server = startServer();
  await waitForPort(true);
  removeProbe();
  app = startApp();
  const online = validate(await waitForProbe((value) => expectedBoot(value, "online"), app), "online");
  pass("signed packaged startup", { activeBuildId: normalBuildId, origin: online.nativeEvidence.contentOrigin });

  for (const mode of ["invalid-signature", "unknown-key", "modified-asset", "incompatible"]) {
    removeProbe();
    await stop(server);
    await waitForPort(false);
    server = startServer(mode);
    await waitForPort(true);
    const rejected = validate(await waitForProbe((value) => value?.probe?.bootMode === "compatibility-blocked", app), "compatibility-blocked");
    if (rejected.nativeEvidence.candidateBuildId) throw new Error(`${mode} reached candidate authority.`);
    pass(`${mode} rejected with LKG retained`, { activeBuildId: normalBuildId });
  }

  removeProbe();
  await stop(server);
  await waitForPort(false);
  server = startServer("hanging");
  await waitForPort(true);
  const quarantined = validate(await waitForProbe(
    (value) => value?.nativeEvidence?.latestQuarantine?.buildId === hangingBuildId
      && value?.nativeEvidence?.latestQuarantine?.failureCode === "timeout",
    app,
    40_000,
  ), "online");
  if (quarantined.nativeEvidence.candidateBuildId) throw new Error("Timed-out candidate retained authority.");
  pass("candidate timeout quarantine and backoff", { quarantinedBuildId: hangingBuildId, activeBuildId: normalBuildId });

  await stop(app);
  removeProbe();
  app = startApp();
  validate(await waitForProbe((value) => value?.nativeEvidence?.latestQuarantine?.buildId === hangingBuildId, app), "online");
  pass("quarantine and LKG survive process restart", { physicalRestart: false });

  removeProbe();
  await stop(server);
  server = null;
  await waitForPort(false);
  validate(await waitForProbe((value) => value?.probe?.bootMode === "offline", app), "offline");
  pass("online to offline transition", { realNetworkAdapterSwitch: false });

  await stop(app);
  removeProbe();
  app = startApp();
  validate(await waitForProbe((value) => value?.probe?.bootMode === "offline", app), "offline");
  pass("offline packaged process restart", { localProjectionLoaded: true, physicalRestart: false });

  removeProbe();
  server = startServer();
  await waitForPort(true);
  validate(await waitForProbe((value) => value?.probe?.bootMode === "online", app), "online");
  pass("offline to online recovery", { activeGenerationUnchanged: true });
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = String(error?.stack || error).slice(0, 2_000);
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await stop(app);
  await stop(server);
  evidence.completedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}
