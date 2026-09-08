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
        rtpLibraryProfileId: "acl-reconstruction-rtp", rtpLibraryProfileName: "ACL Reconstruction RTP",
        rtpProgramGateCriteria: ["Review strength response"],
        rtpProgramNextSteps: ["Review planned loading"],
        rtpProgramExercises: ["Controlled strength exercise"],
        rtpProgramHoldRules: ["Review unexpected pain response"],
        medicalBoard: {
          pitchMode: "full-wide",
          elements: [{ id: "qa-zone", type: "zone", x: 20, y: 20, x2: 45, y2: 50, color: "#dc2626" }],
          exercises: [{ id: "qa-exercise", title: "Controlled strength exercise", phase: "Rehab", dose: "3 x 8", focusArea: "knee", detail: "Clinical review before progression." }],
        },
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

async function expectDialogFits(page, dialog) {
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 8));
  })).toBe(true);
  // Exercise both ends of the tab loop, not only initial focus.
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  const focusable = dialog.locator('button:visible, input:visible, select:visible, textarea:visible, a[href]:visible, summary:visible').filter({ visible: true });
  const enabled = await focusable.evaluateAll(nodes => nodes.filter(node => !node.disabled && node.tabIndex >= 0).length);
  for (let index = 0; index <= enabled; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
}

for (const width of [1470, 820, 390, 320]) {
  test(`Medical library and tool dialogs remain usable at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 700 });
    await openMedical(page);
    await page.locator('[data-medical-ops-tab="rtp-library"]').click();
    const guideTrigger = page.locator('[data-medical-open-rtp-profile="hamstring-strain"]').first();
    await guideTrigger.click();
    const guide = page.locator("#medical-rtp-profile-dialog");
    await expectDialogFits(page, guide);
    for (const group of await guide.locator("[data-medical-rtp-guide-group]").evaluateAll(nodes => nodes.map(node => node.dataset.medicalRtpGuideGroup))) {
      await guide.locator(`[data-medical-rtp-guide-group="${group}"]`).click();
      const panel = guide.locator(`[data-medical-rtp-guide-group-panel="${group}"]`);
      await expect(panel).toBeVisible();
      expect(await guide.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`guide-${group}.png`), animations: "disabled" });
    }
    await page.evaluate(() => document.body.classList.add("is-dark-mode"));
    await page.screenshot({ path: testInfo.outputPath("guide-dark.png"), animations: "disabled" });
    await page.evaluate(() => document.body.classList.remove("is-dark-mode"));
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect(guideTrigger).toBeFocused();
    await page.locator("[data-medical-open-rtp-guide-draft]").click();
    const template = page.locator("#medical-rtp-guide-draft-dialog");
    await expectDialogFits(page, template);
    await page.screenshot({ path: testInfo.outputPath("guide-template.png"), animations: "disabled" });
    await template.locator("button[data-medical-close-rtp-guide-draft]").click();

    await page.locator('[data-medical-ops-tab="programs"]').click();
    await page.locator('[data-medical-select-board-plan="qa-design-case"]').click();
    await page.locator("[data-medical-rtp-exercise-open]").click();
    const bank = page.locator(".medical-rtp-exercise-overlay-panel");
    await expectDialogFits(page, bank);
    await expect(bank.locator(".medical-rtp-exercise-catalog-card").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("exercise-bank.png"), animations: "disabled" });
    await bank.locator("[data-medical-rtp-exercise-close]").click();
    await page.locator('[data-medical-board-edit-button="qa-design-case"]').click();
    const board = page.locator(".medical-board-editor-modal");
    await expectDialogFits(page, board);
    await expect(board.locator(".medical-board-editor-pitch")).toBeVisible();
    await expect(board.locator("rect.medical-board-editor-shape-dashed-zone")).toHaveCount(1);
    await expect(board.getByText("Controlled strength exercise", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("field-board.png"), animations: "disabled" });
    await board.locator("[data-medical-close-board-editor]").click();
    await expect(board).toBeHidden();
    await expectPageFits(page);
  });
}

async function expectPageFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1470, 820, 390, 320]) {
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
      await page.evaluate(() => document.body.classList.add("is-dark-mode"));
      await expectPageFits(page);
      await page.screenshot({ path: testInfo.outputPath(`${tab}-dark.png`), animations: "disabled" });
      await page.evaluate(() => document.body.classList.remove("is-dark-mode"));
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

for (const width of [1470, 390]) {
  test(`Medical expanded plan and confirmation keep drafts and focus at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 700 });
    await openMedical(page);
    await page.locator('.medical-roster-row[data-medical-select-player="qa-design-0"] .medical-roster-player-cell').click();
    const dialog = page.locator(".medical-modal-card");
    await dialog.locator('[data-medical-modal-tab="plan"]').click();
    const form = dialog.locator("#medicalInjuryPlanForm");
    await form.locator('[name="injuryType"]').fill("Unsaved clinical draft");
    await form.locator('[name="comment"]').fill("Keep this text while switching tabs.");
    const program = form.locator(".medical-plan-program-section");
    if (await program.getAttribute("open") === null) await program.locator(":scope > summary").click();
    await form.locator(".medical-plan-program-content").scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("expanded-plan.png"), animations: "disabled" });
    await dialog.locator('[data-medical-modal-tab="profile"]').click();
    const archive = dialog.locator('[data-medical-delete-record="qa-design-rec-0"]');
    await archive.click();
    const confirmation = page.locator(".platform-confirm-dialog");
    await expect(page.locator(".platform-confirm-layer")).toHaveCSS("position", "fixed");
    await expectDialogFits(page, confirmation);
    await page.screenshot({ path: testInfo.outputPath("archive-confirmation.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeHidden();
    await expect(archive).toBeFocused();
    await dialog.locator('[data-medical-modal-tab="plan"]').click();
    await expect(form.locator('[name="injuryType"]')).toHaveValue("Unsaved clinical draft");
    await expect(form.locator('[name="comment"]')).toHaveValue("Keep this text while switching tabs.");
    await page.evaluate(() => document.body.classList.add("is-dark-mode"));
    await page.screenshot({ path: testInfo.outputPath("plan-dark.png"), animations: "disabled" });
    await expectDialogFits(page, dialog);
    await dialog.locator(".medical-modal-close").click();
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem("football-medical-team-v1")).records);
    expect(records.find(record => record.id === "qa-design-rec-0").archivedAt).toBeFalsy();
  });
}
