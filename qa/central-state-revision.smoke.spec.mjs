import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";
const require = createRequire(import.meta.url);
const { decodeSessionStateValue, encodeSessionStateValue } = require("../api/_lib/session-state-transport.js");

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
  const appStateWriteBodies = Array.isArray(options.appStateWriteBodies) ? options.appStateWriteBodies : [];
  const deniedWriteKeys = new Set(Array.isArray(options.deniedWriteKeys) ? options.deniedWriteKeys : []);

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
      if (typeof options.appStateReadHandler === "function") {
        const customResponse = await options.appStateReadHandler({ request, centralStore });
        if (customResponse) {
          await route.fulfill({
            status: Number(customResponse.status) || 200,
            contentType: "application/json",
            body: JSON.stringify(customResponse.body || {}),
          });
          return;
        }
      }
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
    if (body.key === sessionPlannerStateKey) {
      if (body.sessionChange) body.sessionChange = JSON.parse(await decodeSessionStateValue(body.key, body.sessionChange));
      else body.value = await decodeSessionStateValue(body.key, body.value);
    }
    if (body.key !== revisionStateKey) {
      appStateWriteBodies.push(body);
      if (typeof options.appStateWriteHandler === "function") {
        const customResponse = await options.appStateWriteHandler({ body, centralStore, request });
        if (customResponse) {
          await route.fulfill({
            status: Number(customResponse.status) || 200,
            contentType: "application/json",
            body: JSON.stringify(customResponse.body || {}),
          });
          return;
        }
      }
      if (deniedWriteKeys.has(body.key)) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            reason: "You do not have edit access for medical-team.",
          }),
        });
        return;
      }
      if (body.sessionChange) {
        const previous = JSON.parse(centralStore.entries?.[body.key] || '{"sessions":{}}');
        const merged = applySessionDateChange(previous, body.sessionChange);
        const revision = Number(centralStore.metadataEntries?.[body.key]?.revision || 0) + 1;
        const value = JSON.stringify(merged.state);
        if (merged.ok) {
          centralStore.entries = { ...centralStore.entries, [body.key]: value };
          centralStore.metadataEntries = { ...centralStore.metadataEntries, [body.key]: { ...createMetadata(revision, value), moduleId: "session-planner" } };
        }
        await route.fulfill({ status: merged.ok ? 200 : 409, contentType: "application/json", body: JSON.stringify(merged.ok ? {
          ok: true, metadata: centralStore.metadataEntries[body.key], sessionChange: JSON.stringify({ id: body.sessionChange.id, date: body.sessionChange.date, value: sessionDateValue(merged.state, body.sessionChange.date) }),
        } : { ok: false, conflicts: merged.conflicts }) });
        return;
      }
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

test("first and second Sessions edits save when the account initially has no central Sessions record", async ({ browser, baseURL }) => {
  const initial = createStateValue("Original central sequence");
  const centralStore = { value: initial, metadata: createMetadata(1, initial) };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "new-sessions-account", { appStateWriteBodies: writes });
  try {
    await expect.poll(() => tab.page.evaluate(async () => window.footballScienceCentralState && await window.footballScienceCentralState.getSessionCentralValue())).toBe('{"sessions":{}}');
    await tab.page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ selectedDate: "2026-09-09", sessions: { "2026-09-10": { date: "2026-09-10", title: "Training", selectedBlockId: "a", blocks: [{ id: "a", title: "First save", minutes: 20, tacticalActiveFrameId: "f2", tacticalFrames: [{ id: "f1", elements: [] }, { id: "f2", elements: [] }] }] } } })), sessionPlannerStateKey);
    await expect.poll(() => JSON.parse(centralStore.entries?.[sessionPlannerStateKey] || "{}").sessions?.["2026-09-10"]?.blocks?.[0]?.title).toBe("First save");
    await expect.poll(() => tab.page.evaluate(async () => window.footballScienceCentralState.getSessionPendingState())).toBeNull();
    await expect.poll(() => tab.page.evaluate((key) => {
      const cached = JSON.parse(localStorage.getItem(key));
      return { date: cached.selectedDate, block: cached.sessions["2026-09-10"].selectedBlockId, frame: cached.sessions["2026-09-10"].blocks[0].tacticalActiveFrameId };
    }, sessionPlannerStateKey)).toEqual({ date: "2026-09-09", block: "a", frame: "f2" });
    await tab.page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key)); state.sessions["2026-09-10"].blocks[0].title = "Second save";
      localStorage.setItem(key, JSON.stringify(state));
    }, sessionPlannerStateKey);
    await expect.poll(() => JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions["2026-09-10"].blocks[0].title).toBe("Second save");
    await expect.poll(() => tab.page.evaluate(async () => window.footballScienceCentralState.getSessionPendingState())).toBeNull();
    expect(writes.filter((row) => row.key === sessionPlannerStateKey)).toHaveLength(2);
    expect(writes.filter((row) => row.key === sessionPlannerStateKey).every((row) => row.sessionChange && row.value === undefined)).toBe(true);
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => tab.page.evaluate(async () => JSON.parse(await window.footballScienceCentralState?.getSessionCentralValue?.() || "{}").sessions?.["2026-09-10"]?.blocks?.[0]?.title)).toBe("Second save");
  } finally { await closeCentralStateContext(tab.context); }
});

