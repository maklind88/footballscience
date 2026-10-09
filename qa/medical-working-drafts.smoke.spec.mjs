import { test, expect } from "@playwright/test";
import { addMedicalAcceptanceRoster } from "./helpers/medical-acceptance-roster-fixture.mjs";
import { installMedicalWorkingFailure, verifyMedicalWorkingAcceptance } from "./helpers/medical-working-draft-acceptance.mjs";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";
import { draft, install, retain, list } from "./helpers/medical-draft-fixture.mjs";

async function failRescue(page) {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => {
    window.__realRetain = window.__store.retain;
    window.__store.retain = () => Promise.reject(new Error("Synthetic storage denied"));
  });
  expect(await retain(page)).toBe(false);
}

test("storage failure keeps a downloadable working branch while distinct central work stays readable", async ({ page }) => {
  await failRescue(page);
  expect(await page.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBe(JSON.stringify(draft));
  await page.evaluate(() => {
    window.footballScienceCentralState.getStatus = () => ({ metadata: { "football-medical-team-v1": { revision: 8 } } });
    window.dispatchEvent(new Event("footballscience:central-state-ready"));
  });
  expect(await page.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBeUndefined();
  await page.getByText(/^Unsaved in this tab from /).click();
  await expect(page.locator("#recovery")).toContainText(draft.records[0].comment);
  await expect(page.getByRole("button", { name: "Remove this verified local copy" })).toHaveCount(0);
  await page.evaluate(() => { window.__store.retain = window.__realRetain; });
  await page.getByRole("button", { name: "Retry saving recovery copy" }).click();
  await expect(page.locator("#recovery")).toContainText("A Medical recovery copy is saved on this device");
  const rows = await list(page); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ value: JSON.stringify(draft), previousValue: '{"records":[]}', baseRevision: 7 });
  expect(await page.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBeUndefined();
  await page.reload(); await install(page);
  await page.getByText(/^Copy from /).click();
  await expect(page.locator("#recovery")).toContainText(draft.records[0].comment);
});

for (const change of ["account", "permission", "readonly"]) {
  test(`a ${change} change blocks the working projection under the current access policy`, async ({ page }) => {
    await failRescue(page);
    await page.evaluate(change => {
      if (change === "account") window.__scope = "owner-team-b";
      if (change === "permission") window.__canEdit = false;
      if (change === "readonly") {
        window.footballScienceCentralState.getCachedValueInfo = () => ({ source: "central-readonly-baseline" });
      }
      window.dispatchEvent(new Event("platform:user-change"));
    }, change);
    expect(await page.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBeUndefined();
    if (change !== "readonly") {
      await expect(page.locator("#recovery")).toBeHidden();
      await expect(page.getByRole("button", { name: "Download this recovery copy" })).toHaveCount(0);
    }
  });
}

test("two open tabs retain different failed working versions independently", async ({ page, context }) => {
  await failRescue(page);
  const other = await context.newPage(); await failRescue(other);
  const variant = { ...draft, note: "Second user's working version" };
  expect(await retain(other, variant)).toBe(false);
  expect(await page.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBe(JSON.stringify(draft));
  expect(await other.evaluate(() => window.__recovery.readWorkingDraft('{"records":[]}', window.__scope))).toBe(JSON.stringify(variant));
  await other.close();
});

test("shared acceptance exercise proves the actual Medical runtime under failed saving and a newer peer baseline", async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  const key = "football-medical-team-v1", marker = "qa-unsaved-working", acceptedMarker = "qa-accepted-peer";
  const player = { id: "qa-player", name: "Synthetic acceptance", rosterType: "squad", status: "available" };
  const recordId = "qa-record";
  let revision = 10, medical = { rosterVersion: "qa", selectedDate: "2026-10-09", players: [player], injuryPlans: [],
    records: [{ id: recordId, playerId: player.id, date: "2026-10-09", participation: 100, comment: "Synthetic baseline", createdAt: "2026-10-09T08:00:00Z" }] };
  await installMedicalWorkingFailure(page, marker);
  let browserWrites = 0;
  await page.route("**/api/app-state**", route => {
    if (route.request().method() !== "GET") { browserWrites++; return route.fulfill({ status: 503, json: { ok: false } }); }
    const entries = { [key]: JSON.stringify(medical) };
    const keys = new URL(route.request().url()).searchParams.get("keys")?.split(",") || Object.keys(entries);
    return route.fulfill({ json: addMedicalAcceptanceRoster({ ok: true, entries: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, entries[k]])),
      metadata: Object.fromEntries(keys.filter(k => k in entries).map(k => [k, { revision }])), absentKeys: keys.filter(k => !(k in entries)) }, { run: "qa", player }) });
  });
  await page.goto("/?workspace=medical-team");
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector("#loginScreen")?.hidden);
  await page.evaluate(() => {
    document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click();
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "medical-team" } }));
  });
  await verifyMedicalWorkingAcceptance(page, { recordId, marker, baselineMarker: "Synthetic baseline", acceptedMarker, publishPeer: async () => {
    medical = { ...medical, records: [{ ...medical.records[0], comment: acceptedMarker, updatedAt: "2026-10-09T12:00:00Z" }] };
    revision++;
  } });
  expect(browserWrites).toBeGreaterThan(0);
  expect(medical.records[0].comment).toBe(acceptedMarker);
});
