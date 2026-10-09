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
export async function verifyMedicalWorkingAcceptance(page, { recordId, marker, baselineMarker, acceptedMarker, publishPeer }) {
  const key = "football-medical-team-v1";
  // Read/reload and begin the edit in one browser action. A transient key-ready
  // flag can change between separate test calls during startup. A blocked
  // bootstrap write may leave hydrate() false even though its read was applied;
  // verify the actual expected central fixture before touching it instead.
  const owner = await page.evaluate(async ({ key, recordId, marker, baselineMarker }) => {
    const medical = await import("/src/modules/medical/medical-runtime-accessors.mjs");
    const runtime = await import("/src/core/platform-runtime-accessors.mjs");
    const bridge = window.footballScienceCentralState;
    await bridge.hydrate({ keys: [key, "football-player-profiles-v1"], fresh: true, forceApply: true });
    runtime.reloadCentralizedAppStateFromStorage();
    const scope = bridge.getReadScope(), record = medical.ensureMedicalState().records.find(row => row.id === recordId);
    if (!scope || bridge.canAutoSyncKey(key) !== true || record?.comment !== baselineMarker) return null;
    record.comment = marker;
    medical.writeMedicalState();
    runtime.reloadCentralizedAppStateFromStorage();
    return scope;
  }, { key, recordId, marker, baselineMarker });
  expect(Boolean(owner)).toBe(true);
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
  await page.evaluate(async key => {
    await window.footballScienceCentralState.hydrate({ keys: [key, "football-player-profiles-v1"], fresh: true, forceApply: true });
    (await import("/src/core/platform-runtime-accessors.mjs")).reloadCentralizedAppStateFromStorage();
  }, key);
  await expect.poll(() => hasRecord(acceptedMarker)).toBe(true);
  expect(await page.evaluate(owner => window.footballScienceCentralState.getReadScope() === owner, owner)).toBe(true);
  await panel.getByText(/^Unsaved in this tab from /).click();
  await expect.poll(() => panel.evaluate((node, marker) => node.textContent.includes(marker), marker)).toBe(true);
  expect(await panel.getByRole("button", { name: "Remove this verified local copy" }).count()).toBe(0);
}