test("legacy local review keeps the archived copy and clears only its resolved pending flag", async ({ browser, baseURL }) => {
  const day = "2026-09-10", initial = createStateValue("Original central sequence");
  const central = { sessions: { [day]: { date: day, title: "Training", blocks: [{ id: "a", title: "Press", objective: "Central" }] } } };
  const local = structuredClone(central); local.sessions[day].blocks[0].objective = "Legacy local";
  const value = JSON.stringify(central);
  const centralStore = { value: initial, metadata: createMetadata(1, initial), entries: { [sessionPlannerStateKey]: value }, metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(10, value), moduleId: "session-planner" } } };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "legacy-review-completion", {
    appStateWriteBodies: writes,
    initScript: ({ key, manifestKey, value }) => {
      localStorage.setItem(key, value);
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, serverRevision: 9, hash: "old-edit" } } }));
    }, initArg: { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey, value: JSON.stringify(local) },
  });
  try {
    const result = await tab.page.evaluate(async ({ key, manifestKey, day }) => {
      const bridge = window.footballScienceCentralState;
      await bridge.hydrate({ fresh: true });
      const expected = localStorage.getItem(key);
      await bridge.prepareSessionLocalReview();
      const { createSessionLocalReviewService } = await import("/src/modules/session-planner/session-local-review-service.mjs");
      const user = window.platformAuthStore.getCurrentUser(), metadata = bridge.getStatus().metadata[key];
      const context = { scope: JSON.stringify([user.id, metadata.organizationId || "", user.clubId || "", user.teamId || ""]), ready: true };
      const db = await new Promise((resolve) => { const req = indexedDB.open("football-science-data-safety-v1", 1); req.onsuccess = () => resolve(req.result); });
      const legacy = createSessionLocalReviewService({ openDatabase: async () => db, getContext: () => context, getCentralValue: bridge.getSessionCentralValue, save: async () => { throw new Error("Keep central must not write"); } });
      const rows = await legacy.list();
      for (const row of rows) await legacy.resolve(row, false);
      const finished = await bridge.finishSessionLocalReview(expected);
      const remaining = await legacy.list();
      const archives = await new Promise((resolve) => { const req = db.transaction("snapshots").objectStore("snapshots").getAll(); req.onsuccess = () => resolve(req.result); });
      db.close();
      return { reviewed: rows.map((row) => row.date), finished, remaining: remaining.length, retained: archives.some((row) => row.storage?.[key]?.includes("Legacy local") && row.reviewedDates?.[day]),
        pending: Boolean(JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync), objective: JSON.parse(localStorage.getItem(key)).sessions[day].blocks[0].objective };
    }, { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey, day });
    expect(result).toEqual({ reviewed: [day], finished: true, remaining: 0, retained: true, pending: false, objective: "Central" });
    expect(writes.filter((row) => row.key === sessionPlannerStateKey)).toEqual([]);
  } finally { await closeCentralStateContext(tab.context); }
});

test("changing team during Sessions payload encoding never sends the old team's draft", async ({ browser, baseURL }) => {
  const initial = createStateValue("Original central sequence");
  const centralStore = { value: initial, metadata: createMetadata(1, initial) };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "sessions-scope-send-race", { appStateWriteBodies: writes });
  try {
    const result = await tab.page.evaluate(async (key) => {
      const bridge = window.footballScienceCentralState, user = window.platformAuthStore.getCurrentUser();
      const originalTeam = user.teamId;
      const scope = JSON.stringify(["sessions-actor-team-v1", user.id, user.clubId || "", user.teamId || ""]);
      const NativeBlob = window.Blob;
      window.Blob = class extends NativeBlob {
        constructor(...args) { super(...args); if (String(args[0]?.[0]).includes("session-date-change-v1")) user.teamId = "other-team"; }
      };
      try {
        const result = await bridge.syncKey(key, JSON.stringify({ sessions: { "2026-09-10": { date: "2026-09-10", title: "Private draft", blocks: [] } } }));
        const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
        const rows = await createSessionSaveStore().list(scope);
        return { ok: result.ok, reason: result.reason, pending: rows.length };
      } finally { window.Blob = NativeBlob; user.teamId = originalTeam; }
    }, sessionPlannerStateKey);
    expect(result).toMatchObject({ ok: false, pending: 1 });
    expect(result.reason).toContain("Account or team changed");
    expect(writes.filter((row) => row.key === sessionPlannerStateKey)).toEqual([]);
  } finally { await closeCentralStateContext(tab.context); }
});

