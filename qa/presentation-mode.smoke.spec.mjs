import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const medicalKey = "football-medical-team-v1";
const presentationKey = "football-dashboard-presentation-mode-v1";

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => {
      const shell = document.getElementById("hubShell");
      const loginScreen = document.getElementById("loginScreen");
      return Boolean(
        window.__footballScienceAppReady &&
          document.body?.dataset.appReady === "true" &&
          shell &&
          !shell.hidden &&
          loginScreen &&
          loginScreen.hidden &&
          !document.body.classList.contains("is-booting")
      );
    },
    null,
    { timeout: 20_000 }
  );
}

async function dismissDashboardModal(page) {
  await page
    .evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      const closeButton = modalRoot?.querySelector(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
      );
      closeButton?.click();
    })
    .catch(() => {});
}

test("Presentation Mode opens from Home and renders the planned training deck", async ({ page }) => {
  const dateValue = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const expectedDateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateValue}T00:00:00`));

  await page.addInitScript(
    ({ dateValue: seededDate, now: seededNow, keys }) => {
      window.localStorage.setItem(
        keys.schedule,
        JSON.stringify({
          selectedDate: seededDate,
          events: [
            {
              id: "qa-presentation-training",
              date: seededDate,
              time: "10:30",
              type: "training",
              title: "Matchday Presentation Training",
            },
          ],
        })
      );
      window.localStorage.setItem(
        keys.periodization,
        JSON.stringify({
          selectedDate: seededDate,
          days: {
            [seededDate]: {
              sessionType: "Training briefing",
              matchDay: "MD-2",
              physicalLoad: "High",
              pitchSize: "2/3 pitch",
              mainFocus: "Build-up and final-third connections",
              matchPhases: ["In Possession"],
              subPhases: ["Build Up", "Final Third"],
              preTrainingVideo: "Press trigger clips",
            },
          },
        })
      );
      window.localStorage.setItem(
        keys.sessionPlanner,
        JSON.stringify({
          selectedDate: seededDate,
          sessions: {
            [seededDate]: {
              id: "qa-presentation-session",
              date: seededDate,
              title: "Matchday Presentation Training",
              theme: "Build-up and final-third connections",
              selectedBlockId: "qa-presentation-block-1",
              blocks: [
                {
                  id: "qa-presentation-block-1",
                  label: "Block 1",
                  title: "Rondo to finish",
                  focus: "- Tempo\n- Third-player support",
                  phase: "In Possession",
                  subPhase: "Build Up",
                  minutes: 30,
                  pitchSize: "2/3 pitch",
                  objective: "- Connect through pressure",
                  organization: "- 7v7 + 3 neutrals",
                  principles: "- Scan early\n- Play forward when open",
                  diagram: "half-pitch",
                  tacticalElements: [],
                  playerBoardPositions: {},
                  playerBoardColors: {
                    "ncc-2026-madison-white": "#22c55e",
                    "ncc-2026-kailen-sheridan": "#f59e0b",
                  },
                  playerBoardCustomPeople: [{ id: "qa-staff-1", name: "Lead Coach", kind: "staff", role: "Staff" }],
                },
              ],
            },
          },
        })
      );
      window.localStorage.setItem(
        keys.medical,
        JSON.stringify({
          __medicalAutoCloseActual: false,
          selectedDate: seededDate,
          selectedPlayerId: "ncc-2026-madison-white",
          players: [],
          records: [
            {
              id: "qa-record-1",
              playerId: "ncc-2026-madison-white",
              date: seededDate,
              status: "full",
              participation: 100,
              actualParticipation: "not-logged",
              shareWithCoach: true,
              createdAt: seededNow,
              updatedAt: seededNow,
            },
            {
              id: "qa-record-2",
              playerId: "ncc-2026-kailen-sheridan",
              date: seededDate,
              status: "unavailable",
              participation: 0,
              actualParticipation: "not-logged",
              shareWithCoach: true,
              createdAt: seededNow,
              updatedAt: seededNow,
            },
          ],
          injuryPlans: [],
        })
      );
      window.localStorage.setItem(
        keys.presentation,
        JSON.stringify({
          schema: "footballscience-presentation-mode-v1",
          version: 1,
          decks: {
            [seededDate]: {
              updatedAt: seededNow,
              infoSlides: [
                {
                  id: "qa-info",
                  title: "Daily Info",
                  body: "- Arrive ready\n- Bring GPS\n- Staff huddle after block 1",
                  fontSize: "large",
                  accentColor: "#38bdf8",
                  textColor: "#f8fafc",
                },
              ],
            },
          },
        })
      );
    },
    {
      dateValue,
      now,
      keys: {
        schedule: scheduleKey,
        periodization: periodizationKey,
        sessionPlanner: sessionPlannerKey,
        medical: medicalKey,
        presentation: presentationKey,
      },
    }
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);

  const card = page.locator("[data-dashboard-presentation-card]");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Presentation Mode");
  await expect(card).not.toContainText("Matchday Presentation Training");
  const homeDayOptions = await card
    .locator("[data-dashboard-presentation-date] option")
    .evaluateAll((options) => options.map((option) => option.textContent?.trim() || ""));
  expect(homeDayOptions).toContain(expectedDateLabel);
  for (const optionText of homeDayOptions) {
    expect(optionText).not.toContain("Matchday Presentation Training");
    expect(optionText).not.toContain("blocks");
    expect(optionText).not.toContain("min");
  }

  await card.locator("[data-dashboard-open-presentation]").click();
  const presentation = page.locator("[data-presentation-mode-shell]");
  await expect(presentation).toBeVisible();
  await expect(presentation).toContainText("Matchday Presentation Training");
  await expect(presentation.locator("[data-presentation-pass-select]")).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-date-input]")).toHaveValue(dateValue);
  await expect(presentation.locator(".presentation-cover-metrics")).toHaveCount(0);
  await expect(presentation.locator(".presentation-footer-nav .presentation-slide-tabs")).toBeVisible();
  const footerNavigationLayout = await presentation.evaluate(() => {
    const footer = document.querySelector(".presentation-footer-nav");
    const tabs = document.querySelector(".presentation-footer-nav .presentation-slide-tabs");
    const pager = document.querySelector(".presentation-footer-pager");
    const progress = document.querySelector(".presentation-progress");
    if (!footer || !tabs || !pager || !progress) return null;
    const footerRect = footer.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    const pagerRect = pager.getBoundingClientRect();
    const progressRect = progress.getBoundingClientRect();
    return {
      tabsInsideFooter: footer.contains(tabs),
      pagerInsideFooter: footer.contains(pager),
      tabsBeforePager: tabsRect.right <= pagerRect.left + 2,
      sameControlBand: Math.abs((tabsRect.top + tabsRect.bottom) / 2 - (progressRect.top + progressRect.bottom) / 2) <= 16,
      compactFooter: footerRect.height <= 64,
    };
  });
  expect(footerNavigationLayout).toMatchObject({
    tabsInsideFooter: true,
    pagerInsideFooter: true,
    tabsBeforePager: true,
    sameControlBand: true,
    compactFooter: true,
  });

  await page.keyboard.press("ArrowRight");
  await expect(presentation.locator(".presentation-info-title")).toHaveValue("Daily Info");
  await expect(presentation.locator(".presentation-info-rule")).toHaveCount(1);
  const infoTitleAboveRule = await presentation.evaluate(() => {
    const title = document.querySelector(".presentation-info-title");
    const rule = document.querySelector(".presentation-info-rule");
    if (!title || !rule) return false;
    return title.getBoundingClientRect().bottom <= rule.getBoundingClientRect().top;
  });
  expect(infoTitleAboveRule).toBe(true);
  await expect(presentation).toContainText("Arrive ready");
  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Training Overview");
  await expect(presentation.locator(".presentation-slide-overview .presentation-section-heading h2")).toHaveCount(0);
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-gauge")).toHaveCount(1);
  await expect(presentation.locator(".presentation-overview-metric.is-load .presentation-load-copy strong")).toHaveText("High");
  await expect(presentation.locator(".presentation-medical-overview")).toBeVisible();
  await expect(presentation.locator(".presentation-medical-player").first()).toBeVisible();
  await expect(presentation.locator(".presentation-medical-player > span:last-child", { hasText: /^100%$/ }).first()).toBeVisible();
  await expect(presentation.locator(".presentation-medical-player > span:last-child", { hasText: /^0%$/ }).first()).toBeVisible();
  const overviewLoadLayout = await presentation.evaluate(() => {
    const load = document.querySelector(".presentation-overview-metric.is-load");
    const phase = document.querySelector(".presentation-overview-metric.is-phase");
    const pitch = document.querySelector(".presentation-overview-metric.is-pitch");
    const gauge = document.querySelector(".presentation-load-gauge");
    const needle = document.querySelector(".presentation-load-needle");
    if (!load || !phase || !pitch || !gauge || !needle) return null;
    const loadRect = load.getBoundingClientRect();
    const phaseRect = phase.getBoundingClientRect();
    const pitchRect = pitch.getBoundingClientRect();
    const loadStyle = getComputedStyle(load);
    return {
      leftOfPhase: loadRect.right <= phaseRect.left,
      leftOfPitch: loadRect.right <= pitchRect.left,
      spansTopRows: loadRect.bottom >= pitchRect.bottom - 2,
      loadColor: loadStyle.getPropertyValue("--presentation-load-color").trim(),
      loadAngle: loadStyle.getPropertyValue("--presentation-load-angle").trim(),
    };
  });
  expect(overviewLoadLayout).toMatchObject({
    leftOfPhase: true,
    leftOfPitch: true,
    spansTopRows: true,
    loadColor: "#d92d3f",
    loadAngle: "68deg",
  });
  const overviewMedicalLayout = await presentation.evaluate(() => {
    const video = document.querySelector(".presentation-overview-metric.is-video");
    const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
    const medical = document.querySelector(".presentation-medical-overview");
    const players = Array.from(document.querySelectorAll(".presentation-medical-player"));
    if (!video || !matchDay || !medical || !players.length) return null;
    const videoRect = video.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const medicalRect = medical.getBoundingClientRect();
    const firstPlayerRect = players[0].getBoundingClientRect();
    return {
      rightOfVideo: medicalRect.left >= videoRect.right - 2,
      rightOfMatchDay: medicalRect.left >= matchRect.right - 2,
      spansOverviewContent: medicalRect.bottom >= firstPlayerRect.bottom,
      compactRows: players.every((player) => {
        const rect = player.getBoundingClientRect();
        return rect.height <= 28;
      }),
      allRowsFit: players.every((player) => {
        const rect = player.getBoundingClientRect();
        return rect.top >= medicalRect.top - 1 && rect.bottom <= medicalRect.bottom + 1;
      }),
    };
  });
  expect(overviewMedicalLayout).toMatchObject({
    rightOfVideo: true,
    rightOfMatchDay: true,
    spansOverviewContent: true,
    compactRows: true,
    allRowsFit: true,
  });
  const overviewBlocksLayout = await presentation.evaluate(() => {
    const pitch = document.querySelector(".presentation-overview-metric.is-pitch");
    const matchDay = document.querySelector(".presentation-overview-metric.is-match-day");
    const blocks = document.querySelector(".presentation-block-flow");
    const articles = Array.from(document.querySelectorAll(".presentation-block-flow article"));
    if (!pitch || !matchDay || !blocks || articles.length === 0) return null;
    const pitchRect = pitch.getBoundingClientRect();
    const matchRect = matchDay.getBoundingClientRect();
    const blocksRect = blocks.getBoundingClientRect();
    const articleRects = articles.map((article) => article.getBoundingClientRect());
    const combinedLeft = Math.min(pitchRect.left, matchRect.left);
    const combinedRight = Math.max(pitchRect.right, matchRect.right);
    return {
      sameLeft: Math.abs(blocksRect.left - combinedLeft) <= 2,
      sameRight: Math.abs(blocksRect.right - combinedRight) <= 2,
      underPitchAndMatch: blocksRect.top >= Math.max(pitchRect.bottom, matchRect.bottom) - 2,
      rowsAreWide: articleRects.every((rect) => rect.width > rect.height * 2.2),
    };
  });
  expect(overviewBlocksLayout).toMatchObject({
    sameLeft: true,
    sameRight: true,
    underPitchAndMatch: true,
    rowsAreWide: true,
  });
  await expect(presentation).toContainText("High");

  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Rondo to finish");
  await expect(presentation).not.toContainText("Focus");
  await expect(presentation).not.toContainText("5v2");
  await expect(presentation).not.toContainText("In this block");
  await expect(presentation).toContainText("Not in this block");
  await expect(presentation).not.toContainText("Madison White");
  await expect(presentation).toContainText("Kailen Sheridan");
  await expect(presentation).not.toContainText("Lead Coach");
  const blockVisualLayout = await presentation.evaluate(() => {
    const visual = document.querySelector(".presentation-block-visual");
    const board = document.querySelector(".presentation-block-visual .session-visual-board");
    const pitch = document.querySelector(".presentation-block-visual .session-pitch-diagram");
    if (!visual || !board || !pitch) return null;
    const visualRect = visual.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    return {
      boardIsPortrait: boardRect.height > boardRect.width * 1.35,
      boardFitsVisual:
        boardRect.top >= visualRect.top - 1 &&
        boardRect.left >= visualRect.left - 1 &&
        boardRect.right <= visualRect.right + 1 &&
        boardRect.bottom <= visualRect.bottom + 1,
      noLandscapeBoardClass:
        !board.classList.contains("session-visual-board-print-landscape") &&
        !board.classList.contains("session-visual-board-landscape"),
      noLandscapePitchClass: !pitch.classList.contains("session-pitch-diagram-landscape"),
    };
  });
  expect(blockVisualLayout).toMatchObject({
    boardIsPortrait: true,
    boardFitsVisual: true,
    noLandscapeBoardClass: true,
    noLandscapePitchClass: true,
  });
});
