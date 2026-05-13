import { expect, test } from "@playwright/test";

const revisionStateKey = "football-simulator-sequence-v1";
const periodizationStateKey = "football-periodization-v2";
const scheduleStateKey = "football-schedule-v1";
const qaUser = {
  id: "qa-user-1",
  email: "qa@footballscience.test",
  user_metadata: {
    firstName: "QA",
    lastName: "Coach",
    username: "qa.coach",
    title: "Coach",
    department: "Football",
    team: "Revision FC",
  },
  app_metadata: {
    role: "admin",
    status: "active",
  },
  created_at: "2026-05-07T00:00:00.000Z",
};

function createStateValue(title) {
  return JSON.stringify({
    name: title,
    savedAt: "2026-05-07T12:00:00.000Z",
    sequence: { steps: [], currentFrameIndex: -1 },
  });
}

function createMetadata(revision, value) {
  return {
    revision,
    updatedAt: `2026-05-07T12:0${revision}:00.000Z`,
    updatedBy: `qa-user-${revision}`,
    organizationId: "org-qa",
    moduleId: "game-simulator",
    mergePolicy: "revision-guarded-last-write",
    hash: `hash-${revision}-${value.length}`,
    size: value.length,
  };
}

function createFakeSupabaseScript(sessionUser = qaUser) {
  const session = {
    access_token: "qa-access-token",
    user: sessionUser,
  };

  return `
    window.__qaSession = ${JSON.stringify(session)};
    window.supabase = {
      createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: window.__qaSession }, error: null }),
            refreshSession: async () => ({ data: { session: window.__qaSession }, error: null }),
            signInWithPassword: async () => ({ data: { session: window.__qaSession }, error: null }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          },
        };
      },
    };
  `;
}

async function installCentralRevisionRoutes(context, centralStore, syncBodies, options = {}) {
  const sessionUser = options.sessionUser || qaUser;
  const profileUser = options.profileUser || qaUser;

  await context.route("**/npm/@supabase/supabase-js@2/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: createFakeSupabaseScript(sessionUser),
    });
  });

  await context.route("**/api/client-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        url: "https://qa.supabase.co",
        anonKey: "qa-anon-key",
        hasServiceRoleKey: true,
      }),
    });
  });

  await context.route("**/api/admin-users**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.has("me")
        ? { ok: true, user: profileUser }
        : { ok: true, users: [profileUser], roles: ["admin", "coach", "analyst", "performance", "medical", "guest"] }),
    });
  });

  await context.route("**/api/presence**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, entries: [], updatedAt: new Date().toISOString() }),
    });
  });

  await context.route("**/api/app-state", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          entries: { [revisionStateKey]: centralStore.value, ...(centralStore.entries || {}) },
          metadata: { [revisionStateKey]: centralStore.metadata, ...(centralStore.metadataEntries || {}) },
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }

    const body = JSON.parse(request.postData() || "{}");
    if (body.key !== revisionStateKey) {
      const value = String(body.value || "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          key: body.key || "",
          value,
          revision: 1,
          metadata: {
            revision: 1,
            updatedAt: new Date().toISOString(),
            updatedBy: qaUser.id,
            organizationId: "org-qa",
            moduleId: "qa-ignored",
            mergePolicy: "revision-guarded-last-write",
            hash: `ignored-${value.length}`,
            size: value.length,
          },
        }),
      });
      return;
    }

    syncBodies.push(body);
    const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
    if (baseRevision !== centralStore.metadata.revision) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          reason: "Stale simulator sequence data was not saved because the central state is already newer.",
          currentRevision: centralStore.metadata.revision,
        }),
      });
      return;
    }

    centralStore.value = String(body.value || "");
    centralStore.metadata = createMetadata(centralStore.metadata.revision + 1, centralStore.value);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        key: revisionStateKey,
        value: centralStore.value,
        revision: centralStore.metadata.revision,
        metadata: centralStore.metadata,
      }),
    });
  });
}

