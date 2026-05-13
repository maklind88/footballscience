import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const medicalKey = "football-medical-team-v1";
const playerProfilesKey = "football-player-profiles-v1";
const dashboardChatKey = "football-dashboard-chat-v1";
const workspaceHubKey = "football-workspace-hub-v3";
const workspaceLastActiveKey = "football-workspace-last-active-local-v1";

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isOpen = await page.evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      return Boolean(modalRoot && !modalRoot.hidden);
    });

    if (isOpen) {
      const closeButton = page
        .locator(
          "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
        )
        .first();

      if ((await closeButton.count()) > 0) {
        await closeButton.click({ force: true });
      }

      await expect
        .poll(
          () =>
            page
              .locator("#dashboardModalRoot")
              .evaluate((node) => node.hidden)
              .catch(() => true),
          { timeout: 5_000 }
        )
        .toBe(true);
    }

    await page.waitForTimeout(150);
  }
}

async function bootApp(page, options = {}) {
  const clientConfigRequests = [];
  const pageErrors = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/client-config")) {
      clientConfigRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    await dialog.dismiss().catch(() => {});
  });

  await page.goto(options.path || "/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await page.waitForTimeout(450);
  await dismissDashboardModal(page);

  return {
    clientConfigRequests,
    pageErrors,
  };
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    await page.evaluate((targetWorkspaceId) => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
    }, workspaceId);
  }
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function expectStorageContains(page, key, text) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ storageKey, expectedText }) => window.localStorage.getItem(storageKey)?.includes(expectedText) ?? false,
          { storageKey: key, expectedText: text }
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
}

test("localhost boots through dev auth and keeps Supabase config off the local path", async ({ page }) => {
  const boot = await bootApp(page);

  expect(boot.clientConfigRequests).toEqual([]);
  expect(boot.pageErrors).toEqual([]);
  await expect(page.locator("#workspaceTitle")).toContainText("Football Science");

  await page.locator("#profileMenuButton").click();
  await expect(page.locator("#dataSafetyStatus")).toBeVisible();
  await expect(page.locator("#dataSafetyStatus")).toContainText(/sync|autosave|saved|cache/i);
  await expect(page.locator("#dataSafetyExportButton")).toBeVisible();
  await expect(page.locator("#dataSafetyImportButton")).toBeVisible();
});

test("Workspace hub ignores stale shared active workspace on boot", async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          activeWorkspaceId: "game-simulator",
          workspaceAccess: {
            home: { view: ["admin", "coach"], edit: ["admin", "coach"] },
            "game-simulator": { view: ["admin", "coach"], edit: ["admin", "coach"] },
          },
        })
      );
    },
    { key: workspaceHubKey }
  );

  await bootApp(page);

  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "home");
  const storedHubState = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), workspaceHubKey));
  expect(storedHubState.activeWorkspaceId).toBeUndefined();
});

test("Refresh keeps the active workspace without flashing the login screen", async ({ page }) => {
  await bootApp(page);
  await openWorkspace(page, "schedule");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), workspaceLastActiveKey), { timeout: 5_000 })
    .toBe("schedule");

  await page.addInitScript(() => {
    window.__qaLoginFlashDuringBoot = false;
    const markLoginVisibility = () => {
      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen && !loginScreen.hidden) {
        window.__qaLoginFlashDuringBoot = true;
      }
    };
    const observer = new MutationObserver(markLoginVisibility);
    const startObserver = () => {
      markLoginVisibility();
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "hidden", "style"],
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    }
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__qaLoginFlashDuringBoot)).toBe(false);
});

test("Profile updates sync to the account menu and local dev keeps Mak signed in", async ({ page }) => {
  const stamp = Date.now();
  await bootApp(page);

  await page.locator("#profileMenuButton").click();
  await page.locator('#profileMenu [data-open-workspace="my-profile"]').click();
  await expect(page.locator('[data-workspace-view="profile"].is-active')).toBeVisible();

  await page.locator('#profileForm input[name="firstName"]').fill("QA");
  await page.locator('#profileForm input[name="lastName"]').fill(`Account ${stamp}`);
  await page.locator('#profileForm input[name="title"]').fill("Account Tester");
  await page.locator('#profileForm input[name="department"]').fill("Football Ops");
  await page.locator('#profileForm input[name="team"]').fill(`Central Team ${stamp}`);
  await page.locator('#profileForm button[type="submit"]').click();

  await expect(page.locator("#profileWorkspace")).toContainText("Saved.");
  await expect(page.locator("#profileWorkspace .profile-title")).toContainText(`QA Account ${stamp}`);
  await expect(page.locator("#profileMenuName")).toContainText(`QA Account ${stamp}`);
  await expect(page.locator("#profileMenuClub")).toContainText(`Central Team ${stamp}`);

  await page.locator("#profileMenuButton").click();
  await page.locator("#logoutButton").click();
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await expect(page.locator("#profileMenuName")).toContainText("Mak Lind");
});

