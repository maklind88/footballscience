import { test, expect } from "@playwright/test";
import { createScheduleProbeFixture, showScheduleDateInPlanner } from "./helpers/live-schedule-probe.mjs";

async function installPlanner(page, date) {
  await page.setContent(`
    <button id="schedulePreviousMonthButton">Previous</button>
    <button id="scheduleNextMonthButton">Next</button>
    <div class="schedule-planner-day" data-schedule-date="${date}"></div>
    <script>
      (() => {
      const day = document.querySelector('.schedule-planner-day');
      function shift(offset) {
        const date = new Date(day.dataset.scheduleDate + 'T12:00:00Z');
        date.setUTCMonth(date.getUTCMonth() + offset);
        day.dataset.scheduleDate = date.toISOString().slice(0, 10);
      }
      document.querySelector('#schedulePreviousMonthButton').onclick = () => shift(-1);
      document.querySelector('#scheduleNextMonthButton').onclick = () => shift(1);
      })();
    </script>
  `);
}

test("schedule probe returns to a saved date outside the initial window after reload", async ({ page }) => {
  await installPlanner(page, "2026-10-01");
  await showScheduleDateInPlanner(page, "2026-12-01");
  // The application can reopen the current window rather than the saved future month.
  await installPlanner(page, "2026-10-01");
  await showScheduleDateInPlanner(page, "2026-12-01");
  await expect(page.locator(".schedule-planner-day")).toHaveAttribute("data-schedule-date", "2026-12-01");
  await showScheduleDateInPlanner(page, "2026-09-01");
  await expect(page.locator(".schedule-planner-day")).toHaveAttribute("data-schedule-date", "2026-09-01");
});

test("schedule probe stops at its window bound without silently succeeding", async ({ page }) => {
  await installPlanner(page, "2026-10-01");
  await expect(showScheduleDateInPlanner(page, "2026-12-01", 1)).rejects.toThrow("could not show");
  await expect(page.locator(".schedule-planner-day")).toHaveAttribute("data-schedule-date", "2026-11-01");
});

test("schedule cleanup does not depend on the original browser page surviving", async ({ page, browser }) => {
  const user = { id: "qa-user", clubId: "qa-club", teamId: "qa-team" };
  let cleanupPage;
  const [fixture] = createScheduleProbeFixture({
    signIn: async nextPage => { await nextPage.setContent("<p>Isolated test account</p>"); },
    getCurrentUser: async () => user,
    removeRecord: async (nextPage, title, date) => {
      cleanupPage = nextPage;
      expect(page.isClosed()).toBe(true);
      expect(nextPage.isClosed()).toBe(false);
      expect(title).toBe("QA Live 1234567890-abcdef");
      expect(date).toBe("2026-10-23");
      await expect(nextPage.locator("p")).toHaveText("Isolated test account");
    },
  });
  await fixture({ browser }, async probe => {
    probe.arm({ title: "QA Live 1234567890-abcdef", targetDate: "2026-10-23", user });
    await page.close();
  });
  expect(cleanupPage.isClosed()).toBe(true);
});
