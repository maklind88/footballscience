import { expect } from "@playwright/test";

export async function installMedicalWorkingFailure(page, marker) {
  await page.addInitScript(marker => {
    const set = Storage.prototype.setItem, open = IDBFactory.prototype.open;
    Storage.prototype.setItem = function(key, value) {
      if (key === "football-medical-team-v1" && String(value).includes(marker)) {
        throw new DOMException("Synthetic Medical quota failure", "QuotaExceededError");
      }
      return set.call(this, key, value);
    };
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === "football-science-medical-drafts-v1") throw new DOMException("Synthetic rescue denial", "SecurityError");
      return open.call(this, name, ...args);
    };
  }, marker);
}

// The caller blocks browser data mutations, opens the actual Medical runtime and
// supplies a guarded peer write of its own fixture. Never print clinical payloads.
export async function verifyMedicalWorkingAcceptance(page, { recordId, marker, acceptedMarker, publishPeer }) {
  const key = "football-medical-team-v1";
  await page.waitForFunction(async ({ recordId, key }) => {
    const state = (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState();
    return window.footballScienceCentralState?.isKeyHydrated?.(key) === true
      && state.records.some(row => row.id === recordId);
  }, { recordId, key });
  const owner = await page.evaluate(() => window.footballScienceCentralState.getReadScope());
  expect(Boolean(owner)).toBe(true);
  await page.evaluate(async ({ recordId, marker }) => {
    const medical = await import("/src/modules/medical/medical-runtime-accessors.mjs");
    medical.ensureMedicalState().records.find(row => row.id === recordId).comment = marker;
    medical.writeMedicalState();
    (await import("/src/core/platform-runtime-accessors.mjs")).reloadCentralizedAppStateFromStorage();
  }, { recordId, marker });
  const hasRecord = value => page.evaluate(async ({ recordId, value }) =>
    (await import("/src/modules/medical/medical-runtime-accessors.mjs")).ensureMedicalState().records
      .some(row => row.id === recordId && row.comment === value), { recordId, value });
  expect(await hasRecord(marker)).toBe(true);
  expect(await page.evaluate(({ key, marker }) => localStorage.getItem(key)?.includes(marker) === true, { key, marker })).toBe(false);
  const panel = page.locator("[data-medical-draft-recovery]");
  await panel.getByText(/^Unsaved in this tab from /).click();
  await expect.poll(() => panel.evaluate((node, marker) => node.textContent.includes(marker), marker)).toBe(true);
  await expect.poll(() => panel.evaluate(node => node.textContent.includes("will be lost if it closes"))).toBe(true);

  await publishPeer();
  await page.evaluate(async () => {
    await window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true });
    (await import("/src/core/platform-runtime-accessors.mjs")).reloadCentralizedAppStateFromStorage();
  });
  await expect.poll(() => hasRecord(acceptedMarker)).toBe(true);
  expect(await page.evaluate(owner => window.footballScienceCentralState.getReadScope() === owner, owner)).toBe(true);
  await panel.getByText(/^Unsaved in this tab from /).click();
  await expect.poll(() => panel.evaluate((node, marker) => node.textContent.includes(marker), marker)).toBe(true);
  expect(await panel.getByRole("button", { name: "Remove this verified local copy" }).count()).toBe(0);
}