test("Chat launcher shows unread chat until the thread is opened", async ({ page }) => {
  const messageId = `qa-chat-unread-${Date.now()}`;
  await bootApp(page);

  await page.evaluate(
    ({ key, id }) => {
      const existingMessages = JSON.parse(window.localStorage.getItem(key) || "[]");
      const nextMessages = [
        ...existingMessages.filter((message) => message.id !== id),
        {
          id,
          userId: "qa-colleague",
          threadId: "team",
          text: "QA unread chat notification",
          createdAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          readBy: ["qa-colleague"],
          mentionedUserIds: [],
          author: {
            id: "qa-colleague",
            firstName: "QA",
            lastName: "Colleague",
            role: "coach",
            status: "active",
          },
        },
      ];
      window.localStorage.setItem(key, JSON.stringify(nextMessages));
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(nextMessages) }));
    },
    { key: dashboardChatKey, id: messageId }
  );

  await expect(page.locator(".dashboard-chat-launcher .dashboard-chat-header-badge")).toContainText("1");
  await expect(page.locator('.top-icon-menu-item[data-open-workspace="home"].has-notification')).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ key, id }) => {
            const message = JSON.parse(window.localStorage.getItem(key) || "[]").find((entry) => entry.id === id);
            return Boolean(message?.readBy?.includes("dev-user-mak"));
          },
          { key: dashboardChatKey, id: messageId }
        ),
      { timeout: 3_000 }
    )
    .toBe(false);

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ key, id }) => {
            const message = JSON.parse(window.localStorage.getItem(key) || "[]").find((entry) => entry.id === id);
            return Boolean(message?.readBy?.includes("dev-user-mak"));
          },
          { key: dashboardChatKey, id: messageId }
        ),
      { timeout: 5_000 }
    )
    .toBe(true);
  await expect(page.locator(".dashboard-chat-launcher .dashboard-chat-header-badge")).toHaveCount(0);
  await expect(page.locator('.top-icon-menu-item[data-open-workspace="home"].has-notification')).toHaveCount(0);
});

