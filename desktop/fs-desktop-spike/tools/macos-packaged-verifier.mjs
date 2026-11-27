import { closeSync, existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

if (process.argv.includes("--load-check")) {
  console.log("Packaged desktop verifier loaded.");
  process.exit(0);
}
const linux = process.argv.includes("--linux");
const linuxRootOption = process.argv.find((value) => value.startsWith("--linux-root="));
if (linuxRootOption && !linux) throw new Error("--linux-root is only available with --linux.");
const linuxPackageRoot = linuxRootOption && realpathSync(linuxRootOption.slice("--linux-root=".length));
const platform = linux ? "linux" : "darwin";
if (process.platform !== platform) throw new Error(`Packaged verification must run on ${platform}.`);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = resolve(packageRoot, "src-tauri", "target", "release");
const artifactRoot = resolve(packageRoot, "artifacts", linux ? "linux" : "macos");
const logRoot = resolve(artifactRoot, "logs");
const appName = "FS Desktop Architecture Spike.app";
const appBinary = linux
  ? (linuxPackageRoot
    ? resolve(linuxPackageRoot, "usr", "bin", "fs-desktop-architecture-spike")
    : resolve(targetRoot, "fs-desktop-architecture-spike"))
  : resolve(targetRoot, "bundle", "macos", appName, "Contents", "MacOS", "fs-desktop-architecture-spike");
const evidencePath = resolve(artifactRoot, linux ? "linux-native-evidence.json" : "macos-packaged-evidence.json");
const publicEnvironment = JSON.parse(readFileSync(resolve(packageRoot, "generated", "test-release-public-env.json"), "utf8"));
const probeRoot = mkdtempSync(resolve(tmpdir(), "fs-desktop-native-proof-"));
const probePath = resolve(probeRoot, "fs-desktop-spike-hosted.json");
const testDataRoot = resolve(probeRoot, "fs-desktop-test-profile");
const normalBuildId = publicEnvironment.releases.normal.buildId;
const hangingBuildId = publicEnvironment.releases.hanging.buildId;
mkdirSync(logRoot, { recursive: true });

const evidence = {
  schema: linux ? "fs-desktop-linux-native-evidence-v1" : "fs-desktop-macos-packaged-evidence-v1",
  platform,
  architecture: process.arch,
  startedAt: new Date().toISOString(),
  packagePath: linux ? "fs-desktop-architecture-spike" : appName,
  packageKind: linux ? (linuxPackageRoot ? "extracted-test-deb" : "unbundled-native-binary") : "test-app-bundle",
  productionInstallerUsed: false,
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
  child.once("error", (error) => { child.spawnError = error; });
  return child;
}

function startApp() {
  const descriptor = openSync(resolve(logRoot, "packaged-app.log"), "a");
  const child = spawn(appBinary, [], {
    cwd: dirname(appBinary),
    env: {
      ...process.env,
      FS_DESKTOP_CI: "1",
      FS_DESKTOP_TEST_DATA_ROOT: testDataRoot,
      TMPDIR: probeRoot,
    },
    stdio: ["ignore", descriptor, descriptor],
  });
  child.logDescriptor = descriptor;
  child.once("error", (error) => { child.spawnError = error; });
  return child;
}

function running(child) {
  return Boolean(child?.pid && !child.spawnError && child.exitCode === null && child.signalCode === null);
}

async function stop(child) {
  if (!child) return;
  if (running(child)) {
    const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(2_000)]);
    if (running(child)) {
      child.kill("SIGKILL");
      await Promise.race([exited, delay(2_000)]);
    }
  }
  if (Number.isInteger(child.logDescriptor)) closeSync(child.logDescriptor);
}

async function waitForProbe(predicate, app, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app?.spawnError) throw app.spawnError;
    if (!running(app)) throw new Error(`Native application exited early (${app?.signalCode ?? app?.exitCode}).`);
    if (existsSync(probePath)) {
      try {
        const value = JSON.parse(readFileSync(probePath, "utf8"));
        if (predicate(value)) return value;
      } catch {}
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for native desktop probe evidence.");
}

