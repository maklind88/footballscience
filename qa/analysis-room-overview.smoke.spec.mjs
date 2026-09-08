import { expect, test } from "@playwright/test";

async function openOverview(page) {
  await page.clock.setFixedTime(new Date("2026-06-15T12:00:00Z"));
  await page.addInitScript(() => {
    window.__videoAnalysisSmokeMatches = [];
    window.__videoAnalysisSmokeScheduleCandidates = Array.from({ length: 12 }, (_, index) => ({
      id: `activity-${index}`, date: "2026-06-15", type: "training",
      title: `Activity ${String(index + 1).padStart(2, "0")} - Training with a deliberately long session title`,
    }));
    window.__videoAnalysisSmokeScheduleEvents = [
      ...window.__videoAnalysisSmokeScheduleCandidates,
      { id: "off", date: "2026-06-16", type: "off", title: "Rest day" },
      { id: "meeting", date: "2026-06-16", type: "meeting", title: "Staff meeting" },
    ];
  });
  await page.goto("/qa/video-analysis-browser-smoke.html?reset=1");
  await page.evaluate(() => new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/styles.css";
    link.onload = resolve;
    link.onerror = reject;
    document.head.prepend(link);
  }));
  await expect(page.locator("[data-video-analysis-library]")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("button", { name: "Show all 12 activities for 15/06/2026" })).toBeVisible();
}

test("Analysis Room calendar and search agree, including zero results", async ({ page }) => {
  await openOverview(page);
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(2);
  await expect(page.locator(".video-analysis-calendar-overview")).not.toContainText("Rest day");
  await expect(page.locator(".video-analysis-calendar-overview")).not.toContainText("Staff meeting");
  await expect(page.getByRole("region", { name: "Search results", exact: true })).toHaveCount(0);
  const search = page.getByRole("searchbox");
  await search.fill("Activity 11");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(1);
  await search.fill("No such opponent");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(0);
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Search results", exact: true })).toContainText("No matches or training sessions found.");
  await search.fill("");
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(2);
});

test("Analysis Room day overflow opens every activity with keyboard and paginated results", async ({ page }) => {
  await openOverview(page);
  await page.evaluate(() => {
    const fetch = window.fetch;
    window.fetch = async (url, options) => {
      if (new URL(url, location.origin).searchParams.get("action") === "library-search") {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return fetch(url, options);
    };
  });
  const more = page.getByRole("button", { name: "Show all 12 activities for 15/06/2026" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Filter by date")).toHaveValue("2026-06-15");
  await expect(page.locator("[data-video-analysis-library-results-title]")).toBeFocused();
  await expect(page.locator("[data-video-analysis-library]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-video-analysis-library-results-title]")).toBeFocused();
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Previous results" })).toBeDisabled();
  await page.getByRole("button", { name: "Next results" }).click();
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Search results", exact: true })).toContainText("9-12 of 12");
  await expect(page.getByRole("button", { name: "Next results" })).toBeDisabled();
  await page.getByRole("searchbox").fill("Activity 01");
  await expect(page.locator(".video-analysis-library-row")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Search results", exact: true })).toContainText("1-1 of 1");
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Next results" }).click();
  await page.locator('.video-analysis-library-row [data-video-analysis-open-library-item="schedule:activity-11"]').click();
  await expect(page.locator(".analysis-room-tab.is-active")).toContainText("FS Player");
  await expect(page.locator("[data-video-analysis-library]")).toHaveCount(0);
  await expect(page.locator("[data-video-analysis-file]")).toHaveCount(1);
  await page.locator("[data-video-analysis-file]").setInputFiles({
    name: "activity-12.mp4", mimeType: "video/mp4", buffer: Buffer.from("ftypisommp42moovtrakmdiahdlrstsdavc1", "latin1"),
  });
  await expect.poll(() => page.evaluate(() => (window.__videoAnalysisRequests || []).some((request) => (
    request.body.scheduleEventId === "activity-11"
      && request.body.matchDate === "2026-06-15"
      && request.body.matchTitle.startsWith("Activity 12")
  )))).toBe(true);
});

test("Analysis Room date and month navigation do not keep an invisible day filter", async ({ page }) => {
  await openOverview(page);
  await page.getByRole("button", { name: "Show activities for 15/06/2026", exact: true }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Filter by date")).toHaveValue("");
  await expect(page.locator(".video-analysis-calendar-overview")).toContainText("Jul 2026");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(2);
  await page.getByLabel("Filter by date").fill("2026-07-01");
  await expect(page.locator(".video-analysis-calendar-overview")).toContainText("Jul 2026");
});

test("Analysis Room shows loading and refresh errors without dropping cached activities", async ({ page }) => {
  await openOverview(page);
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.__failOverviewRefresh = true;
    window.fetch = async (url, options) => {
      if (new URL(url, location.origin).searchParams.get("action") === "library-calendar") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (window.__failOverviewRefresh) throw new Error("Calendar unavailable");
      }
      return originalFetch(url, options);
    };
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("[data-video-analysis-library]")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Calendar unavailable");
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(2);
  await page.evaluate(() => { window.__failOverviewRefresh = false; });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("[data-video-analysis-library]")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".video-analysis-calendar-event")).toHaveCount(2);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`Analysis Room overview stays within ${viewport.width}px with long titles`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openOverview(page);
    await page.getByRole("button", { name: "Show all 12 activities for 15/06/2026" }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const geometry = await page.locator("[data-video-analysis-library]").evaluate((root) => {
      const day = root.querySelector(".video-analysis-calendar-day.has-items");
      const number = day.querySelector(".video-analysis-calendar-day__number").getBoundingClientRect();
      const event = day.querySelector(".video-analysis-calendar-event").getBoundingClientRect();
      const controls = [...root.querySelectorAll(".video-analysis-library-search input, .video-analysis-library-search select, .video-analysis-library-search button")].map((element) => element.getBoundingClientRect());
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        numberBottom: number.bottom, eventTop: event.top,
        controlsFit: controls.every((rect) => rect.left >= 0 && rect.right <= window.innerWidth),
      };
    });
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.numberBottom).toBeLessThanOrEqual(geometry.eventTop);
    expect(geometry.controlsFit).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`overview-${viewport.width}.png`), fullPage: true });
  });
}