test("Schedule edits persist after refresh", async ({ page }) => {
  const title = `QA Schedule ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "schedule");

  await page.locator("#scheduleTodayButton").click();
  await page.locator("#scheduleEditDayButton").click();
  await expect(page.locator("#scheduleEventForm")).toBeVisible();
  await page.locator("#scheduleEventTitle").fill(title);
  await page.locator("#scheduleEventNote").fill("QA smoke test event");
  await page.locator("#scheduleEventSubmitButton").click();
  await expect(page.locator("#scheduleEventList")).toContainText(title);
  await expectStorageContains(page, scheduleKey, title);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await openWorkspace(page, "schedule");
  await expectStorageContains(page, scheduleKey, title);
});

test("Schedule Today anchors overview to the real current date", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 0,
        selectedDate: "2026-01-15",
        viewMode: "overview",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [],
      })
    );
  }, { key: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");
  await page.locator("#scheduleTodayButton").click();

  await expect(page.locator("#scheduleMonthTitle")).toHaveText("May - October");
  await expect(page.locator("#scheduleSelectedDateLabel")).toHaveText("Saturday, 9 May 2026");
  await expect(page.locator(".schedule-overview-month h3").first()).toHaveText("May");
  await expect(page.locator('[data-schedule-date="2026-05-09"]')).toHaveClass(/is-selected/);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          selectedDate: state.selectedDate,
          selectedMonthIndex: state.selectedMonthIndex,
        };
      }, scheduleKey)
    )
    .toEqual({
      selectedDate: "2026-05-09",
      selectedMonthIndex: 4,
    });
});

test("Schedule week view shows daily operations and opens linked session", async ({ page }) => {
  await page.addInitScript(({ scheduleKey, sessionPlannerKey, periodizationKey }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        viewMode: "month",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          {
            id: "qa-week-training",
            date: "2026-05-09",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "QA week operations",
          },
          {
            id: "qa-week-training-duplicate",
            date: "2026-05-09",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "Same imported training with a slightly different note",
          },
        ],
      })
    );
    window.localStorage.setItem(
      sessionPlannerKey,
      JSON.stringify({
        selectedDate: "2026-05-09",
        sessions: {
          "2026-05-09": {
            id: "session-2026-05-09",
            date: "2026-05-09",
            title: "Training Session",
            theme: "QA operations",
            selectedBlockId: "warm-up",
            blocks: [
              {
                id: "warm-up",
                label: "Warm Up",
                title: "Activation",
                focus: "Ready the group",
                minutes: 15,
                intensity: 2,
                pitchSize: "20m x 20m",
                diagram: "build-up",
              },
            ],
          },
        },
      })
    );
    window.localStorage.setItem(
      periodizationKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-09": {
            seasonPhase: "Competition",
            daySchedule: "Training",
            matchDay: "MD-1",
            matchPhases: ["In Possession"],
            subPhases: ["Build-up"],
          },
        },
      })
    );
  }, { scheduleKey, sessionPlannerKey, periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");
  await page.locator("#scheduleWeekViewButton").click();

  await expect(page.locator("#scheduleWeekGrid")).toBeVisible();
  await expect(page.locator(".schedule-week-day.is-selected")).toContainText("9");
  await expect(page.locator(".schedule-week-day.is-selected .schedule-week-event-summary")).toHaveText("1 plan");
  const trainingCard = page.locator("#scheduleEventList .schedule-event-card");
  await expect(trainingCard).toHaveCount(1);
  await expect(trainingCard).toContainText("Training (1 block / 15 min)");
  await expect(trainingCard).toContainText("MD-1");
  await expect(trainingCard).toContainText("In Possession / Build-up");
  await expect(page.locator("#scheduleDayInsights .schedule-day-summary-grid")).toHaveCount(0);
  await expect(page.locator("#scheduleDayInsights")).not.toContainText("1 block / 15 min");
  await expect(page.locator("#scheduleDayInsights")).not.toContainText("Training Session");

  await page.locator('[data-schedule-open-session-date="2026-05-09"]').click();

  await expect(page.locator('[data-workspace-view="session-planner"].is-active')).toBeVisible();
  await expect(page.locator("#sessionPlannerWorkspace")).toContainText("Training Session");
});

test("Schedule keeps the board simple while the selected day shows all plans", async ({ page }) => {
  await page.addInitScript(({ scheduleKey, sessionPlannerKey, periodizationKey }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-10T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-10",
        viewMode: "week",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          {
            id: "qa-layer-training",
            date: "2026-05-10",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "Layer QA",
          },
          {
            id: "qa-layer-match",
            date: "2026-05-10",
            time: "10:00",
            type: "match",
            title: "QA Match",
            note: "Same slot",
          },
          {
            id: "qa-layer-off",
            date: "2026-05-10",
            type: "off",
            title: "Off",
            note: "Conflict seed",
          },
        ],
      })
    );
    window.localStorage.setItem(
      sessionPlannerKey,
      JSON.stringify({
        selectedDate: "2026-05-10",
        sessions: {},
      })
    );
    window.localStorage.setItem(
      periodizationKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-10",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-10": {
            daySchedule: "Off",
          },
        },
      })
    );
  }, { scheduleKey, sessionPlannerKey, periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");

  await expect(page.locator("#scheduleWeekGrid")).toBeVisible();
  await expect(page.locator('[data-schedule-layer]')).toHaveCount(0);
  await expect(page.locator(".schedule-week-day.is-selected .schedule-week-event-summary")).toHaveText("3 plans");
  await expect(page.locator(".schedule-week-day.is-selected")).not.toContainText("alert");
  await expect(page.locator("#scheduleEventList")).toContainText("Training");
  await expect(page.locator("#scheduleEventList")).toContainText("QA Match");
  await expect(page.locator("#scheduleEventList")).toContainText("Off");

  await page.locator("#scheduleMonthViewButton").click();
  const selectedDay = page.locator(".schedule-day-button.is-selected");
  await expect(selectedDay.locator(".schedule-event-pill")).toHaveCount(1);
  await expect(selectedDay.locator(".schedule-event-pill")).toContainText("QA Match");
  await expect(selectedDay.locator(".schedule-more-pill")).toHaveText("+2");
});

test("Periodization Today opens the real current date", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 0,
        selectedDate: "2026-01-15",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-04": {
            seasonPhase: "Competition",
            daySchedule: "Recovery",
            matchDay: "MD+1",
            physicalLoad: "Low",
            pitchSize: "SSG",
            matchPhases: ["Defensive Transition"],
            subPhases: ["Immediate reaction after loss"],
          },
          "2026-05-05": {
            seasonPhase: "Competition",
            daySchedule: "Main tactical day",
            matchDay: "MD-4",
            physicalLoad: "Medium-High",
            pitchSize: "Half pitch",
            matchPhases: ["In Possession"],
            subPhases: ["Build-up"],
          },
          "2026-05-06": {
            seasonPhase: "Competition",
            daySchedule: "Load day",
            matchDay: "MD-3",
            physicalLoad: "High",
            pitchSize: "BSG",
            matchPhases: ["Transition"],
            subPhases: ["Counter-press"],
          },
          "2026-05-09": {
            seasonPhase: "Competition",
            daySchedule: "Matchday",
            matchDay: "MD",
            physicalLoad: "Match Load",
            pitchSize: "Full pitch",
            matchPhases: ["Full match"],
            subPhases: ["All game states"],
            sessionNotes: "QA today anchor",
          },
        },
      })
    );
  }, { key: periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "periodization");
  await page.locator("#periodizationTodayButton").click();

  await expect(page.locator("#periodizationHeading")).toHaveText("May 2026");
  const selectedCard = page.locator('[data-periodization-date="2026-05-09"]');
  await expect(selectedCard).toHaveClass(/is-selected/);
  await expect(selectedCard.locator(".periodization-day-md")).toHaveText("MD");
  const microcycle = page.locator('[data-periodization-week-start="2026-05-04"]');
  await expect(microcycle.locator(".periodization-microcycle-load-rail")).toBeVisible();
  await expect(microcycle.locator(".periodization-microcycle-load-day")).toHaveCount(7);
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await expect(page.locator("[data-periodization-overlay] h2").first()).toHaveText("Saturday, May 9");
  await expect(page.locator("[data-periodization-overlay] .periodization-view-microcycle")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          selectedDate: state.selectedDate,
          selectedMonthIndex: state.selectedMonthIndex,
          note: state.days?.["2026-05-09"]?.sessionNotes || "",
        };
      }, periodizationKey)
    )
    .toEqual({
      selectedDate: "2026-05-09",
      selectedMonthIndex: 4,
      note: "QA today anchor",
    });
});

test("Periodization day notes persist after refresh", async ({ page }) => {
  const note = `QA Periodization ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "periodization");

  await page.locator("#periodizationTodayButton").click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const notesField = page.locator('textarea[data-periodization-field="sessionNotes"]').first();
  await expect(notesField).toBeVisible();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, periodizationKey, note);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const selectedDate = state.selectedDate || "";
        return Boolean(state.days?.[selectedDate]?.fieldUpdatedAt?.sessionNotes);
      }, periodizationKey)
    )
    .toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, periodizationKey, note);
});

