import { expect, test } from "@playwright/test";

const revisionStateKey = "football-simulator-sequence-v1";
const periodizationStateKey = "football-periodization-v2";
const scheduleStateKey = "football-schedule-v1";
const sessionPlannerStateKey = "football-session-planner-v3";
const medicalTeamStateKey = "football-medical-team-v1";
const playerProfilesStateKey = "football-player-profiles-v1";
const dataSafetyManifestKey = "football-data-safety-v1";
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
  const appStateGetUrls = Array.isArray(options.appStateGetUrls) ? options.appStateGetUrls : [];

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

  await context.route("**/api/app-state**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();

    if (method === "GET") {
      appStateGetUrls.push(request.url());
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
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      const revision = Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision + 1 : 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          key: body.key || "",
          value,
          revision,
          metadata: {
            revision,
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
  if (options.waitForHydration !== false) {
    await page.waitForFunction(
      () => Boolean(window.footballScienceDataSafety && window.footballScienceCentralState?.isHydrated?.()),
      null,
      { timeout: 15_000 }
    );
  } else {
    await page.waitForFunction(
      () => Boolean(window.footballScienceDataSafety && window.footballScienceCentralState),
      null,
      { timeout: 15_000 }
    );
  }
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
    const moreMenu = tab.page.locator(".platform-nav-more").first();
    if ((await moreMenu.count()) > 0) {
      await moreMenu.evaluate((node) => {
        node.open = true;
      });
    }
    const adminNavButton = tab.page.locator('#workspaceList [data-open-workspace="admin"]').first();
    await expect(adminNavButton).toBeVisible({ timeout: 10_000 });
    await adminNavButton.evaluate((button) => button.click());
    await expect(tab.page.locator('[data-workspace-view="admin"].is-active')).toBeVisible();
    await expect(tab.page.locator("#adminWorkspace")).toContainText("Access & Users");
    await expect(tab.page.locator("#adminWorkspace")).toContainText("Platform Admin");
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central hydration does not overwrite pending local Session Planner data with a different server hash", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localSessionPlannerState = {
    selectedDate: "2026-05-18",
    sessions: {
      "2026-05-18": {
        date: "2026-05-18",
        title: "Local unsynced training",
        selectedBlockId: "local-block",
        blocks: [
          {
            id: "local-block",
            label: "Block 1",
            title: "Local unsynced exercise",
            minutes: 15,
            updatedAt: "2026-05-18T12:01:00.000Z",
          },
        ],
      },
    },
  };
  const centralSessionPlannerState = {
    selectedDate: "2026-05-18",
    sessions: {
      "2026-05-18": {
        date: "2026-05-18",
        title: "Central older training",
        selectedBlockId: "central-block",
        blocks: [
          {
            id: "central-block",
            label: "Block 1",
            title: "Central older exercise",
            minutes: 10,
            updatedAt: "2026-05-18T12:00:00.000Z",
          },
        ],
      },
    },
  };
  const centralValue = JSON.stringify(centralSessionPlannerState);
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [sessionPlannerStateKey]: centralValue,
    },
    metadataEntries: {
      [sessionPlannerStateKey]: {
        ...createMetadata(6, centralValue),
        hash: "central-different-hash",
        updatedAt: "2026-05-18T12:06:00.000Z",
      },
    },
  };
  const localValue = JSON.stringify(localSessionPlannerState);
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "session-pending-local", {
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          entries: {
            [key]: {
              label: "Session Planner",
              updatedAt: "2026-05-18T12:01:00.000Z",
              hash: "local-pending-hash",
              size: value.length,
              writes: 1,
              pendingCentralSync: true,
            },
          },
        })
      );
    },
    initArg: { key: sessionPlannerStateKey, value: localValue, manifestKey: dataSafetyManifestKey },
  });

  try {
    await expect
      .poll(
        () =>
          tab.page.evaluate((key) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const session = state.sessions?.["2026-05-18"];
            return {
              title: session?.title || "",
              blockTitle: session?.blocks?.[0]?.title || "",
            };
          }, sessionPlannerStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        title: "Local unsynced training",
        blockTitle: "Local unsynced exercise",
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central hydration preserves local value when central revision is stale against manifest server revision", async ({ browser, baseURL }) => {
  const staleCentralValue = createStateValue("Original central sequence - stale");
  const localValue = createStateValue("Original central sequence - local");
  const centralStore = {
    value: staleCentralValue,
    metadata: createMetadata(2, staleCentralValue),
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "revision-guard-stale", {
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          entries: {
            [key]: {
              label: "Simulator Sequence",
              updatedAt: "2026-05-07T12:10:00.000Z",
              hash: "hash-local-value",
              writes: 1,
              serverRevision: 4,
            },
          },
        })
      );
    },
    initArg: { key: revisionStateKey, value: localValue, manifestKey: dataSafetyManifestKey },
  });

  try {
    await expect
      .poll(
        () => tab.page.evaluate((key) => window.localStorage.getItem(key) || "", revisionStateKey),
        { timeout: 10_000 }
      )
      .toContain("Original central sequence - local");

    const freshCentralValue = createStateValue("Original central sequence - remote");
    centralStore.value = freshCentralValue;
    centralStore.metadata = createMetadata(5, freshCentralValue);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate());

    await expect
      .poll(
        () => tab.page.evaluate((key) => window.localStorage.getItem(key) || "", revisionStateKey),
        { timeout: 10_000 }
      )
      .toContain("Original central sequence - remote");

    await expect
      .poll(
        () =>
          tab.page.evaluate((manifestKey) => {
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            return manifest.entries?.["football-simulator-sequence-v1"]?.serverRevision || 0;
          }, dataSafetyManifestKey),
        { timeout: 10_000 }
      )
      .toBe(5);

    const staleAfterFreshValue = createStateValue("Original central sequence - stale after fresh");
    centralStore.value = staleAfterFreshValue;
    centralStore.metadata = createMetadata(3, staleAfterFreshValue);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate());

    await expect
      .poll(
        () => tab.page.evaluate((key) => window.localStorage.getItem(key) || "", revisionStateKey),
        { timeout: 10_000 }
      )
      .toContain("Original central sequence - remote");

    await expect
      .poll(
        () =>
          tab.page.evaluate(() =>
            window.footballScienceCentralState.getStatus().metadata["football-simulator-sequence-v1"]?.revision || 0
          ),
        { timeout: 10_000 }
      )
      .toBe(5);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("fresh Session Planner hydration recovers from a higher stale browser revision", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localSessionPlannerState = {
    selectedDate: "2026-07-21",
    sessions: {
      "2026-07-21": {
        date: "2026-07-21",
        title: "Training/IDP",
        selectedBlockId: "local-block",
        blocks: [{ id: "local-block", title: "New Exercise", minutes: 15 }],
      },
    },
  };
  const centralSessionPlannerState = {
    selectedDate: "2026-07-24",
    sessions: {
      "2026-07-21": {
        date: "2026-07-21",
        title: "Training/IDP",
        selectedBlockId: "central-block-1",
        blocks: [
          { id: "central-block-1", title: "1v1 Def/Off", minutes: 15 },
          { id: "central-block-2", title: "Possession", minutes: 25 },
          { id: "central-block-3", title: "German Possession", minutes: 20 },
          { id: "central-block-4", title: "Big Sided Games", minutes: 25 },
        ],
      },
    },
  };
  const centralValue = JSON.stringify(centralSessionPlannerState);
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [sessionPlannerStateKey]: centralValue },
    metadataEntries: {
      [sessionPlannerStateKey]: {
        ...createMetadata(76, centralValue),
        moduleId: "session-planner",
      },
    },
  };
  const localValue = JSON.stringify(localSessionPlannerState);
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "session-stale-browser-revision", {
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          entries: {
            [key]: {
              label: "Session Planner",
              updatedAt: "2026-07-21T19:20:00.000Z",
              hash: "stale-local-hash",
              size: value.length,
              writes: 1,
              serverRevision: 1407,
              pendingCentralSync: false,
            },
          },
        })
      );
    },
    initArg: { key: sessionPlannerStateKey, value: localValue, manifestKey: dataSafetyManifestKey },
  });

  try {
    await expect
      .poll(
        () =>
          tab.page.evaluate(({ key, manifestKey }) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            const session = state.sessions?.["2026-07-21"];
            return {
              blockTitles: (session?.blocks || []).map((block) => block.title),
              selectedDate: state.selectedDate,
              revisionsAligned:
                Number(manifest.entries?.[key]?.serverRevision || 0) >= 76 &&
                Number(manifest.entries?.[key]?.serverRevision || 0) ===
                  Number(window.footballScienceCentralState.getStatus().metadata[key]?.revision || 0),
            };
          }, { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey }),
        { timeout: 10_000 }
      )
      .toEqual({
        blockTitles: ["1v1 Def/Off", "Possession", "German Possession", "Big Sided Games"],
        selectedDate: "2026-07-21",
        revisionsAligned: true,
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Session Planner hydration fails closed when localStorage quota is full", async ({ browser, baseURL }) => {
  const centralSessionPlannerState = {
    selectedDate: "2026-07-21",
    sessions: {
      "2026-07-21": {
        date: "2026-07-21",
        title: "Training/IDP",
        selectedBlockId: "central-block-1",
        blocks: [
          { id: "central-block-1", title: "1v1 Def/Off", minutes: 15 },
          { id: "central-block-2", title: "Possession", minutes: 25 },
          { id: "central-block-3", title: "German Possession", minutes: 20 },
          { id: "central-block-4", title: "Big Sided Games", minutes: 25 },
        ],
      },
    },
  };
  const centralValue = JSON.stringify(centralSessionPlannerState);
  const centralStore = {
    value: createStateValue("Original central sequence"),
    metadata: createMetadata(1, createStateValue("Original central sequence")),
    entries: { [sessionPlannerStateKey]: centralValue },
    metadataEntries: {
      [sessionPlannerStateKey]: { ...createMetadata(106, centralValue), moduleId: "session-planner" },
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "session-quota-fallback", {
    waitForHydration: false,
    initScript: ({ key, staleValue }) => {
      const originalSetItem = Storage.prototype.setItem;
      originalSetItem.call(window.localStorage, key, staleValue);
      Storage.prototype.setItem = function quotaAwareSetItem(storageKey, value) {
        if (String(storageKey) === key && String(value).includes("Big Sided Games")) {
          throw new DOMException(`Setting ${key} exceeded the quota.`, "QuotaExceededError");
        }
        return originalSetItem.call(this, storageKey, value);
      };
    },
    initArg: {
      key: sessionPlannerStateKey,
      staleValue: JSON.stringify({
        selectedDate: "2026-07-20",
        sessions: {
          "2026-07-20": {
            date: "2026-07-20",
            title: "Stale local session",
            blocks: [{ id: "stale-block-1", title: "Stale Local Block", minutes: 10 }],
          },
        },
      }),
    },
  });

  try {
    await expect
      .poll(() => tab.page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const status = window.footballScienceCentralState.getStatus();
        const backup = window.footballScienceDataSafety.createBackup("quota-hydration");
        return {
          rawValue: window.localStorage.getItem(key),
          blockTitles: (state.sessions?.["2026-07-21"]?.blocks || []).map((block) => block.title),
          backupHasKey: Object.prototype.hasOwnProperty.call(backup.storage || {}, key),
          cachedValueType: typeof window.footballScienceCentralState.getCachedValue(key),
          fallbackKeys: status.cacheFallbackKeys || [],
          hydrated: status.hydrated,
          lastError: status.lastError || "",
        };
      }, sessionPlannerStateKey))
      .toEqual({
        rawValue: null,
        blockTitles: [],
        backupHasKey: false,
        cachedValueType: "undefined",
        fallbackKeys: [],
        hydrated: false,
        lastError: `Setting ${sessionPlannerStateKey} exceeded the quota.`,
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("initial central hydration requests a fresh source read", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  };
  const appStateGetUrls = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "fresh-initial-hydration", {
    appStateGetUrls,
  });

  try {
    expect(appStateGetUrls.length).toBeGreaterThan(0);
    expect(new URL(appStateGetUrls[0]).searchParams.get("fresh")).toBe("1");
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central hydration keeps Session Planner and Medical view dates local while shared data updates", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localSessionPlannerState = {
    selectedDate: "2026-07-20",
    blockReductionGuard: {
      "2026-07-20": new Date().toISOString(),
    },
    sessions: {
      "2026-07-20": {
        id: "session-2026-07-20",
        date: "2026-07-20",
        title: "Stale browser training",
        selectedBlockId: "monday-block",
        blocks: [
          {
            id: "monday-block",
            label: "Block 1",
            title: "Stale browser exercise",
            minutes: 15,
            fieldUpdatedAt: {
              title: "2026-07-20T09:00:00.000Z",
              minutes: "2026-07-20T09:00:00.000Z",
            },
          },
        ],
      },
    },
  };
  const centralSessionPlannerState = {
    selectedDate: "2026-07-22",
    sessions: {
      "2026-07-20": {
        id: "session-2026-07-20",
        date: "2026-07-20",
        title: "Central Monday training",
        selectedBlockId: "monday-block",
        blocks: [
          {
            id: "monday-block",
            label: "Block 1",
            title: "Monday possession",
            minutes: 20,
            fieldUpdatedAt: {
              title: "2026-07-20T10:00:00.000Z",
              minutes: "2026-07-20T10:00:00.000Z",
            },
          },
          {
            id: "monday-block-2",
            label: "Block 2",
            title: "Monday finishing",
            minutes: 25,
          },
        ],
      },
    },
  };
  const localMedicalState = {
    selectedDate: "2026-07-20",
    selectedPlayerId: "player-1",
    players: [],
    records: [],
    injuryPlans: [],
  };
  const centralMedicalState = {
    selectedDate: "2026-07-21",
    selectedPlayerId: "player-2",
    players: [
      { id: "player-1", name: "First Player", position: "Forward" },
      { id: "player-2", name: "Second Player", position: "Midfielder" },
    ],
    records: [
      {
        id: "recommendation-full",
        playerId: "player-1",
        date: "2026-07-20",
        status: "full",
        participation: 100,
        createdAt: "2026-07-20T10:00:00.000Z",
      },
      {
        id: "recommendation-modified",
        playerId: "player-2",
        date: "2026-07-20",
        status: "modified",
        participation: 75,
        createdAt: "2026-07-20T10:01:00.000Z",
      },
    ],
    injuryPlans: [],
  };
  const playerProfilesState = {
    selectedPlayerId: "player-1",
    rosterVersion: "qa-local-view-date-v1",
    schemaVersion: 3,
    removedPlayerIds: [],
    players: [
      {
        id: "player-1",
        name: "First Player",
        position: "Forward",
        rosterType: "squad",
        countsInSquad: true,
        status: "available",
      },
      {
        id: "player-2",
        name: "Second Player",
        position: "Midfielder",
        rosterType: "squad",
        countsInSquad: true,
        status: "available",
      },
    ],
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [sessionPlannerStateKey]: JSON.stringify(centralSessionPlannerState),
      [medicalTeamStateKey]: JSON.stringify(centralMedicalState),
      [playerProfilesStateKey]: JSON.stringify(playerProfilesState),
    },
    metadataEntries: {
      [sessionPlannerStateKey]: createMetadata(4, JSON.stringify(centralSessionPlannerState)),
      [medicalTeamStateKey]: createMetadata(5, JSON.stringify(centralMedicalState)),
      [playerProfilesStateKey]: createMetadata(6, JSON.stringify(playerProfilesState)),
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "local-view-dates", {
    initScript: ({ sessionKey, sessionValue, medicalKey, medicalValue }) => {
      window.localStorage.setItem(sessionKey, sessionValue);
      window.localStorage.setItem(medicalKey, medicalValue);
    },
    initArg: {
      sessionKey: sessionPlannerStateKey,
      sessionValue: JSON.stringify(localSessionPlannerState),
      medicalKey: medicalTeamStateKey,
      medicalValue: JSON.stringify(localMedicalState),
    },
  });

  try {
    await expect
      .poll(() =>
        tab.page.evaluate(({ sessionKey, medicalKey }) => {
          const sessionState = JSON.parse(window.localStorage.getItem(sessionKey) || "{}");
          const medicalState = JSON.parse(window.localStorage.getItem(medicalKey) || "{}");
          return {
            sessionDate: sessionState.selectedDate || "",
            sessionTitle: sessionState.sessions?.["2026-07-20"]?.title || "",
            sessionBlockTitles:
              sessionState.sessions?.["2026-07-20"]?.blocks?.map((block) => block.title) || [],
            medicalDate: medicalState.selectedDate || "",
            selectedMedicalPlayerId: medicalState.selectedPlayerId || "",
            recommendationCount: medicalState.records?.filter((record) => record.date === "2026-07-20").length || 0,
          };
        }, { sessionKey: sessionPlannerStateKey, medicalKey: medicalTeamStateKey }),
        { timeout: 10_000 }
      )
      .toEqual({
        sessionDate: "2026-07-20",
        sessionTitle: "Central Monday training",
        sessionBlockTitles: ["Monday possession", "Monday finishing"],
        medicalDate: "2026-07-20",
        selectedMedicalPlayerId: "player-1",
        recommendationCount: 2,
      });

    await tab.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "session-planner" } }));
    });
    await expect(tab.page.locator("body")).toHaveAttribute("data-active-workspace", "session-planner");
    await expect(tab.page.locator("#sessionPlannerWorkspace")).toContainText("Monday possession");

    await tab.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "medical-team" } }));
    });
    await expect(tab.page.locator("body")).toHaveAttribute("data-active-workspace", "medical-team");
    await expect(tab.page.locator(".medical-metric-card").filter({ hasText: "Full" })).toContainText("1");
    await expect(tab.page.locator(".medical-metric-card").filter({ hasText: "Modified" })).toContainText("1");
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Medical hydration cannot replace a locally confirmed newer recommendation with stale central data", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const localMedicalState = {
    selectedDate: "2026-07-20",
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        updatedAt: "2026-07-20T10:05:00.000Z",
      },
    ],
    records: [
      {
        id: "recommendation-local",
        playerId: "player-1",
        date: "2026-07-20",
        status: "controlled",
        participation: 50,
        coachNote: "Modified training",
        shareWithCoach: true,
        rtpPhase: "modified-team",
        createdAt: "2026-07-20T10:05:00.000Z",
        updatedAt: "2026-07-20T10:05:00.000Z",
      },
      {
        id: "recommendation-archived",
        playerId: "player-1",
        date: "2026-07-20",
        status: "full",
        participation: 100,
        createdAt: "2026-07-20T09:00:00.000Z",
        updatedAt: "2026-07-20T10:06:00.000Z",
        archivedAt: "2026-07-20T10:06:00.000Z",
      },
    ],
    injuryPlans: [],
  };
  const staleCentralMedicalState = {
    selectedDate: "2026-07-20",
    selectedPlayerId: "player-1",
    players: [
      {
        id: "player-1",
        name: "QA Player",
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
    ],
    records: [
      {
        id: "recommendation-central",
        playerId: "player-1",
        date: "2026-07-20",
        status: "full",
        participation: 100,
        createdAt: "2026-07-20T10:04:00.000Z",
        updatedAt: "2026-07-20T10:04:00.000Z",
      },
      {
        id: "recommendation-archived",
        playerId: "player-1",
        date: "2026-07-20",
        status: "full",
        participation: 100,
        createdAt: "2026-07-20T09:00:00.000Z",
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
    ],
    injuryPlans: [],
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [medicalTeamStateKey]: JSON.stringify(staleCentralMedicalState),
    },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(4, JSON.stringify(staleCentralMedicalState)),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      },
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-stale-revision-guard", {
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          lastCentralError: "Stale medical data needs attention.",
          entries: {
            [key]: {
              label: "Medical Room",
              pendingCentralSync: false,
              serverRevision: 5,
              updatedAt: "2026-07-20T10:05:00.000Z",
            },
          },
        })
      );
    },
    initArg: {
      key: medicalTeamStateKey,
      value: JSON.stringify(localMedicalState),
      manifestKey: dataSafetyManifestKey,
    },
  });

  try {
    await expect
      .poll(
        () =>
          tab.page.evaluate((key) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const recommendation = state.records?.find((record) => record.id === "recommendation-local");
            const archived = state.records?.find((record) => record.id === "recommendation-archived");
            return {
              coachNote: recommendation?.coachNote || "",
              participation: recommendation?.participation,
              recordIds: (state.records || []).map((record) => record.id).sort(),
              archivedAt: archived?.archivedAt || "",
            };
          }, medicalTeamStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        coachNote: "Modified training",
        participation: 50,
        recordIds: ["recommendation-archived", "recommendation-central", "recommendation-local"],
        archivedAt: "2026-07-20T10:06:00.000Z",
      });

    await expect
      .poll(
        () => tab.page.evaluate((manifestKey) => {
          const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
          const centralRevision =
            window.footballScienceCentralState.getStatus().metadata["football-medical-team-v1"]?.revision || 0;
          const manifestRevision = manifest.entries?.["football-medical-team-v1"]?.serverRevision || 0;
          return {
            revisionsAligned:
              centralRevision >= 5 &&
              manifestRevision >= 5 &&
              centralRevision === manifestRevision,
            lastCentralError: manifest.lastCentralError || "",
          };
        }, dataSafetyManifestKey),
        { timeout: 10_000 }
      )
      .toEqual({
        revisionsAligned: true,
        lastCentralError: "",
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central hydration acknowledges matching pending values across different hash formats", async ({ browser, baseURL }) => {
  const matchingValue = createStateValue("Original central sequence");
  const centralStore = {
    value: matchingValue,
    metadata: {
      ...createMetadata(6, matchingValue),
      hash: "sha256-server-hash",
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "pending-value-ack", {
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          entries: {
            [key]: {
              label: "Simulator Sequence",
              updatedAt: "2026-05-07T12:05:00.000Z",
              hash: "fnv-local-hash",
              writes: 1,
              pendingCentralSync: true,
            },
          },
        })
      );
    },
    initArg: { key: revisionStateKey, value: matchingValue, manifestKey: dataSafetyManifestKey },
  });

  try {
    await expect
      .poll(
        () =>
          tab.page.evaluate((manifestKey) => {
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            const entry = manifest.entries?.["football-simulator-sequence-v1"] || {};
            return {
              pendingCentralSync: entry.pendingCentralSync,
              serverRevision: entry.serverRevision,
            };
          }, dataSafetyManifestKey),
        { timeout: 10_000 }
      )
      .toEqual({
        pendingCentralSync: false,
        serverRevision: 6,
      });
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
    await Promise.race([
      context.close(),
      new Promise((resolve) => setTimeout(resolve, 2_500)),
    ]);
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("Target page, context or browser has been closed") ||
      (message.includes("ENOENT") && (message.includes(".network") || message.includes(".trace") || message.includes(".zip")))
    ) {
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
        viewMode: "planner",
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

test("central Medical hydration preserves pending local availability plans", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    selectedDate: "2026-05-16",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "QA Player", updatedAt: "2026-05-07T12:04:00.000Z" }],
    records: [],
    injuryPlans: [
      {
        id: "plan-central",
        playerId: "player-1",
        injuryType: "Central plan",
        startDate: "2026-05-01",
        endDate: "2026-05-21",
        updatedAt: "2026-05-07T12:04:00.000Z",
      },
    ],
  };
  const localMedicalState = {
    selectedDate: "2026-05-17",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "QA Player", updatedAt: "2026-05-07T12:05:00.000Z" }],
    records: [],
    injuryPlans: [
      {
        id: "plan-local",
        playerId: "player-1",
        injuryType: "Pending local plan",
        startDate: "2026-05-17",
        endDate: "2026-06-14",
        updatedAt: "2026-05-07T12:05:00.000Z",
      },
    ],
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [medicalTeamStateKey]: JSON.stringify(centralMedicalState),
    },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(4, JSON.stringify(centralMedicalState)),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
        updatedAt: "2026-05-07T12:06:00.000Z",
      },
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-pending-plan", {
    initScript: ({ key, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        "football-data-safety-v1",
        JSON.stringify({
          entries: {
            [key]: {
              label: "Medical Room",
              pendingCentralSync: true,
              updatedAt: "2026-05-07T12:05:30.000Z",
            },
          },
        })
      );
    },
    initArg: { key: medicalTeamStateKey, value: JSON.stringify(localMedicalState) },
  });

  try {
    await expect
      .poll(() =>
        tab.page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          return {
            selectedDate: state.selectedDate,
            planIds: (state.injuryPlans || []).map((plan) => plan.id).sort(),
          };
        }, medicalTeamStateKey),
        { timeout: 10_000 }
      )
      .toEqual({
        selectedDate: "2026-05-17",
        planIds: ["plan-central", "plan-local"],
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});
