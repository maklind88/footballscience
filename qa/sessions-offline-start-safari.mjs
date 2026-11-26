import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { startSessionsOfflineStartFixture, qaLoginKey } from "./helpers/sessions-offline-start-server.mjs";
import { key } from "./helpers/session-full-app-storage-fixture.mjs";

const route = "/?workspace=session-planner";
const accepted = "Synthetic native Safari accepted A";
const pending = "Synthetic native Safari unsynced B";
const baseCandidate = "8abf1158fd0bbe3107a3e257fb1deb1b61eb5757";
const worker = await readFile(new URL("../src/core/sessions-offline-code-worker.js", import.meta.url));
const output = process.argv[2];
const diagnoseOfflineWorker = process.argv.includes("--diagnose-worker");
if (!output) throw new Error("Pass a local evidence file path.");
const evidence = {
  baseCandidate, workerSha256: createHash("sha256").update(worker).digest("hex"), syntheticDataOnly: true, nativeSafari: false, physicalMobile: false,
  diagnoseOfflineWorker, browserProcessRestart: false, discardedPreparedDocument: false, checks: [],
};
let driver, fixture, root, sessionId;

function mark(check) {
  evidence.checks.push(check);
  console.log("PASS " + check);
}

async function reserveDriverPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function request(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(root + path, {
    method, signal: AbortSignal.timeout(35000),
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  });
  const { value } = await response.json();
  if (!response.ok || value?.error) throw new Error(value?.message || value?.error || "SafariDriver request failed.");
  return value;
}
const command = (path, body, method) => request("/session/" + sessionId + path, body, method);
const js = (script, args = []) => command("/execute/sync", { script, args });
async function asyncJs(fn, args = []) {
  const result = await command("/execute/async", { script: [
    "const done = arguments[arguments.length - 1];",
    "(" + fn.toString() + ")(...Array.from(arguments).slice(0, -1))",
    ".then(value => done({value}), error => done({error: String(error.message)}));",
  ].join("\n"), args });
  if (result?.error) throw new Error(result.error);
  return result?.value;
}

async function wait(check, read, predicate = Boolean, timeout = 18000) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(150);
  } while (Date.now() < end);
  throw new Error(check + " timed out.");
}

async function click(selector) {
  const element = await command("/element", { using: "css selector", value: selector });
  await command("/element/" + element["element-6066-11e4-a52e-4f735466cecf"] + "/click", {});
}

async function startSession() {
  const created = await request("/session", {
    capabilities: { alwaysMatch: { browserName: "safari", platformName: "mac" } },
  });
  sessionId = created.sessionId;
  await command("/timeouts", { script: 20000, pageLoad: 25000, implicit: 0 });
  assert.equal(created.capabilities.browserName.toLowerCase(), "safari");
  return created.capabilities;
}

