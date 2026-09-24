import { expect, test } from "@playwright/test";

for (const width of [390, 800, 1440]) {
  test(`Home Leaderboard stays below birthdays when calendar grows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/__home_layout__", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
    }));
    await page.goto("/__home_layout__");
    await page.evaluate(async () => {
      await Promise.all([
        "/styles.css", "/dashboard-chat.css", "/presentation-mode.css",
        "/src/modules/home/home-leaderboard.css",
      ].map((href) => new Promise((resolve, reject) => {
        const link = document.createElement("link");
        Object.assign(link, { rel: "stylesheet", href, onload: resolve, onerror: reject });
        document.head.append(link);
      })));
      const { createDashboardHomeCardsRenderer } = await import("/src/modules/home/dashboard-renderer.mjs");
      document.body.innerHTML = createDashboardHomeCardsRenderer().render({
        myOpenTasks: [], personalOpenTasks: [], delegatedOpenTasks: [],
        users: [], alerts: [], canViewLeaderboard: true,
      }, "");
      // Model the calendar's variable detail height without involving schedule data.
      const calendar = document.querySelector("#dashboardSchedulePreview");
      calendar.innerHTML = '<button type="button">Select day</button><div hidden>Selected day</div>';
      calendar.style.minHeight = "320px";
      calendar.querySelector("button").onclick = () => {
        const detail = calendar.querySelector("div");
        detail.hidden = !detail.hidden;
        calendar.style.minHeight = detail.hidden ? "320px" : "1100px";
      };
    });

    const measure = () => page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { top: box.top + scrollY, bottom: box.bottom + scrollY, left: box.left, width: box.width };
      };
      return {
        birthday: rect(".dashboard-birthday-strip"),
        leaderboard: rect(".dashboard-leaderboard-slot"),
        calendar: rect("#dashboardSchedulePreview"),
      };
    });
    const before = await measure();
    expect(before.leaderboard.top - before.birthday.bottom).toBeGreaterThanOrEqual(0);
    expect(before.leaderboard.top - before.birthday.bottom).toBeLessThan(12);
    expect(Math.abs(before.leaderboard.width - before.birthday.width)).toBeLessThan(1);
    expect(before.leaderboard.left).toBe(before.birthday.left);
    await page.getByRole("button", { name: "Select day", exact: true }).click();
    const expanded = await measure();
    expect(expanded.calendar.bottom - expanded.calendar.top).toBeGreaterThan(1000);
    expect(expanded.leaderboard).toEqual(before.leaderboard);
    await page.screenshot({ path: test.info().outputPath(`home-calendar-expanded-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Select day", exact: true }).click();
    expect((await measure()).leaderboard).toEqual(before.leaderboard);
  });
}
