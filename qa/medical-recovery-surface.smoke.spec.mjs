import { test, expect } from "@playwright/test";
import { draft, install, retain, list } from "./helpers/medical-draft-fixture.mjs";

async function setMode(page, mode) {
  await page.evaluate(mode => {
    const host = document.querySelector("#recovery");
    host.dataset.medicalRecoveryMode = mode;
    window.__recovery.mount(host);
  }, mode);
}

async function leavingIsBlocked(page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test("recovery summary keeps clinical content out of the work view without deleting copies", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await retain(page); const before = await list(page);
  await setMode(page, "summary");
  await expect(page.getByRole("button", { name: "Open Recovery" })).toBeVisible();
  await expect(page.locator("#recovery details")).toHaveCount(0);
  await expect(page.locator("#recovery")).not.toContainText(draft.records[0].comment);
  await setMode(page, "full");
  await page.getByText(/^Copy from /).click();
  await expect(page.locator("#recovery")).toContainText(draft.records[0].comment);
  expect(await list(page)).toEqual(before);
  expect(await leavingIsBlocked(page)).toBe(false);
  await setMode(page, "summary");
  await page.evaluate(() => { window.__canEdit = false; window.dispatchEvent(new Event("platform:user-change")); });
  await expect(page.locator("#recovery")).toBeHidden();
  await expect(page.locator("#recovery")).toHaveText("");
});

test("memory-only drafts warn before leaving and stay exportable after switching recovery views", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => {
    window.__realRetain = window.__store.retain;
    window.__store.retain = () => Promise.reject(new DOMException("private error content", "SecurityError"));
  });
  expect(await retain(page)).toBe(false);
  await setMode(page, "summary");
  await expect(page.locator("#recovery")).toContainText("Unsaved Medical work remains in this tab");
  expect(await leavingIsBlocked(page)).toBe(true);
  await setMode(page, "full");
  await expect(page.locator("#recovery")).toContainText("browser blocked access");
  await expect(page.locator("#recovery")).not.toContainText("private error content");
  await page.getByText(/^Unsaved in this tab from /).click();
  const leaving = page.waitForEvent("dialog");
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  const dialog = await leaving;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page.locator("#recovery")).toContainText(draft.records[0].comment);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download this recovery copy" }).click();
  const stream = await (await downloading).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks)).value).toBe(JSON.stringify(draft));
  // A download is not a server receipt or permission to discard the draft.
  expect(await leavingIsBlocked(page)).toBe(true);
  await page.evaluate(() => { window.__store.retain = window.__realRetain; });
  await page.getByRole("button", { name: "Retry saving recovery copy" }).click();
  await expect(page.locator("#recovery")).toContainText("A Medical recovery copy is saved on this device");
  expect(await leavingIsBlocked(page)).toBe(false);
  expect(await list(page)).toHaveLength(1);
});

test("unload warning is limited to the current authorized recovery scope", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => { window.__store.retain = () => Promise.reject(new Error("failure")); });
  await retain(page);
  expect(await leavingIsBlocked(page)).toBe(true);
  await page.evaluate(() => { window.__scope = "different-team"; });
  expect(await leavingIsBlocked(page)).toBe(false);
  await page.evaluate(() => { window.__scope = "owner-team-a"; window.__canEdit = false; });
  expect(await leavingIsBlocked(page)).toBe(false);
  await page.evaluate(() => { window.__canEdit = true; });
  expect(await leavingIsBlocked(page)).toBe(true);
});

test("empty recovery is explicit and never claims central saving", async ({ page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await setMode(page, "full");
  await expect(page.locator("#recovery")).toHaveText("RecoveryNo recovery copies on this device.");
  await setMode(page, "summary");
  await expect(page.locator("#recovery")).toBeHidden();
});
