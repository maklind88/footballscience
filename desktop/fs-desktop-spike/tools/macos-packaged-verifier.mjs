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
const appLogPath = resolve(logRoot, "packaged-app.log");
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
const normalBuildId = publicEnvironment.releases.normal.buildId;
const hangingBuildId = publicEnvironment.releases.hanging.buildId;
mkdirSync(logRoot, { recursive: true });
writeFileSync(appLogPath, "", "utf8");

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

function startApp(profileName = "profile") {
  const profileRoot = resolve(probeRoot, `fs-desktop-test-${profileName}`);
  const descriptor = openSync(appLogPath, "a");
  const child = spawn(appBinary, [], {
    cwd: dirname(appBinary),
    env: {
      ...process.env,
      FS_DESKTOP_CI: "1",
      FS_DESKTOP_TEST_DATA_ROOT: profileRoot,
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

function readProbe() {
  return existsSync(probePath) ? JSON.parse(readFileSync(probePath, "utf8")) : null;
}

async function waitForProbe(predicate, app, timeoutMs = 45_000, readObservation = readProbe) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app?.spawnError) throw app.spawnError;
    if (!running(app)) throw new Error(`Native application exited early (${app?.signalCode ?? app?.exitCode}).`);
    try {
      const value = readObservation();
      if (value && predicate(value)) return value;
    } catch {}
    await delay(250);
  }
  throw new Error("Timed out waiting for native desktop probe evidence.");
}

function validate(probe, bootMode, buildId = normalBuildId) {
  if (probe?.probe?.candidate !== "hosted" || probe.probe.bootMode !== bootMode) throw new Error(`Unexpected packaged boot mode: ${probe?.probe?.bootMode}`);
  if (probe.probe.payloadBuildId !== buildId || probe.nativeEvidence?.activeBuildId !== buildId) throw new Error("Active signed generation changed unexpectedly.");
  if (probe.probe.cacheVersion !== "fs-desktop-native-shell-cache-v2") throw new Error("Native cache version mismatch.");
  if (probe.probe.serviceWorkerControlled !== false || probe.probe.unauthorizedCommandRejected !== true) throw new Error("WebView boundary evidence failed.");
  if (probe.nativeEvidence?.localSchemaVersion !== 3 || probe.nativeEvidence?.syncProtocolVersion !== 1) throw new Error("Local compatibility mismatch.");
  if (probe.nativeEvidence?.contentOrigin !== "fs-active://localhost" || probe.nativeEvidence?.customProtocol !== true) throw new Error("Native custom-protocol origin mismatch.");
  if (probe.nativeEvidence?.activeIsolationProofSchema !== "fs-desktop-candidate-isolation-v1") throw new Error("Candidate isolation proof is missing.");
  if (probe.probe.fullPlatformRuntimeLoaded !== true || probe.nativeEvidence?.fullPlatformRuntimeLoaded !== true) throw new Error("Full platform runtime proof is missing.");
  if (probe.nativeEvidence?.localProjectionLoaded !== true || probe.nativeEvidence?.partitionValidated !== true) throw new Error("Local projection evidence is missing.");
  return probe;
}

function expectedBoot(value, bootMode, buildId = normalBuildId) {
  return value?.probe?.bootMode === bootMode
    && value?.probe?.payloadBuildId === buildId
    && value?.nativeEvidence?.activeBuildId === buildId;
}

function pass(name, detail = {}) {
  evidence.results.push({ name, result: "passed", ...detail });
  console.log(`PASS ${name}`);
}

function readFailureDiagnostics() {
  const tracePath = resolve(probeRoot, "fs-desktop-runtime-trace.log");
  const observedStages = new Map();
  const runtimeStage = /^(runtime run entered|setup entered|desktop runtime initialized|desktop runtime installed|main window created)$/;
  const windowStage = /^(window build (?:started|completed) role=(?:Active|Candidate|Recovery|Bundled) label=(?:main|candidate|recovery))$/;
  const navigationStage = /^((?:navigation role=\w+ allowed=(?:true|false)|page load role=\w+ event=\w+)) url=/;
  const protocolStage = /^(protocol (?:active|candidate|recovery) label=(?:main|candidate|recovery)) path=/;
  const commandStage = /^(command (?:desktop_bootstrap_status|desktop_prepare_shell_update(?: completed state=[a-z-]+| failed| task failed)?|desktop_candidate_status|desktop_candidate_confirm|desktop_candidate_report_failure|desktop_recovery_status|record_spike_probe))(?= |$)/;
  const preparationStage = /^(shell preparation (?:locks acquired|signed manifest verified|bundle extraction (?:started|verified)|generation (?:verification started|verified)))$/;
  const namedAsset = /^(protocol (?:active|candidate|recovery) label=(?:main|candidate|recovery) path=\/(?:bootstrap\/(?:index\.html|app\.js|tauri-invoke\.mjs)|active\/(?:index\.html|app-runtime\.js)|index\.html))$/;
  const stages = [runtimeStage, windowStage, navigationStage, namedAsset, protocolStage, commandStage, preparationStage];
  if (existsSync(tracePath)) {
    for (const line of readFileSync(tracePath, "utf8").split("\n")) {
      const event = line.replace(/^\d+ /, "");
      const stage = stages.map(pattern => pattern.exec(event)?.[1]).find(Boolean);
      if (stage) observedStages.set(stage, (observedStages.get(stage) || 0) + 1);
    }
  }
  let lastProbe = "missing";
  try {
    const value = readProbe();
    if (value) {
      const { probe, nativeEvidence } = value;
      const bootMode = probe?.bootMode;
      lastProbe = {
        bootMode: ["online", "offline", "compatibility-blocked"].includes(bootMode) ? bootMode : "other",
        expectedPayload: probe?.payloadBuildId === normalBuildId,
        expectedActiveGeneration: nativeEvidence?.activeBuildId === normalBuildId,
      };
    }
  } catch {
    lastProbe = "unreadable";
  }
  const output = readFileSync(appLogPath, "utf8");
  const graphicsErrors = {
    webkitProcess: /WebKit(?:Web|Network)Process/i,
    gtkCritical: /(?:Gtk|GLib|Gdk)-(?:ERROR|CRITICAL)/i,
    graphicsDevice: /(?:failed to create GBM|failed to create EGL|DRI[23]|libEGL warning)/i,
    sandbox: /(?:bubblewrap|bwrap:|failed to create sandbox)/i,
    dbus: /(?:D-Bus|dbus)[^\n]*(?:error|fail|timeout)/i,
  };
  const stderrCategories = Object.entries(graphicsErrors)
    .filter(([, pattern]) => pattern.test(output)).map(([category]) => category);
  const gtkEvents = output.split("\n").filter(line =>
    /^FS_GTK role=(?:candidate|recovery) (?:attached incognito=(?:true|false) ephemeral=(?:true|false) loading=(?:true|false)|(?:load|load_failed|terminated)=[a-zA-Z0-9_(): -]+)$/.test(line)
  ).slice(-30);
  return { lastProbe, observedStages: Object.fromEntries(observedStages), stderrCategories, gtkEvents };
}

let server = null;
let app = null;
try {
  if (!existsSync(appBinary)) throw new Error(`Native binary is missing: ${appBinary}`);
  if (linuxPackageRoot && realpathSync(appBinary) !== appBinary) throw new Error("The test package binary must not be a symlink.");
  if (linux && !readFileSync(appBinary).includes("FS_GTK role=")) {
    throw new Error("The Linux test executable does not contain the GTK trace point.");
  }
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

  if (linux) {
    await stop(app);
    removeProbe();
    app = startApp("repeat-update-profile");
    validate(await waitForProbe((value) => expectedBoot(value, "online"), app), "online");
    removeProbe();
    await stop(server);
    await waitForPort(false);
    server = startServer("rollback");
    await waitForPort(true);
    const rollbackBuildId = publicEnvironment.releases.rollback.buildId;
    validate(await waitForProbe((value) => expectedBoot(value, "online", rollbackBuildId), app), "online", rollbackBuildId);
    pass("repeated signed candidate activation in one Linux process");

    await stop(app);
    await stop(server);
    server = null;
    await waitForPort(false);
    const recoveryStage = "command desktop_recovery_status";
    const previous = readFailureDiagnostics().observedStages[recoveryStage] || 0;
    app = startApp("recovery-profile");
    await waitForProbe(
      (value) => (value.observedStages[recoveryStage] || 0) > previous,
      app,
      45_000,
      readFailureDiagnostics,
    );
    pass("fresh Linux profile exposes read-only recovery without the release source");
  }
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = String(error?.stack || error).slice(0, 2_000);
  console.error(evidence.failure);
  evidence.diagnostics = readFailureDiagnostics();
  console.error("Synthetic native startup diagnostics", JSON.stringify(evidence.diagnostics));
  process.exitCode = 1;
} finally {
  await stop(app);
  await stop(server);
  evidence.completedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  rmSync(probeRoot, { recursive: true, force: true });
}
