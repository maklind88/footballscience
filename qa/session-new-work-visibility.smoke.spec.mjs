import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";
import { readJournal } from "./helpers/session-full-app-storage-fixture.mjs";
import transport from "../api/_lib/session-state-transport.js";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";

const key = "football-session-planner-v3", day = "2026-10-24";
const field = (page, name) => page.locator(`[data-session-field="${name}"]`).first();
const saved = page => page.locator("[data-platform-autosave-status]");
async function edit(page, name, value) {
  await field(page, name).fill(value);
  await field(page, name).dispatchEvent("change");
  await field(page, name).blur();
}
async function ready(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  await page.evaluate(() => document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click());
  await page.locator(`[data-session-date="${day}"]`).click();
}

for (const fullCache of [false, true]) {
  test(`new work is visible to peers after offline edit, reload and lost receipt (full cache: ${fullCache})`, async ({ browser }) => {
    test.setTimeout(90000);
    const contexts = [], receipts = new Map();
    const server = { value: { sessions: {} }, revision: 0, effects: 0, denyA: false, loseA: false, duplicateReceipts: 0 };
    async function open(actor) {
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      const transportState = { offline: false };
      const fixture = await installSetPiecesCentralFixture(page); fixture.actor.id = actor;
      await page.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
      if (fullCache) await page.addInitScript(key => {
        const set = Storage.prototype.setItem;
        window.__qaCacheFailures = 0;
        Storage.prototype.setItem = function(name, value) {
          if (name === key) { window.__qaCacheFailures++; throw new DOMException("Synthetic full cache", "QuotaExceededError"); }
          return set.call(this, name, value);
        };
      }, key);
      await page.route("**/api/app-state**", async route => {
        // Route callbacks can overlap reload; do not evaluate a disappearing page.
        if (transportState.offline) return route.abort("internetdisconnected");
        if (route.request().method() === "GET") {
          const entries = { "football-schedule-v1": JSON.stringify({ selectedDate: day,
            events: [{ id: "qa-training", date: day, type: "training", title: "Synthetic training" }] }) };
          if (server.revision) entries[key] = JSON.stringify(server.value);
          const keys = new URL(route.request().url()).searchParams.get("keys")?.split(",") || Object.keys(entries);
          return route.fulfill({ json: { ok: true, entries: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, entries[k]])),
            metadata: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, { revision: server.revision, organizationId: "set-pieces-org" }])),
            absentKeys: keys.filter(k => !(k in entries)) } });
        }
        const body = route.request().postDataJSON();
        if (body.key !== key) return route.fulfill({ json: { ok: true } });
        if (actor === "author-a" && server.denyA) return route.abort("internetdisconnected");
        if (!body.sessionChange) return route.fulfill({ status: 400, json: { ok: false } });
        const change = JSON.parse(await transport.decodeSessionStateValue(key, body.sessionChange));
        const receiptKey = `${actor}:${change.id}`, previous = receipts.get(receiptKey);
        if (previous) {
          expect(JSON.stringify(change)).toBe(previous);
          server.duplicateReceipts++;
        } else {
          if (Number(body.baseRevision) !== server.revision)
            return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision } });
          const result = applySessionDateChange(server.value, change);
          if (!result.ok) return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision, conflicts: result.conflicts } });
          server.value = result.state; server.revision++; server.effects++;
          receipts.set(receiptKey, JSON.stringify(change));
          if (actor === "author-a" && server.loseA) {
            server.loseA = false; server.denyA = true;
            return route.abort("failed");
          }
        }
        return route.fulfill({ json: { ok: true, metadata: { revision: server.revision, organizationId: "set-pieces-org" },
          sessionChange: JSON.stringify({ id: change.id, date: change.date, value: sessionDateValue(server.value, change.date) }) } });
      });
      await page.goto("/?workspace=session-planner"); await ready(page);
      return { context, page, async setOffline(value) {
        transportState.offline = value;
        await context.setOffline(value);
        expect(await page.evaluate(() => navigator.onLine)).toBe(!value);
      } };
    }
    try {
      const a = await open("author-a");
      expect(server.revision).toBe(0); // Opening an absent session is not creation.
      await a.page.getByRole("button", { name: "Add exercise", exact: true }).click();
      await a.page.locator("[data-session-add-new]").click();
      await expect.poll(() => server.value.sessions[day]?.blocks?.length).toBe(1);
      await edit(a.page, "title", "New shared exercise");
      await expect.poll(() => server.value.sessions[day]?.blocks?.[0]?.title).toBe("New shared exercise");
      await expect.poll(() => readJournal(a.page)).toEqual([]);
      const b = await open("author-b");
      await expect(field(b.page, "title")).toHaveValue("New shared exercise");

      await a.setOffline(true);
      await edit(a.page, "objective", "Offline new work");
      await expect.poll(() => readJournal(a.page)).toHaveLength(1);
      const pending = await readJournal(a.page);
      await expect(saved(a.page)).not.toHaveClass(/is-saved/);
      await edit(b.page, "title", "Colleague title");
      await expect.poll(() => server.value.sessions[day].blocks[0].title).toBe("Colleague title");

      // Reload while central writes remain unavailable. Static assets and reads
      // are reachable again; this is not a claim of full offline app-shell boot.
      server.denyA = true;
      await a.setOffline(false);
      await a.page.reload(); await ready(a.page);
      expect(await readJournal(a.page)).toEqual(pending);
      await expect(field(a.page, "objective")).toHaveValue("Offline new work");
      await expect(saved(a.page)).not.toHaveClass(/is-saved/);
      const before = server.effects;
      server.denyA = false; server.loseA = true;
      await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => server.effects).toBe(before + 1);
      await expect.poll(() => readJournal(a.page)).toHaveLength(1);
      await expect(saved(a.page)).not.toHaveClass(/is-saved/);
      server.denyA = false;
      await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => readJournal(a.page)).toEqual([]);
      await expect(saved(a.page)).toHaveClass(/is-saved/);
      expect(server.effects).toBe(before + 1);
      expect(server.duplicateReceipts).toBeGreaterThan(0);

      const reader = await open("reader-c");
      for (const client of [a, b, reader]) {
        await client.page.reload(); await ready(client.page);
        await expect(field(client.page, "title")).toHaveValue("Colleague title");
        await expect(field(client.page, "objective")).toHaveValue("Offline new work");
        expect(await readJournal(client.page)).toEqual([]);
        if (fullCache) expect(await client.page.evaluate(() => window.__qaCacheFailures)).toBeGreaterThan(0);
      }
      expect(server.effects).toBe(before + 1);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}
