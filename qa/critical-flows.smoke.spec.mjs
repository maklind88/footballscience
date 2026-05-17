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

test("Periodization edit overlay keeps scroll position while saving fields", async ({ page }) => {
  const note = `QA Periodization Scroll ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "periodization");

  await page.locator("#periodizationTodayButton").click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const panel = page.locator("[data-periodization-overlay] .periodization-day-panel").first();
  await expect(panel).toBeVisible();
  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => panel.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(120);

  const notesField = page.locator('textarea[data-periodization-field="sessionNotes"]').first();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, periodizationKey, note);
  await expect.poll(() => panel.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(120);
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
  await page.addInitScript(({ storageKey }) => {
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...current,
        selectedDate: "2026-05-16",
      })
    );
  }, { storageKey: medicalKey });
  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await expect(page.locator(".medical-hero h1")).toHaveText("North Carolina Courage");
  await expect(page.locator(".medical-hero-meta")).toHaveCount(0);

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

test("Medical metrics use current-month and trailing 7-day averages", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    const fixedNow = new Date("2026-05-15T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-14",
        selectedPlayerId: "qa-player",
        rosterVersion: "qa-medical-average-v1",
        players: [{ id: "qa-player", name: "QA Player", position: "Forward", rosterOrder: 1 }],
        records: [
          { id: "month-start", playerId: "qa-player", date: "2026-05-01", participation: 10, createdAt: "2026-05-01T08:00:00.000Z" },
          { id: "trailing-start", playerId: "qa-player", date: "2026-05-08", participation: 25, createdAt: "2026-05-08T08:00:00.000Z" },
          { id: "selected-day", playerId: "qa-player", date: "2026-05-14", participation: 50, createdAt: "2026-05-14T08:00:00.000Z" },
          { id: "today", playerId: "qa-player", date: "2026-05-15", participation: 75, createdAt: "2026-05-15T08:00:00.000Z" },
          { id: "future", playerId: "qa-player", date: "2026-05-20", participation: 100, createdAt: "2026-05-20T08:00:00.000Z" },
        ],
        injuryPlans: [],
      })
    );
  }, { storageKey: medicalKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const metricCards = page.locator(".medical-metric-card");
  await expect(metricCards.filter({ hasText: "Month average" })).toContainText("40%");
  await expect(metricCards.filter({ hasText: "Month average" })).not.toContainText("filled");
  await expect(metricCards.filter({ hasText: "7-day average" })).toContainText("38%");
  await expect(metricCards.filter({ hasText: "7-day average" })).toContainText("last 7 days");
  await expect(page.locator(".medical-huddle-brief strong")).toHaveText("0/1");
});

test("Medical bulk recommendation opens as a compact dated action row", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    const fixedNow = new Date("2026-05-15T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "bulk-one",
        rosterVersion: "qa-medical-bulk-v1",
        players: [
          { id: "bulk-one", name: "Bulk One", position: "Forward", rosterOrder: 1 },
          { id: "bulk-two", name: "Bulk Two", position: "Midfielder", rosterOrder: 2 },
        ],
        records: [
          { id: "existing-today", playerId: "bulk-one", date: "2026-05-15", participation: 100, createdAt: "2026-05-15T08:00:00.000Z" },
        ],
        injuryPlans: [],
      })
    );
  }, { storageKey: medicalKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const bulkToggle = page.locator("[data-medical-bulk-menu-toggle]");
  await expect(bulkToggle).toContainText("Bulk Recommendation");
  await expect(page.locator("#medicalBulkRecommendationForm")).toHaveCount(0);
  await bulkToggle.click();

  const bulkForm = page.locator("#medicalBulkRecommendationForm");
  await expect(bulkForm).toBeVisible();
  const bulkColumnWidths = await bulkForm.evaluate((form) => {
    const dateField = form.querySelector(".medical-bulk-date-field");
    const selectField = form.querySelector(".medical-bulk-select-field");
    const recommendField = form.querySelector(".medical-bulk-recommend-field");
    return {
      formClient: form.clientWidth,
      formScroll: form.scrollWidth,
      date: dateField?.getBoundingClientRect().width ?? 0,
      select: selectField?.getBoundingClientRect().width ?? 0,
      recommend: recommendField?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(bulkColumnWidths.formScroll).toBeLessThanOrEqual(bulkColumnWidths.formClient + 2);
  expect(bulkColumnWidths.date).toBeGreaterThan(0);
  expect(bulkColumnWidths.date).toBeLessThan(bulkColumnWidths.select);
  expect(bulkColumnWidths.recommend).toBeGreaterThan(0);
  expect(bulkColumnWidths.recommend).toBeLessThan(bulkColumnWidths.date * 0.85);
  await expect(bulkForm.locator("[data-medical-bulk-date]")).toHaveValue("2026-05-15");
  await bulkForm.locator("[data-medical-bulk-select-not-set]").click();
  await expect(page.locator("[data-medical-bulk-menu-toggle]")).toContainText("1 selected");
  await bulkForm.locator("[data-medical-bulk-participation]").selectOption("25");
  await expect(bulkForm.locator("[data-medical-bulk-rtp-preview]")).toHaveValue("Rehab");
  await bulkForm.locator('button[type="submit"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return (state.records || []).filter((record) => record.date === "2026-05-15").map((record) => `${record.playerId}:${record.participation}`).sort();
      }, medicalKey)
    )
    .toEqual(["bulk-one:100", "bulk-two:25"]);
});

test("Medical recommendations use match context and lock non-activity days", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, scheduleStorageKey }) => {
    const fixedNow = new Date("2026-05-16T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-16",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-activity-context-v1",
        events: [
          { id: "qa-training", date: "2026-05-15", time: "10:00", type: "training", title: "Training", note: "" },
          { id: "qa-match", date: "2026-05-16", time: "18:30", type: "match", title: "QA Match Day", note: "" },
          { id: "qa-off", date: "2026-05-17", time: "", type: "off", title: "Squad Off", note: "" },
        ],
      })
    );
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-16",
        selectedPlayerId: "qa-match-player",
        rosterVersion: "qa-medical-activity-context-v1",
        players: [{ id: "qa-match-player", name: "QA Match Player", position: "Forward", rosterOrder: 1 }],
        records: [],
        injuryPlans: [],
      })
    );
  }, { medicalStorageKey: medicalKey, scheduleStorageKey: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  await expect(page.locator("[data-medical-activity-context]")).toContainText("Match Recommendation");
  const playerRow = page.locator('[data-medical-roster-row="qa-match-player"]');
  await playerRow.locator('[data-medical-quick-participation="100"]').click();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const record = (state.records || []).find((entry) => entry.playerId === "qa-match-player" && entry.date === "2026-05-16");
        return record ? `${record.participation}:${record.rtpPhase}` : "";
      }, medicalKey)
    )
    .toBe("100:match-available");
  await expect(playerRow.locator(".medical-status-chip")).toHaveText("Match Available");
  await expect(playerRow).not.toContainText("Full Training");

  await playerRow.click();
  await expect(page.locator(".medical-modal-current")).toContainText("Match Available");
  await expect(page.locator("[data-medical-recommendation-preview]")).toHaveText("100% / Match Available");
  await page.locator(".medical-modal-close").click();

  await page.locator("[data-medical-date-picker]").evaluate((input) => {
    input.value = "2026-05-17";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("[data-medical-activity-context]")).toContainText("No Team Recommendation");
  await expect(page.locator('[data-medical-roster-row="qa-match-player"] [data-medical-quick-participation="100"]')).toBeDisabled();

  await page.locator("[data-medical-bulk-menu-toggle]").click();
  const bulkForm = page.locator("#medicalBulkRecommendationForm");
  await expect(bulkForm.locator("[data-medical-bulk-participation]")).toBeDisabled();
  await expect(bulkForm.locator('button[type="submit"]')).toBeDisabled();

  await page.locator('[data-medical-roster-row="qa-match-player"]').click();
  await expect(page.locator(".medical-activity-lock")).toContainText("No scheduled training or match");
  await expect(page.locator('#medicalRecommendationForm button[type="submit"]')).toBeDisabled();
});

test("Medical roster overview groups by position and supports row quick recommendations", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-gk",
        rosterVersion: "qa-medical-roster-overview-v1",
        players: [
          { id: "qa-def", name: "QA Defender", position: "Defender", rosterOrder: 2 },
          { id: "qa-gk", name: "QA Goalkeeper", position: "Goalkeeper", rosterOrder: 1 },
          { id: "qa-mid", name: "QA Midfielder", position: "Midfielder", rosterOrder: 3 },
          { id: "qa-fwd", name: "QA Forward Alias", position: "F", primaryRole: "ST", roleGroup: "forward", rosterOrder: 4 },
        ],
        records: [],
        injuryPlans: [],
      })
    );
  }, { storageKey: medicalKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const positionGroups = page.locator(".medical-position-group");
  await expect(positionGroups.first()).toContainText("Goalkeeper");
  await expect(positionGroups.nth(1)).toContainText("Defender");
  await expect(positionGroups.nth(2)).toContainText("Midfielder");
  await expect(positionGroups.nth(3)).toContainText("Forward");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".medical-position-group-head strong")).map((element) =>
          element.textContent?.trim()
        )
      )
    )
    .toEqual(["Goalkeeper", "Defender", "Midfielder", "Forward"]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bulkPanel = document.querySelector(".medical-bulk-panel");
        const commandBoard = document.querySelector(".medical-roster-panel > .medical-command-board");
        const positionOverview = document.querySelector(".medical-position-overview");
        if (!bulkPanel || !commandBoard || !positionOverview) return "";
        const bulkAfterCommand = Boolean(commandBoard.compareDocumentPosition(bulkPanel) & Node.DOCUMENT_POSITION_FOLLOWING);
        const overviewAfterBulk = Boolean(bulkPanel.compareDocumentPosition(positionOverview) & Node.DOCUMENT_POSITION_FOLLOWING);
        return bulkAfterCommand && overviewAfterBulk ? "command-bulk-list" : "wrong-order";
      })
    )
    .toBe("command-bulk-list");

  const searchInput = page.locator("[data-medical-roster-search]");
  await searchInput.click();
  await page.keyboard.type("Goal");
  await expect(searchInput).toHaveValue("Goal");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches("[data-medical-roster-search]") ?? false))
    .toBe(true);
  await expect(page.locator('[data-medical-roster-row="qa-gk"]')).toBeVisible();
  await expect(page.locator('[data-medical-roster-row="qa-def"]')).toHaveCount(0);

  const goalkeeperRow = page.locator('[data-medical-roster-row="qa-gk"]');
  await expect(goalkeeperRow).toBeVisible();
  await expect(goalkeeperRow.locator(".medical-quick-rec-button")).toHaveCount(6);
  await goalkeeperRow.locator('[data-medical-quick-participation="25"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const record = (state.records || []).find((entry) => entry.playerId === "qa-gk" && entry.date === "2026-05-15");
        return record ? `${record.participation}:${record.rtpPhase}` : "";
      }, medicalKey)
    )
    .toBe("25:rehab");
});

test("Medical operations board separates signals, cases, history and season views", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-risk",
        rosterVersion: "qa-medical-ops-v1",
        players: [
          { id: "qa-risk", name: "QA Risk Player", position: "Forward", rosterOrder: 1 },
          { id: "qa-clear", name: "QA Clear Player", position: "Midfielder", rosterOrder: 2 },
        ],
        records: [
          {
            id: "qa-risk-record",
            playerId: "qa-risk",
            date: "2026-05-15",
            status: "modified",
            participation: 75,
            actualParticipation: 100,
            rtpPhase: "modified-team",
            createdAt: "2026-05-15T08:00:00.000Z",
          },
          {
            id: "qa-clear-record",
            playerId: "qa-clear",
            date: "2026-05-15",
            status: "full",
            participation: 100,
            actualParticipation: 100,
            rtpPhase: "full-training",
            createdAt: "2026-05-15T08:05:00.000Z",
          },
        ],
        injuryPlans: [
          {
            id: "qa-active-case",
            playerId: "qa-risk",
            injuryType: "ACL injury",
            bodyArea: "Knee",
            startDate: "2026-05-01",
            endDate: "2026-08-31",
            duration: 4,
            durationUnit: "months",
            status: "modified",
            participation: 75,
            reviewDate: "2026-05-14",
            rtpPhase: "modified-team",
            phase: "Modified team integration",
            clearance: { doctor: false, physio: true, performance: false },
            gates: {
              strength: "monitor",
              gpsLoad: "pending",
              painResponse: "pass",
              wellness: "pass",
              psychologicalReadiness: "pending",
            },
            createdAt: "2026-05-01T08:00:00.000Z",
          },
        ],
      })
    );
  }, { storageKey: medicalKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const operationsMenu = page.locator("[data-medical-ops-top-menu]");
  await expect(operationsMenu).toBeVisible();
  await expect(operationsMenu).not.toContainText("Intelligence Board");
  await expect(operationsMenu.locator("[data-medical-ops-tab]")).toHaveCount(6);
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveText("Availability");
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-medical-availability-workspace]")).toBeVisible();
  await expect(page.locator(".medical-position-overview")).toBeVisible();
  await expect(page.locator("[data-medical-operations-system]")).toHaveCount(0);

  await operationsMenu.locator('[data-medical-ops-tab="overview"]').click();
  const operations = page.locator("[data-medical-operations-system]");
  await expect(operations).toBeVisible();
  await expect(operations.locator("[data-medical-ops-tab]")).toHaveCount(0);
  await expect(page.locator("[data-medical-availability-workspace]")).toHaveCount(0);
  const menuPlacement = await page.evaluate(() => {
    const menu = document.querySelector("[data-medical-ops-top-menu]");
    const firstTab = menu?.querySelector("[data-medical-ops-tab]");
    const operationsSystem = document.querySelector("[data-medical-operations-system]");
    return {
      menuTop: menu?.getBoundingClientRect().top ?? 0,
      menuLeft: menu?.getBoundingClientRect().left ?? 0,
      firstTabLeft: firstTab?.getBoundingClientRect().left ?? 0,
      operationsTop: operationsSystem?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(menuPlacement.menuTop).toBeLessThan(menuPlacement.operationsTop);
  expect(menuPlacement.firstTabLeft - menuPlacement.menuLeft).toBeLessThan(20);
  await expect(operations).toContainText("Review now");
  await expect(operations).toContainText("ACL injury");

  await operationsMenu.locator('[data-medical-ops-tab="availability"]').click();
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-medical-availability-workspace]")).toBeVisible();
  await expect(page.locator(".medical-position-overview")).toBeVisible();
  await expect(page.locator("[data-medical-operations-system]")).toHaveCount(0);

  await operationsMenu.locator('[data-medical-ops-tab="signals"]').click();
  await expect(operations).toContainText("Actual exceeded recommendation");
  await expect(operations).toContainText("QA Risk Player");

  await operationsMenu.locator('[data-medical-ops-tab="cases"]').click();
  await expect(operations).toContainText("Review overdue");
  await expect(operations).toContainText("1/3 sign-off");

  await operationsMenu.locator('[data-medical-ops-tab="history"]').click();
  await expect(operations).toContainText("Case opened");
  await expect(operations).toContainText("Recommendation");

  await operationsMenu.locator('[data-medical-ops-tab="season"]').click();
  await expect(operations).toContainText("Managed days");
  await expect(operations).toContainText("Major");
});

test("Squad add creates a Medical roster slot and Session Planner placement", async ({ page }) => {
  const playerName = `QA Squad Placement ${Date.now()}`;
  let squadAgeRequests = 0;
  await bootApp(page);
  await page.route("**/api/squad-ages", async (route) => {
    squadAgeRequests += 1;
    const body = route.request().postDataJSON();
    const players = Array.isArray(body?.players) ? body.players : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        schema: "footballscience-squad-age-hydration-v1",
        checkedAt: new Date().toISOString(),
        checkedProfileIds: players.map((player) => player.profileId).filter(Boolean),
        players: players
          .filter((player) => player.name === "Madison White")
          .map((player) => ({
            profileId: player.profileId,
            name: player.name,
            birthDate: "2000-01-01",
            databasePlayerId: "11111111-1111-4111-8111-111111111111",
            source: "squad_players",
          })),
      }),
    });
  });
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    store.getAccessToken = async () => "qa-token";
    window.localStorage.removeItem("football-player-profile-age-cache-v1");
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
          {
            id: "team-football-science-live",
            clubId: "club-riverside",
            name: "Football Science Live",
            shortName: "FSL",
            level: "Legacy placeholder",
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
  await expect(page.locator('#topIconMenu [data-open-workspace="player-profiles"]')).toHaveAttribute(
    "aria-label",
    "Squad Room"
  );
  await expect(page.locator(".squad-command-title h1")).toHaveText("Riverside FC");
  await expect(page.locator(".squad-command-title")).not.toContainText("Player profiles");
  await expect(page.locator(".squad-command-title .squad-command-list-summary")).toHaveCount(0);
  await expect(page.locator(".squad-command-actions [data-player-profile-new-open]")).toBeVisible();
  await expect(page.locator(".squad-command-tools [data-player-profile-new-open]")).toHaveCount(0);
  await expect(page.locator('[data-squad-roster-section="squad"] .squad-roster-section-head')).toContainText(
    "Squad List"
  );
  await expect(page.locator('[data-squad-roster-section="squad"] .squad-roster-section-head')).toContainText(
    /\d+\/\d+ squad/
  );
  await expect(page.locator(".squad-command-tools .squad-command-list-summary")).toHaveCount(0);
  await expect(page.locator(".squad-table thead").first()).toContainText("Age");
  await expect(page.locator(".squad-table thead").first()).not.toContainText("Medical");
  await expect(page.locator(".squad-table thead").first()).toContainText("IDP");
  await expect(page.locator(".squad-player-row").first()).toContainText("Goalkeeper");
  await expect(page.locator(".squad-player-row").first().locator(".squad-age-cell")).toHaveText(/^-|\d+$/);
  await expect(page.locator('[data-player-profile-select="ncc-2026-madison-white"] .squad-age-cell')).toHaveText(/\d+/);
  expect(squadAgeRequests).toBe(1);
  await openWorkspace(page, "home");
  await openWorkspace(page, "player-profiles");
  await page.waitForTimeout(200);
  expect(squadAgeRequests).toBe(1);
  await expect
    .poll(async () => {
      const playerCell = await page.locator(".squad-player-row").first().locator("td").nth(0).boundingBox();
      return playerCell ? Math.round(playerCell.width) : 999;
    })
    .toBeLessThanOrEqual(290);
  await expect
    .poll(async () => {
      const ageCell = await page.locator(".squad-player-row").first().locator("td").nth(1).boundingBox();
      return ageCell ? Math.round(ageCell.width) : 999;
    })
    .toBeLessThanOrEqual(90);
  await expect(page.locator(".squad-player-row").first().locator(".squad-role-cell small")).toHaveCount(0);
  await expect(page.locator(".squad-player-row").first().locator(".squad-planning-cell small")).toHaveCount(0);
  await expect(page.locator(".squad-player-row").first().locator(".squad-planning-cell")).not.toContainText(
    "Squad player"
  );
  const firstIdpCell = page.locator(".squad-player-row").first().locator(".squad-idp-cell");
  await expect(firstIdpCell).toContainText(/IDP|Review|Monitor/);
  await expect(firstIdpCell).toContainText(/Review|Next:|follow-up|No IDP focus|No active IDP/);
  await expect(firstIdpCell).not.toContainText("Distribution, claiming");
  const squadSearch = page.locator("[data-player-profile-search]").first();
  await squadSearch.click();
  await page.keyboard.type("Mad");
  await expect(squadSearch).toHaveValue("Mad");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches("[data-player-profile-search]") || false))
    .toBe(true);
  await squadSearch.fill("");
  await page.locator("[data-squad-team-logo-upload]").setInputFiles({
    name: "riverside-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const structure = JSON.parse(window.localStorage.getItem("football-platform-structure-v1") || "{}");
        return structure.teams?.find((team) => team.id === "team-riverside-first")?.logoUrl || "";
      })
    )
    .toMatch(/^data:image\//);
  await expect(page.locator(".squad-team-logo-mark img")).toBeVisible();
  await expect
    .poll(async () => {
      const box = await page.locator(".squad-team-logo-mark").first().boundingBox();
      return box ? Math.round(Math.min(box.width, box.height)) : 0;
    })
    .toBeGreaterThanOrEqual(68);

  await page.locator("[data-player-profile-new-open]").click();
  const form = page.locator("#playerProfileNewPlayerForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(playerName);
  await form.locator('input[name="number"]').fill("88");
  await form.locator('input[name="age"]').fill("21");
  await form.locator('input[name="position"]').fill("Midfielder");
  await form.locator('select[name="primaryRole"]').selectOption("8");
  await form.locator('button[type="submit"]').click();

  await expectStorageContains(page, playerProfilesKey, playerName);
  await expect(
    page.locator(".squad-player-row", { hasText: playerName }).first().locator(".squad-age-cell")
  ).toHaveText("21");
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
  const squadSection = page.locator('[data-squad-roster-section="squad"]');
  const guestSection = page.locator('[data-squad-roster-section="temporary"]');
  await expect(squadSection).toBeVisible();
  await expect(guestSection).toBeVisible();
  const guestRow = guestSection.locator(".squad-player-row", { hasText: playerName });
  await expect(guestRow).toBeVisible();
  await expect(guestRow.locator(".squad-planning-cell")).toContainText("Academy training");
  await expect(guestRow.locator(".squad-planning-cell")).not.toContainText("Squad depth");
  await expect(squadSection.locator(".squad-player-row", { hasText: playerName })).toHaveCount(0);
  const squadBox = await squadSection.boundingBox();
  const guestBox = await guestSection.boundingBox();
  expect(squadBox).not.toBeNull();
  expect(guestBox).not.toBeNull();
  expect(guestBox.y).toBeGreaterThan(squadBox.y);
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
  await expect(modal.locator(".squad-profile-strip")).toHaveCount(0);
  await expect(modal.locator('input[name="photoUrl"]')).toHaveCount(0);
  await expect(modal.locator('select[name="rosterType"]')).toHaveCount(0);
  await expect(modal.locator('input[name="temporaryGroup"]')).toHaveCount(0);
  await expect(modal.locator('input[name="temporaryFrom"]')).toHaveCount(0);
  await expect(modal.locator('input[name="temporaryTo"]')).toHaveCount(0);

  const playerId = await modal.locator('input[name="playerId"]').inputValue();
  await page.evaluate(() => {
    const form = document.querySelector("#playerProfileEditForm");
    if (!form) return;
    [
      ["rosterType", "academy"],
      ["temporaryGroup", "Injected academy group"],
      ["temporaryFrom", "2026-05-01"],
      ["temporaryTo", "2026-05-14"],
    ].forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    form.querySelector('input[name="rosterType"]')?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                temporaryGroup: player.temporaryGroup || "",
                temporaryFrom: player.temporaryFrom || "",
                temporaryTo: player.temporaryTo || "",
              }
            : null;
        },
        { key: playerProfilesKey, id: playerId }
      )
    )
    .toMatchObject({
      countsInSquad: true,
      rosterType: "squad",
      temporaryGroup: "",
      temporaryFrom: "",
      temporaryTo: "",
    });
  await modal.locator("[data-player-profile-photo-upload]").setInputFiles({
    name: "player-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect
    .poll(
      () =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player?.photoUrl || "";
        },
        { key: playerProfilesKey, id: playerId }
      ),
      { timeout: 30_000 }
    )
    .toMatch(/^data:image\//);
  await expect(modal.locator(".squad-profile-avatar img")).toBeVisible();

  const readModalHeight = async () => {
    await expect(modal).toBeVisible();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const box = await modal.boundingBox();
      if (box) return Math.round(box.height);
      await page.waitForTimeout(100);
    }
    return 0;
  };
  const overviewHeight = await readModalHeight();
  expect(overviewHeight).toBeGreaterThan(0);
  await modal.locator('[data-player-profile-tab="notes"]').click();
  await expect.poll(readModalHeight, { timeout: 5_000 }).toBe(overviewHeight);

  await modal.locator('textarea[name="coachNotes"]').fill(coachNote);
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ key, id }) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
            return player
              ? {
                  coachNotes: player.coachNotes || "",
                  countsInSquad: player.countsInSquad,
                  photoUploaded: /^data:image\//.test(player.photoUrl || ""),
                  rosterType: player.rosterType || "",
                  temporaryFrom: player.temporaryFrom || "",
                  temporaryTo: player.temporaryTo || "",
                }
              : null;
          },
          { key: playerProfilesKey, id: playerId }
        ),
      { timeout: 30_000 }
    )
    .toMatchObject({
      coachNotes: coachNote,
      countsInSquad: true,
      photoUploaded: true,
      rosterType: "squad",
      temporaryFrom: "",
      temporaryTo: "",
    });

  await modal.locator("[data-player-profile-modal-close]").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, playerProfilesKey, coachNote);
});

test("Squad availability status is editable and Medical injury status overrides the roster", async ({ page }) => {
  test.setTimeout(90_000);
  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  const injuredPlayerRow = page.locator("[data-player-profile-select]").first();
  const manualPlayerRow = page.locator("[data-player-profile-select]").nth(1);
  const injuredPlayerId = await injuredPlayerRow.getAttribute("data-player-profile-select");
  const manualPlayerId = await manualPlayerRow.getAttribute("data-player-profile-select");
  expect(injuredPlayerId).toBeTruthy();
  expect(manualPlayerId).toBeTruthy();

  await page.evaluate(
    ({ medicalStorageKey, playerStorageKey, playerId }) => {
      const profiles = JSON.parse(window.localStorage.getItem(playerStorageKey) || "{}");
      const player = Array.isArray(profiles.players)
        ? profiles.players.find((candidate) => candidate.id === playerId)
        : null;
      if (!player) return;

      const now = new Date().toISOString();
      const medical = JSON.parse(window.localStorage.getItem(medicalStorageKey) || "{}");
      const medicalPlayer = {
        id: player.id,
        name: player.name,
        number: player.number || "",
        position: player.position || "",
        photoUrl: player.photoUrl || "",
        sourceUrl: player.sourceUrl || "",
        rosterType: player.rosterType || "squad",
        countsInSquad: player.countsInSquad !== false,
        temporaryGroup: player.temporaryGroup || "",
        temporaryFrom: player.temporaryFrom || "",
        temporaryTo: player.temporaryTo || "",
        rosterOrder: player.rosterOrder ?? null,
        createdAt: player.createdAt || now,
        updatedAt: now,
      };

      medical.players = [
        medicalPlayer,
        ...(Array.isArray(medical.players) ? medical.players.filter((candidate) => candidate.id !== player.id) : []),
      ];
      medical.injuryPlans = [
        {
          id: "qa-active-squad-injury-plan",
          playerId: player.id,
          injuryType: "QA availability restriction",
          bodyArea: "",
          startDate: "2026-01-01",
          endDate: "2099-12-31",
          duration: 1,
          durationUnit: "weeks",
          status: "unavailable",
          participation: 0,
          reviewDate: "",
          rtpPhase: "medical-restriction",
          phase: "Medical restriction",
          clearance: { doctor: false, physio: false, performance: false },
          gates: {},
          coachNote: "Unavailable until cleared by Medical.",
          shareWithCoach: true,
          comment: "",
          createdAt: now,
          updatedAt: now,
          createdBy: "qa",
        },
        ...(Array.isArray(medical.injuryPlans)
          ? medical.injuryPlans.filter((plan) => plan.id !== "qa-active-squad-injury-plan" && plan.playerId !== player.id)
          : []),
      ];
      window.localStorage.setItem(medicalStorageKey, JSON.stringify(medical));
    },
    { medicalStorageKey: medicalKey, playerStorageKey: playerProfilesKey, playerId: injuredPlayerId }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await openWorkspace(page, "player-profiles");
  await expect(
    page.locator(`[data-player-profile-select="${injuredPlayerId}"] .squad-status-pill`).first()
  ).toContainText("Injured");
  await expect(
    page.locator(`[data-player-profile-select="${injuredPlayerId}"] .squad-medical-cell`)
  ).toHaveCount(0);

  await page.locator(`[data-player-profile-select="${manualPlayerId}"]`).click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  const statusSelect = modal.locator('select[name="status"]');
  await expect(statusSelect).toContainText("International duty");
  await expect(statusSelect).toContainText("Vacation");
  await statusSelect.selectOption("national-team");

  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player?.status || "";
        },
        { key: playerProfilesKey, id: manualPlayerId }
      )
    )
    .toBe("national-team");

  await modal.locator("[data-player-profile-modal-close]").click();
  await expect(
    page.locator(`[data-player-profile-select="${manualPlayerId}"] .squad-status-pill`).first()
  ).toContainText("International duty");
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
