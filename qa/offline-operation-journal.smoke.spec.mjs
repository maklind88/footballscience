import { expect, test } from "@playwright/test";

const databaseName = "football-science-offline-operation-journal-test";

async function resetDatabase(page) {
  await page.evaluate(async (name) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Test database remained open."));
    });
  }, databaseName);
}

test("offline operation journal survives reload and never exposes another scoped team's entries", async ({ page }) => {
  await page.goto("/");
  await resetDatabase(page);
  const beforeReload = await page.evaluate(async (name) => {
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    const journal = createOfflineOperationJournal({ databaseName: name, now: () => 100 });
    await journal.put({
      id: "periodization-day-1",
      scope: "coach-1:org-1:team-1",
      moduleId: "periodization",
      key: "football-periodization-v2",
      type: "day.patch",
      payload: { date: "2026-09-23", patch: { objectives: "Build from the back" } },
      baseRevision: 7,
    });
    await journal.put({
      id: "periodization-day-1",
      scope: "coach-2:org-2:team-2",
      moduleId: "periodization",
      key: "football-periodization-v2",
      type: "day.patch",
      payload: { date: "2026-09-23", patch: { objectives: "Private" } },
      baseRevision: 3,
    });
    return journal.list("coach-1:org-1:team-1");
  }, databaseName);
  expect(beforeReload).toHaveLength(1);
  await page.reload();
  const result = await page.evaluate(async (name) => {
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    const journal = createOfflineOperationJournal({ databaseName: name });
    const own = await journal.list("coach-1:org-1:team-1");
    const other = await journal.list("coach-2:org-2:team-2");
    await journal.updateStatus("periodization-day-1", "coach-1:org-1:team-1", "applied");
    const afterApply = await journal.list("coach-1:org-1:team-1");
    const otherAfterApply = await journal.list("coach-2:org-2:team-2");
    await journal.close();
    return {
      own,
      other,
      afterApply,
      otherAfterApply,
    };
  }, databaseName);
  expect(result.own).toHaveLength(1);
  expect(result.own[0]).toMatchObject({
    baseRevision: 7,
    key: "football-periodization-v2",
    moduleId: "periodization",
    status: "pending",
  });
  expect(result.other).toHaveLength(1);
  expect(result.afterApply).toEqual([]);
  expect(result.otherAfterApply[0]).toMatchObject({
    id: "periodization-day-1",
    status: "pending",
  });
  await resetDatabase(page);
});
