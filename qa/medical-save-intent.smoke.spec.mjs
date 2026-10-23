import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";

const key = "football-medical-team-v1";
const day = "2026-10-23";
const player = { id: "qa-intent-player", name: "Synthetic Intent Player", position: "Forward",
  rosterType: "squad", countsInSquad: true, status: "available" };

function createServer() {
  return {
    revision: 10, writes: [], reads: [],
    entries: {
      [key]: JSON.stringify({ rosterVersion: "qa-intent", players: [{ ...player, name: "Earlier Squad Name" }],
        records: [], injuryPlans: [] }),
      "football-player-profiles-v1": JSON.stringify({ rosterVersion: "qa-intent", players: [player], removedPlayerIds: [] }),
      "football-schedule-v1": JSON.stringify({ events: [{ id: "qa-training", date: day, type: "training", title: "Training" }] }),
    },
  };
}

async function install(page, server, { denied = false } = {}) {
  await page.clock.setFixedTime(new Date(`${day}T16:00:00Z`));
  await installSetPiecesCentralFixture(page);
  if (denied) await page.addInitScript(key => {
    const set = Storage.prototype.setItem, open = IDBFactory.prototype.open;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException("Synthetic cache denied", "QuotaExceededError");
      return set.call(this, name, value);
    };
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === "football-science-medical-drafts-v1") throw new DOMException("Synthetic recovery denied", "SecurityError");
      return open.call(this, name, ...args);
    };
  }, key);
  // The real Medical UI/runtime and sync client run against synthetic HTTP only.
  await page.route("**/api/medical**", route => route.fulfill({ json: { ok: true, enabled: false, localDev: true } }));
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") {
      const keys = new URL(route.request().url()).searchParams.get("keys")?.split(",") || Object.keys(server.entries);
      if (keys.includes(key)) server.reads.push(page);
      return route.fulfill({ json: { ok: true,
        entries: Object.fromEntries(keys.filter(k => k in server.entries).map(k => [k, server.entries[k]])),
        metadata: Object.fromEntries(keys.filter(k => k in server.entries).map(k => [k, { revision: server.revision }])),
        absentKeys: keys.filter(k => !(k in server.entries)),
      } });
    }
    const body = route.request().postDataJSON();
    if (body.key === key) {
      server.writes.push(body);
      if (denied) return route.fulfill({ status: 503, json: { ok: false } });
      if (body.baseRevision !== server.revision) return route.fulfill({ status: 409,
        json: { ok: false, currentRevision: server.revision } });
      server.entries[key] = body.value;
      server.revision++;
    }
    return route.fulfill({ json: { ok: true, key: body.key, value: body.value, metadata: { revision: server.revision } } });
  });
}

async function ready(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector("#loginScreen")?.hidden);
  await page.evaluate(() => document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click());
  await page.getByRole("button", { name: "Medical", exact: true }).click();
  await expect(page.locator(`[data-medical-roster-row="${player.id}"]`)).toContainText(player.name);
}

test("opening Medical with denied cache and recovery storage does not fabricate unsaved clinical work", async ({ page }) => {
  const server = createServer();
  await install(page, server, { denied: true });
  const dialogs = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.goto("/?workspace=medical-team"); await ready(page);
  for (const tab of ["History", "Reports", "Availability"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Open Recovery", exact: true })).toHaveCount(0);
  expect(server.writes).toEqual([]);
  await page.reload({ timeout: 10000 }); await ready(page);
  expect(dialogs).toEqual([]);
  expect(server.writes).toEqual([]);
});

test("a recommendation and Medical Plan are acknowledged and readable in a fresh independent session", async ({ page, browser, baseURL }) => {
  const server = createServer();
  await install(page, server);
  await page.goto("/?workspace=medical-team"); await ready(page);
  expect(server.writes).toEqual([]);
  await page.locator(`[data-medical-quick-recommend="${player.id}"][data-medical-quick-participation="25"]`).click();
  await expect.poll(() => JSON.parse(server.entries[key]).records?.some(row => row.playerId === player.id && row.participation === 25)).toBe(true);
  await page.locator(`[data-medical-roster-row="${player.id}"] .medical-roster-player-cell`).click();
  await page.locator('[data-medical-modal-tab="plan"]').click();
  const form = page.locator("#medicalInjuryPlanForm");
  await form.locator('[name="injuryType"]').fill("Synthetic test plan");
  await form.locator('[name="duration"]').fill("8");
  await form.locator('[name="participation"]').selectOption("0");
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => JSON.parse(server.entries[key]).injuryPlans?.some(plan =>
    plan.playerId === player.id && plan.injuryType === "Synthetic test plan" && plan.participation === 0)).toBe(true);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem("football-data-safety-v1"))?.entries?.[key]?.pendingCentralSync, key)).toBe(false);
  expect(server.revision).toBeGreaterThan(10);

  const verify = async target => {
    const value = await target.evaluate(async () => {
      const state = (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState();
      return { records: state.records, injuryPlans: state.injuryPlans };
    });
    expect(value.records).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: player.id, participation: 25 })]));
    expect(value.injuryPlans).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: player.id, injuryType: "Synthetic test plan", participation: 0 })]));
  };
  await page.reload(); await ready(page); await verify(page);
  const freshContext = await browser.newContext({ baseURL });
  try {
    const fresh = await freshContext.newPage();
    await install(fresh, server);
    await fresh.goto("/?workspace=medical-team"); await ready(fresh); await verify(fresh);
    expect(server.reads).toContain(fresh);
  } finally { await freshContext.close(); }
});
