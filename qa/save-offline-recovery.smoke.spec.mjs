import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const date = "2026-09-23";
const scope = "coach-a:org-a:team-a";
const initial = () => ({ sessions: { [date]: { date, title: "Training", blocks: [
  { id: "block-a", title: "Press", objective: "Close space", minutes: 15 },
] } } });

// Real HTTP/offline transport; synthetic revision-CAS server using the production merge protocol.
async function saveServer(baseURL) {
  const state = { value: initial(), revision: 10, requests: [], accepted: [], receipts: new Map() };
  const server = createServer(async (request, response) => {
    if (request.method === "GET") {
      if (request.url.startsWith("/src/")) {
        const asset = await fetch(new URL(request.url, baseURL));
        response.writeHead(asset.status, { "Content-Type": "text/javascript" }).end(await asset.text());
      } else response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Isolated save verification</title>");
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { change, baseRevision, principal } = JSON.parse(Buffer.concat(chunks).toString());
    const send = (status, payload) => response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
    state.requests.push({ id: change.id, baseRevision, principal });
    if (state.receipts.has(change.id)) { send(200, state.receipts.get(change.id)); return; }
    if (baseRevision !== state.revision) { send(409, { currentRevision: state.revision }); return; }
    const result = applySessionDateChange(state.value, change);
    if (!result.ok) { send(409, { currentRevision: state.revision, conflicts: result.conflicts }); return; }
    state.value = result.state;
    state.revision++;
    const payload = { sessionChange: { id: change.id, date: change.date, value: sessionDateValue(state.value, change.date) }, metadata: { revision: state.revision } };
    state.accepted.push({ id: change.id, baseRevision });
    state.receipts.set(change.id, payload);
    send(200, payload);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { state, url: `http://127.0.0.1:${server.address().port}/save`, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}

async function boot(page, server, principal = scope) {
  await page.goto(new URL("/harness", server.url).href);
  await page.evaluate(async ({ url, value, revision, principal }) => {
    const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    window.saveScope = principal;
    window.saveStore = createSessionSaveStore();
    window.saveClient = createSessionSaveClient({
      getScope: () => window.saveScope,
      store: window.saveStore,
      send: async (change, baseRevision, expected) => {
        try {
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ change, baseRevision, principal: expected }) });
          return { ok: response.ok, status: response.status, payload: await response.json() };
        } catch { return { ok: false, status: 0 }; }
      },
    });
    window.saveClient.observe(JSON.stringify(value), { revision });
  }, { url: server.url, value: server.state.value, revision: server.state.revision, principal });
}

test("Sessions offline commit survives a fully closed browser profile and replays once after reconnect", async ({ playwright, baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), "fs-save-restart-"));
  const server = await saveServer(baseURL);
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, { headless: true });
    let page = await context.newPage();
    await boot(page, server);
    await context.setOffline(true);
    const desired = initial(); desired.sessions[date].blocks[0].objective = "Offline objective";
    expect(await page.evaluate((value) => window.saveClient.save(JSON.stringify(value)), desired)).toMatchObject({ ok: false, durablePending: true });
    expect(await page.evaluate((scope) => window.saveStore.list(scope), scope)).toHaveLength(1);
    expect(server.state.requests).toHaveLength(0);
    // Upgrade the shared database while a committed Sessions edit is still offline.
    await context.setOffline(false);
    await page.evaluate(async (scope) => {
      const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
      const journal = createOfflineOperationJournal();
      await journal.put({ id: "other-module", scope, moduleId: "periodization", key: "football-periodization-v2",
        type: "day.patch", payload: { title: "Pending after restart" }, baseRevision: 7 });
      await journal.close();
    }, scope);
    expect(server.state.requests).toHaveLength(0);
    await context.close(); context = null;

    context = await playwright.chromium.launchPersistentContext(profile, { headless: true });
    page = await context.newPage();
    await boot(page, server, "coach-b:org-b:team-b");
    expect(await page.evaluate(() => window.saveClient.pendingState())).toBeNull();
    expect((await page.evaluate(() => window.saveClient.replay())).ok).toBe(true);
    expect(server.state.requests).toHaveLength(0);
    await boot(page, server);
    expect(await page.evaluate((scope) => window.saveStore.list(scope), scope)).toHaveLength(1);
    expect((await page.evaluate(() => window.saveClient.replay())).ok).toBe(true);
    expect((await page.evaluate(() => window.saveClient.replay())).ok).toBe(true);
    expect(server.state.accepted).toHaveLength(1);
    expect(server.state.requests).toHaveLength(1);
    expect(server.state.value.sessions[date].blocks[0].objective).toBe("Offline objective");
    expect(await page.evaluate((scope) => window.saveStore.list(scope), scope)).toEqual([]);
    expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(true);
    expect(await page.evaluate(async (scope) => {
      const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
      const journal = createOfflineOperationJournal();
      const rows = await journal.list(scope); await journal.close(); return rows;
    }, scope)).toMatchObject([{ id: "other-module", status: "pending", payload: { title: "Pending after restart" } }]);
  } finally {
    await context?.close(); await server.close(); await rm(profile, { recursive: true, force: true });
  }
});

