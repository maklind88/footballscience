import { test, expect } from "@playwright/test";
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