test("Session Planner block edits persist after refresh", async ({ page }) => {
  const value = `QA Session ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "session-planner");

  let field = page.locator('[data-session-field="objective"]:visible').first();
  if ((await field.count()) === 0) {
    field = page.locator("[data-session-field]:visible").first();
  }
  await expect(field).toBeVisible();
  await field.fill(value);
  await field.blur();
  await expectStorageContains(page, sessionPlannerKey, value);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, sessionPlannerKey, value);
});

test("Medical recommendation edits persist after refresh", async ({ page }) => {
  const comment = `QA Medical ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "medical-team");

  await page.locator("[data-medical-select-player]:visible").first().click();
  const form = page.locator("#medicalRecommendationForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('textarea[name="comment"]').fill(comment);
  await form.locator('button[type="submit"]').click();
  await expectStorageContains(page, medicalKey, comment);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, medicalKey, comment);
});

test("Squad add creates a Medical roster slot and Session Planner placement", async ({ page }) => {
  const playerName = `QA Squad Placement ${Date.now()}`;
  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    window.localStorage.setItem(
      "football-platform-structure-v1",
      JSON.stringify({
        version: 1,
        activeClubId: "club-riverside",
        activeTeamId: "team-riverside-first",
        clubs: [{ id: "club-riverside", name: "Riverside Club", shortName: "RC", status: "active" }],
        teams: [
          {
            id: "team-riverside-first",
            clubId: "club-riverside",
            name: "Riverside FC",
            shortName: "RFC",
            level: "First Team",
            season: "2026",
            status: "active",
          },
        ],
        memberships: [],
      })
    );
    const nextUser = { ...currentUser, team: "Football Science Live", teamName: "Football Science Live", teamId: "" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });
  await openWorkspace(page, "player-profiles");
  await expect(page.locator(".squad-command-title h1")).toHaveText("Riverside FC");
  await expect(page.locator(".squad-player-row").first()).toContainText("Goalkeeper");

  await page.locator("[data-player-profile-new-open]").click();
  const form = page.locator("#playerProfileNewPlayerForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(playerName);
  await form.locator('input[name="number"]').fill("88");
  await form.locator('input[name="position"]').fill("Midfielder");
  await form.locator('select[name="primaryRole"]').selectOption("8");
  await form.locator('button[type="submit"]').click();

  await expectStorageContains(page, playerProfilesKey, playerName);
  await expectStorageContains(page, medicalKey, playerName);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? {
                idMatchesProfile: Boolean(player.id),
                countsInSquad: player.countsInSquad,
              }
            : null;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toMatchObject({
      idMatchesProfile: true,
      countsInSquad: true,
    });

  await openWorkspace(page, "session-planner");
  await expect(
    page.locator('[data-workspace-view="session-planner"].is-active .session-player-board-warning-row.is-unset small')
  ).toContainText(playerName);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? Boolean((state.records || []).some((record) => record.playerId === player.id))
            : true;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toBe(false);
});