async function bootCentralPage(browser, baseURL, centralStore, syncBodies, tabName, options = {}) {
  const context = await browser.newContext();
  await installCentralRevisionRoutes(context, centralStore, syncBodies, options);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__footballScienceQaForceCentralState = true;
  });
  if (options.initScript) {
    await page.addInitScript(options.initScript, options.initArg);
  }
  const targetUrl = new URL(baseURL || "http://127.0.0.1:4173/");
  targetUrl.searchParams.set("qaTab", tabName);
  await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await page.waitForFunction(
    () => Boolean(window.footballScienceDataSafety && window.footballScienceCentralState?.isHydrated?.()),
    null,
    { timeout: 15_000 }
  );
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key) || "", revisionStateKey), { timeout: 10_000 })
    .toContain("Original central sequence");
  return { context, page };
}

test("fresh server profile restores admin access when the stored Supabase session has a stale role", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  };
  const staleSessionUser = {
    ...qaUser,
    app_metadata: {
      role: "coach",
      status: "active",
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "stale-admin-role", {
    sessionUser: staleSessionUser,
    profileUser: qaUser,
  });

  try {
    await expect
      .poll(() => tab.page.evaluate(() => window.platformAuthStore?.getCurrentUser?.()?.role || ""), { timeout: 10_000 })
      .toBe("admin");

    await tab.page.evaluate(() => window.dispatchEvent(new Event("platform:user-change")));
    const adminNavButton = tab.page.locator('.top-icon-menu-item[data-open-workspace="admin"]').first();
    await expect(adminNavButton).toBeVisible({ timeout: 10_000 });
    await adminNavButton.evaluate((button) => button.click());
    await expect(tab.page.locator('[data-workspace-view="admin"].is-active')).toBeVisible();
    await expect(tab.page.locator("#adminWorkspace")).toContainText("Access & Users");
    await expect(tab.page.locator("#adminWorkspace")).toContainText("Platform Admin");
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

async function writeRevisionValue(page, title) {
  await page.evaluate(
    ({ key, nextTitle }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      state.name = nextTitle;
      state.savedAt = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    { key: revisionStateKey, nextTitle: title }
  );
}

async function closeCentralStateContext(context) {
  try {
    await context.close();
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("ENOENT") && (message.includes(".network") || message.includes(".trace") || message.includes(".zip"))) {
      return;
    }
    throw error;
  }
}

test("two browser tabs send baseRevision and stale tab cannot overwrite newer central state", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  };
  const syncBodies = [];
  const first = await bootCentralPage(browser, baseURL, centralStore, syncBodies, "first");
  const stale = await bootCentralPage(browser, baseURL, centralStore, syncBodies, "stale");

  try {
    await writeRevisionValue(first.page, "Fresh sequence from first tab");
    await expect.poll(() => syncBodies.length, { timeout: 10_000 }).toBe(1);
    expect(syncBodies[0].metadata.baseRevision).toBe(1);
    expect(centralStore.metadata.revision).toBe(2);
    expect(centralStore.value).toContain("Fresh sequence from first tab");

    await writeRevisionValue(stale.page, "Stale sequence from second tab");
    await expect.poll(() => syncBodies.length, { timeout: 10_000 }).toBe(2);
    expect(syncBodies[1].metadata.baseRevision).toBe(1);
    expect(centralStore.metadata.revision).toBe(2);
    expect(centralStore.value).toContain("Fresh sequence from first tab");
    expect(centralStore.value).not.toContain("Stale sequence from second tab");

    await expect
      .poll(() => stale.page.evaluate((key) => window.localStorage.getItem(key) || "", revisionStateKey), { timeout: 10_000 })
      .toContain("Fresh sequence from first tab");
  } finally {
    await closeCentralStateContext(first.context);
    await closeCentralStateContext(stale.context);
  }
});