async function snapshot() {
  return asyncJs(async sessionKey => {
    const request = indexedDB.open("football-science-data-safety-v1");
    request.onupgradeneeded = () => request.transaction.abort();
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let records;
    try {
      records = await new Promise((resolve, reject) => {
        const tx = db.transaction(["latest", "snapshots"], "readonly");
        const latest = tx.objectStore("latest").getAll();
        const historical = tx.objectStore("snapshots").getAll();
        tx.oncomplete = () => resolve({
          latest: latest.result.filter(row => row.id?.startsWith("session-save:") ||
            row.id?.startsWith("session-accepted-date:") || Object.hasOwn(row.storage ?? {}, sessionKey)),
          historical: historical.result,
        });
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    const read = window.__proofNativeLocalStorageRead || (name => localStorage.getItem(name));
    const meta = JSON.parse(read("football-data-safety-v1") || "{}");
    const digest = async value => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
    };
    const current = { latest: records.latest, storage: read(sessionKey), meta: meta.entries?.[sessionKey] ?? null };
    return {
      digest: await digest({ ...current, historical: records.historical }),
      nonHistoryDigest: await digest({ ...current, latest: current.latest.filter(row => row.id !== "latest") }),
      latestSourceSnapshotId: current.latest.find(row => row.id === "latest")?.sourceSnapshotId ?? null,
      historyIds: records.historical.map(row => row.id),
      historyHashes: await Promise.all(records.historical.map(digest)),
      checkpoints: records.latest.filter(row => row.id.startsWith("session-accepted-date:")).length,
      pending: records.latest.filter(row => row.status === "pending").length,
      history: records.historical.length,
    };
  }, [key]);
}

async function seedSyntheticHistory(date) {
  return asyncJs(async (sessionKey, sessionDate) => {
    const request = indexedDB.open("football-science-data-safety-v1");
    request.onupgradeneeded = () => request.transaction.abort();
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put({
          id: "qa-native-safari-sessions-history", reason: "session-planner-recovery-review",
          createdAt: new Date().toISOString(),
          storage: { [sessionKey]: JSON.stringify({ sessions: { [sessionDate]: { date: sessionDate, title: "Synthetic Safari history" } } }) },
        });
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    return true;
  }, [key, date]);
}

async function editObjective(value) {
  const selector = '#sessionPlannerWorkspace [data-session-field="objective"]';
  await wait("editable objective", () => js("return Boolean(document.querySelector(arguments[0]))", [selector]));
  await js("const field = document.querySelector(arguments[0]); field.value = arguments[1]; field.dispatchEvent(new Event('change', {bubbles:true}));", [selector, value]);
}

async function closeOwnedSession() {
  if (!sessionId) return;
  const id = sessionId;
  sessionId = undefined;
  await request("/session/" + id, undefined, "DELETE");
}

try {
  const port = await reserveDriverPort();
  root = "http://127.0.0.1:" + port;
  driver = spawn("/usr/bin/safaridriver", ["-p", String(port)], { stdio: ["ignore", "ignore", "inherit"] });
  let driverError;
  driver.on("error", error => { driverError = error; });
  await wait("SafariDriver ready", async () => {
    if (driverError || driver.exitCode !== null) throw new Error("SafariDriver could not start.");
    return request("/status").then(status => status?.ready, () => false);
  }, Boolean, 10000);

  const caps = await startSession();
  evidence.nativeSafari = true;
  evidence.safariVersion = caps.browserVersion;
  evidence.platform = caps.platformName;
  const date = await js("const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');");
  fixture = await startSessionsOfflineStartFixture({ useLoopbackBrowserAuth: true, diagnoseOfflineWorker });
  await fixture.stop();
  const backend = await fixture.resume({ writes: [] }, { sessionDay: date });
  await command("/url", { url: fixture.origin + route });
  await wait("ordinary app ready", () => js("return Boolean(window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden)"));
  await js("document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click(); document.querySelector('[data-open-workspace=\"session-planner\"]')?.click();");
  await click('[data-session-date="' + date + '"]');
  await editObjective(accepted);
  await wait("synthetic server accepted edit", () => backend.effects, count => count === 1);
  await wait("durable accepted copy", snapshot, data => data.checkpoints === 1 && data.pending === 0);
  backend.reject = true;
  await editObjective(pending);
  await wait("unsynced edit stored", snapshot, data => data.pending === 1);
  await seedSyntheticHistory(date);
  console.log("Native Safari prepared editor inputs and durable synthetic work. Starting code preparation.");
  // Use one DOM operation for the isolated control. The ordinary editor can
  // repaint between a WebDriver element lookup and the pointer dispatch.
  const started = await js(`
    const button = document.querySelector("[data-session-prepare-offline]");
    if (!button || button.disabled) return false;
    button.click();
    return document.querySelector("[data-session-offline-status]")?.dataset.sessionOfflineStatus === "working";
  `);
  assert.equal(started, true, "Safari did not start the ordinary preparation action");
  const preparation = await wait("Safari prepared Sessions", () => js(
    "return document.querySelector('[data-session-offline-status]')?.dataset.sessionOfflineStatus"
  ), value => value === "ready" || value === "unavailable", 105000);
  if (preparation !== "ready") {
    throw new Error(await js("return document.querySelector('[data-session-offline-status]')?.textContent"));
  }
  assert.equal(fixture.state.grantAccepted, 1);
  mark("Ordinary Sessions editor saved a receipt and durable pending edit, and Safari prepared the date");
  const online = await snapshot();
  assert.equal(online.checkpoints, 1);
  assert.equal(online.pending, 1);
  assert.ok(online.history >= 1);

  const preparedDocument = await command("/window");
  const witness = await command("/window/new", { type: "tab" });
  await command("/window", { handle: witness.handle });
  await command("/url", { url: fixture.origin + "/qa-sessions-offline-probe" });
  await command("/window", { handle: preparedDocument });
  await command("/window", undefined, "DELETE");
  assert.deepEqual(await command("/window/handles"), [witness.handle]);
  await command("/window", { handle: witness.handle });
  // Allow the online editor's own page-close snapshot to settle. The
  // witness has no app runtime or write controllers of its own.
  let before = await snapshot();
  before = await wait("stable protected bytes after closing the editor", async () => {
    await delay(300);
    const next = await snapshot();
    const stable = next.digest === before.digest;
    before = next;
    return stable ? next : null;
  });
  assert.equal(before.nonHistoryDigest, online.nonHistoryDigest);
  assert.ok(online.historyHashes.every(hash => before.historyHashes.includes(hash)));
  if (online.latestSourceSnapshotId && before.latestSourceSnapshotId !== online.latestSourceSnapshotId) {
    assert.ok(before.historyIds.includes(online.latestSourceSnapshotId), "Old latest source snapshot was lost");
  }
  evidence.onlineCloseHistoryAdditions = before.history - online.history;

  const fresh = await command("/window/new", { type: "tab" });
  await command("/window", { handle: witness.handle });
  await command("/window", undefined, "DELETE");
  assert.deepEqual(await command("/window/handles"), [fresh.handle]);
  await command("/window", { handle: fresh.handle });
  evidence.discardedPreparedDocument = true;
  await fixture.stop();
  await assert.rejects(fetch(fixture.origin + "/qa-sessions-offline-probe", { signal: AbortSignal.timeout(3000) }));
  evidence.originUnavailable = true;
  const requests = fixture.state.privateRequests;
  await command("/url", { url: fixture.origin + route });
  const view = await wait("prepared read-only view in fresh Safari tab", () => js(
    "const root = document.querySelector('[data-session-offline-readonly]'); return root && root.getAttribute('aria-busy')==='false' ? {" +
    "date: root.querySelector('[data-session-offline-date]')?.dateTime, " +
    "accepted: root.querySelector('[data-session-offline-version=\"accepted\"]')?.textContent, " +
    "pending: root.querySelector('[data-session-offline-version=\"pending\"]')?.textContent, " +
    "writeControls: root.querySelectorAll('input,textarea,[contenteditable=true]').length, " +
    "injected: Boolean(window.__footballScienceQaForceCentralState), build: document.querySelector('meta[name=\"sessions-offline-code-package\"]')?.content } : null;"
  ), value => Boolean(value?.date));
  assert.equal(await command("/url"), fixture.origin + route);
  assert.equal(view.date, date);
  assert.equal(view.build, fixture.packageId());
  assert.equal(view.writeControls, 0);
  assert.equal(view.injected, false);
  assert.ok(view.accepted.includes(accepted) && !view.accepted.includes(pending));
  assert.ok(view.pending.includes(pending));
  const pendingVisible = await js(`
    const entry = document.querySelector('[data-session-offline-version="pending"]');
    entry?.querySelector("summary")?.click();
    return entry?.open && Array.from(entry.querySelectorAll("p")).some(p =>
      p.textContent === arguments[0] && p.getClientRects().length > 0);
  `, [pending]);
  assert.equal(pendingVisible, true);
  assert.deepEqual(await snapshot(), before, "Protected storage hash changed after fresh-tab offline read");
  assert.equal(fixture.state.privateRequests, requests);
  mark("Exact Sessions route opened in a fresh Safari tab against a stopped origin, with the correct read-only contents and unchanged work hashes");

  await command("/url", { url: fixture.origin + route + "&date=2000-01-01" });
  await wait("unprepared date locked", () => js(
    "return document.querySelector('[data-session-offline-readonly] [role=status]')?.textContent?.includes('Connect')"
  ));
  assert.equal(await js("return document.querySelectorAll('[data-session-offline-version]').length"), 0);
  assert.deepEqual(await snapshot(), before);
  mark("Unprepared date did not expose the prepared session");

  // A separate SAFARI automation session is intentionally clean. Verify the
  // test boundary at the same origin without providing synthetic auth again.
  await closeOwnedSession();
  await fixture.resume(backend, { sessionDay: date });
  await startSession();
  await command("/url", { url: fixture.origin + "/qa-sessions-offline-probe" });
  const isolated = await asyncJs(async authKey => ({
    savedLogin: localStorage.getItem(authKey) !== null,
    preparation: localStorage.getItem("football-science-sessions-offline-preparation-v1") !== null,
    priorWorker: Boolean(await navigator.serviceWorker.getRegistration("/")),
  }), [qaLoginKey]);
  assert.deepEqual(isolated, { savedLogin: false, preparation: false, priorWorker: false });
  evidence.newAutomationSessionStartedClean = true;
  mark("New SafariDriver session did not retain the preparation, login or worker");
  evidence.result = "fresh-document-offline-passed";
} catch (error) {
  evidence.result = "failed";
  evidence.error = error.message;
  if (sessionId) {
    try {
      evidence.browserStatus = await asyncJs(async () => {
        const status = document.querySelector("[data-session-offline-status]");
        const button = document.querySelector("[data-session-prepare-offline]");
        const registration = await navigator.serviceWorker?.getRegistration("/");
        return {
          preparation: status?.dataset.sessionOfflineStatus, text: status?.textContent,
          disabled: button?.disabled, activeWorker: registration?.active?.state,
          activatingWorker: registration?.installing?.state, controlled: !!navigator.serviceWorker?.controller,
          assetRequests: performance.getEntriesByType("resource").filter(entry =>
            entry.name.includes("sessions-offline")).length,
        };
      });
      console.log("Browser status:", JSON.stringify(evidence.browserStatus));
    } catch {}
  }
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await closeOwnedSession().catch(() => {});
  await fixture?.stop().catch(() => {});
  if (driver && driver.exitCode === null) driver.kill("SIGTERM");
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("Evidence: " + output);
}
