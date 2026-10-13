import { chromium, webkit } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySessionDateChange, sessionDateValue } from "../../src/modules/session-planner/session-save-protocol.mjs";

export const day = "2026-10-12", owner = "coach:org:team";
export const initial = () => ({ sessions: { [day]: { date: day, title: "Training", blocks: [
  { id: "block", title: "Press", objective: "Baseline", minutes: 20 },
] } } });

// Real disk-backed browser profile, IDB store and save client; synthetic transport.
// Closing a persistent context terminates its browser. No storageState export or
// journal reinjection is used. close() is graceful; crash() terminates Chromium
// through its browser-level crash command. Neither proves OS power-loss safety.
export async function createRestartHarness(baseURL, browserName) {
  const profile = await mkdtemp(join(tmpdir(), "fs-session-restart-"));
  const state = { value: initial(), revision: 10, calls: [], effects: 0, mode: "offline", receipts: new Map() };
  let context;
  let loadedSources = new Set();
  async function open(scope = owner, sourceFiles = new Map()) {
    if (context) throw new Error("Close the previous browser before reopening its profile");
    context = await ({ chromium, webkit }[browserName]).launchPersistentContext(profile, { headless: true, baseURL, serviceWorkers: "block" });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL).origin) return route.abort("blockedbyclient");
      if (url.pathname === "/qa/session-restart-harness") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic restart acceptance</title>" });
      if (url.pathname !== "/qa/session-restart-api") return route.continue();
      if (route.request().method() === "GET") return route.fulfill({ json: { value: JSON.stringify(state.value), metadata: { revision: state.revision } } });
      const request = route.request().postDataJSON();
      state.calls.push(request);
      if (state.mode === "offline") return route.abort("internetdisconnected");
      const { change, baseRevision, scope: submittedScope } = request;
      if (submittedScope !== owner) return route.fulfill({ status: 403, json: {} });
      // A synthetic exact-operation receipt models the server contract. This
      // proves immutable client retry, not real DB/audit exactly-once delivery.
      const previous = state.receipts.get(change.id);
      if (previous) {
        if (JSON.stringify(previous.change) !== JSON.stringify(change)) return route.fulfill({ status: 409, json: { conflicts: ["Changed operation"] } });
        return route.fulfill({ json: { metadata: { revision: state.revision }, sessionChange: { id: change.id, date: day, value: sessionDateValue(state.value, day) } } });
      }
      if (baseRevision !== state.revision) return route.fulfill({ status: 409, json: { currentRevision: state.revision } });
      const merged = applySessionDateChange(state.value, change);
      if (!merged.ok) return route.fulfill({ status: 409, json: { currentRevision: state.revision, conflicts: merged.conflicts } });
      state.value = merged.state; state.revision++; state.effects++;
      state.receipts.set(change.id, { change });
      if (state.mode === "lost-reply") return route.abort("connectionreset");
      return route.fulfill({ json: { metadata: { revision: state.revision }, sessionChange: { id: change.id, date: day, value: sessionDateValue(state.value, day) } } });
    });
    return boot(context.pages()[0], scope, sourceFiles);
  }
  async function boot(page, scope, sourceFiles) {
    loadedSources = new Set();
    if (sourceFiles.size) await page.route("**/*", route => {
      const path = new URL(route.request().url()).pathname;
      if (!sourceFiles.has(path)) return route.fallback();
      loadedSources.add(path);
      return route.fulfill({ contentType: "text/javascript", body: sourceFiles.get(path) });
    });
    await page.goto("/qa/session-restart-harness");
    await page.evaluate(async ({ scope, value, revision }) => {
      const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
      const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
      window.saveStore = createSessionSaveStore();
      window.saveClient = createSessionSaveClient({ getScope: () => scope, store: window.saveStore,
        getLatest: async () => (await fetch("/qa/session-restart-api")).json(),
        send: async (change, baseRevision, scope) => {
          try {
            const response = await fetch("/qa/session-restart-api", { method: "POST", body: JSON.stringify({ change, baseRevision, scope }) });
            return { ok: response.ok, status: response.status, payload: await response.json() };
          } catch { return { ok: false, status: 0 }; }
        },
      });
      window.saveClient.observe(JSON.stringify(value), { revision });
    }, { scope, value: state.value, revision: state.revision });
    return page;
  }
  async function close() { if (context) { await context.close(); context = null; } }
  async function crash() {
    if (browserName !== "chromium" || !context) throw new Error("Crash requires an open, isolated Chromium profile");
    const current = context, browser = current.browser();
    const cdp = await browser.newBrowserCDPSession();
    const disconnected = new Promise(resolve => browser.once("disconnected", resolve));
    const closed = new Promise(resolve => current.once("close", resolve));
    // Only this harness-owned browser is targeted. Do not gracefully close it
    // before the crash: doing so would flush the very writes under test.
    await cdp.send("Browser.crash").catch(error => {
      if (!/Target page, context or browser has been closed/.test(error.message)) throw error;
    });
    await Promise.all([disconnected, closed]);
    context = null;
    if (browser.isConnected()) throw new Error("Browser did not disconnect after crash");
    return { disconnected: true };
  }
  return { state, open, close, crash, peer: async (scope = owner, sources = new Map()) => {
    if (!context) throw new Error("Open the primary browser first");
    return boot(await context.newPage(), scope, sources);
  }, loadedSources: () => [...loadedSources].sort(), async dispose() { try { await close(); } finally { await rm(profile, { recursive: true, force: true }); } } };
}
export const rows = page => page.evaluate(scope => window.saveStore.list(scope), owner);
export const stage = (page, value, previousValue) => page.evaluate(({ value, previousValue }) =>
  window.saveClient.stage(JSON.stringify(value), { previousValue: JSON.stringify(previousValue) }), { value, previousValue });
export const replay = page => page.evaluate(() => window.saveClient.replay());
export const view = page => page.evaluate(async () => { const result = await window.saveClient.project(); return { ...result, value: JSON.parse(result.value) }; });
