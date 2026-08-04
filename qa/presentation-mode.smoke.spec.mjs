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
  const presentationDayOptions = await presentation
    .locator("[data-presentation-pass-select] option")
    .evaluateAll((options) => options.map((option) => option.textContent?.trim() || ""));
  expect(presentationDayOptions).toContain(expectedDateLabel);
  for (const optionText of presentationDayOptions) {
    expect(optionText).not.toContain("Matchday Presentation Training");
    expect(optionText).not.toContain("blocks");
    expect(optionText).not.toContain("min");
  }

  await page.keyboard.press("ArrowRight");
  await expect(presentation.locator(".presentation-info-title")).toHaveValue("Daily Info");
  await expect(presentation).toContainText("Arrive ready");
  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Training Overview");
  await expect(presentation).toContainText("High");

  await page.keyboard.press("ArrowRight");
  await expect(presentation).toContainText("Rondo to finish");
  await expect(presentation).toContainText("Madison White");
  await expect(presentation).toContainText("Kailen Sheridan");
  await expect(presentation).toContainText("Lead Coach");
});