test("pending Sessions snapshot with an evicted cache still shows central training without retrying the baseline", async ({ browser, baseURL }) => {
  const day = "2026-09-10";
  const sessionValue = JSON.stringify({ selectedDate: "2026-08-01", sessions: {
    [day]: { date: day, title: "Central training", blocks: [{ id: "central-one", title: "Saved pressing exercise", minutes: 20 }] },
  } });
  const initial = createStateValue("Original central sequence");
  const centralStore = { value: initial, metadata: createMetadata(1, initial),
    entries: { [sessionPlannerStateKey]: sessionValue },
    metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(18601, sessionValue), moduleId: "session-planner" } },
  };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "missing-session-cache", {
    appStateWriteBodies: writes,
    initScript: ({ key, manifestKey }) => {
      const nativeSet = Storage.prototype.setItem;
      nativeSet.call(localStorage, manifestKey, JSON.stringify({ entries: {
        [key]: { pendingCentralSync: true, serverRevision: 18590, hash: "unsaved-local-training" },
      } }));
      Storage.prototype.setItem = function (storageKey, value) {
        if (storageKey === key) throw new DOMException("quota", "QuotaExceededError");
        return nativeSet.call(this, storageKey, value);
      };
    },
    initArg: { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey, day }) => {
      const cached = window.footballScienceCentralState.getCachedValueInfo(key);
      return {
        titles: JSON.parse(cached.value || "{}").sessions?.[day]?.blocks?.map((block) => block.title),
        source: cached.source,
        pending: JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
        hash: JSON.parse(localStorage.getItem(manifestKey)).entries[key].hash,
      };
    }, { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey, day })).toEqual({
      titles: ["Saved pressing exercise"], source: "central-pending-baseline", pending: true, hash: "unsaved-local-training",
    });
    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator(`[data-session-date="${day}"]`).click();
    await expect(tab.page.locator('[data-session-field="title"]').first()).toHaveValue("Saved pressing exercise");
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    await expect(tab.page.locator(`[data-session-date="${day}"]`)).toHaveClass(/is-active|is-selected/);
    expect(await tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
      { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey })).toBe(true);
    expect(writes.filter((write) => write.key === sessionPlannerStateKey)).toEqual([]);
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => tab.page.evaluate((key) => window.footballScienceCentralState?.getCachedValueInfo?.(key)?.source, sessionPlannerStateKey)).toBe("central-pending-baseline");
    expect(writes.filter((write) => write.key === sessionPlannerStateKey)).toEqual([]);
  } finally { await closeCentralStateContext(tab.context); }
});

