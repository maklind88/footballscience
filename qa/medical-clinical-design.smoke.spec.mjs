import { expect, test } from "@playwright/test";

const percentages = [0, 10, 25, 50, 75, 100];
const percentageColors = [
  "rgb(166, 63, 53)", "rgb(242, 180, 176)", "rgb(240, 162, 75)",
  "rgb(246, 220, 117)", "rgb(194, 221, 165)", "rgb(31, 91, 69)",
];

async function openMedical(page) {
  await page.clock.setFixedTime(new Date("2026-09-08T16:00:00Z"));
  await page.addInitScript(() => {
    const values = [0, 10, 25, 50, 75, 100];
    const players = values.map((participation, index) => ({
      id: `qa-design-${participation}`, name: `Design Player ${index + 1}`, number: index + 1,
      position: "Defender", rosterType: "squad", countsInSquad: true,
      rosterOrder: index + 1, status: "available",
    }));
    localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3, rosterVersion: "qa-medical-design", selectedPlayerId: players[0].id,
      players, removedPlayerIds: [],
    }));
    localStorage.setItem("football-medical-team-v1", JSON.stringify({
      rosterVersion: "qa-medical-design", selectedDate: "2026-09-08", selectedPlayerId: players[0].id,
      players,
      records: values.map((participation, index) => ({
        id: `qa-design-rec-${participation}`, playerId: players[index].id, date: "2026-09-08",
        participation, actualParticipation: "not-logged", comment: "Review response after the session.",
        createdAt: "2026-09-08T08:00:00Z",
      })),
      injuryPlans: [{
        id: "qa-design-case", playerId: players[0].id, injuryType: "Knee injury", bodyArea: "Knee",
        startDate: "2026-09-01", endDate: "2026-12-01", duration: 3, durationUnit: "months",
        status: "unavailable", participation: 0, reviewDate: "2026-09-07",
        rtpPhase: "medical-restriction", phase: "Rehabilitation",
        comment: "Individual rehabilitation. Review before progression.",
        clearance: { doctor: false, physio: true, performance: false },
        gates: { strength: "pending", gpsLoad: "pending", painResponse: "monitor", wellness: "pass", psychologicalReadiness: "pending" },
        createdAt: "2026-09-01T08:00:00Z",
      }],
    }));
    localStorage.setItem("football-schedule-v1", JSON.stringify({
      selectedYear: 2026, selectedMonthIndex: 8, selectedDate: "2026-09-08", viewMode: "month",
      importVersion: "qa-medical-design",
      events: [{ id: "qa-design-training", date: "2026-09-08", type: "training", title: "Training" }],
    }));
  });
  await page.goto("/?workspace=medical-team");
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector("#loginScreen")?.hidden);
  await page.evaluate(() => {
    document.querySelector("#dashboardModalRoot button[data-dashboard-modal-close]")?.click();
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "medical-team" } }));
  });
  await expect(page.locator(".medical-position-group-head").first()).toBeVisible();
}

async function expectPageFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1470, 820, 390]) {
  test(`Medical clinical design keeps controls, details and percentage colors at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await openMedical(page);
    for (const dark of [false, true]) {
      await page.evaluate(value => document.body.classList.toggle("is-dark-mode", value), dark);
      for (const [index, participation] of percentages.entries()) {
        const selected = page.locator(`[data-medical-quick-recommend="qa-design-${participation}"][data-medical-quick-participation="${participation}"]`);
        await expect(selected).toHaveClass(/is-active/);
        await expect(selected).toHaveCSS("background-color", percentageColors[index]);
      }
      await expectPageFits(page);
      await page.screenshot({ path: testInfo.outputPath(`availability-${dark ? "dark" : "light"}.png`), animations: "disabled" });
    }
    await page.evaluate(() => document.body.classList.remove("is-dark-mode"));

    await page.locator('.medical-roster-row[data-medical-select-player="qa-design-0"] .medical-roster-player-cell').click();
    const dialog = page.locator(".medical-modal-card");
    await expect(dialog).toBeVisible();
    for (const tab of ["availability", "profile", "plan"]) {
      await dialog.locator(`[data-medical-modal-tab="${tab}"]`).click();
      await expect(dialog.locator(`[data-medical-modal-tab="${tab}"]`)).toHaveAttribute("aria-selected", "true");
      const bounds = await dialog.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(-1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(901);
      expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const body = dialog.locator("#medicalModalPanel");
      await body.evaluate(node => { node.scrollTop = 0; });
      expect(await body.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      expect(await dialog.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 8));
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`modal-${tab}.png`), animations: "disabled" });
      const submit = dialog.locator('button[type="submit"]').first();
      if (await submit.count()) {
        // Verify actionability after scrolling settles, without saving test data.
        await submit.click({ trial: true });
      }
    }
    await dialog.locator(".medical-modal-close").click();
    await expect(dialog).toHaveCount(0);

    for (const tab of ["signals", "cases", "programs", "history", "rtp-library", "season"]) {
      await page.locator(`[data-medical-ops-tab="${tab}"]`).click();
      await expect(page.locator("[data-medical-operations-system]")).toBeVisible();
      await expectPageFits(page);
      if (width < 640 && ["signals", "cases", "history"].includes(tab)) {
        const label = page.locator(".medical-ops-table-row > [data-label='Player']").first();
        await expect(label).toBeVisible();
        await expect(label).toHaveCSS("grid-column", "1 / -1");
      }
      await page.screenshot({ path: testInfo.outputPath(`${tab}.png`), animations: "disabled" });
      if (tab === "programs") {
        await page.locator('[data-medical-select-board-plan="qa-design-case"]').click();
        await expect(page.locator('[data-medical-program-view="detail"]')).toBeVisible();
        await expectPageFits(page);
        await page.screenshot({ path: testInfo.outputPath("program-detail.png"), animations: "disabled" });
      }
    }
    await expect(page.locator(".medical-metrics-grid")).toBeVisible();
  });
}
