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


test("Sessions syncs its committed journal when localStorage metadata and extra history cannot be written", async ({ page }) => {
  // Fail history from startup: an earlier successful identical snapshot may
  // legitimately suppress later writes, so enabling the fault after ready races
  // startup and does not prove the unavailable-history precondition.
  const server = await installSessionStorageFixture(page, { failHistory: true });
  server.reject = false;
  await page.goto("/?workspace=session-planner"); await ready(page);
  await expect.poll(() => page.evaluate(() => window.__storageFault.historyFailures)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__storageFault.manifest = true; });
  await edit(page, "Journal survives unavailable cache metadata");
  await expect.poll(() => server.effects).toBe(1);
  await expect.poll(() => readJournal(page)).toEqual([]);
  await expect(status(page)).toHaveClass(/is-saved/);
  expect(server.value.sessions[day].blocks[0].objective).toBe("Journal survives unavailable cache metadata");
  expect(await page.evaluate(() => window.__storageFault.manifestFailures)).toBeGreaterThan(0);
  await page.reload(); await ready(page);
  await expect(objective(page)).toHaveValue("Journal survives unavailable cache metadata");
  expect(server.effects).toBe(1);
});

for (const overlap of [false, true]) {
  test(`Sessions reload and colleague edits remain safe without cache metadata or history (conflict=${overlap})`, async ({ page }) => {
    const server = await installSessionStorageFixture(page, { failManifest: true, failHistory: true });
    await page.goto("/?workspace=session-planner"); await ready(page);
    await edit(page, "Owner work retained in journal");
    await expect.poll(() => server.writes.length).toBeGreaterThan(0);
    const retained = await readJournal(page);
    expect(retained).toHaveLength(1);
    expect(retained[0].status).toBe("pending");
    await expect(status(page)).not.toHaveClass(/is-saved/);
    await page.reload(); await ready(page);
    await expect(objective(page)).toHaveValue("Owner work retained in journal");
    expect(await readJournal(page)).toEqual(retained);
    if (overlap) server.value.sessions[day].blocks[0].objective = "Accepted colleague objective";
    else server.value.sessions[day].blocks[0].title = "Accepted colleague title";
    server.revision++; server.reject = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    if (overlap) {
      await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(["review"]);
      expect(server.effects).toBe(0);
      expect(server.value.sessions[day].blocks[0].objective).toBe("Accepted colleague objective");
      await expect(status(page)).not.toHaveClass(/is-saved/);
      await page.reload(); await ready(page);
      expect((await readJournal(page))[0].change).toEqual(retained[0].change);
      await page.getByRole("button", { name: "Review local saves", exact: true }).click();
      await expect(page.locator("dialog.session-save-review")).toContainText("Owner work retained in journal");
    } else {
      await expect.poll(() => server.effects).toBe(1);
      await expect.poll(() => readJournal(page)).toEqual([]);
      await expect(status(page)).toHaveClass(/is-saved/);
      expect(server.value.sessions[day].blocks[0].title).toBe("Accepted colleague title");
      await page.reload(); await ready(page);
      await expect(objective(page)).toHaveValue("Owner work retained in journal");
      await expect(page.locator('[data-session-field="title"]').first()).toHaveValue("Accepted colleague title");
    }
    expect(await page.evaluate(() => window.__storageFault.manifestFailures)).toBeGreaterThan(0);
  });
}