test("large Sessions hydrate, edit, save and reload through compressed browser transport", async ({ browser, baseURL }) => {
  const day = "2026-09-10";
  const sessions = {};
  for (let i = 0; i < 36; i += 1) {
    const date = new Date(Date.UTC(2026, 7, 6 + i)).toISOString().slice(0, 10);
    sessions[date] = { date, title: "Training", blocks: Array.from({ length: 4 }, (_, b) => ({
      id: `${date}-${b}`, title: `Pressing ${b + 1}`, minutes: 15, organization: "Keep possession. ".repeat(2200),
    })) };
  }
  const sessionValue = JSON.stringify({ sessions });
  expect(Buffer.byteLength(sessionValue)).toBeGreaterThan(4 * 1024 * 1024);
  const initial = createStateValue("Original central sequence");
  const centralStore = { value: initial, metadata: createMetadata(1, initial),
    entries: { [sessionPlannerStateKey]: sessionValue },
    metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(5, sessionValue), moduleId: "session-planner" } },
  };
  const wires = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "large-session-transport", {
    initScript: (key) => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, value) {
        if (storageKey === key) throw new DOMException("quota", "QuotaExceededError");
        return nativeSet.call(this, storageKey, value);
      };
    },
    initArg: sessionPlannerStateKey,
    appStateReadHandler: async ({ request }) => {
      const requested = new URL(request.url()).searchParams.get("keys")?.split(",") || [];
      const entries = { [revisionStateKey]: centralStore.value };
      if (requested.includes(sessionPlannerStateKey)) {
        entries[sessionPlannerStateKey] = await encodeSessionStateValue({ url: request.url() }, sessionPlannerStateKey, centralStore.entries[sessionPlannerStateKey]);
      }
      return { body: { ok: true, entries, metadata: { [revisionStateKey]: centralStore.metadata, ...centralStore.metadataEntries } } };
    },
    appStateWriteHandler: async ({ body, request }) => {
      if (body.key !== sessionPlannerStateKey) return null;
      wires.push(request.postData());
      if (body.sessionChange) return null;
      const revision = Number(body.baseRevision) + 1;
      centralStore.entries[sessionPlannerStateKey] = body.value;
      centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(revision, body.value), moduleId: "session-planner" };
      return { body: { ok: true, key: body.key, revision, metadata: centralStore.metadataEntries[body.key],
        value: await encodeSessionStateValue({ url: request.url() }, body.key, body.value) } };
    },
  });
  try {
    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator(`[data-session-date="${day}"]`).click();
    const title = tab.page.locator('[data-session-field="title"]').first();
    await expect(title).toHaveValue("Pressing 1");
    await title.fill("Saved large plan edit");
    await title.dispatchEvent("change");
    await expect.poll(() => JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions[day].blocks[0].title).toBe("Saved large plan edit");
    expect(wires.length).toBeGreaterThan(0);
    for (const wire of wires) {
      expect(Buffer.byteLength(wire)).toBeLessThan(4 * 1024 * 1024);
      expect(JSON.parse(wire).sessionChange).toBeTruthy();
    }
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator(`[data-session-date="${day}"]`).click();
    await expect(title).toHaveValue("Saved large plan edit");
    expect(Object.keys(JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions)).toHaveLength(36);
  } finally { await closeCentralStateContext(tab.context); }
});

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
  const appStateWriteBodies = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "session-quota-fallback", {
    initScript: ({ key, staleValue }) => {
      const originalSetItem = Storage.prototype.setItem;
      originalSetItem.call(window.localStorage, key, staleValue);
      Storage.prototype.setItem = function quotaAwareSetItem(storageKey, value) {
        if (String(storageKey) === key) {
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
    appStateWriteBodies,
  });

  try {
    await expect
      .poll(() => tab.page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const status = window.footballScienceCentralState.getStatus();
        const backup = window.footballScienceDataSafety.createBackup("quota-hydration");
        const cachedInfo = window.footballScienceCentralState.getCachedValueInfo(key);
        return {
          blockTitles: (state.sessions?.["2026-07-21"]?.blocks || []).map((block) => block.title),
          backupHasKey: Object.prototype.hasOwnProperty.call(backup.storage || {}, key),
          cacheDurable: cachedInfo.durable,
          cacheServerBacked: cachedInfo.serverBacked,
          cacheSource: cachedInfo.source,
          fallbackKeys: status.cacheFallbackKeys || [],
          hydrated: status.hydrated,
          lastError: status.lastError || "",
        };
      }, sessionPlannerStateKey))
      .toEqual({
        blockTitles: ["1v1 Def/Off", "Possession", "German Possession", "Big Sided Games"],
        backupHasKey: false,
        cacheDurable: false,
        cacheServerBacked: true,
        cacheSource: "central-hydration",
        fallbackKeys: [sessionPlannerStateKey],
        hydrated: true,
        lastError: "",
    });

    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator('[data-session-date="2026-07-21"]').click();
    const titleField = tab.page.locator('#sessionPlannerWorkspace [data-session-field="title"]').first();
    await expect(titleField).toBeVisible();
    await titleField.fill("Quota fallback saved edit");
    await titleField.dispatchEvent("change");

    await expect.poll(() => {
      const write = appStateWriteBodies.find((body) => body.key === sessionPlannerStateKey);
      return write?.sessionChange?.after.session.blocks[0]?.title || "";
    }, { timeout: 10_000 }).toBe("Quota fallback saved edit");

    await expect.poll(() => JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions["2026-07-21"].blocks[0].title).toBe("Quota fallback saved edit");
    await expect.poll(() => tab.page.evaluate(async ({ databaseName, key, storeName }) => {
      const database = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(databaseName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const snapshots = await new Promise((resolve, reject) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return snapshots.filter((entry) => entry.id?.startsWith(`${key}-quota-fallback`)).length;
    }, {
      databaseName: "football-science-data-safety-v1",
      key: sessionPlannerStateKey,
      storeName: "snapshots",
    }), { timeout: 10_000 }).toBe(0);
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getSessionPendingState())).toBeNull();
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("large Player Profiles central hydration stays server-backed when localStorage quota is full", async ({ browser, baseURL }) => {
  const centralPlayerProfilesState = {
    players: [
      {
        id: "player-large-1",
        name: "Large Server Player",
        position: "CM",
        profileImageUrl: "",
      },
    ],
  };
  const centralValue = JSON.stringify(centralPlayerProfilesState);
  const centralStore = {
    value: createStateValue("Original central sequence"),
    metadata: createMetadata(1, createStateValue("Original central sequence")),
    entries: { [playerProfilesStateKey]: centralValue },
    metadataEntries: {
      [playerProfilesStateKey]: { ...createMetadata(118, centralValue), moduleId: "player-profiles" },
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "player-profiles-quota-fallback", {
    initScript: ({ key }) => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function quotaAwareSetItem(storageKey, value) {
        if (String(storageKey) === key) {
          throw new DOMException(`Setting ${key} exceeded the quota.`, "QuotaExceededError");
        }
        return originalSetItem.call(this, storageKey, value);
      };
    },
    initArg: { key: playerProfilesStateKey },
  });

  try {
    await expect
      .poll(() => tab.page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const status = window.footballScienceCentralState.getStatus();
        const backup = window.footballScienceDataSafety.createBackup("player-profiles-quota-hydration");
        const cachedInfo = window.footballScienceCentralState.getCachedValueInfo(key);
        return {
          backupHasKey: Object.prototype.hasOwnProperty.call(backup.storage || {}, key),
          cacheDurable: cachedInfo.durable,
          cacheServerBacked: cachedInfo.serverBacked,
          cacheSource: cachedInfo.source,
          fallbackKeys: status.cacheFallbackKeys || [],
          hydrated: status.hydrated,
          lastError: status.lastError || "",
          playerName: state.players?.[0]?.name || "",
        };
      }, playerProfilesStateKey))
      .toEqual({
        backupHasKey: false,
        cacheDurable: false,
        cacheServerBacked: true,
        cacheSource: "central-hydration",
        fallbackKeys: [playerProfilesStateKey],
        hydrated: true,
        lastError: "",
        playerName: "Large Server Player",
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
    await expect(tab.page.locator("[data-medical-date-picker]")).toHaveValue("2026-07-20");
    await expect(tab.page.locator("[data-medical-availability-workspace] .medical-metric-card")).toHaveCount(0);

    await tab.page.locator('[data-medical-ops-tab="season"]').click();
    const reports = tab.page.locator("[data-medical-reports-workspace]");
    await expect(reports).toBeVisible();
    await expect(reports.locator(".medical-reports-heading h2")).toHaveText("Mon 20 Jul");
    await expect(reports.locator(".medical-metric-card").filter({ hasText: "Full" }).locator("strong")).toHaveText("1");
    await expect(reports.locator(".medical-metric-card").filter({ hasText: "Modified" }).locator("strong")).toHaveText("1");

    await tab.page.locator('[data-medical-ops-tab="availability"]').click();
    await expect(tab.page.locator("[data-medical-date-picker]")).toHaveValue("2026-07-20");
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

test("overlapping Schedule saves are serialized and preserve the newest local generation", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const firstScheduleState = {
    selectedYear: 2026,
    selectedMonthIndex: 8,
    selectedDate: "2026-09-08",
    viewMode: "planner",
    overviewSpan: 6,
    events: [{ id: "training-a", date: "2026-09-08", type: "training", title: "First local training" }],
  };
  const secondScheduleState = {
    ...firstScheduleState,
    events: [
      ...firstScheduleState.events,
      { id: "training-b", date: "2026-09-08", type: "training", title: "Newest local training" },
    ],
  };
  const centralScheduleState = {
    ...firstScheduleState,
    events: [],
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
  const scheduleWrites = [];
  let markFirstWriteStarted;
  const firstWriteStarted = new Promise((resolve) => {
    markFirstWriteStarted = resolve;
  });
  let releaseFirstWrite;
  const firstWritePending = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "schedule-overlap", {
    appStateWriteHandler: async ({ body }) => {
      if (body.key !== scheduleStateKey) {
        return null;
      }
      scheduleWrites.push(body);
      if (scheduleWrites.length === 1) {
        markFirstWriteStarted();
        await firstWritePending;
      }
      const currentMetadata = centralStore.metadataEntries[scheduleStateKey];
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      if (baseRevision !== currentMetadata.revision) {
        return {
          status: 409,
          body: {
            ok: false,
            reason: "Central app-state revision changed before save.",
            currentRevision: currentMetadata.revision,
          },
        };
      }
      const value = String(body.value || "");
      const revision = currentMetadata.revision + 1;
      centralStore.entries[scheduleStateKey] = value;
      centralStore.metadataEntries[scheduleStateKey] = createMetadata(revision, value);
      return {
        status: 200,
        body: {
          ok: true,
          key: scheduleStateKey,
          value,
          revision,
          metadata: centralStore.metadataEntries[scheduleStateKey],
        },
      };
    },
  });

  try {
    await tab.page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: scheduleStateKey, value: JSON.stringify(firstScheduleState) }
    );
    await firstWriteStarted;

    await tab.page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: scheduleStateKey, value: JSON.stringify(secondScheduleState) }
    );
    await tab.page.waitForTimeout(250);
    expect(scheduleWrites).toHaveLength(1);

    releaseFirstWrite();
    await expect.poll(() => scheduleWrites.length, { timeout: 10_000 }).toBe(2);
    await expect
      .poll(() => centralStore.metadataEntries[scheduleStateKey].revision, { timeout: 10_000 })
      .toBe(6);

    expect(scheduleWrites.map((body) => body.metadata.baseRevision)).toEqual([4, 5]);
    expect(scheduleWrites[0].value).toBe(JSON.stringify(firstScheduleState));
    expect(scheduleWrites[1].value).toBe(JSON.stringify(secondScheduleState));
    expect(centralStore.entries[scheduleStateKey]).toBe(JSON.stringify(secondScheduleState));
    await expect
      .poll(() =>
        tab.page.evaluate(
          ({ key, manifestKey }) => {
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            return {
              value: window.localStorage.getItem(key),
              pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
              serverRevision: manifest.entries?.[key]?.serverRevision,
            };
          },
          { key: scheduleStateKey, manifestKey: dataSafetyManifestKey }
        )
      )
      .toEqual({
        value: JSON.stringify(secondScheduleState),
        pendingCentralSync: false,
        serverRevision: 6,
      });
  } finally {
    releaseFirstWrite?.();
    await closeCentralStateContext(tab.context);
  }
});