function validate(probe, bootMode) {
  if (probe?.probe?.candidate !== "hosted" || probe.probe.bootMode !== bootMode) throw new Error(`Unexpected packaged boot mode: ${probe?.probe?.bootMode}`);
  if (probe.probe.payloadBuildId !== normalBuildId || probe.nativeEvidence?.activeBuildId !== normalBuildId) throw new Error("Active signed generation changed unexpectedly.");
  if (probe.probe.cacheVersion !== "fs-desktop-native-shell-cache-v2") throw new Error("Native cache version mismatch.");
  if (probe.probe.serviceWorkerControlled !== false || probe.probe.unauthorizedCommandRejected !== true) throw new Error("WebView boundary evidence failed.");
  if (probe.nativeEvidence?.localSchemaVersion !== 3 || probe.nativeEvidence?.syncProtocolVersion !== 1) throw new Error("Local compatibility mismatch.");
  if (probe.nativeEvidence?.contentOrigin !== "fs-active://localhost" || probe.nativeEvidence?.customProtocol !== true) throw new Error("Native custom-protocol origin mismatch.");
  if (probe.nativeEvidence?.activeIsolationProofSchema !== "fs-desktop-candidate-isolation-v1") throw new Error("Candidate isolation proof is missing.");
  if (probe.probe.fullPlatformRuntimeLoaded !== true || probe.nativeEvidence?.fullPlatformRuntimeLoaded !== true) throw new Error("Full platform runtime proof is missing.");
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
  if (!existsSync(appBinary)) throw new Error(`Native binary is missing: ${appBinary}`);
  if (linuxPackageRoot && realpathSync(appBinary) !== appBinary) throw new Error("The test package binary must not be a symlink.");
  if (await portOpen()) throw new Error("The synthetic loopback port is already in use.");
  server = startServer();
  await waitForPort(true);
  removeProbe();
  app = startApp();
  const online = validate(await waitForProbe((value) => expectedBoot(value, "online"), app), "online");
  pass("signed native startup", {
    activeBuildId: normalBuildId,
    origin: online.nativeEvidence.contentOrigin,
    fullPlatformRuntimeLoaded: true,
  });

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
  await stop(app);
  removeProbe();
  app = startApp();
  await waitForProbe(
    (value) => value?.nativeEvidence?.candidateBuildId === hangingBuildId,
    app,
    30_000,
  );
  await delay(10_000);
  if (app.exitCode !== null) throw new Error(`Packaged application exited during native candidate watchdog (${app.exitCode}).`);
  await stop(app);
  removeProbe();
  await stop(server);
  await waitForPort(false);
  server = startServer("normal");
  await waitForPort(true);
  app = startApp();
  const quarantined = validate(await waitForProbe(
    (value) => value?.nativeEvidence?.latestQuarantine?.buildId === hangingBuildId
      && value?.nativeEvidence?.latestQuarantine?.failureCode === "timeout",
    app,
    30_000,
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
  await stop(app);
  removeProbe();
  app = startApp();
  validate(await waitForProbe((value) => value?.probe?.bootMode === "offline", app), "offline");
  pass("online to offline cold start", { processRestart: true, realNetworkAdapterSwitch: false });

  await stop(app);
  removeProbe();
  app = startApp();
  validate(await waitForProbe((value) => value?.probe?.bootMode === "offline", app), "offline");
  pass("offline native process restart", { localProjectionLoaded: true, physicalRestart: false });

  removeProbe();
  await stop(app);
  server = startServer();
  await waitForPort(true);
  app = startApp();
  validate(await waitForProbe((value) => value?.probe?.bootMode === "online", app), "online");
  pass("offline to online recovery", { processRestart: true, activeGenerationUnchanged: true });
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
  rmSync(probeRoot, { recursive: true, force: true });
}
