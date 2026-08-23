import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const revisionStateKey = "football-simulator-sequence-v1";
const periodizationStateKey = "football-periodization-v2";
const scheduleStateKey = "football-schedule-v1";
const sessionPlannerStateKey = "football-session-planner-v3";
const medicalTeamStateKey = "football-medical-team-v1";
const playerProfilesStateKey = "football-player-profiles-v1";
const platformStructureStateKey = "football-platform-structure-v1";
const dataSafetyManifestKey = "football-data-safety-v1";
const qaPrincipalScope = "qa-user-1:club-ncc:team-ncc-first";
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

function createSecondaryQaSession() {
  return {
    access_token: "qa-b-access-token",
    refresh_token: "qa-b-refresh-token",
    user: {
      id: "qa-user-2",
      email: "qa-2@footballscience.test",
      user_metadata: {
        firstName: "Second",
        lastName: "Coach",
        clubId: "club-b",
        teamId: "team-b",
      },
      app_metadata: { role: "coach", status: "active" },
    },
  };
}

function reverseObjectKeyOrder(value) {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeyOrder);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value).reverse().reduce((reversed, key) => {
    reversed[key] = reverseObjectKeyOrder(value[key]);
    return reversed;
  }, {});
}

function createFakeSupabaseScript(sessionUser = qaUser) {
  const session = {
    access_token: "qa-access-token",
    user: sessionUser,
  };

  return `
    window.__qaSession = ${JSON.stringify(session)};
    window.__qaAuthStateCallbacks = [];
    window.__qaSetSessionCalls = [];
    window.__qaSignOutScopes = [];
    window.supabase = {
      createClient() {
        return {
          auth: {
            getSession: async () => {
              if (window.__qaGetSessionDelayMs) {
                await new Promise((resolve) => window.setTimeout(resolve, window.__qaGetSessionDelayMs));
              }
              return {
                data: { session: window.__qaGetSessionResolvedSession || window.__qaSession },
                error: null,
              };
            },
            refreshSession: async () => ({ data: { session: window.__qaSession }, error: null }),
            signInWithPassword: async () => ({ data: { session: window.__qaSession }, error: null }),
            setSession: async (tokens) => {
              window.__qaSetSessionCalls.push({ ...tokens });
              if (window.__qaStartDelayedGetSessionDuringSetSession) {
                window.platformAuthStore.clearCurrentUser();
                window.__qaLateGetSessionTokenPromise = window.platformAuthStore.getAccessToken();
              }
              if (window.__qaSetSessionDelayMs) {
                await new Promise((resolve) => window.setTimeout(resolve, window.__qaSetSessionDelayMs));
              }
              if (window.__qaSetSessionError) {
                return { data: { session: null }, error: { message: window.__qaSetSessionError } };
              }
              if (window.__qaSetSessionResolvedSession) {
                window.__qaSession = window.__qaSetSessionResolvedSession;
                for (const callback of window.__qaAuthStateCallbacks) {
                  await callback("SIGNED_IN", window.__qaSession);
                }
                if (typeof window.__qaAfterSetSessionAuthEvent === "function") {
                  await window.__qaAfterSetSessionAuthEvent();
                }
              }
              return { data: { session: window.__qaSession }, error: null };
            },
            signOut: async (options = {}) => {
              window.__qaSignOutScopes.push(options.scope || "global");
              window.__qaSignOutPending = true;
              if (window.__qaSignOutDelayMs) {
                await new Promise((resolve) => window.setTimeout(resolve, window.__qaSignOutDelayMs));
              }
              window.__qaSession = null;
              window.__qaSignOutPending = false;
              return { error: null };
            },
            onAuthStateChange: (callback) => {
              window.__qaAuthStateCallbacks.push(callback);
              return { data: { subscription: { unsubscribe() {} } } };
            },
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
  const allSyncBodies = Array.isArray(options.allSyncBodies) ? options.allSyncBodies : [];
  const appStateRequests = Array.isArray(options.appStateRequests) ? options.appStateRequests : [];
  const authLoginRequests = Array.isArray(options.authLoginRequests) ? options.authLoginRequests : [];

  if (options.authLoginSession) {
    await context.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, session: options.authLoginSession }),
      });
    });
  }

  await context.route("**/npm/@supabase/supabase-js@2/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: createFakeSupabaseScript(sessionUser),
    });
  });

  await context.route("**/api/client-config", async (route) => {
    if (route.request().method().toUpperCase() === "POST" && options.authLoginSession) {
      authLoginRequests.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, session: options.authLoginSession }),
      });
      return;
    }
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
    const authorization = route.request().headers().authorization || "";
    const profileForRequest = Object.entries(options.profileUsersByAccessToken || {})
      .find(([token]) => authorization.includes(token))?.[1] || profileUser;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.has("me")
        ? { ok: true, user: profileForRequest }
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
      const requestUrl = new URL(request.url());
      const accessMode = requestUrl.searchParams.get("access") || "requested";
      const entries = centralStore.emptyCentralState
        ? {}
        : { [revisionStateKey]: centralStore.value, ...(centralStore.entries || {}) };
      const metadata = centralStore.emptyCentralState
        ? {}
        : { [revisionStateKey]: centralStore.metadata, ...(centralStore.metadataEntries || {}) };
      const includeAccess = accessMode !== "none" && !centralStore.omitWriteAccess;
      const defaultAccess = Object.fromEntries(Object.keys(entries).map((key) => [key, true]));
      const payload = {
        ok: true,
        entries,
        metadata,
        updatedAt: new Date().toISOString(),
      };
      if (includeAccess) {
        payload.writeAccess = {
          ...defaultAccess,
          ...(centralStore.writeAccess || {}),
        };
        payload.seedAccess = {
          ...defaultAccess,
          ...(centralStore.seedAccess || centralStore.writeAccess || {}),
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return;
    }

    const body = JSON.parse(request.postData() || "{}");
    allSyncBodies.push(body);
    appStateRequests.push({
      authorization: request.headers().authorization || "",
      body,
    });
    if (typeof options.appStateWriteHandler === "function") {
      const handled = await options.appStateWriteHandler({
        body,
        centralStore,
        route,
      });
      if (handled) {
        return;
      }
    }
    if (body.entries && typeof body.entries === "object") {
      const results = Object.keys(body.entries).map((key, index) => ({
        key,
        revision: index + 1,
        metadata: createMetadata(index + 1, String(body.entries[key] || "")),
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, keys: Object.keys(body.entries), results }),
      });
      return;
    }
    if (body.key !== revisionStateKey) {
      const value = String(body.value || "");
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      const revision = Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision + 1 : 1;
      if (Array.isArray(centralStore.rejectWriteKeys) && centralStore.rejectWriteKeys.includes(body.key)) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, reason: `You do not have edit access for ${body.key}.` }),
        });
        return;
      }
      const nextMetadata = {
        revision,
        updatedAt: new Date().toISOString(),
        updatedBy: qaUser.id,
        organizationId: "org-qa",
        moduleId: "qa-ignored",
        mergePolicy: "revision-guarded-last-write",
        hash: `ignored-${value.length}`,
        size: value.length,
      };
      centralStore.entries = { ...(centralStore.entries || {}), [body.key]: value };
      centralStore.metadataEntries = { ...(centralStore.metadataEntries || {}), [body.key]: nextMetadata };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          key: body.key || "",
          value,
          revision,
          metadata: nextMetadata,
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
  await context.route("**/platform-auth-boot.js*", async (route) => {
    const requestedTimeout = Number(options.authSetSessionTimeoutMs);
    let source = readFileSync(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
    if (Number.isFinite(requestedTimeout) && requestedTimeout > 0) {
      source = source.replace(
        "const AUTH_SERVER_SESSION_INSTALL_TIMEOUT_MS = 5000;",
        `const AUTH_SERVER_SESSION_INSTALL_TIMEOUT_MS = ${Math.floor(requestedTimeout)};`
      );
    }
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: source,
    });
  });
  await context.route("**/src/core/central-sync-runtime-service.mjs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: readFileSync(new URL("../src/core/central-sync-runtime-service.mjs", import.meta.url), "utf8"),
    });
  });
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
  if (options.expectAuthFailure) {
    await expect(page.locator("#loginScreen")).toBeVisible();
    return { context, page };
  }
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

test("pending central data is quarantined across principals and restored only to its owner", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const allSyncBodies = [];
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "principal-pending-quarantine", { allSyncBodies });
  const principalB = {
    id: "qa-user-2",
    email: "qa-2@footballscience.test",
    firstName: "Second",
    lastName: "Coach",
    role: "coach",
    clubId: "club-b",
    teamId: "team-b",
  };
  const valueA = JSON.stringify({ injuryPlans: [{ id: "private-plan-a" }] });

  try {
    const afterB = await tab.page.evaluate(({ key, manifestKey, principalB, principalScope, valueA }) => {
      const principalA = window.platformAuthStore.getCurrentUser();
      window.__qaPrincipalA = principalA;
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, valueA);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries = manifest.entries || {};
        manifest.entries[key] = {
          label: "Medical Room",
          hash: "private-plan-a-hash",
          writes: 4,
          updatedAt: "2026-08-23T12:00:00.000Z",
          pendingCentralSync: true,
          principalScope,
          serverRevision: 2,
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.platformAuthStore.writeUsers([principalA, principalB]);
      window.platformAuthStore.setCurrentUser(principalB.id);
      const afterBManifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        activeScope: afterBManifest.activePrincipalScope,
        currentUserId: window.platformAuthStore.getCurrentUser()?.id,
        exposedValue: window.localStorage.getItem(key),
        quarantinedValue: afterBManifest.principalPending?.[principalScope]?.[key]?.value,
      };
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalB,
      principalScope: qaPrincipalScope,
      valueA,
    });

    expect(afterB).toEqual({
      activeScope: "qa-user-2:club-b:team-b",
      currentUserId: "qa-user-2",
      exposedValue: null,
      quarantinedValue: valueA,
    });
    await tab.page.waitForTimeout(250);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey).some((body) => (
      String(body.value || "").includes("private-plan-a")
    ))).toBe(false);

    const afterA = await tab.page.evaluate(({ key, manifestKey }) => {
      window.platformAuthStore.setCurrentUser(window.__qaPrincipalA.id);
      const afterAManifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        activeScope: afterAManifest.activePrincipalScope,
        currentUserId: window.platformAuthStore.getCurrentUser()?.id,
        pending: afterAManifest.entries?.[key]?.pendingCentralSync,
        principalScope: afterAManifest.entries?.[key]?.principalScope,
        restoredValue: window.localStorage.getItem(key),
      };
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
    });

    expect(afterA).toEqual({
      activeScope: qaPrincipalScope,
      currentUserId: qaUser.id,
      pending: true,
      principalScope: qaPrincipalScope,
      restoredValue: valueA,
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("legacy unscoped pending data is quarantined and never adopted for automatic sync", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const allSyncBodies = [];
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "legacy-unscoped-quarantine", { allSyncBodies });
  const legacyValue = JSON.stringify({ injuryPlans: [{ id: "legacy-private-plan" }] });
  const principalB = {
    id: "qa-user-2",
    email: "qa-2@footballscience.test",
    firstName: "Second",
    lastName: "Coach",
    role: "coach",
    clubId: "club-b",
    teamId: "team-b",
  };

  try {
    const result = await tab.page.evaluate(({ key, legacyValue, manifestKey, principalB, principalScope }) => {
      const currentUser = window.platformAuthStore.getCurrentUser();
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, legacyValue);
        window.localStorage.setItem(manifestKey, JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              pendingCentralSync: true,
              writes: 1,
            },
          },
        }));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.platformAuthStore.writeUsers([currentUser, principalB]);
      window.platformAuthStore.setCurrentUser(principalB.id);
      const afterB = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      window.platformAuthStore.setCurrentUser(currentUser.id);
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        activeEntry: manifest.entries?.[key] || null,
        afterBActiveEntry: afterB.entries?.[key] || null,
        afterBLegacyValue: afterB.principalPending?.["legacy-unscoped"]?.[key]?.value,
        exposedValue: window.localStorage.getItem(key),
        legacyValue: manifest.principalPending?.["legacy-unscoped"]?.[key]?.value,
      };
    }, {
      key: medicalTeamStateKey,
      legacyValue,
      manifestKey: dataSafetyManifestKey,
      principalB,
      principalScope: qaPrincipalScope,
    });

    expect(result.afterBActiveEntry).toBeNull();
    expect(result.afterBLegacyValue).toBe(legacyValue);
    expect(result.legacyValue).toBe(legacyValue);
    expect(result.activeEntry).toBeNull();
    expect(result.exposedValue).toBeNull();
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey).some((body) => (
      String(body.value || "").includes("legacy-private-plan")
    ))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

for (const manifestWritesBeforeFailure of [0, 1]) {
  test(`principal transition fails closed when manifest write ${manifestWritesBeforeFailure + 1} fails`, async ({ browser, baseURL }) => {
    const initialValue = createStateValue("Original central sequence");
    const allSyncBodies = [];
    const tab = await bootCentralPage(browser, baseURL, {
      value: initialValue,
      metadata: createMetadata(1, initialValue),
    }, [], `principal-quota-${manifestWritesBeforeFailure}`, {
      allSyncBodies,
      initScript: ({ manifestKey }) => {
        const originalSetItem = window.Storage.prototype.setItem;
        window.__qaManifestWritesBeforeFailure = -1;
        window.Storage.prototype.setItem = function failSelectedManifestWrite(key, value) {
          if (key === manifestKey && window.__qaManifestWritesBeforeFailure >= 0) {
            if (window.__qaManifestWritesBeforeFailure === 0) {
              throw new DOMException("Quota exceeded", "QuotaExceededError");
            }
            window.__qaManifestWritesBeforeFailure -= 1;
          }
          return originalSetItem.call(this, key, value);
        };
      },
      initArg: { manifestKey: dataSafetyManifestKey },
    });
    const principalB = {
      id: "qa-user-2",
      email: "qa-2@footballscience.test",
      role: "coach",
      clubId: "club-b",
      teamId: "team-b",
    };
    const valueA = JSON.stringify({ injuryPlans: [{ id: "must-survive" }] });

    try {
      const result = await tab.page.evaluate(({
        key,
        manifestKey,
        manifestWritesBeforeFailure,
        principalB,
        principalScope,
        valueA,
      }) => {
        const principalA = window.platformAuthStore.getCurrentUser();
        window.__footballScienceCentralHydrating = true;
        try {
          window.localStorage.setItem(key, valueA);
          const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
          manifest.activePrincipalScope = principalScope;
          manifest.entries[key] = {
            label: "Medical Room",
            pendingCentralSync: true,
            principalScope,
            writes: 3,
          };
          window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
        } finally {
          window.__footballScienceCentralHydrating = false;
        }
        window.platformAuthStore.writeUsers([principalA, principalB]);
        window.__qaManifestWritesBeforeFailure = manifestWritesBeforeFailure;
        window.platformAuthStore.setCurrentUser(principalB.id);
        window.__qaManifestWritesBeforeFailure = -1;
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        return {
          activeScope: manifest.activePrincipalScope,
          currentUserId: window.platformAuthStore.getCurrentUser()?.id,
          pending: manifest.entries?.[key]?.pendingCentralSync,
          value: window.localStorage.getItem(key),
        };
      }, {
        key: medicalTeamStateKey,
        manifestKey: dataSafetyManifestKey,
        manifestWritesBeforeFailure,
        principalB,
        principalScope: qaPrincipalScope,
        valueA,
      });

      expect(result).toEqual({
        activeScope: qaPrincipalScope,
        currentUserId: qaUser.id,
        pending: true,
        value: valueA,
      });
    } finally {
      await closeCentralStateContext(tab.context);
    }
  });
}

test("failed phase-two principal transition removes another principal's restored cache value", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const allSyncBodies = [];
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "principal-phase-two-cache-rollback", {
    allSyncBodies,
    initScript: ({ manifestKey }) => {
      const originalSetItem = window.Storage.prototype.setItem;
      window.__qaManifestWritesBeforeFailure = -1;
      window.Storage.prototype.setItem = function failSelectedManifestWrite(key, value) {
        if (key === manifestKey && window.__qaManifestWritesBeforeFailure >= 0) {
          if (window.__qaManifestWritesBeforeFailure === 0) {
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          }
          window.__qaManifestWritesBeforeFailure -= 1;
        }
        return originalSetItem.call(this, key, value);
      };
    },
    initArg: { manifestKey: dataSafetyManifestKey },
  });
  const principalB = {
    id: "qa-user-2",
    email: "qa-2@footballscience.test",
    role: "coach",
    clubId: "club-b",
    teamId: "team-b",
  };
  const principalBScope = "qa-user-2:club-b:team-b";
  const valueA = JSON.stringify({ events: [{ id: "owner-a-schedule" }] });
  const valueB = JSON.stringify({ injuryPlans: [{ id: "owner-b-medical" }] });

  try {
    const result = await tab.page.evaluate(({
      manifestKey,
      medicalKey,
      principalB,
      principalBScope,
      principalScope,
      scheduleKey,
      valueA,
      valueB,
    }) => {
      const principalA = window.platformAuthStore.getCurrentUser();
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(scheduleKey, valueA);
        window.localStorage.removeItem(medicalKey);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries = {
          ...(manifest.entries || {}),
          [scheduleKey]: {
            label: "Schedule",
            pendingCentralSync: true,
            principalScope,
            writes: 4,
          },
        };
        delete manifest.entries[medicalKey];
        manifest.principalPending = {
          ...(manifest.principalPending || {}),
          [principalBScope]: {
            [medicalKey]: {
              entry: {
                label: "Medical Room",
                pendingCentralSync: true,
                principalScope: principalBScope,
                writes: 3,
              },
              value: valueB,
            },
          },
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.platformAuthStore.writeUsers([principalA, principalB]);
      window.__qaManifestWritesBeforeFailure = 1;
      window.platformAuthStore.setCurrentUser(principalB.id);
      window.__qaManifestWritesBeforeFailure = -1;
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        activeScope: manifest.activePrincipalScope,
        currentUserId: window.platformAuthStore.getCurrentUser()?.id,
        medicalValue: window.localStorage.getItem(medicalKey),
        quarantinedMedicalValue: manifest.principalPending?.[principalBScope]?.[medicalKey]?.value,
        scheduleValue: window.localStorage.getItem(scheduleKey),
      };
    }, {
      manifestKey: dataSafetyManifestKey,
      medicalKey: medicalTeamStateKey,
      principalB,
      principalBScope,
      principalScope: qaPrincipalScope,
      scheduleKey: scheduleStateKey,
      valueA,
      valueB,
    });

    expect(result).toEqual({
      activeScope: qaPrincipalScope,
      currentUserId: qaUser.id,
      medicalValue: null,
      quarantinedMedicalValue: valueB,
      scheduleValue: valueA,
    });
    expect(allSyncBodies.some((body) => String(body.value || "").includes("owner-b-medical"))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("token refresh never commits a new principal session when pending-data quarantine fails", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const allSyncBodies = [];
  const appStateRequests = [];
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "token-refresh-quarantine-failure", {
    allSyncBodies,
    appStateRequests,
    initScript: ({ manifestKey }) => {
      const originalSetItem = window.Storage.prototype.setItem;
      window.__qaManifestWritesBeforeFailure = -1;
      window.Storage.prototype.setItem = function failSelectedManifestWrite(key, value) {
        if (key === manifestKey && window.__qaManifestWritesBeforeFailure >= 0) {
          if (window.__qaManifestWritesBeforeFailure === 0) {
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          }
          window.__qaManifestWritesBeforeFailure -= 1;
        }
        return originalSetItem.call(this, key, value);
      };
    },
    initArg: { manifestKey: dataSafetyManifestKey },
  });
  const valueA = JSON.stringify({ injuryPlans: [{ id: "token-owner-a" }] });

  try {
    const result = await tab.page.evaluate(({ key, manifestKey, principalScope, valueA }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, valueA);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries[key] = {
          label: "Medical Room",
          pendingCentralSync: true,
          principalScope,
          writes: 5,
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.__qaSession = {
        access_token: "qa-b-access-token",
        user: {
          id: "qa-user-2",
          email: "qa-2@footballscience.test",
          user_metadata: {
            firstName: "Second",
            lastName: "Coach",
            clubId: "club-b",
            teamId: "team-b",
          },
          app_metadata: { role: "coach", status: "active" },
        },
      };
      window.__qaManifestWritesBeforeFailure = 0;
      return window.platformAuthStore.refreshAccessToken().then(async (refreshedToken) => {
        window.__qaManifestWritesBeforeFailure = -1;
        return {
          activeToken: await window.platformAuthStore.getAccessToken(),
          currentUserId: window.platformAuthStore.getCurrentUser()?.id,
          pendingValue: window.localStorage.getItem(key),
          refreshedToken,
          userIds: window.platformAuthStore.getUsers().map((user) => user.id),
        };
      });
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      valueA,
    });

    expect(result).toEqual({
      activeToken: "qa-access-token",
      currentUserId: qaUser.id,
      pendingValue: valueA,
      refreshedToken: null,
      userIds: [qaUser.id],
    });
    expect(appStateRequests.some((request) => request.authorization.includes("qa-b-access-token"))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("server login never installs a new SDK session when principal transition fails", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const sessionB = createSecondaryQaSession();
  const appStateRequests = [];
  const authLoginRequests = [];
  const valueA = JSON.stringify({ injuryPlans: [{ id: "server-login-owner-a" }] });
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "server-login-quarantine-failure", {
    appStateRequests,
    authLoginRequests,
    authLoginSession: sessionB,
    initScript: ({ manifestKey }) => {
      const originalSetItem = window.Storage.prototype.setItem;
      window.__qaFailNextManifestWrite = false;
      window.Storage.prototype.setItem = function failNextManifestWrite(key, value) {
        if (key === manifestKey && window.__qaFailNextManifestWrite) {
          window.__qaFailNextManifestWrite = false;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    },
    initArg: { manifestKey: dataSafetyManifestKey },
  });

  try {
    await tab.page.evaluate(({ key, manifestKey, principalScope, valueA }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, valueA);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries[key] = {
          label: "Medical Room",
          pendingCentralSync: true,
          principalScope,
          writes: 6,
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.__qaFailNextManifestWrite = true;
      document.getElementById("loginUsername").value = "qa-2@footballscience.test";
      document.getElementById("loginPassword").value = "test-password";
      document.getElementById("loginForm").requestSubmit();
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      valueA,
    });

    await expect(tab.page.locator("#loginError")).toContainText("Local pending data could not be isolated safely");
    const result = await tab.page.evaluate(async ({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        activeToken: await window.platformAuthStore.getAccessToken(),
        currentUserId: window.platformAuthStore.getCurrentUser()?.id,
        pending: manifest.entries?.[key]?.pendingCentralSync,
        pendingValue: window.localStorage.getItem(key),
        sdkSessionUserId: window.__qaSession?.user?.id || "",
        setSessionCalls: window.__qaSetSessionCalls.length,
        signOutScopes: [...window.__qaSignOutScopes],
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });

    expect(result).toEqual({
      activeToken: "qa-access-token",
      currentUserId: qaUser.id,
      pending: true,
      pendingValue: valueA,
      sdkSessionUserId: qaUser.id,
      setSessionCalls: 0,
      signOutScopes: [],
    });
    expect(authLoginRequests).toHaveLength(1);
    expect(appStateRequests.some((request) => request.authorization.includes(sessionB.access_token))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("late server session installation is rejected after a bounded timeout", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const sessionB = createSecondaryQaSession();
  const appStateRequests = [];
  const authLoginRequests = [];
  const valueA = JSON.stringify({ injuryPlans: [{ id: "late-session-owner-a" }] });
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "late-server-session-rejection", {
    appStateRequests,
    authLoginRequests,
    authLoginSession: sessionB,
    authSetSessionTimeoutMs: 25,
    profileUsersByAccessToken: { [sessionB.access_token]: sessionB.user },
  });

  try {
    await tab.page.evaluate(({ key, manifestKey, principalScope, sessionB, valueA }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, valueA);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries[key] = {
          label: "Medical Room",
          pendingCentralSync: true,
          principalScope,
          writes: 7,
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.__qaSetSessionDelayMs = 100;
      window.__qaSetSessionResolvedSession = sessionB;
      window.__qaGetSessionDelayMs = 150;
      window.__qaGetSessionResolvedSession = sessionB;
      window.__qaStartDelayedGetSessionDuringSetSession = true;
      window.__qaLoginErrorMessages = [];
      const loginError = document.getElementById("loginError");
      new MutationObserver(() => {
        const message = String(loginError?.textContent || "").trim();
        if (message) {
          window.__qaLoginErrorMessages.push(message);
        }
      }).observe(loginError, { childList: true, characterData: true, subtree: true });
      window.__qaAfterSetSessionAuthEvent = async () => {
        document.getElementById("loginUsername").value = "qa-3@footballscience.test";
        document.getElementById("loginPassword").value = "test-password";
        document.getElementById("loginForm").dispatchEvent(new Event("submit", {
          bubbles: true,
          cancelable: true,
        }));
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      };
      document.getElementById("loginUsername").value = "qa-2@footballscience.test";
      document.getElementById("loginPassword").value = "test-password";
      document.getElementById("loginForm").requestSubmit();
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      sessionB,
      valueA,
    });

    await expect.poll(() => tab.page.evaluate(() => ({
      currentUserId: window.platformAuthStore.getCurrentUser()?.id || "",
      sdkSessionUserId: window.__qaSession?.user?.id || "",
      setSessionCalls: window.__qaSetSessionCalls.length,
      signOutPending: Boolean(window.__qaSignOutPending),
      visiblePrincipalId: window.platformSession?.id || "",
    }))).toEqual({
      currentUserId: "",
      sdkSessionUserId: "",
      setSessionCalls: 1,
      signOutPending: false,
      visiblePrincipalId: "",
    });
    const finalState = await tab.page.evaluate(async (manifestKey) => {
      const lateToken = await window.__qaLateGetSessionTokenPromise;
      return {
        currentUserId: window.platformAuthStore.getCurrentUser()?.id || "",
        lateToken,
        loginErrorMessages: [...window.__qaLoginErrorMessages],
        manifest: JSON.parse(window.localStorage.getItem(manifestKey) || "{}"),
        sdkSessionUserId: window.__qaSession?.user?.id || "",
        signOutScopes: [...window.__qaSignOutScopes],
      };
    }, dataSafetyManifestKey);
    const manifest = finalState.manifest;
    expect(manifest.principalPending?.[qaPrincipalScope]?.[medicalTeamStateKey]?.value).toBe(valueA);
    expect(finalState.signOutScopes.length).toBeGreaterThanOrEqual(1);
    expect(finalState.signOutScopes.every((scope) => scope === "local")).toBe(true);
    expect(finalState.lateToken).toBeNull();
    expect(finalState.currentUserId).toBe("");
    expect(finalState.sdkSessionUserId).toBe("");
    expect(finalState.loginErrorMessages.some((message) => message.includes("local session could not be saved safely"))).toBe(true);
    expect(finalState.loginErrorMessages.some((message) => message.includes("still being cleaned up"))).toBe(true);
    expect(authLoginRequests).toHaveLength(1);
    expect(appStateRequests.some((request) => request.authorization.includes(sessionB.access_token))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("existing SDK session failure signs out locally and quarantines the previous principal", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const sessionB = createSecondaryQaSession();
  const appStateRequests = [];
  const valueA = JSON.stringify({ injuryPlans: [{ id: "existing-session-owner-a" }] });
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "existing-session-quarantine-failure", {
    appStateRequests,
    expectAuthFailure: true,
    sessionUser: sessionB.user,
    initScript: ({ key, manifestKey, principalScope, valueA }) => {
      const originalSetItem = window.Storage.prototype.setItem;
      window.localStorage.setItem(key, valueA);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {
          [key]: {
            label: "Medical Room",
            pendingCentralSync: true,
            principalScope,
            writes: 7,
          },
        },
      }));
      window.__qaSignOutDelayMs = 50;
      window.__qaFailNextManifestWrite = true;
      window.Storage.prototype.setItem = function failNextManifestWrite(storageKey, value) {
        if (storageKey === manifestKey && window.__qaFailNextManifestWrite) {
          window.__qaFailNextManifestWrite = false;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return originalSetItem.call(this, storageKey, value);
      };
    },
    initArg: {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      valueA,
    },
  });

  try {
    await tab.page.evaluate(() => window.platformAuthReadyPromise);
    const result = await tab.page.evaluate(({ key, manifestKey, principalScope }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        currentUserId: window.platformAuthStore.getCurrentUser()?.id || "",
        quarantinedValue: manifest.principalPending?.[principalScope]?.[key]?.value || "",
        sdkSessionUserId: window.__qaSession?.user?.id || "",
        signOutPending: Boolean(window.__qaSignOutPending),
        signOutScopes: [...window.__qaSignOutScopes],
      };
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    });

    expect(result).toEqual({
      currentUserId: "",
      quarantinedValue: valueA,
      sdkSessionUserId: "",
      signOutPending: false,
      signOutScopes: ["local"],
    });
    expect(appStateRequests.some((request) => request.authorization.includes(sessionB.access_token))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("auth state change failure cannot show the previous principal under the new SDK session", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const sessionB = createSecondaryQaSession();
  const appStateRequests = [];
  const valueA = JSON.stringify({ injuryPlans: [{ id: "auth-event-owner-a" }] });
  const tab = await bootCentralPage(browser, baseURL, {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
  }, [], "auth-event-quarantine-failure", {
    appStateRequests,
    initScript: ({ manifestKey }) => {
      const originalSetItem = window.Storage.prototype.setItem;
      window.__qaFailNextManifestWrite = false;
      window.Storage.prototype.setItem = function failNextManifestWrite(key, value) {
        if (key === manifestKey && window.__qaFailNextManifestWrite) {
          window.__qaFailNextManifestWrite = false;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    },
    initArg: { manifestKey: dataSafetyManifestKey },
  });

  try {
    const result = await tab.page.evaluate(async ({ key, manifestKey, principalScope, sessionB, valueA }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, valueA);
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        manifest.activePrincipalScope = principalScope;
        manifest.entries[key] = {
          label: "Medical Room",
          pendingCentralSync: true,
          principalScope,
          writes: 8,
        };
        window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      window.__qaSession = sessionB;
      window.__qaSignOutDelayMs = 50;
      window.__qaFailNextManifestWrite = true;
      await window.__qaAuthStateCallbacks[0]("SIGNED_IN", sessionB);
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        currentUserId: window.platformAuthStore.getCurrentUser()?.id || "",
        quarantinedValue: manifest.principalPending?.[principalScope]?.[key]?.value || "",
        sdkSessionUserId: window.__qaSession?.user?.id || "",
        signOutPending: Boolean(window.__qaSignOutPending),
        signOutScopes: [...window.__qaSignOutScopes],
      };
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      sessionB,
      valueA,
    });

    expect(result).toEqual({
      currentUserId: "",
      quarantinedValue: valueA,
      sdkSessionUserId: "",
      signOutPending: false,
      signOutScopes: ["local"],
    });
    expect(appStateRequests.some((request) => request.authorization.includes(sessionB.access_token))).toBe(false);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("central writes require a matching key and a strictly advancing durable revision", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const scheduleValue = JSON.stringify({ events: [] });
  let acknowledgementMode = "passthrough";
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [scheduleStateKey]: scheduleValue },
    metadataEntries: { [scheduleStateKey]: createMetadata(4, scheduleValue) },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "strict-central-ack", {
    appStateWriteHandler: async ({ body, route }) => {
      if (body.key !== scheduleStateKey) {
        return false;
      }
      if (acknowledgementMode === "passthrough") {
        return false;
      }
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      const payload = {
        ok: true,
        key: acknowledgementMode === "wrong-key" ? medicalTeamStateKey : scheduleStateKey,
        value: String(body.value || ""),
      };
      if (acknowledgementMode === "equal") {
        payload.revision = baseRevision;
        payload.metadata = { revision: baseRevision };
      } else if (acknowledgementMode === "lower") {
        payload.revision = Math.max(0, baseRevision - 1);
        payload.metadata = { revision: Math.max(0, baseRevision - 1) };
      } else if (acknowledgementMode === "wrong-key" || acknowledgementMode === "valid") {
        payload.revision = baseRevision + 1;
        payload.metadata = { revision: baseRevision + 1 };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return true;
    },
  });

  try {
    const baseRevision = await tab.page.evaluate((key) => (
      window.footballScienceCentralState.getStatus().metadata[key]?.revision
    ), scheduleStateKey);
    for (const mode of ["missing", "equal", "lower", "wrong-key"]) {
      acknowledgementMode = mode;
      const result = await tab.page.evaluate(({ baseRevision, key, value }) => (
        window.footballScienceCentralState.syncKey(key, value, { baseRevision })
      ), { baseRevision, key: scheduleStateKey, value: JSON.stringify({ events: [{ id: mode }] }) });
      expect(result).toMatchObject({ ok: false, status: 409, conflict: true });
      expect(await tab.page.evaluate((key) => (
        window.footballScienceCentralState.getStatus().metadata[key]?.revision
      ), scheduleStateKey)).toBe(baseRevision);
    }

    acknowledgementMode = "valid";
    const validResult = await tab.page.evaluate(({ baseRevision, key, value }) => (
      window.footballScienceCentralState.syncKey(key, value, { baseRevision })
    ), { baseRevision, key: scheduleStateKey, value: JSON.stringify({ events: [{ id: "valid" }] }) });
    expect(validResult).toMatchObject({ ok: true, key: scheduleStateKey, revision: baseRevision + 1 });
    expect(await tab.page.evaluate((key) => (
      window.footballScienceCentralState.getStatus().metadata[key]?.revision
    ), scheduleStateKey)).toBe(baseRevision + 1);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

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

async function bootPendingMedicalHydration(browser, baseURL, accessMode, options = {}) {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    players: [{ id: "player-1", name: "QA Player" }],
    records: [],
    injuryPlans: [],
  };
  const localMedicalState = {
    ...centralMedicalState,
    selectedDate: "2026-08-23",
    injuryPlans: [{
      id: "pending-plan-1",
      playerId: "player-1",
      injuryType: "Pending local plan",
      updatedAt: "2026-08-23T10:00:00.000Z",
    }],
  };
  const centralMedicalValue = JSON.stringify(centralMedicalState);
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: centralMedicalValue },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(2, centralMedicalValue),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      },
    },
    ...(accessMode === "missing"
      ? { omitWriteAccess: true }
      : { writeAccess: { [medicalTeamStateKey]: accessMode === "true" } }),
    ...(options.rejectWrite ? { rejectWriteKeys: [medicalTeamStateKey] } : {}),
  };
  const coachUser = {
    ...qaUser,
    app_metadata: { role: "coach", status: "active" },
  };
  const allSyncBodies = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], `coach-medical-${accessMode}-hydration`, {
    ...options,
    sessionUser: coachUser,
    profileUser: coachUser,
    allSyncBodies,
    initScript: ({ key, value, manifestKey, principalScope, stagePendingOnBoot }) => {
      if (!stagePendingOnBoot) {
        return;
      }
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {
          [key]: {
            label: "Medical Room",
            updatedAt: "2026-08-23T10:00:00.000Z",
            pendingCentralSync: true,
            principalScope,
          },
        },
      }));
    },
    initArg: {
      key: medicalTeamStateKey,
      value: JSON.stringify(localMedicalState),
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      stagePendingOnBoot: !options.stagePendingAfterBoot,
    },
  });
  return { allSyncBodies, centralStore, tab };
}

for (const accessMode of ["false", "missing"]) {
  test(`coach central hydration keeps pending Medical data when write access is ${accessMode}`, async ({ browser, baseURL }) => {
    const { allSyncBodies, tab } = await bootPendingMedicalHydration(browser, baseURL, accessMode);

    try {
      await tab.page.evaluate(async () => {
        await window.footballScienceCentralState.hydrate({ forceApply: true });
        await window.footballScienceCentralState.hydrate({ forceApply: true });
      });

      expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(0);
      expect(await tab.page.evaluate(({ key, manifestKey }) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
        return {
          hydrated: window.footballScienceCentralState.getStatus().hydrated,
          lastError: window.footballScienceCentralState.getStatus().lastError || "",
          pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
          planIds: (state.injuryPlans || []).map((plan) => plan.id),
        };
      }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
        hydrated: true,
        lastError: "",
        pendingCentralSync: true,
        planIds: ["pending-plan-1"],
      });
    } finally {
      await closeCentralStateContext(tab.context);
    }
  });
}

test("authorized Medical hydration writes pending data exactly once and clears pending after 200", async ({ browser, baseURL }) => {
  const { allSyncBodies, tab } = await bootPendingMedicalHydration(browser, baseURL, "true");

  try {
    await tab.page.evaluate(async () => {
      await window.footballScienceCentralState.hydrate({ forceApply: true });
    });

    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(1);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        lastError: window.footballScienceCentralState.getStatus().lastError || "",
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: false,
      lastError: "",
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Medical hydration acknowledges shared data when only local view fields differ", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    players: [{ id: "player-1", name: "QA Player" }],
    records: [],
    injuryPlans: [{
      id: "shared-plan-1",
      playerId: "player-1",
      injuryType: "Shared plan",
      updatedAt: "2026-08-23T10:00:00.000Z",
    }],
  };
  const centralMedicalValue = JSON.stringify(centralMedicalState);
  const allSyncBodies = [];
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: centralMedicalValue },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(2, centralMedicalValue),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      },
    },
    writeAccess: { [medicalTeamStateKey]: true },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-local-view-ack", {
    allSyncBodies,
  });

  try {
    await tab.page.waitForTimeout(250);
    const stableSharedMedicalValue = await tab.page.evaluate(({ key, localUiFields }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      localUiFields.forEach((field) => delete state[field]);
      return JSON.stringify(state);
    }, {
      key: medicalTeamStateKey,
      localUiFields: ["selectedDate", "selectedPlayerId"],
    });
    centralStore.entries[medicalTeamStateKey] = stableSharedMedicalValue;
    centralStore.metadataEntries[medicalTeamStateKey] = {
      ...createMetadata(3, stableSharedMedicalValue),
      moduleId: "medical-team",
      mergePolicy: "record-timestamp-merge",
    };
    allSyncBodies.length = 0;

    await tab.page.evaluate(async ({ key, manifestKey, principalScope, value }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, value);
        window.localStorage.setItem(manifestKey, JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              hash: "local-view-only-hash",
              writes: 1,
              updatedAt: "2026-08-23T10:01:00.000Z",
              pendingCentralSync: true,
              principalScope,
            },
          },
        }));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      await window.footballScienceCentralState.hydrate({ forceApply: true });
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      value: JSON.stringify({
        ...reverseObjectKeyOrder(JSON.parse(stableSharedMedicalValue)),
        selectedDate: "2026-08-24",
        selectedPlayerId: "player-1",
      }),
    });

    const initialMedicalWrites = allSyncBodies.filter((body) => body.key === medicalTeamStateKey);
    expect(initialMedicalWrites.length).toBeLessThanOrEqual(1);
    expect(JSON.parse(centralStore.entries[medicalTeamStateKey])).toEqual(JSON.parse(stableSharedMedicalValue));
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        selectedDate: state.selectedDate,
        selectedPlayerId: state.selectedPlayerId,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: false,
      selectedDate: "2026-08-24",
      selectedPlayerId: "player-1",
    });
    await tab.page.waitForTimeout(350);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ forceApply: true }));
    await tab.page.waitForTimeout(250);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(initialMedicalWrites.length);

    centralStore.writeAccess[medicalTeamStateKey] = false;
    allSyncBodies.length = 0;
    await tab.page.evaluate(async ({ key, manifestKey, principalScope }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      state.injuryPlans = [
        ...(state.injuryPlans || []),
        {
          id: "local-shared-difference",
          playerId: "player-1",
          injuryType: "Pending shared difference",
          updatedAt: "2026-08-23T10:02:00.000Z",
        },
      ];
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
        window.localStorage.setItem(manifestKey, JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              hash: "real-shared-difference-hash",
              writes: 2,
              updatedAt: "2026-08-23T10:02:00.000Z",
              pendingCentralSync: true,
              principalScope,
            },
          },
        }));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      await window.footballScienceCentralState.hydrate({ forceApply: true });
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    });

    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(0);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        planIds: (state.injuryPlans || []).map((plan) => plan.id),
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: true,
      planIds: expect.arrayContaining(["local-shared-difference"]),
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Medical hydration acknowledgement never clears a newer pending local write", async ({ browser, baseURL }) => {
  let resolveFirstWrite;
  let resolveSecondWrite;
  const firstWriteGate = new Promise((resolve) => { resolveFirstWrite = resolve; });
  const secondWriteGate = new Promise((resolve) => { resolveSecondWrite = resolve; });
  let medicalWriteCount = 0;
  const medicalResponseStatuses = [];

  const { allSyncBodies, centralStore, tab } = await bootPendingMedicalHydration(browser, baseURL, "true", {
    stagePendingAfterBoot: true,
    appStateWriteHandler: async ({ body, centralStore, route }) => {
      if (body.key !== medicalTeamStateKey) {
        return false;
      }
      medicalWriteCount += 1;
      if (medicalWriteCount === 1) {
        await firstWriteGate;
      } else if (medicalWriteCount === 2) {
        await secondWriteGate;
      }
      const value = String(body.value || "");
      const currentRevision = Number(centralStore.metadataEntries?.[medicalTeamStateKey]?.revision) || 0;
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      if (baseRevision !== currentRevision) {
        medicalResponseStatuses.push(409);
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            reason: "Stale medical-team data was not saved because the central state is already newer.",
            currentRevision,
          }),
        });
        return true;
      }
      const metadata = {
        ...createMetadata(currentRevision + 1, value),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      };
      centralStore.entries = { ...(centralStore.entries || {}), [medicalTeamStateKey]: value };
      centralStore.metadataEntries = {
        ...(centralStore.metadataEntries || {}),
        [medicalTeamStateKey]: metadata,
      };
      medicalResponseStatuses.push(200);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          key: medicalTeamStateKey,
          value,
          revision: metadata.revision,
          metadata,
        }),
      });
      return true;
    },
  });

  try {
    await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      state.selectedDate = "2026-08-23";
      state.injuryPlans = [{
        id: "pending-plan-1",
        playerId: "player-1",
        injuryType: "Pending local plan",
        updatedAt: "2026-08-23T10:00:00.000Z",
      }];
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      manifest.entries[key].pendingCentralSync = true;
      window.localStorage.setItem(manifestKey, JSON.stringify(manifest));
      window.__qaMedicalHydrationPromise = window.footballScienceCentralState.hydrate({ forceApply: true });
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
    await expect.poll(() => medicalWriteCount).toBe(1);
    await tab.page.evaluate(({ key }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      state.injuryPlans = [
        ...(state.injuryPlans || []),
        {
          id: "pending-plan-2",
          playerId: "player-1",
          injuryType: "Newer pending local plan",
          updatedAt: "2026-08-23T10:01:00.000Z",
        },
      ];
      window.localStorage.setItem(key, JSON.stringify(state));
    }, { key: medicalTeamStateKey });

    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        planIds: (state.injuryPlans || []).map((plan) => plan.id).sort(),
        writes: manifest.entries?.[key]?.writes,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: true,
      planIds: ["pending-plan-1", "pending-plan-2"],
      writes: 2,
    });

    await tab.page.waitForTimeout(350);
    expect(medicalWriteCount).toBe(1);

    resolveFirstWrite();
    await expect.poll(() => medicalWriteCount).toBe(2);

    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(2);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        planIds: (state.injuryPlans || []).map((plan) => plan.id).sort(),
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: true,
      planIds: ["pending-plan-1", "pending-plan-2"],
    });

    resolveSecondWrite();
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return manifest.entries?.[key]?.pendingCentralSync;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toBe(false);

    const medicalWrites = allSyncBodies.filter((body) => body.key === medicalTeamStateKey);
    expect(medicalWrites).toHaveLength(2);
    expect(medicalWrites.map((body) => Number(body?.metadata?.baseRevision ?? body?.baseRevision)))
      .toEqual([2, 3]);
    expect(medicalResponseStatuses).toEqual([200, 200]);
    expect(JSON.parse(medicalWrites[0].value).injuryPlans.map((plan) => plan.id).sort())
      .toEqual(["pending-plan-1"]);
    expect(JSON.parse(medicalWrites[1].value).injuryPlans.map((plan) => plan.id).sort())
      .toEqual(["pending-plan-1", "pending-plan-2"]);
    expect(JSON.parse(centralStore.entries[medicalTeamStateKey]).injuryPlans.map((plan) => plan.id).sort())
      .toEqual(["pending-plan-1", "pending-plan-2"]);
    await tab.page.waitForTimeout(350);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(2);
  } finally {
    resolveFirstWrite?.();
    resolveSecondWrite?.();
    await closeCentralStateContext(tab.context);
  }
});

test("Medical hydration cache restoration never overwrites a newer pending generation", async ({ browser, baseURL }) => {
  let allowReconciledWrite = false;
  let returnAnomalousAcknowledgement = true;
  const { allSyncBodies, centralStore, tab } = await bootPendingMedicalHydration(browser, baseURL, "true", {
    stagePendingAfterBoot: true,
    appStateWriteHandler: async ({ body, route }) => {
      if (body.key !== medicalTeamStateKey || allowReconciledWrite) {
        if (body.key !== medicalTeamStateKey || !returnAnomalousAcknowledgement) {
          return false;
        }
        returnAnomalousAcknowledgement = false;
        const value = String(body.value || "");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            key: medicalTeamStateKey,
            value,
            revision: 6,
            metadata: createMetadata(6, value),
          }),
        });
        return true;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          reason: "A newer external Medical generation is already pending.",
          currentRevision: 7,
        }),
      });
      return true;
    },
  });

  try {
    const centralStateWithHydrationMerge = JSON.parse(centralStore.entries[medicalTeamStateKey] || "{}");
    centralStateWithHydrationMerge.injuryPlans = [{
      id: "central-plan",
      playerId: "player-1",
      injuryType: "Central plan",
      updatedAt: "2026-08-23T09:59:00.000Z",
    }];
    const centralHydrationValue = JSON.stringify(centralStateWithHydrationMerge);
    centralStore.entries[medicalTeamStateKey] = centralHydrationValue;
    centralStore.metadataEntries[medicalTeamStateKey] = {
      ...createMetadata(2, centralHydrationValue),
      moduleId: "medical-team",
      mergePolicy: "record-timestamp-merge",
    };
    await tab.page.evaluate(async ({ key, manifestKey, principalScope }) => {
      const initialState = JSON.parse(window.footballScienceDataSafety.collect()[key] || "{}");
      initialState.injuryPlans = [{
        id: "pending-plan-a",
        playerId: "player-1",
        injuryType: "Pending plan A",
        updatedAt: "2026-08-23T10:00:00.000Z",
      }];
      const pendingValue = JSON.stringify(initialState);
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, pendingValue);
        window.footballScienceCentralState.setCachedValue(key, pendingValue);
        window.localStorage.setItem(manifestKey, JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              hash: "pending-medical-generation-a",
              size: pendingValue.length,
              writes: 7,
              updatedAt: "2026-08-23T10:00:00.000Z",
              deletedAt: "",
              pendingCentralSync: true,
              principalScope,
              serverRevision: 2,
            },
          },
        }));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }

      const patchedSetItem = window.Storage.prototype.setItem;
      window.__qaDidInjectNewerMedicalGeneration = false;
      window.Storage.prototype.setItem = function injectNewerMedicalGeneration(storageKey, value) {
        const result = patchedSetItem.call(this, storageKey, value);
        if (
          !window.__qaDidInjectNewerMedicalGeneration &&
          this === window.localStorage &&
          storageKey === key &&
          window.__footballScienceCentralHydrating
        ) {
          window.__qaDidInjectNewerMedicalGeneration = true;
          const newerState = JSON.parse(String(value || "{}"));
          newerState.injuryPlans = [
            ...(newerState.injuryPlans || []),
            {
              id: "pending-plan-b",
              playerId: "player-1",
              injuryType: "Newer pending plan B",
              updatedAt: "2026-08-23T10:01:00.000Z",
            },
          ];
          const newerValue = JSON.stringify(newerState);
          patchedSetItem.call(this, storageKey, newerValue);
          window.footballScienceCentralState.setCachedValue(key, newerValue);
          patchedSetItem.call(this, manifestKey, JSON.stringify({
            version: 1,
            activePrincipalScope: principalScope,
            entries: {
              [key]: {
                label: "Medical Room",
                hash: "pending-medical-generation-b",
                size: newerValue.length,
                writes: 9,
                updatedAt: "2026-08-23T10:01:00.000Z",
                deletedAt: "",
                pendingCentralSync: true,
                principalScope,
                serverRevision: 7,
              },
            },
          }));
        }
        return result;
      };
      try {
        await window.footballScienceCentralState.hydrate({ forceApply: true });
      } finally {
        window.Storage.prototype.setItem = patchedSetItem;
      }
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    });

    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      const rawState = JSON.parse(window.footballScienceDataSafety.collect()[key] || "{}");
      return {
        bridgeRevision: window.footballScienceCentralState.getStatus().metadata[key]?.revision,
        injected: window.__qaDidInjectNewerMedicalGeneration,
        hash: manifest.entries?.[key]?.hash,
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        planIds: (rawState.injuryPlans || []).map((plan) => plan.id).sort(),
        reconcileRevision: window.footballScienceCentralState.getStatus().reconcileRequired[key],
        serverRevision: manifest.entries?.[key]?.serverRevision,
        updatedAt: manifest.entries?.[key]?.updatedAt,
        writes: manifest.entries?.[key]?.writes,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      bridgeRevision: 7,
      injected: true,
      hash: "pending-medical-generation-b",
      pendingCentralSync: true,
      planIds: ["central-plan", "pending-plan-a", "pending-plan-b"],
      reconcileRevision: 7,
      serverRevision: 7,
      updatedAt: "2026-08-23T10:01:00.000Z",
      writes: 9,
    });
    await tab.page.waitForTimeout(250);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(0);

    centralStore.metadataEntries[medicalTeamStateKey] = {
      ...createMetadata(7, centralHydrationValue),
      moduleId: "medical-team",
      mergePolicy: "record-timestamp-merge",
    };
    allowReconciledWrite = true;
    expect(await tab.page.evaluate(
      () => window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true })
    )).toBe(false);

    await expect.poll(() => allSyncBodies.filter((body) => body.key === medicalTeamStateKey).length).toBe(1);
    const [anomalousWrite] = allSyncBodies.filter((body) => body.key === medicalTeamStateKey);
    expect(anomalousWrite.baseRevision).toBe(7);
    expect(JSON.parse(anomalousWrite.value).injuryPlans.map((plan) => plan.id).sort())
      .toEqual(["central-plan", "pending-plan-a", "pending-plan-b"]);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        bridgeRevision: window.footballScienceCentralState.getStatus().metadata[key]?.revision,
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        reconcileRevision: window.footballScienceCentralState.getStatus().reconcileRequired[key],
        serverRevision: manifest.entries?.[key]?.serverRevision,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      bridgeRevision: 7,
      pendingCentralSync: true,
      reconcileRevision: 7,
      serverRevision: 7,
    });

    expect(await tab.page.evaluate(
      () => window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true })
    )).toBe(true);
    await expect.poll(() => allSyncBodies.filter((body) => body.key === medicalTeamStateKey).length).toBe(2);
    const [, newerWrite] = allSyncBodies.filter((body) => body.key === medicalTeamStateKey);
    expect(newerWrite.baseRevision).toBe(7);
    expect(JSON.parse(newerWrite.value).injuryPlans.map((plan) => plan.id)).toContain("pending-plan-b");
    expect(JSON.parse(newerWrite.value).injuryPlans.map((plan) => plan.id)).not.toEqual([
      "central-plan",
      "pending-plan-a",
    ]);
    await tab.page.waitForTimeout(250);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(2);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        hash: manifest.entries?.[key]?.hash,
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
        serverRevision: manifest.entries?.[key]?.serverRevision,
        updatedAt: manifest.entries?.[key]?.updatedAt,
        writes: manifest.entries?.[key]?.writes,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      hash: "pending-medical-generation-b",
      pendingCentralSync: false,
      serverRevision: 8,
      updatedAt: "2026-08-23T10:01:00.000Z",
      writes: 9,
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("permission revoke race keeps pending Medical data without blocking hydration", async ({ browser, baseURL }) => {
  const { allSyncBodies, centralStore, tab } = await bootPendingMedicalHydration(browser, baseURL, "true", {
    rejectWrite: true,
  });

  try {
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(1);
    centralStore.writeAccess[medicalTeamStateKey] = false;
    await tab.page.evaluate(async () => {
      await window.footballScienceCentralState.hydrate({ forceApply: true });
    });

    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(1);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return {
        hydrated: window.footballScienceCentralState.getStatus().hydrated,
        lastError: window.footballScienceCentralState.getStatus().lastError || "",
        pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      hydrated: true,
      lastError: "",
      pendingCentralSync: true,
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("empty central state never seeds platform structure for delegated Player Profiles editors", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const allSyncBodies = [];
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    emptyCentralState: true,
    writeAccess: {
      [revisionStateKey]: true,
      [platformStructureStateKey]: true,
    },
    seedAccess: {
      [revisionStateKey]: true,
      [platformStructureStateKey]: false,
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "delegated-structure-seed-guard", {
    allSyncBodies,
    initScript: ({ manifestKey, principalScope, revisionKey, revisionValue, structureKey }) => {
      window.localStorage.setItem(revisionKey, revisionValue);
      window.localStorage.setItem(structureKey, JSON.stringify({ clubs: [{ id: "club-1", name: "QA FC" }] }));
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {},
      }));
    },
    initArg: {
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      revisionKey: revisionStateKey,
      revisionValue: initialValue,
      structureKey: platformStructureStateKey,
    },
  });

  try {
    const seedBody = allSyncBodies.find((body) => body.entries && typeof body.entries === "object");
    expect(seedBody).toBeTruthy();
    expect(seedBody.entries[revisionStateKey]).toBe(initialValue);
    expect(seedBody.entries).not.toHaveProperty(platformStructureStateKey);
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
    initScript: ({ key, value, manifestKey, principalScope }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Session Planner",
              updatedAt: "2026-05-18T12:01:00.000Z",
              hash: "local-pending-hash",
              size: value.length,
              writes: 1,
              pendingCentralSync: true,
              principalScope,
            },
          },
        })
      );
    },
    initArg: {
      key: sessionPlannerStateKey,
      value: localValue,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    },
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
    initScript: ({ key, value, manifestKey, principalScope }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Simulator Sequence",
              updatedAt: "2026-05-07T12:10:00.000Z",
              hash: "hash-local-value",
              writes: 1,
              principalScope,
              serverRevision: 4,
            },
          },
        })
      );
    },
    initArg: {
      key: revisionStateKey,
      value: localValue,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    },
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
    initScript: ({ key, value, manifestKey, principalScope }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Session Planner",
              updatedAt: "2026-07-21T19:20:00.000Z",
              hash: "stale-local-hash",
              size: value.length,
              writes: 1,
              serverRevision: 1407,
              pendingCentralSync: false,
              principalScope,
            },
          },
        })
      );
    },
    initArg: {
      key: sessionPlannerStateKey,
      value: localValue,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    },
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

test("Session Planner hydration stays server-backed when localStorage quota is full", async ({ browser, baseURL }) => {
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
    initScript: ({ key }) => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function quotaAwareSetItem(storageKey, value) {
        if (String(storageKey) === key && String(value).includes("Big Sided Games")) {
          throw new DOMException(`Setting ${key} exceeded the quota.`, "QuotaExceededError");
        }
        return originalSetItem.call(this, storageKey, value);
      };
    },
    initArg: { key: sessionPlannerStateKey },
  });

  try {
    await expect
      .poll(() => tab.page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const status = window.footballScienceCentralState.getStatus();
        return {
          blockTitles: (state.sessions?.["2026-07-21"]?.blocks || []).map((block) => block.title),
          fallbackKeys: status.cacheFallbackKeys || [],
          hydrated: status.hydrated,
          lastError: status.lastError || "",
        };
      }, sessionPlannerStateKey))
      .toEqual({
        blockTitles: ["1v1 Def/Off", "Possession", "German Possession", "Big Sided Games"],
        fallbackKeys: [sessionPlannerStateKey],
        hydrated: true,
        lastError: "",
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
    initScript: ({ manifestKey, principalScope, sessionKey, sessionValue, medicalKey, medicalValue }) => {
      window.localStorage.setItem(sessionKey, sessionValue);
      window.localStorage.setItem(medicalKey, medicalValue);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {},
      }));
    },
    initArg: {
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
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
    initScript: ({ key, value, manifestKey, principalScope }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          lastCentralError: "Stale medical data needs attention.",
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              pendingCentralSync: false,
              principalScope,
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
      principalScope: qaPrincipalScope,
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
    initScript: ({ key, value, manifestKey, principalScope }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        manifestKey,
        JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Simulator Sequence",
              updatedAt: "2026-05-07T12:05:00.000Z",
              hash: "fnv-local-hash",
              writes: 1,
              pendingCentralSync: true,
              principalScope,
            },
          },
        })
      );
    },
    initArg: {
      key: revisionStateKey,
      value: matchingValue,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
    },
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
    initScript: ({ key, manifestKey, principalScope, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {},
      }));
    },
    initArg: {
      key: scheduleStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      value: JSON.stringify(localScheduleState),
    },
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
    initScript: ({ key, manifestKey, principalScope, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        version: 1,
        activePrincipalScope: principalScope,
        entries: {},
      }));
    },
    initArg: {
      key: periodizationStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      value: JSON.stringify(localPeriodizationState),
    },
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
    initScript: ({ key, principalScope, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(
        "football-data-safety-v1",
        JSON.stringify({
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              pendingCentralSync: true,
              principalScope,
              updatedAt: "2026-05-07T12:05:30.000Z",
            },
          },
        })
      );
    },
    initArg: {
      key: medicalTeamStateKey,
      principalScope: qaPrincipalScope,
      value: JSON.stringify(localMedicalState),
    },
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

test("failed Medical hydration writeback preserves the pending generation until a real acknowledgement", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    players: [{ id: "player-1", name: "QA Player", updatedAt: "2026-05-07T12:04:00.000Z" }],
    records: [],
    injuryPlans: [{
      id: "plan-central",
      playerId: "player-1",
      injuryType: "Central plan",
      updatedAt: "2026-05-07T12:04:00.000Z",
    }],
  };
  const localMedicalState = {
    ...centralMedicalState,
    selectedDate: "2026-05-17",
    selectedPlayerId: "player-1",
    injuryPlans: [{
      id: "plan-local",
      playerId: "player-1",
      injuryType: "Pending local plan",
      updatedAt: "2026-05-07T12:05:00.000Z",
    }],
  };
  const centralMedicalValue = JSON.stringify(centralMedicalState);
  const allSyncBodies = [];
  let testWritebackActive = false;
  let medicalWriteAttempts = 0;
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: centralMedicalValue },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(4, centralMedicalValue),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      },
    },
    writeAccess: { [medicalTeamStateKey]: true },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-writeback-recovery", {
    allSyncBodies,
    appStateWriteHandler: async ({ body, route }) => {
      if (!testWritebackActive || body.key !== medicalTeamStateKey) {
        return false;
      }
      medicalWriteAttempts += 1;
      if (medicalWriteAttempts !== 1) {
        return false;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "Injected Medical writeback failure." }),
      });
      return true;
    },
  });

  try {
    await tab.page.waitForTimeout(250);
    const stableMedicalState = await tab.page.evaluate((key) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      delete state.selectedDate;
      delete state.selectedPlayerId;
      return state;
    }, medicalTeamStateKey);
    const testCentralMedicalState = {
      ...stableMedicalState,
      injuryPlans: centralMedicalState.injuryPlans,
    };
    const testLocalMedicalState = {
      ...stableMedicalState,
      selectedDate: localMedicalState.selectedDate,
      selectedPlayerId: localMedicalState.selectedPlayerId,
      injuryPlans: localMedicalState.injuryPlans,
    };
    const testCentralMedicalValue = JSON.stringify(testCentralMedicalState);
    centralStore.entries[medicalTeamStateKey] = testCentralMedicalValue;
    centralStore.metadataEntries[medicalTeamStateKey] = {
      ...createMetadata(4, testCentralMedicalValue),
      moduleId: "medical-team",
      mergePolicy: "record-timestamp-merge",
    };
    allSyncBodies.length = 0;
    testWritebackActive = true;

    const firstHydrationResult = await tab.page.evaluate(async ({ key, manifestKey, principalScope, value }) => {
      window.__footballScienceCentralHydrating = true;
      try {
        window.localStorage.setItem(key, value);
        window.localStorage.setItem(manifestKey, JSON.stringify({
          version: 1,
          activePrincipalScope: principalScope,
          entries: {
            [key]: {
              label: "Medical Room",
              hash: "pending-medical-generation-a",
              writes: 7,
              updatedAt: "2026-05-07T12:05:30.000Z",
              deletedAt: "",
              pendingCentralSync: true,
              principalScope,
              serverRevision: 3,
            },
          },
        }));
      } finally {
        window.__footballScienceCentralHydrating = false;
      }
      return window.footballScienceCentralState.hydrate({ forceApply: true });
    }, {
      key: medicalTeamStateKey,
      manifestKey: dataSafetyManifestKey,
      principalScope: qaPrincipalScope,
      value: JSON.stringify(testLocalMedicalState),
    });

    expect(firstHydrationResult).toBe(false);
    expect(medicalWriteAttempts).toBe(1);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(1);
    expect(await tab.page.evaluate(({ key, manifestKey }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      const entry = manifest.entries?.[key] || {};
      return {
        pendingCentralSync: entry.pendingCentralSync,
        hash: entry.hash,
        writes: entry.writes,
        updatedAt: entry.updatedAt,
        planIds: (state.injuryPlans || []).map((plan) => plan.id).sort(),
        lastError: window.footballScienceCentralState.getStatus().lastError,
      };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({
      pendingCentralSync: true,
      hash: "pending-medical-generation-a",
      writes: 7,
      updatedAt: "2026-05-07T12:05:30.000Z",
      planIds: ["plan-central", "plan-local"],
      lastError: "Injected Medical writeback failure.",
    });

    const retryResult = await tab.page.evaluate(() =>
      window.footballScienceCentralState.hydrate({ forceApply: true })
    );
    expect(retryResult).toBe(true);
    expect(medicalWriteAttempts).toBe(2);
    expect(allSyncBodies.filter((body) => body.key === medicalTeamStateKey)).toHaveLength(2);
    const finalPendingEntry = await tab.page.evaluate(({ key, manifestKey }) => {
      const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
      return manifest.entries?.[key] || null;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
    expect(finalPendingEntry).toMatchObject({
      pendingCentralSync: false,
      hash: "pending-medical-generation-a",
      writes: 7,
    });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});