test("stale in-flight hydration cannot replace an acknowledged Schedule save", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const originalScheduleState = {
    selectedYear: 2026,
    selectedMonthIndex: 8,
    selectedDate: "2026-09-08",
    viewMode: "planner",
    overviewSpan: 6,
    events: [],
  };
  const savedScheduleState = {
    ...originalScheduleState,
    events: [{ id: "training-latest", date: "2026-09-08", type: "training", title: "Latest acknowledged training" }],
  };
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: {
      [scheduleStateKey]: JSON.stringify(originalScheduleState),
    },
    metadataEntries: {
      [scheduleStateKey]: createMetadata(4, JSON.stringify(originalScheduleState)),
    },
  };
  let deferScheduleRead = false;
  let markStaleReadStarted;
  const staleReadStarted = new Promise((resolve) => {
    markStaleReadStarted = resolve;
  });
  let releaseStaleRead;
  const staleReadPending = new Promise((resolve) => {
    releaseStaleRead = resolve;
  });
  const scheduleWrites = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "schedule-stale-hydration", {
    appStateReadHandler: async ({ request }) => {
      if (!deferScheduleRead) {
        return null;
      }
      const keys = String(new URL(request.url()).searchParams.get("keys") || "").split(",");
      if (!keys.includes(scheduleStateKey)) {
        return null;
      }
      const staleValue = centralStore.entries[scheduleStateKey];
      markStaleReadStarted();
      await staleReadPending;
      const staleMetadata = {
        ...createMetadata(centralStore.metadataEntries[scheduleStateKey].revision, staleValue),
      };
      return {
        status: 200,
        body: {
          ok: true,
          entries: { [scheduleStateKey]: staleValue },
          metadata: { [scheduleStateKey]: staleMetadata },
        },
      };
    },
    appStateWriteHandler: async ({ body }) => {
      if (body.key !== scheduleStateKey) {
        return null;
      }
      scheduleWrites.push(body);
      const currentMetadata = centralStore.metadataEntries[scheduleStateKey];
      const baseRevision = Number(body?.metadata?.baseRevision ?? body?.baseRevision);
      if (baseRevision !== currentMetadata.revision) {
        return {
          status: 409,
          body: {
            ok: false,
            reason: "Central app-state revision changed before save.",
            currentRevision: currentMetadata.revision,
          },
        };
      }
      const value = String(body.value || "");
      const revision = currentMetadata.revision + 1;
      centralStore.entries[scheduleStateKey] = value;
      centralStore.metadataEntries[scheduleStateKey] = createMetadata(revision, value);
      return {
        status: 200,
        body: {
          ok: true,
          key: scheduleStateKey,
          value,
          revision,
          metadata: centralStore.metadataEntries[scheduleStateKey],
        },
      };
    },
  });

  try {
    deferScheduleRead = true;
    await tab.page.evaluate(() => {
      window.__qaStaleScheduleHydration = window.footballScienceCentralState.hydrate({ forceApply: true });
    });
    await staleReadStarted;

    await tab.page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: scheduleStateKey, value: JSON.stringify(savedScheduleState) }
    );
    await expect.poll(() => scheduleWrites.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => centralStore.metadataEntries[scheduleStateKey].revision, { timeout: 10_000 }).toBe(5);
    await expect
      .poll(() =>
        tab.page.evaluate(
          ({ key, manifestKey }) => {
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            return {
              value: window.localStorage.getItem(key),
              pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
              serverRevision: manifest.entries?.[key]?.serverRevision,
            };
          },
          { key: scheduleStateKey, manifestKey: dataSafetyManifestKey }
        )
      )
      .toEqual({
        value: JSON.stringify(savedScheduleState),
        pendingCentralSync: false,
        serverRevision: 5,
      });

    releaseStaleRead();
    await tab.page.evaluate(() => window.__qaStaleScheduleHydration);

    expect(scheduleWrites[0].metadata.baseRevision).toBe(4);
    expect(centralStore.entries[scheduleStateKey]).toBe(JSON.stringify(savedScheduleState));
    await expect
      .poll(() =>
        tab.page.evaluate(
          ({ key, manifestKey }) => {
            const manifest = JSON.parse(window.localStorage.getItem(manifestKey) || "{}");
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            return {
              savedEvent: (state.events || []).find((event) => event.id === "training-latest") || null,
              pendingCentralSync: manifest.entries?.[key]?.pendingCentralSync,
              serverRevision: manifest.entries?.[key]?.serverRevision,
              bridgeRevision: window.footballScienceCentralState.getStatus().metadata?.[key]?.revision,
            };
          },
          { key: scheduleStateKey, manifestKey: dataSafetyManifestKey }
        )
      )
      .toEqual({
        savedEvent: {
          id: "training-latest",
          date: "2026-09-08",
          time: "",
          type: "training",
          title: "Latest acknowledged training",
          note: "",
        },
        pendingCentralSync: false,
        serverRevision: 5,
        bridgeRevision: 5,
      });
  } finally {
    releaseStaleRead?.();
    await closeCentralStateContext(tab.context);
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

test("read-only coach hydration never auto-writes Medical or poisons ready state", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    selectedDate: "2026-05-16",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "QA Player", updatedAt: "2026-05-07T12:04:00.000Z" }],
    records: [],
    injuryPlans: [],
  };
  const localMedicalState = {
    ...centralMedicalState,
    selectedDate: "2026-05-17",
    players: [{
      id: "player-1",
      name: "QA Player",
      photoUrl: "https://images.footballscience.test/qa-player.png",
      updatedAt: "2026-05-07T12:05:00.000Z",
    }],
  };
  const coachUser = {
    ...qaUser,
    id: "qa-coach-read-only",
    email: "coach-readonly@footballscience.test",
    app_metadata: { ...qaUser.app_metadata, role: "coach" },
  };
  const appStateWriteBodies = [];
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: JSON.stringify(centralMedicalState) },
    metadataEntries: {
      [medicalTeamStateKey]: {
        ...createMetadata(4, JSON.stringify(centralMedicalState)),
        moduleId: "medical-team",
        mergePolicy: "record-timestamp-merge",
      },
    },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-readonly-auto-write-guard", {
    sessionUser: coachUser,
    profileUser: coachUser,
    appStateWriteBodies,
    deniedWriteKeys: [medicalTeamStateKey],
    initScript: ({ key, value }) => window.localStorage.setItem(key, value),
    initArg: { key: medicalTeamStateKey, value: JSON.stringify(localMedicalState) },
  });

  try {
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ forceApply: true }));
    await tab.page.waitForTimeout(400);

    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey)).toEqual([]);
    await expect
      .poll(() => tab.page.evaluate(() => {
        const status = window.footballScienceCentralState.getStatus();
        return {
          hydrated: status.hydrated,
          hydrating: status.hydrating,
          lastError: status.lastError,
          lastWriteError: status.lastWriteError,
        };
      }))
      .toEqual({ hydrated: true, hydrating: false, lastError: "", lastWriteError: "" });

    const deniedResult = await tab.page.evaluate(
      ({ key, value }) => window.footballScienceCentralState.syncKey(key, value),
      { key: medicalTeamStateKey, value: JSON.stringify(localMedicalState) }
    );
    expect(deniedResult).toMatchObject({ ok: false, status: 403 });
    await expect
      .poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus()))
      .toMatchObject({
        hydrated: true,
        hydrating: false,
        lastError: "",
        lastWriteError: "You do not have edit access for medical-team.",
      });
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("read-only coach hydration preserves pending Medical data without posting it", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    selectedDate: "2026-05-16",
    players: [{ id: "player-1", name: "QA Player" }],
    records: [],
    injuryPlans: [],
  };
  const pendingMedicalState = {
    selectedDate: "2026-05-17",
    players: [{ id: "player-1", name: "QA Player" }],
    records: [],
    injuryPlans: [{ id: "pending-plan", playerId: "player-1", injuryType: "Pending local plan" }],
  };
  const coachUser = {
    ...qaUser,
    id: "qa-coach-pending",
    email: "coach-pending@footballscience.test",
    app_metadata: { ...qaUser.app_metadata, role: "coach" },
  };
  const appStateWriteBodies = [];
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: JSON.stringify(centralMedicalState) },
    metadataEntries: { [medicalTeamStateKey]: createMetadata(4, JSON.stringify(centralMedicalState)) },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-readonly-pending-guard", {
    sessionUser: coachUser,
    profileUser: coachUser,
    appStateWriteBodies,
    deniedWriteKeys: [medicalTeamStateKey],
    initScript: ({ key, value, manifestKey }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        entries: {
          [key]: {
            label: "Medical Room",
            pendingCentralSync: true,
            updatedAt: "2026-05-07T12:05:30.000Z",
          },
        },
      }));
    },
    initArg: {
      key: medicalTeamStateKey,
      value: JSON.stringify(pendingMedicalState),
      manifestKey: dataSafetyManifestKey,
    },
  });

  try {
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ forceApply: true }));
    await tab.page.waitForTimeout(400);
    const state = await tab.page.evaluate(({ key, manifestKey }) => ({
      value: JSON.parse(window.localStorage.getItem(key) || "{}"),
      pending: JSON.parse(window.localStorage.getItem(manifestKey) || "{}").entries?.[key]?.pendingCentralSync,
      status: window.footballScienceCentralState.getStatus(),
    }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });

    expect(state.value.injuryPlans?.map((plan) => plan.id)).toEqual(["pending-plan"]);
    expect(state.pending).toBe(true);
    expect(state.status).toMatchObject({ hydrated: true, hydrating: false, lastError: "", lastWriteError: "" });
    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey)).toEqual([]);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Medical editor hydration still writes an automatic media merge", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    selectedDate: "2026-05-16",
    selectedPlayerId: "player-1",
    players: [{ id: "player-1", name: "QA Player", updatedAt: "2026-05-07T12:04:00.000Z" }],
    records: [],
    injuryPlans: [],
  };
  const localMedicalState = {
    ...centralMedicalState,
    players: [{
      id: "player-1",
      name: "QA Player",
      photoUrl: "https://images.footballscience.test/qa-player.png",
      updatedAt: "2026-05-07T12:05:00.000Z",
    }],
  };
  const medicalUser = {
    ...qaUser,
    id: "qa-medical-editor",
    email: "medical-editor@footballscience.test",
    app_metadata: { ...qaUser.app_metadata, role: "medical" },
  };
  const appStateWriteBodies = [];
  const centralStore = {
    value: initialValue,
    metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: JSON.stringify(centralMedicalState) },
    metadataEntries: { [medicalTeamStateKey]: createMetadata(4, JSON.stringify(centralMedicalState)) },
  };
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-editor-auto-write", {
    sessionUser: medicalUser,
    profileUser: medicalUser,
    appStateWriteBodies,
    initScript: ({ key, value }) => window.localStorage.setItem(key, value),
    initArg: { key: medicalTeamStateKey, value: JSON.stringify(localMedicalState) },
  });

  try {
    await expect
      .poll(() => appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey).length)
      .toBeGreaterThanOrEqual(1);
    const medicalWrite = appStateWriteBodies.find((body) => body.key === medicalTeamStateKey);
    expect(JSON.parse(medicalWrite.value).players[0].photoUrl).toBe("https://images.footballscience.test/qa-player.png");
    await expect
      .poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus()))
      .toMatchObject({ hydrated: true, hydrating: false, lastError: "", lastWriteError: "" });
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
