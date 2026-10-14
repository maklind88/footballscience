import { expect } from "@playwright/test";
import { createRequire } from "node:module";
const { decodeSessionStateValue } = createRequire(import.meta.url)("../../api/_lib/session-state-transport.js");
import { installSetPiecesCentralFixture } from "./set-pieces-central-fixture.mjs";
import { applySessionDateChange, sessionDateValue } from "../../src/modules/session-planner/session-save-protocol.mjs";

export const key = "football-session-planner-v3", day = "2026-10-14";
export async function installSessionStorageFixture(page) {
  // Reuse the established synthetic auth/HTTP fixture. No live account or data.
  await installSetPiecesCentralFixture(page);
  await page.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
  const server = { revision: 10, reject: true, writes: [], effects: 0,
    value: { selectedDate: day, sessions: { [day]: { date: day, title: "Training", selectedBlockId: "a",
      blocks: [{ id: "a", title: "Press", objective: "Central baseline", minutes: 20 }] } } } };
  await page.addInitScript(key => {
    window.__storageFault = { journal: false, cacheFailures: 0, journalFailures: 0 };
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, put = IDBObjectStore.prototype.put;
    window.__nativeStorageRead = name => get.call(localStorage, name);
    Storage.prototype.setItem = function(name, value) {
      if (name === key) { window.__storageFault.cacheFailures++; throw new DOMException("Synthetic full cache", "QuotaExceededError"); }
      return set.call(this, name, value);
    };
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (window.__storageFault.journal && this.transaction.db.name === "football-science-data-safety-v1") {
        window.__storageFault.journalFailures++;
        throw new DOMException("Synthetic full journal", "QuotaExceededError");
      }
      return put.call(this, value, ...args);
    };
  }, key);
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") {
      const entries = { [key]: JSON.stringify(server.value), "football-schedule-v1": JSON.stringify({ selectedDate: day,
        events: [{ id: "training", date: day, type: "training", title: "Training" }] }) };
      const keys = new URL(route.request().url()).searchParams.get("keys")?.split(",") || Object.keys(entries);
      return route.fulfill({ json: { ok: true, entries: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, entries[k]])),
        metadata: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, { revision: server.revision, organizationId: "set-pieces-org" }])),
        absentKeys: keys.filter(k => !(k in entries)) } });
    }
    const body = route.request().postDataJSON();
    if (body.key !== key) return route.fulfill({ status: 503, json: { ok: false } });
    server.writes.push(body);
    if (server.reject) return route.fulfill({ status: 503, json: { ok: false, reason: "Synthetic unavailable central saving" } });
    if (body.sessionChange) body.sessionChange = JSON.parse(await decodeSessionStateValue(key, body.sessionChange));
    if (!body.sessionChange) return route.fulfill({ status: 400, json: { ok: false } });
    if (Number(body.metadata?.baseRevision ?? body.baseRevision) !== server.revision)
      return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision } });
    const result = applySessionDateChange(server.value, body.sessionChange);
    if (!result.ok) return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision, conflicts: result.conflicts } });
    server.value = result.state; server.revision++; server.effects++;
    return route.fulfill({ json: { ok: true, metadata: { revision: server.revision, organizationId: "set-pieces-org" },
      sessionChange: JSON.stringify({ id: body.sessionChange.id, date: day, value: sessionDateValue(server.value, day) }) } });
  });
  return server;
}
export async function ready(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector("#loginScreen")?.hidden);
  await page.evaluate(() => document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click());
  await page.locator('[data-open-workspace="session-planner"]').first().click();
  await page.locator(`[data-session-date="${day}"]`).click();
  await expect(page.locator('[data-session-field="objective"]').first()).toBeVisible();
}
export async function edit(page, value) {
  const field = page.locator('[data-session-field="objective"]').first();
  await field.fill(value); await field.dispatchEvent("change");
}
export const readJournal = page => page.evaluate(async () => {
  const request = indexedDB.open("football-science-data-safety-v1");
  const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("latest"), read = tx.objectStore("latest").getAll();
      tx.oncomplete = () => resolve(read.result.filter(row => row.id?.startsWith("session-save:")));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
});
export const refresh = page => page.evaluate(async () => {
  await window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true });
  (await import("/src/core/platform-runtime-accessors.mjs")).reloadCentralizedAppStateFromStorage();
});