for (const sameField of [false, true]) {
  test(`two independent Sessions users ${sameField ? "retain a same-field conflict for review" : "merge independent fields through revision CAS"}`, async ({ browser, baseURL }) => {
    const server = await saveServer(baseURL);
    const first = await browser.newContext(), second = await browser.newContext();
    try {
      const a = await first.newPage(), b = await second.newPage();
      await boot(a, server);
      await boot(b, server, "coach-b:org-a:team-a");
      const valueA = initial(), valueB = initial();
      valueA.sessions[date].blocks[0].objective = "Coach A";
      if (sameField) valueB.sessions[date].blocks[0].objective = "Coach B";
      else valueB.sessions[date].blocks[0].minutes = 25;
      expect((await a.evaluate((value) => window.saveClient.stage(JSON.stringify(value)), valueA)).ok).toBe(true);
      expect((await b.evaluate((value) => window.saveClient.stage(JSON.stringify(value)), valueB)).ok).toBe(true);
      // Both clients observed revision 10; B must handle an actual HTTP 409 after A commits.
      expect((await a.evaluate(() => window.saveClient.replay())).ok).toBe(true);
      const result = await b.evaluate(() => window.saveClient.replay());
      expect(server.state.requests.map((request) => request.baseRevision)).toEqual([10, 10, 11]);
      expect(server.state.value.sessions[date].blocks[0].objective).toBe("Coach A");
      if (sameField) {
        expect(result).toMatchObject({ ok: false, reviewRequired: true });
        expect(server.state.accepted).toHaveLength(1);
        const rows = await b.evaluate(() => window.saveStore.list(window.saveScope));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: "review", change: { after: { session: { blocks: [{ objective: "Coach B" }] } } } });
        await boot(b, server, "coach-b:org-a:team-a");
        expect(await b.evaluate(() => window.saveClient.reviews())).toHaveLength(1);
      } else {
        expect(result.ok).toBe(true);
        expect(server.state.revision).toBe(12);
        expect(server.state.value.sessions[date].blocks[0].minutes).toBe(25);
        expect(await b.evaluate(() => window.saveStore.list(window.saveScope))).toEqual([]);
      }
    } finally { await first.close(); await second.close(); await server.close(); }
  });
}

test("shared offline journal schema remains compatible with Sessions durable storage", async ({ page, baseURL }) => {
  await page.route("**/qa/offline-schema-harness", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated schema verification</title>" }));
  await page.goto(`${baseURL}/qa/offline-schema-harness`);
  const result = await page.evaluate(async () => {
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const journal = createOfflineOperationJournal();
    await journal.put({ id: "pending", scope: "coach:org:team", moduleId: "periodization", key: "football-periodization-v2", type: "day.patch", payload: { title: "Retain" }, baseRevision: 1 });
    await journal.close();
    try { return { ok: true, rows: await createSessionSaveStore().list("coach:org:team") }; }
    catch (error) { return { ok: false, error: error.name }; }
  });
  expect(result).toEqual({ ok: true, rows: [] });
});