test("Academy Squad add is available for session planning without Medical clearance", async ({ page }) => {
  const playerName = `QA Academy Planner ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  await page.locator("[data-player-profile-new-open]").click();
  const form = page.locator("#playerProfileNewPlayerForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(playerName);
  await form.locator('input[name="number"]').fill("89");
  await form.locator('input[name="position"]').fill("Forward");
  await form.locator('select[name="primaryRole"]').selectOption("ST");
  await form.locator('select[name="rosterType"]').selectOption("academy");
  await form.locator('button[type="submit"]').click();

  await expectStorageContains(page, playerProfilesKey, playerName);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                hasMedicalRecord: Boolean((state.records || []).some((record) => record.playerId === player.id)),
              }
            : null;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toMatchObject({
      countsInSquad: false,
      rosterType: "academy",
      hasMedicalRecord: false,
    });

  await openWorkspace(page, "session-planner");
  await page.locator("[data-session-open-player-board]").click();
  await expect(
    page.locator(`.session-player-board-token[aria-label^="${playerName}, 100% available"]`)
  ).toBeVisible();
});

test("Squad profile modal autosaves edits and keeps its size across tabs", async ({ page }) => {
  const coachNote = `QA autosave note ${Date.now()}`;
  await bootApp(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "player-profiles" } }));
  });
  await dismissDashboardModal(page);
  await expect(page.locator('[data-workspace-view="player-profiles"].is-active')).toBeVisible();

  await page.locator("[data-player-profile-select]").first().click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await expect(modal.locator('button[type="submit"]')).toHaveCount(0);
  await expect(modal.locator("[data-player-profile-remove]")).toBeVisible();

  const overviewHeight = Math.round((await modal.boundingBox()).height);
  await modal.locator('[data-player-profile-tab="notes"]').click();
  await expect.poll(async () => Math.round((await modal.boundingBox()).height), { timeout: 5_000 }).toBe(overviewHeight);

  const playerId = await modal.locator('input[name="playerId"]').inputValue();
  await modal.locator('textarea[name="coachNotes"]').fill(coachNote);
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ key, id }) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
            return player?.coachNotes || "";
          },
          { key: playerProfilesKey, id: playerId }
        ),
      { timeout: 8_000 }
    )
    .toBe(coachNote);

  await modal.locator("[data-player-profile-modal-close]").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, playerProfilesKey, coachNote);
});

test("Squad profile remove is hidden for coach editors", async ({ page }) => {
  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const coachUser = { ...currentUser, id: "qa-squad-coach-editor", email: "qa-squad-coach-editor@footballscience.local", firstName: "QA", lastName: "Coach", username: "qa-squad-coach-editor", role: "coach", title: "Coach" };
    store.writeUsers([coachUser, ...store.getUsers().filter((user) => user.id !== coachUser.id)]);
    store.setCurrentUser(coachUser.id);
  });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "player-profiles" } }));
  });
  await dismissDashboardModal(page);
  await expect(page.locator('[data-workspace-view="player-profiles"].is-active')).toBeVisible();

  await page.locator("[data-player-profile-select]").first().click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="position"]')).toBeEnabled();
  await expect(modal.locator('button[type="submit"]')).toHaveCount(0);
  await expect(modal.locator("[data-player-profile-remove]")).toHaveCount(0);
});
