import { expect } from "@playwright/test";

export function installScheduleDialogHandler(page) {
  let lastDialogType = "none";
  page.on("dialog", async dialog => {
    lastDialogType = dialog.type();
    console.info(`Schedule probe dialog: ${lastDialogType}`);
    if (lastDialogType === "confirm") await dialog.accept();
    else await dialog.dismiss(); // Never discard unsaved work to make a smoke test pass.
  });
  return () => lastDialogType;
}

export async function showScheduleDateInPlanner(page, targetDate, maxWindowShifts = 24) {
  if (!targetDate) return;
  const targetDay = page.locator(`.schedule-planner-day[data-schedule-date="${targetDate}"]`);
  for (let attempt = 0; attempt <= maxWindowShifts; attempt += 1) {
    if ((await targetDay.count()) > 0) return;
    if (attempt === maxWindowShifts) break;
    const firstVisibleDate = await page.locator(".schedule-planner-day").first().getAttribute("data-schedule-date");
    const navigationButton = targetDate < String(firstVisibleDate || "")
      ? page.locator("#schedulePreviousMonthButton")
      : page.locator("#scheduleNextMonthButton");
    await navigationButton.click();
    await expect.poll(
      () => page.locator(".schedule-planner-day").first().getAttribute("data-schedule-date"),
      { timeout: 15_000 }
    ).not.toBe(firstVisibleDate);
  }
  throw new Error(`Schedule verification could not show ${targetDate} in the planner.`);
}

// A test-scoped fixture has a teardown budget separate from a timed-out test body.
// Use a fresh context: the original page may already have been closed on timeout.
export function createScheduleProbeFixture({ signIn, getCurrentUser, removeRecord }) {
  return [async ({ browser }, use) => {
    let record;
    await use({
      arm({ title, targetDate, user }) {
        if (record || !/^QA Live \d+-[a-f0-9-]+$/.test(title) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !user?.id) {
          throw new Error("Schedule cleanup requires one exact run-owned record and an authenticated account.");
        }
        record = { title, targetDate, userId: user.id, clubId: user.clubId, teamId: user.teamId };
        console.info(`Schedule probe armed: ${JSON.stringify({ title, targetDate })}`);
      },
    });
    if (!record) return;
    const { title, targetDate } = record;
    console.info(`Schedule probe cleanup started: ${JSON.stringify({ title, targetDate })}`);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page);
      const user = await getCurrentUser(page);
      expect({ id: user.id, clubId: user.clubId, teamId: user.teamId }, "Cleanup account/scope changed").toEqual({
        id: record.userId, clubId: record.clubId, teamId: record.teamId,
      });
      await removeRecord(page, title, targetDate);
      console.info(`Schedule probe cleanup verified: ${JSON.stringify({ title, targetDate })}`);
    } finally {
      await context.close();
    }
  }, { timeout: 90_000 }];
}