test("central Schedule hydration preserves the local selected day", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localScheduleState = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-09",
    viewMode: "overview",
    overviewSpan: 6,
    importVersion: "ncc-2026-numbers-v1",
    events: [{ id: "local-training", date: "2026-05-09", type: "training", title: "Local Training" }],
  };
  const centralScheduleState = {
    selectedYear: 2026,
    selectedMonthIndex: 0,
    selectedDate: "2026-01-15",
    viewMode: "month",
    overviewSpan: 3,
    importVersion: "ncc-2026-numbers-v1",
    events: [{ id: "central-match", date: "2026-05-09", type: "match", title: "Central Match" }],
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [scheduleStateKey]: JSON.stringify(centralScheduleState),
    },
    metadataEntries: {
      [scheduleStateKey]: createMetadata(4, JSON.stringify(centralScheduleState)),
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "schedule-local-date", {
    initScript: ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    initArg: { key: scheduleStateKey, value: JSON.stringify(localScheduleState) },
  });

  try {
    await expect
      .poll(() =>
        tab.page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          return {
            selectedDate: state.selectedDate,
            selectedMonthIndex: state.selectedMonthIndex,
            viewMode: state.viewMode,
            overviewSpan: state.overviewSpan,
            eventTitles: (state.events || []).map((event) => event.title),
          };
        }, scheduleStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        selectedDate: "2026-05-09",
        selectedMonthIndex: 4,
        viewMode: "overview",
        overviewSpan: 6,
        eventTitles: ["Central Match"],
      });

    centralScheduleState.selectedMonthIndex = 1;
    centralScheduleState.selectedDate = "2026-02-01";
    centralStore.entries[scheduleStateKey] = JSON.stringify(centralScheduleState);
    centralStore.metadataEntries[scheduleStateKey] = createMetadata(5, centralStore.entries[scheduleStateKey]);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ forceApply: true }));

    await expect
      .poll(() =>
        tab.page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          return {
            selectedDate: state.selectedDate,
            selectedMonthIndex: state.selectedMonthIndex,
          };
        }, scheduleStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        selectedDate: "2026-05-09",
        selectedMonthIndex: 4,
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central Periodization hydration preserves the local selected day", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localPeriodizationState = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-09",
    importVersion: "ncc-2026-periodization-v1",
    days: {
      "2026-05-09": {
        seasonPhase: "Competition",
        daySchedule: "Travel Day",
        sessionNotes: "Local today note",
      },
    },
  };
  const centralPeriodizationState = {
    selectedYear: 2026,
    selectedMonthIndex: 0,
    selectedDate: "2026-01-15",
    importVersion: "ncc-2026-periodization-v1",
    days: {
      "2026-05-09": {
        seasonPhase: "Competition",
        daySchedule: "Training",
        sessionNotes: "Central training note",
      },
    },
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [periodizationStateKey]: JSON.stringify(centralPeriodizationState),
    },
    metadataEntries: {
      [periodizationStateKey]: createMetadata(4, JSON.stringify(centralPeriodizationState)),
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "periodization-local-date", {
    initScript: ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    initArg: { key: periodizationStateKey, value: JSON.stringify(localPeriodizationState) },
  });

  try {
    await expect
      .poll(() =>
        tab.page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          return {
            selectedDate: state.selectedDate,
            selectedMonthIndex: state.selectedMonthIndex,
            daySchedule: state.days?.["2026-05-09"]?.daySchedule || "",
            note: state.days?.["2026-05-09"]?.sessionNotes || "",
          };
        }, periodizationStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        selectedDate: "2026-05-09",
        selectedMonthIndex: 4,
        daySchedule: "Training",
        note: "Central training note",
      });

    await tab.page.evaluate((key) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      state.days["2026-05-09"].sessionNotes = "Fresh local note after central load";
      state.days["2026-05-09"].fieldUpdatedAt = {
        ...(state.days["2026-05-09"].fieldUpdatedAt || {}),
        sessionNotes: "2026-05-07T17:00:00.000Z",
      };
      window.localStorage.setItem(key, JSON.stringify(state));
    }, periodizationStateKey);

    centralPeriodizationState.selectedMonthIndex = 1;
    centralPeriodizationState.selectedDate = "2026-02-01";
    centralPeriodizationState.days["2026-05-09"].sessionNotes = "Older central note";
    centralPeriodizationState.days["2026-05-09"].fieldUpdatedAt = {
      sessionNotes: "2026-05-07T16:00:00.000Z",
    };
    centralStore.entries[periodizationStateKey] = JSON.stringify(centralPeriodizationState);
    centralStore.metadataEntries[periodizationStateKey] = createMetadata(5, centralStore.entries[periodizationStateKey]);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ forceApply: true }));

    await expect
      .poll(() =>
        tab.page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          return {
            selectedDate: state.selectedDate,
            selectedMonthIndex: state.selectedMonthIndex,
            note: state.days?.["2026-05-09"]?.sessionNotes || "",
          };
        }, periodizationStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        selectedDate: "2026-05-09",
        selectedMonthIndex: 4,
        note: "Fresh local note after central load",
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});
