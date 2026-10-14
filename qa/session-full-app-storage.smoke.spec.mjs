import { test, expect } from "@playwright/test";
import { installSessionStorageFixture, ready, edit, readJournal, refresh, key, day } from "./helpers/session-full-app-storage-fixture.mjs";

const status = page => page.locator('[data-platform-autosave-status]');
const objective = page => page.locator('[data-session-field="objective"]').first();

test("full Sessions app retains pending work across full cache, failed central saving and reload", async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await edit(page, "Pending full-app work");
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  await expect(status(page)).toHaveClass(/is-issue/);
  const before = await readJournal(page);
  expect(before).toHaveLength(1);
  expect(before[0].status).toBe("pending");
  expect(server.effects).toBe(0);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Central baseline");
  expect(await page.evaluate(key => window.__nativeStorageRead(key), key)).toBeNull();
  expect(await page.evaluate(() => window.__storageFault.cacheFailures)).toBeGreaterThan(0);
  await refresh(page);
  await expect(objective(page)).toHaveValue("Pending full-app work");
  await page.reload(); await ready(page);
  expect(await readJournal(page)).toEqual(before);
  await expect(objective(page)).toHaveValue("Pending full-app work");
  await expect(status(page)).not.toHaveClass(/is-saved/);
  server.reject = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => server.effects).toBe(1);
  await expect.poll(() => readJournal(page)).toEqual([]);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Pending full-app work");
  await expect(status(page)).toHaveClass(/is-saved/);
  await page.reload(); await ready(page);
  await expect(objective(page)).toHaveValue("Pending full-app work");
  expect(await readJournal(page)).toEqual([]);
});

test("full Sessions app keeps volatile edit honest during combined storage failure and retries after recovery", async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await page.evaluate(() => { window.__storageFault.journal = true; });
  await edit(page, "Volatile full-app work");
  await expect(status(page)).toContainText("Not saved on this device");
  await expect(status(page)).toHaveClass(/is-issue/);
  expect(await page.evaluate(() => window.__storageFault.journalFailures)).toBeGreaterThan(0);
  expect(await readJournal(page)).toEqual([]);
  expect(server.writes).toEqual([]);
  await refresh(page);
  await expect(objective(page)).toHaveValue("Volatile full-app work");
  await expect(status(page)).not.toHaveClass(/is-saved/);
  await page.evaluate(() => { window.__storageFault.journal = false; });
  // An actual subsequent edit triggers the existing autosave path. Re-firing
  // change with identical text is not a user-facing retry action.
  await edit(page, "Volatile full-app work recovered");
  await expect.poll(() => readJournal(page)).toHaveLength(1);
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  expect(server.effects).toBe(0);
  await expect(status(page)).toHaveClass(/is-issue/);
  server.reject = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => server.effects).toBe(1);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Volatile full-app work recovered");
  await expect.poll(() => readJournal(page)).toEqual([]);
  await expect(status(page)).toHaveClass(/is-saved/);
});

test("full Sessions app preserves unresolved review across combined failure and reload without pretending volatile work survived", async ({ page }) => {
  const server = await installSessionStorageFixture(page);
  await page.goto("/?workspace=session-planner"); await ready(page);
  await edit(page, "Conflicting local work");
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  server.value.sessions[day].blocks[0].objective = "Accepted colleague work";
  server.revision++; server.reject = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(["review"]);
  const reviewed = await readJournal(page);
  await refresh(page);
  await expect(objective(page)).toHaveValue("Accepted colleague work");
  server.reject = true;
  await page.evaluate(() => { window.__storageFault.journal = true; });
  const title = page.locator('[data-session-field="title"]').first();
  await title.fill("Volatile title without durable storage"); await title.dispatchEvent("change");
  await expect(status(page)).toContainText("Not saved on this device");
  await expect(title).toHaveValue("Volatile title without durable storage");
  await refresh(page);
  await expect(status(page)).toContainText("Not saved on this device");
  await expect(title).toHaveValue("Volatile title without durable storage");
  expect(await readJournal(page)).toEqual(reviewed);
  expect(server.effects).toBe(0);
  // Deliberately reload despite the visible warning. Memory-only text cannot
  // survive; the previously committed review must survive exactly.
  await page.reload(); await ready(page);
  await expect(title).toHaveValue("Press");
  await expect(objective(page)).toHaveValue("Accepted colleague work");
  expect(await readJournal(page)).toEqual(reviewed);
  await expect(status(page)).not.toHaveClass(/is-saved/);
  await page.getByRole("button", { name: "Review local saves", exact: true }).click();
  await expect(page.locator("dialog.session-save-review")).toContainText("1 local version to review");
  await expect(page.locator("dialog.session-save-review")).toContainText("Conflicting local work");
  expect(await readJournal(page)).toEqual(reviewed);
  expect(server.effects).toBe(0);
});
