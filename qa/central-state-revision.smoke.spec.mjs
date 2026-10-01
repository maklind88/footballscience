import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { applySessionDateChange, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";
import { cloneScheduleState } from "../src/modules/schedule/schedule-state.mjs";
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
            onAuthStateChange: (callback) => { window.__qaAuthStateCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
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
          absentKeys: centralStore.absentKeys || [],
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
    fixedDate: "2026-09-10T12:00:00.000Z",
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
    fixedDate: "2026-09-10T12:00:00.000Z",
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
  if (options.fixedDate) {
    await page.addInitScript((fixedDate) => {
      const NativeDate = Date;
      const fixedTime = new NativeDate(fixedDate).getTime();
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedTime]));
        }

        static now() {
          return fixedTime;
        }
      }
      window.Date = FixedDate;
    }, options.fixedDate);
  }
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

test("Sessions merged acknowledgement survives full browser cache and reload without a false review", async ({ browser, baseURL }) => {
  const day = "2026-09-10", initial = createStateValue("Original central sequence");
  const state = { selectedDate: day, sessions: { [day]: { date: day, title: "Training", selectedBlockId: "a", blocks: [
    { id: "a", title: "Press", objective: "Before", minutes: 15 },
  ] } } };
  const value = JSON.stringify(state);
  const centralStore = { value: initial, metadata: createMetadata(1, initial), entries: { [sessionPlannerStateKey]: value },
    metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(7, value), moduleId: "session-planner" } } };
  const posts = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "ack-quota-merge", {
    fixedDate: "2026-09-10T12:00:00.000Z",
    initScript: (key) => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, next) {
        if (storageKey === key) throw new DOMException("synthetic full cache", "QuotaExceededError");
        return nativeSet.call(this, storageKey, next);
      };
    }, initArg: sessionPlannerStateKey,
    appStateWriteHandler: ({ body }) => {
      if (body.key !== sessionPlannerStateKey || !body.sessionChange) return null;
      const revision = centralStore.metadataEntries[sessionPlannerStateKey].revision;
      const base = Number(body.metadata?.baseRevision ?? body.baseRevision);
      posts.push({ base, revision });
      if (base !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
      const merged = applySessionDateChange(JSON.parse(centralStore.entries[sessionPlannerStateKey]), body.sessionChange);
      if (!merged.ok) return { status: 409, body: { ok: false, conflicts: merged.conflicts, currentRevision: revision } };
      const next = JSON.stringify(merged.state);
      centralStore.entries[sessionPlannerStateKey] = next;
      centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(revision + 1, next), moduleId: "session-planner" };
      return { body: { ok: true, metadata: centralStore.metadataEntries[sessionPlannerStateKey], sessionChange: JSON.stringify({
        id: body.sessionChange.id, date: day, value: sessionDateValue(merged.state, day),
      }) } };
    },
  });
  try {
    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator(`[data-session-date="${day}"]`).click();
    const colleague = JSON.parse(centralStore.entries[sessionPlannerStateKey]);
    colleague.sessions[day].blocks[0].objective = "Compatible colleague edit";
    centralStore.entries[sessionPlannerStateKey] = JSON.stringify(colleague);
    centralStore.metadataEntries[sessionPlannerStateKey].revision++;
    const field = tab.page.locator('[data-session-field="title"]').first();
    await field.fill("Press together"); await field.dispatchEvent("change");
    const read = () => tab.page.evaluate(async ({ key, manifestKey, day }) => {
      const bridge = window.footballScienceCentralState;
      if (!bridge?.isHydrated?.()) return { loading: true };
      const cached = bridge.getCachedValueInfo(key);
      const block = JSON.parse(localStorage.getItem(key) || "{}").sessions?.[day]?.blocks?.[0];
      if (!block) return { loading: true };
      return { title: block.title, objective: block.objective, durable: cached.durable, serverBacked: cached.serverBacked,
        pending: Boolean(JSON.parse(localStorage.getItem(manifestKey) || "{}").entries?.[key]?.pendingCentralSync),
        journal: await bridge.getSessionPendingState(), hydrating: Boolean(window.__footballScienceCentralHydrating) };
    }, { key: sessionPlannerStateKey, manifestKey: dataSafetyManifestKey, day });
    await expect.poll(read).toEqual({ title: "Press together", objective: "Compatible colleague edit", durable: false,
      serverBacked: true, pending: false, journal: null, hydrating: false });
    await expect(tab.page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
    expect(posts.some((post) => post.base !== post.revision)).toBe(true);
    expect(JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions[day].blocks[0]).toMatchObject({ title: "Press together", objective: "Compatible colleague edit" });
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(read).toMatchObject({ title: "Press together", objective: "Compatible colleague edit", pending: false, journal: null, hydrating: false });
    await expect(tab.page.getByText("Local changes need review", { exact: true })).toHaveCount(0);
  } finally { await closeCentralStateContext(tab.context); }
});

test("Sessions still shows the server read-only when its local journal cannot be opened", async ({ browser, baseURL }) => {
  const day = "2026-09-25", initial = createStateValue("Original central sequence");
  const value = JSON.stringify({ selectedDate: day, sessions: { [day]: { date: day, blocks: [{ id: "a", title: "Training already saved", minutes: 20 }] } } });
  const centralStore = { value: initial, metadata: createMetadata(1, initial), entries: { [sessionPlannerStateKey]: value },
    metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(7, value), moduleId: "session-planner" } } };
  const posts = [];
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "unavailable-journal-baseline", {
    fixedDate: "2026-09-25T12:00:00.000Z",
    initScript: () => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, ...args) => {
        if (name === "football-science-data-safety-v1") throw new DOMException("Synthetic unavailable journal", "SecurityError");
        return open(name, ...args);
      };
    },
    appStateWriteHandler: async ({ body }) => { if (body.key === sessionPlannerStateKey) posts.push(body); return null; },
  });
  try {
    await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
    await tab.page.locator(`[data-session-date="${day}"]`).click();
    await expect(tab.page.locator('[data-session-field="title"]').first()).toHaveValue("Training already saved");
    const info = await tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValueInfo(key), sessionPlannerStateKey);
    expect(info).toMatchObject({ source: "central-pending-baseline", durable: false, serverBacked: true });
    expect(JSON.parse(info.value).sessions[day].blocks[0].title).toBe("Training already saved");
    expect(posts).toEqual([]);
    expect(centralStore.entries[sessionPlannerStateKey]).toBe(value);
  } finally { await closeCentralStateContext(tab.context); }
});

for (const fullCache of [false, true]) {
  test(`Sessions consecutive edits survive a delayed receipt (full cache: ${fullCache})`, async ({ browser, baseURL }) => {
    const day = "2026-09-25", initial = createStateValue("Original central sequence");
    const value = JSON.stringify({ selectedDate: day, sessions: { [day]: { date: day, title: "Training", selectedBlockId: "a",
      blocks: [{ id: "a", title: "Before", objective: "Synthetic instruction", minutes: 20 }] } } });
    const centralStore = { value: initial, metadata: createMetadata(1, initial), entries: { [sessionPlannerStateKey]: value },
      metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(7, value), moduleId: "session-planner" } } };
    const posts = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tab = await bootCentralPage(browser, baseURL, centralStore, [], `consecutive-quota-${fullCache}`, {
      fixedDate: "2026-09-25T12:00:00.000Z",
      initScript: ({ key, fullCache }) => {
        if (!fullCache) return;
        const nativeSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (storageKey, next) {
          if (storageKey === key) throw new DOMException("synthetic full cache", "QuotaExceededError");
          return nativeSet.call(this, storageKey, next);
        };
      }, initArg: { key: sessionPlannerStateKey, fullCache },
      appStateWriteHandler: async ({ body }) => {
        if (body.key !== sessionPlannerStateKey || !body.sessionChange) return null;
        const revision = centralStore.metadataEntries[sessionPlannerStateKey].revision;
        if (Number(body.baseRevision) !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
        const merged = applySessionDateChange(JSON.parse(centralStore.entries[sessionPlannerStateKey]), body.sessionChange);
        posts.push({ change: body.sessionChange, conflicts: merged.conflicts });
        if (!merged.ok) return { status: 409, body: { ok: false, conflicts: merged.conflicts, currentRevision: revision } };
        const next = JSON.stringify(merged.state);
        centralStore.entries[sessionPlannerStateKey] = next;
        centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(revision + 1, next), moduleId: "session-planner" };
        const receipt = { ok: true, metadata: { ...centralStore.metadataEntries[sessionPlannerStateKey] }, sessionChange: JSON.stringify({
          id: body.sessionChange.id, date: day, value: sessionDateValue(merged.state, day),
        }) };
        if (posts.length === 1) await gate;
        return { body: receipt };
      },
    });
    try {
      await tab.page.locator('[data-open-workspace="session-planner"]').first().click();
      await tab.page.locator(`[data-session-date="${day}"]`).click();
      await tab.page.evaluate(() => {
        const bridge = window.footballScienceCentralState, stage = bridge.stageSessionWrite;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        window.releaseSessionJournalTestGate = () => { bridge.stageSessionWrite = stage; release(); };
        bridge.stageSessionWrite = async (...args) => { await gate; return stage(...args); };
      });
      const field = tab.page.locator('[data-session-field="title"]').first();
      await field.fill("First edit"); await field.dispatchEvent("change");
      const colleague = JSON.parse(centralStore.entries[sessionPlannerStateKey]);
      colleague.sessions[day].blocks[0].objective = "Fresh independent colleague instruction";
      centralStore.entries[sessionPlannerStateKey] = JSON.stringify(colleague);
      centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(8, JSON.stringify(colleague)), moduleId: "session-planner" };
      await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true }));
      expect(posts).toHaveLength(0);
      expect(await tab.page.evaluate(({ key, day }) => JSON.parse(localStorage.getItem(key)).sessions[day].blocks[0].title,
        { key: sessionPlannerStateKey, day })).toBe("First edit");
      expect(await tab.page.evaluate(({ key, day }) => JSON.parse(localStorage.getItem(key)).sessions[day].blocks[0].objective,
        { key: sessionPlannerStateKey, day })).toBe("Fresh independent colleague instruction");
      await field.blur();
      await expect(tab.page.locator('[data-session-field="objective"]').first()).toHaveValue("Fresh independent colleague instruction");
      await tab.page.evaluate(() => window.releaseSessionJournalTestGate());
      await expect.poll(() => posts.length).toBe(1);
      expect(posts[0].change.after.session.blocks[0].title).toBe("First edit");
      const newerColleague = JSON.parse(centralStore.entries[sessionPlannerStateKey]);
      newerColleague.sessions[day].blocks[0].objective = "Colleague changed again before the delayed receipt";
      centralStore.entries[sessionPlannerStateKey] = JSON.stringify(newerColleague);
      centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(10, JSON.stringify(newerColleague)), moduleId: "session-planner" };
      for (const title of ["Second edit", "Final edit"]) {
        await field.fill(title); await field.dispatchEvent("change");
      }
      // A refresh during the older receipt must update the server baseline,
      // not replace the newer local journal view, even with forceApply.
      await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true }));
      expect(await tab.page.evaluate(({ key, day }) => JSON.parse(localStorage.getItem(key)).sessions[day].blocks[0].title,
        { key: sessionPlannerStateKey, day })).toBe("Final edit");
      release();
      await expect.poll(() => JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions[day].blocks[0].title).toBe("Final edit");
      await expect(tab.page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
      expect(posts.every((post) => post.conflicts.length === 0)).toBe(true);
      await expect(field).toHaveValue("Final edit");
      expect(await tab.page.evaluate(() => window.footballScienceCentralState.getSessionSaveReviews())).toEqual([]);
      expect(await tab.page.evaluate((key) => Boolean(JSON.parse(localStorage.getItem("football-data-safety-v1") || "{}").entries?.[key]?.pendingCentralSync), sessionPlannerStateKey)).toBe(false);
      expect(await tab.page.evaluate(() => window.footballScienceCentralState.getSessionPendingState())).toBeNull();
      expect(JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions[day].blocks[0].objective).toBe("Colleague changed again before the delayed receipt");
      await tab.page.reload({ waitUntil: "domcontentloaded" });
      await expect.poll(() => tab.page.evaluate(({ key, day }) => JSON.parse(localStorage.getItem(key) || "{}").sessions?.[day]?.blocks?.[0]?.title,
        { key: sessionPlannerStateKey, day })).toBe("Final edit");
    } finally { release(); await closeCentralStateContext(tab.context); }
  });
}

for (const scenario of ["observed successor", "independent stale edit", "conflicting stale edit", "late predecessor receipt"]) {
  test(`Sessions two-editor save ordering: ${scenario}`, async ({ browser, baseURL }) => {
    const day = "2026-09-25", initial = createStateValue("Original central sequence");
    const value = JSON.stringify({ selectedDate: day, sessions: { [day]: { date: day, title: "Training", selectedBlockId: "a",
      blocks: [{ id: "a", title: "Before", objective: "Original objective", minutes: 20 }] } } });
    const centralStore = { value: initial, metadata: createMetadata(1, initial), entries: { [sessionPlannerStateKey]: value },
      metadataEntries: { [sessionPlannerStateKey]: { ...createMetadata(7, value), moduleId: "session-planner" } } };
    const requests = [], accepted = [], tabs = [];
    const observesLatest = ["observed successor", "late predecessor receipt"].includes(scenario);
    let releaseFirst;
    const firstReceipt = new Promise((resolve) => { releaseFirst = resolve; });
    const options = {
      fixedDate: "2026-09-25T12:00:00.000Z",
      appStateWriteHandler: async ({ body }) => {
        if (body.key !== sessionPlannerStateKey || !body.sessionChange) return null;
        requests.push(body);
        const revision = centralStore.metadataEntries[sessionPlannerStateKey].revision;
        if (Number(body.baseRevision) !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
        const merged = applySessionDateChange(JSON.parse(centralStore.entries[sessionPlannerStateKey]), body.sessionChange);
        if (!merged.ok) return { status: 409, body: { ok: false, conflicts: merged.conflicts, currentRevision: revision } };
        const next = JSON.stringify(merged.state);
        centralStore.entries[sessionPlannerStateKey] = next;
        centralStore.metadataEntries[sessionPlannerStateKey] = { ...createMetadata(revision + 1, next), moduleId: "session-planner" };
        accepted.push(body);
        const receipt = { ok: true, metadata: { ...centralStore.metadataEntries[sessionPlannerStateKey] }, sessionChange: JSON.stringify({
          id: body.sessionChange.id, date: day, value: sessionDateValue(merged.state, day),
        }) };
        if (scenario === "late predecessor receipt" && accepted.length === 1) await firstReceipt;
        return { body: receipt };
      },
    };
    const openEditor = async (page) => {
      await page.locator('[data-open-workspace="session-planner"]').first().click();
      await page.locator(`[data-session-date="${day}"]`).click();
    };
    const field = (page, name) => page.locator(`[data-session-field="${name}"]`).first();
    const centralBlock = () => JSON.parse(centralStore.entries[sessionPlannerStateKey]).sessions[day].blocks[0];
    const readLocal = (page) => page.evaluate(({ key, day, manifestKey }) => ({
      block: JSON.parse(localStorage.getItem(key)).sessions[day].blocks[0],
      pending: Boolean(JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync),
    }), { key: sessionPlannerStateKey, day, manifestKey: dataSafetyManifestKey });
    try {
      tabs.push(await bootCentralPage(browser, baseURL, centralStore, [], `ordering-a-${scenario}`, options));
      const colleague = { ...qaUser, id: "qa-colleague", email: "colleague@footballscience.test" };
      tabs.push(await bootCentralPage(browser, baseURL, centralStore, [], `ordering-b-${scenario}`,
        { ...options, sessionUser: colleague, profileUser: colleague }));
      const [a, b] = tabs.map((tab) => tab.page);
      await openEditor(a); await openEditor(b);
      await expect(field(b, "title")).toHaveValue("Before");
      await field(a, "title").fill("Coach A accepted"); await field(a, "title").dispatchEvent("change");
      await expect.poll(() => accepted.length).toBe(1);
      if (scenario !== "late predecessor receipt") await expect(a.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
      expect(accepted).toHaveLength(1);
      expect(centralBlock().title).toBe("Coach A accepted");
      if (observesLatest) {
        await b.reload({ waitUntil: "domcontentloaded" }); await openEditor(b);
        await expect(field(b, "title")).toHaveValue("Coach A accepted");
      } else await expect(field(b, "title")).toHaveValue("Before");
      const changedField = scenario === "independent stale edit" ? "objective" : "title";
      await field(b, changedField).fill("Coach B edit"); await field(b, changedField).dispatchEvent("change");
      if (scenario === "conflicting stale edit") {
        await expect(b.locator('[data-platform-autosave-status]')).toHaveClass(/is-issue/);
        expect(accepted).toHaveLength(1);
        expect(centralBlock().title).toBe("Coach A accepted");
        await b.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
        await expect(field(b, "title")).toHaveValue("Coach A accepted");
        const reviews = await b.evaluate(() => window.footballScienceCentralState.getSessionSaveReviews());
        expect(reviews).toHaveLength(1);
        expect(reviews[0].change.after.session.blocks[0].title).toBe("Coach B edit");
        const sentBeforeReview = requests.length;
        await b.getByRole("button", { name: "Review local saves", exact: true }).click();
        const reviewDialog = b.getByRole("dialog", { name: "Review local saves" });
        await expect(reviewDialog.getByRole("status")).toHaveText("1 local version to review");
        b.once("dialog", (prompt) => prompt.accept());
        await reviewDialog.getByRole("button", { name: "Keep central version", exact: true }).click();
        await expect(reviewDialog.getByRole("status")).toHaveText("No unresolved local versions.");
        await expect.poll(() => readLocal(b)).toMatchObject({ block: { title: "Coach A accepted" }, pending: false });
        expect(requests).toHaveLength(sentBeforeReview);
        expect(accepted).toHaveLength(1);
        await b.reload({ waitUntil: "domcontentloaded" }); await openEditor(b);
        await expect(field(b, "title")).toHaveValue("Coach A accepted");
        expect(await b.evaluate(() => window.footballScienceCentralState.getSessionSaveReviews())).toEqual([]);
        expect(requests.map((body) => Number(body.baseRevision))).toEqual([7, 7, 8]);
        expect(centralStore.metadataEntries[sessionPlannerStateKey].revision).toBe(8);
        return;
      }
      await expect(b.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
      expect(accepted).toHaveLength(2);
      const expected = { title: scenario === "independent stale edit" ? "Coach A accepted" : "Coach B edit",
        objective: scenario === "independent stale edit" ? "Coach B edit" : "Original objective" };
      expect(centralBlock()).toMatchObject(expected);
      await expect.poll(() => readLocal(b)).toMatchObject({ block: expected, pending: false });
      expect(await b.evaluate(() => window.footballScienceCentralState.getSessionSaveReviews())).toEqual([]);
      if (scenario === "late predecessor receipt") {
        await a.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
        await expect.poll(() => a.evaluate(async ({ key, day }) => ({
          title: JSON.parse(await window.footballScienceCentralState.getSessionCentralValue()).sessions[day].blocks[0].title,
          revision: window.footballScienceCentralState.getStatus().metadata[key].revision,
        }), { key: sessionPlannerStateKey, day })).toEqual({ title: "Coach B edit", revision: 9 });
        releaseFirst();
        await expect(a.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
        await expect(field(a, "title")).toHaveValue("Coach B edit");
        await expect.poll(() => readLocal(a)).toMatchObject({ block: expected, pending: false });
      }
      await a.reload({ waitUntil: "domcontentloaded" }); await openEditor(a);
      await expect(field(a, "title")).toHaveValue(expected.title);
      await expect(field(a, "objective")).toHaveValue(expected.objective);
      expect(requests.map((body) => Number(body.baseRevision))).toEqual(observesLatest ? [7, 8] : [7, 7, 8]);
      expect(centralStore.metadataEntries[sessionPlannerStateKey].revision).toBe(9);
    } finally { releaseFirst(); for (const tab of tabs) await closeCentralStateContext(tab.context); }
  });
}

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

for (const afterRuntimeBoot of [false, true]) {
test(`central hydration keeps Session Planner and Medical view dates local while shared data updates (after runtime boot: ${afterRuntimeBoot})`, async ({ browser, baseURL }) => {
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
    // A saved selection must belong to the cached roster, not trigger first-run default seeding.
    rosterVersion: "qa-local-view-date-v1",
    players: [
      { id: "player-1", name: "First Player", position: "Forward" },
      { id: "player-2", name: "Second Player", position: "Midfielder" },
    ],
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
    appStateReadHandler: async ({ request }) => {
      if (afterRuntimeBoot) {
        const page = request.frame().page();
        await page.waitForFunction(() => window.__footballScienceAppReady);
        expect(await page.evaluate((key) => {
          const state = JSON.parse(window.localStorage.getItem(key));
          return { selectedDate: state.selectedDate, selectedPlayerId: state.selectedPlayerId,
            selectedPlayerExists: state.players.some((player) => player.id === state.selectedPlayerId && !player.archivedAt),
            recommendationCount: state.records.length };
        }, medicalTeamStateKey)).toEqual({ selectedDate: "2026-07-20", selectedPlayerId: "player-1",
          selectedPlayerExists: true, recommendationCount: 0 });
      }
      return null;
    },
    initScript: ({ sessionKey, sessionValue, medicalKey, medicalValue, profilesKey, profilesValue }) => {
      window.localStorage.setItem(sessionKey, sessionValue);
      window.localStorage.setItem(medicalKey, medicalValue);
      window.localStorage.setItem(profilesKey, profilesValue);
    },
    initArg: {
      sessionKey: sessionPlannerStateKey,
      sessionValue: JSON.stringify(localSessionPlannerState),
      medicalKey: medicalTeamStateKey,
      medicalValue: JSON.stringify(localMedicalState),
      profilesKey: playerProfilesStateKey,
      profilesValue: JSON.stringify(playerProfilesState),
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
}

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
    appStateWriteHandler: ({ body }) => {
      if (body.key !== medicalTeamStateKey) return null;
      const current = centralStore.metadataEntries[medicalTeamStateKey];
      if (body.baseRevision !== current.revision) return { status: 409, body: { ok: false, currentRevision: current.revision } };
      centralStore.entries[medicalTeamStateKey] = body.value;
      centralStore.metadataEntries[medicalTeamStateKey] = createMetadata(current.revision + 1, body.value);
      return { status: 200, body: { ok: true, key: body.key, value: body.value, metadata: centralStore.metadataEntries[body.key] } };
    },
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
  // Trace finalization must finish before Playwright starts the next test.
  await context.close();
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

test("read-only coach sees fresh central Medical records while the exact pending draft survives reload", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const centralMedicalState = {
    selectedDate: "2026-05-16",
    players: [{ id: "player-1", name: "QA Player" }],
    records: [{ id: "central-recommendation", playerId: "player-1", date: "2026-05-17", participation: 75 }],
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
    appStateReadHandler: () => centralStore.emptySnapshot
      ? { status: 200, body: { ok: true, entries: {}, metadata: {} } } : null,
    initScript: ({ key, value, manifestKey }) => {
      window.__qaNativeGetItem = Storage.prototype.getItem;
      if (window.localStorage.getItem(key) !== null) return;
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(manifestKey, JSON.stringify({
        entries: {
          [key]: {
            label: "Medical Room",
            pendingCentralSync: true,
            hash: "pending-generation", writes: 7, serverRevision: 1,
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
      recovery: window.__qaNativeGetItem.call(localStorage, key),
      pending: JSON.parse(window.localStorage.getItem(manifestKey) || "{}").entries?.[key]?.pendingCentralSync,
      status: window.footballScienceCentralState.getStatus(),
    }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });

    expect(state.value.records).toEqual(centralMedicalState.records);
    expect(state.value.injuryPlans).toEqual([]);
    expect(state.value.selectedDate).toBe("2026-05-17");
    expect(state.recovery).toBe(JSON.stringify(pendingMedicalState));
    expect(state.pending).toBe(true);
    expect(state.status).toMatchObject({ hydrated: true, hydrating: false, lastError: "", lastWriteError: "" });
    expect(await tab.page.evaluate(async () => {
      const { readMedicalState } = await import("/src/modules/medical/medical-runtime-accessors.mjs");
      return readMedicalState().records.find((record) => record.id === "central-recommendation")?.participation;
    })).toBe(75);
    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey)).toEqual([]);
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").records, medicalTeamStateKey)).toEqual(centralMedicalState.records);
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).selectedDate, medicalTeamStateKey)).toBe("2026-05-17");
    await tab.page.evaluate((key) => window.footballScienceCentralState.removeCachedValue(key), medicalTeamStateKey);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).selectedDate, medicalTeamStateKey)).toBe("2026-05-17");
    const recovered = await tab.page.evaluate(({ key, manifestKey }) => ({
      value: window.__qaNativeGetItem.call(localStorage, key),
      entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key],
    }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
    expect(recovered.value).toBe(JSON.stringify(pendingMedicalState));
    expect(recovered.entry).toMatchObject({ pendingCentralSync: true, hash: "pending-generation", writes: 7, serverRevision: 1, updatedAt: "2026-05-07T12:05:30.000Z" });
    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey)).toEqual([]);
    const latestMedical = { ...centralMedicalState, records: [{ ...centralMedicalState.records[0], participation: 50 }] };
    centralStore.entries[medicalTeamStateKey] = JSON.stringify(latestMedical);
    centralStore.metadataEntries[medicalTeamStateKey] = createMetadata(5, JSON.stringify(latestMedical));
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, medicalTeamStateKey)).toEqual(latestMedical.records);
    // A delayed older snapshot cannot regress the view or its freshness metadata.
    centralStore.entries[medicalTeamStateKey] = JSON.stringify(centralMedicalState);
    centralStore.metadataEntries[medicalTeamStateKey] = createMetadata(4, JSON.stringify(centralMedicalState));
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true, forceApply: true }));
    expect(await tab.page.evaluate((key) => ({
      records: JSON.parse(localStorage.getItem(key)).records,
      revision: window.footballScienceCentralState.getStatus().metadata[key].revision,
      raw: window.__qaNativeGetItem.call(localStorage, key),
    }), medicalTeamStateKey)).toEqual({ records: latestMedical.records, revision: 5, raw: JSON.stringify(pendingMedicalState) });
    centralStore.metadataEntries[medicalTeamStateKey] = {};
    expect(await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }))).toBe(false);
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, medicalTeamStateKey)).toEqual(latestMedical.records);
    delete centralStore.entries[medicalTeamStateKey];
    delete centralStore.metadataEntries[medicalTeamStateKey];
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    expect(await tab.page.evaluate((key) => ({
      view: localStorage.getItem(key), raw: window.__qaNativeGetItem.call(localStorage, key),
    }), medicalTeamStateKey)).toEqual({ view: "{}", raw: JSON.stringify(pendingMedicalState) });
    centralStore.emptySnapshot = true;
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey || body.entries?.[medicalTeamStateKey])).toEqual([]);
    await tab.page.evaluate(() => window.platformAuthStore.clearCurrentUser());
    expect(await tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValue(key), medicalTeamStateKey)).toBe("{}");
    expect(appStateWriteBodies.filter((body) => body.key === medicalTeamStateKey)).toEqual([]);
  } finally {
    await closeCentralStateContext(tab.context);
  }
});

test("Medical recovery marker failure never exposes an unscoped private draft", async ({ browser, baseURL }) => {
  const value = JSON.stringify({ players: [{ id: "qa-player", name: "QA Player" }],
    records: [{ id: "authorized-central", playerId: "qa-player", date: "2026-09-28", participation: 75 }], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [medicalTeamStateKey]: value }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, value) } };
  const coach = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach" } };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "medical-marker-failure", {
    sessionUser: coach, profileUser: coach, appStateWriteBodies: writes,
    initScript: () => {
      window.__qaNativeGetItem = Storage.prototype.getItem;
      window.__qaNativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (window.__qaFailMarker && key === "football-data-safety-v1:medical-recovery") {
          throw new DOMException("Synthetic marker quota", "QuotaExceededError");
        }
        return window.__qaNativeSetItem.call(this, key, value);
      };
    },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    const draft = '{"records":[],"injuryPlans":[{"id":"private-legacy-plan"}]}';
    const entry = { pendingCentralSync: true, hash: "private-generation", writes: 7, serverRevision: 1 };
    await tab.page.evaluate(({ key, manifestKey, draft, entry }) => {
      window.__qaNativeSetItem.call(localStorage, key, draft);
      const manifest = JSON.parse(localStorage.getItem(manifestKey));
      manifest.entries[key] = entry;
      window.__qaNativeSetItem.call(localStorage, manifestKey, JSON.stringify(manifest));
      window.footballScienceCentralState.removeCachedValue(key);
      window.__qaFailMarker = true;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey, draft, entry });
    expect(await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }))).toBe(false);
    const read = () => tab.page.evaluate(({ key, manifestKey }) => ({
      view: JSON.parse(localStorage.getItem(key)), raw: window.__qaNativeGetItem.call(localStorage, key),
      entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key],
      canEdit: window.footballScienceCentralState.getCachedValueInfo(key).canEdit,
    }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
    expect(await read()).toMatchObject({ view: JSON.parse(value), raw: draft, entry, canEdit: false });
    await tab.page.addInitScript(() => { window.__qaFailMarker = true; });
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    await expect.poll(read).toMatchObject({ view: { records: JSON.parse(value).records, injuryPlans: [] }, raw: draft, entry, canEdit: false });
    await tab.page.evaluate((key) => window.footballScienceCentralState.removeCachedValue(key), medicalTeamStateKey);
    expect((await read()).view).toEqual({});
    await tab.page.evaluate(() => { window.__qaFailMarker = false; });
    expect(await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }))).toBe(true);
    expect(await read()).toMatchObject({ view: JSON.parse(value), raw: draft, entry, canEdit: false });
    expect(writes.filter((body) => body.key === medicalTeamStateKey || body.entries?.[medicalTeamStateKey])).toEqual([]);
    expect((await read()).entry).toEqual(entry);
  } finally { await closeCentralStateContext(tab.context); }
});

test("a deferred Medical read cannot publish a signed-out actor's data", async ({ browser, baseURL }) => {
  const initialValue = createStateValue("Original central sequence");
  const value = JSON.stringify({ players: [], records: [{ id: "private-to-actor" }], injuryPlans: [] });
  const centralStore = { value: initialValue, metadata: createMetadata(1, initialValue),
    entries: { [medicalTeamStateKey]: value }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, value) } };
  const coach = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach" } };
  let hold = false, release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  const tab = await bootCentralPage(browser, baseURL, centralStore, [], "medical-deferred-signout", {
    sessionUser: coach, profileUser: coach, deniedWriteKeys: [medicalTeamStateKey],
    appStateReadHandler: async () => {
      if (!hold) return null;
      reads += 1;
      await barrier;
      return { status: 200, body: { ok: true, entries: { [medicalTeamStateKey]: value },
        metadata: { [medicalTeamStateKey]: createMetadata(5, value) } } };
    },
    initScript: ({ key, manifestKey }) => {
      window.__qaNativeGetItem = Storage.prototype.getItem;
      localStorage.setItem(key, '{"records":[],"injuryPlans":[{"id":"draft"}]}');
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "draft", writes: 7 } } }));
    }, initArg: { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
    hold = true;
    await tab.page.evaluate(() => { window.__qaDeferredRead = window.footballScienceCentralState.hydrate({ fresh: true }); });
    await expect.poll(() => reads).toBeGreaterThan(0);
    await tab.page.evaluate(() => window.platformAuthStore.clearCurrentUser());
    release();
    expect(await tab.page.evaluate(() => window.__qaDeferredRead)).toBe(false);
    expect(await tab.page.evaluate((key) => ({
      view: window.footballScienceCentralState.getCachedValue(key),
      raw: window.__qaNativeGetItem.call(localStorage, key),
      revision: window.footballScienceCentralState.getStatus().metadata[key].revision,
      hydrating: window.footballScienceCentralState.getStatus().hydrating,
    }), medicalTeamStateKey)).toEqual({ view: "{}", raw: '{"records":[],"injuryPlans":[{"id":"draft"}]}', revision: 4, hydrating: false });
  } finally { release(); await closeCentralStateContext(tab.context); }
});

for (const changeOrganization of [false, true]) {
for (const expiredResponse of [false, true]) {
test(`a token refresh during Medical loading drains a fresh read through the auth event chain (organization change: ${changeOrganization}, expired response: ${expiredResponse})`, async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach", organization_id: "org-a" } };
  const value = JSON.stringify({ players: [{ id: "qa-player", name: "QA Player" }],
    records: [{ id: "record", playerId: "qa-player", date: "2026-09-28", participation: 75 }], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [medicalTeamStateKey]: value }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, value) } };
  const nextValue = changeOrganization ? JSON.stringify({ ...JSON.parse(value), records: [{ id: "org-b-record", playerId: "qa-player", date: "2026-09-28", participation: 50 }] }) : value;
  let hold = false, reads = 0, release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const tab = await bootCentralPage(browser, baseURL, store, [], "medical-token-refresh", {
    sessionUser: profile, profileUser: profile,
    appStateReadHandler: async ({ request }) => {
      if (!hold) return null;
      const rotated = request.headers().authorization === "Bearer rotated-token";
      if (!rotated) { reads += 1; await barrier; }
      if (!rotated && expiredResponse) return { status: 401, body: { reason: "Expired original token" } };
      const responseValue = rotated ? nextValue : value;
      return { status: 200, body: { ok: true, entries: { [medicalTeamStateKey]: responseValue },
        metadata: { [medicalTeamStateKey]: { ...createMetadata(rotated ? 6 : 5, responseValue), organizationId: rotated && changeOrganization ? "org-b" : "org-a" } } } };
    },
    initScript: ({ key, manifestKey }) => {
      localStorage.setItem(key, '{"records":[],"injuryPlans":[{"id":"draft"}]}');
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "draft", writes: 7 } } }));
    }, initArg: { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
    hold = true;
    await tab.page.evaluate((key) => {
      window.__qaReadyRevisions = [];
      window.addEventListener("footballscience:central-state-ready", () => window.__qaReadyRevisions.push(window.footballScienceCentralState.getStatus().metadata[key]?.revision));
      window.__qaHeldHydration = window.footballScienceCentralState.hydrate({ fresh: true });
    }, medicalTeamStateKey);
    await expect.poll(() => reads).toBeGreaterThan(0);
    if (changeOrganization) profile.app_metadata.organization_id = "org-b";
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { ...window.__qaSession, access_token: "rotated-token", user };
      await window.__qaAuthStateCallback("TOKEN_REFRESHED", window.__qaSession);
    }, profile);
    if (changeOrganization) {
      expect(await tab.page.evaluate((key) => localStorage.getItem(key), medicalTeamStateKey)).toBe("{}");
      expect(await tab.page.evaluate(() => window.platformAuthStore.getCurrentUser().organizationId)).toBe("org-b");
    }
    release();
    expect(await tab.page.evaluate(() => window.__qaHeldHydration)).toBe(false);
    await expect.poll(() => tab.page.evaluate((key) => {
      const status = window.footballScienceCentralState.getStatus();
      return { revision: status.metadata[key]?.revision, hydrating: status.hydrating };
    }, medicalTeamStateKey)).toEqual({ revision: 6, hydrating: false });
    expect(await tab.page.evaluate(() => window.__qaReadyRevisions)).not.toContain(5);
    expect(await tab.page.evaluate(() => window.platformAuthStore.getCurrentUser()?.id)).toBe(profile.id);
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, medicalTeamStateKey)).toEqual(JSON.parse(nextValue).records);
  } finally { release(); await closeCentralStateContext(tab.context); }
});
}
}

for (const { switchActor, reload, omitted } of [
  { switchActor: false }, { switchActor: true }, { switchActor: true, reload: true }, { switchActor: true, omitted: true },
]) {
  test(`Medical read view permits a new authorized edit without adopting the old draft (new actor: ${switchActor}, reload: ${!!reload}, omitted: ${!!omitted})`, async ({ browser, baseURL }) => {
    const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach" } };
    const centralValue = JSON.stringify({ selectedDate: "2026-09-28", players: [{ id: "qa-player", name: "QA Player" }],
      records: [{ id: "server-record", playerId: "qa-player", date: "2026-09-28", participation: 75 }], injuryPlans: [] });
    const draft = JSON.stringify({ players: [], records: [], injuryPlans: [{ id: "private-old-draft" }] });
    const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
      entries: { [medicalTeamStateKey]: centralValue }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, centralValue) } };
    const bodies = [];
    const tab = await bootCentralPage(browser, baseURL, store, [], `medical-new-edit-${switchActor}`, {
      sessionUser: profile, profileUser: profile, appStateWriteBodies: bodies,
      appStateWriteHandler: ({ body, request }) => {
        if (body.key !== medicalTeamStateKey) return null;
        const expectedToken = reload ? "Bearer qa-access-token" : "Bearer medical-token";
        if (profile.app_metadata.role !== "medical" || request.headers().authorization !== expectedToken) return { status: 403, body: { ok: false } };
        const metadata = store.metadataEntries[medicalTeamStateKey] || { revision: 0 };
        if (body.baseRevision !== metadata.revision) return { status: 409, body: { ok: false, currentRevision: metadata.revision, currentValue: store.entries[medicalTeamStateKey] } };
        store.entries[medicalTeamStateKey] = body.value;
        store.metadataEntries[medicalTeamStateKey] = createMetadata(metadata.revision + 1, body.value);
        return { status: 200, body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[body.key] } };
      },
      initScript: ({ key, draft, manifestKey }) => {
        window.__qaNativeGetItem = Storage.prototype.getItem;
        if (localStorage.getItem(key) !== null) return;
        localStorage.setItem(key, draft);
        localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "old-draft", writes: 7, serverRevision: 1 } } }));
      }, initArg: { key: medicalTeamStateKey, draft, manifestKey: dataSafetyManifestKey },
    });
    try {
      await expect.poll(() => tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValueInfo(key).source, medicalTeamStateKey)).toBe("central-readonly-baseline");
      profile.app_metadata.role = "medical";
      if (switchActor) profile.id = "qa-medical-new-actor";
      if (omitted) { delete store.entries[medicalTeamStateKey]; delete store.metadataEntries[medicalTeamStateKey]; }
      if (reload) await tab.page.reload({ waitUntil: "domcontentloaded" });
      else await tab.page.evaluate(async (user) => {
        window.__qaSession = { access_token: "medical-token", user };
        await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
      }, profile);
      await expect.poll(() => tab.page.evaluate((key) => ({
        role: window.platformAuthStore.getCurrentUser()?.role,
        canAuto: window.footballScienceCentralState.canAutoSyncKey(key),
        writable: window.footballScienceCentralState.getCachedValueInfo(key).canEdit || window.footballScienceCentralState.getCachedValueInfo(key).source === "local-write",
        error: window.footballScienceCentralState.getStatus().lastError,
      }), medicalTeamStateKey)).toMatchObject({ role: "medical", canAuto: true, writable: true, error: "" });
      // Medical may persist its existing roster/schema normalization, but never the old draft.
      await tab.page.waitForTimeout(400);
      const baselineWrites = bodies.filter((body) => body.key === medicalTeamStateKey);
      expect(baselineWrites.length).toBeLessThanOrEqual(1);
      expect(baselineWrites.every((body) => !body.value.includes("private-old-draft") && (omitted || JSON.parse(body.value).records[0].participation === 75))).toBe(true);
      const baseRevision = store.metadataEntries[medicalTeamStateKey]?.revision || 0;
      await tab.page.evaluate((key) => {
        const value = JSON.parse(localStorage.getItem(key));
        if (!value.records?.length) value.records = [{ id: "new-record", playerId: "qa-player", date: "2026-09-28" }];
        value.records[0].participation = 50;
        localStorage.setItem(key, JSON.stringify(value));
      }, medicalTeamStateKey);
      await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
        { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toBe(false);
      const writes = bodies.filter((body) => body.key === medicalTeamStateKey);
      expect(writes).toHaveLength(baselineWrites.length + 1);
      expect(writes.at(-1).baseRevision).toBe(baseRevision);
      expect(JSON.parse(store.entries[medicalTeamStateKey]).records[0].participation).toBe(50);
      expect(store.entries[medicalTeamStateKey]).not.toContain("private-old-draft");
      const copies = await tab.page.evaluate(() => Object.values(window.footballScienceDataSafety.createBackup().recoveryCopies).map(JSON.parse));
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatchObject({ value: draft, entry: { pendingCentralSync: true, hash: "old-draft", writes: 7, serverRevision: 1 } });
      await tab.page.reload({ waitUntil: "domcontentloaded" });
      await tab.page.waitForFunction(() => typeof window.footballScienceDataSafety?.createBackup === "function");
      await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").records?.[0]?.participation, medicalTeamStateKey)).toBe(50);
      expect(await tab.page.evaluate(() => Object.values(window.footballScienceDataSafety.createBackup().recoveryCopies).map(JSON.parse))).toEqual(copies);
    } finally { await closeCentralStateContext(tab.context); }
  });
}

test("a Schedule manifest quota failure cannot expose or seed the rejected edit after account reload", async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, organization_id: "org-a" } };
  const value = '{"events":[]}';
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [scheduleStateKey]: value }, metadataEntries: { [scheduleStateKey]: createMetadata(4, value) } };
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "schedule-manifest-quota", {
    sessionUser: profile, profileUser: profile, appStateWriteBodies: writes,
    initScript: ({ manifestKey }) => {
      const set = Storage.prototype.setItem;
      window.__qaNativeGetItem = Storage.prototype.getItem;
      Storage.prototype.setItem = function(key, value) {
        if (window.__qaFailManifest && key === manifestKey) throw new DOMException("Manifest quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, initArg: { manifestKey: dataSafetyManifestKey },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    const result = await tab.page.evaluate(({ key, manifestKey }) => {
      const get = window.__qaNativeGetItem, before = get.call(localStorage, key);
      const entry = JSON.parse(get.call(localStorage, manifestKey)).entries[key];
      window.__qaFailManifest = true;
      let error = "";
      try { localStorage.setItem(key, '{"events":[{"id":"private-rejected-quota-edit"}]}'); } catch (caught) { error = caught.message; }
      window.__qaFailManifest = false;
      return { error, before, after: get.call(localStorage, key), entry, afterEntry: JSON.parse(get.call(localStorage, manifestKey)).entries[key] };
    }, { key: scheduleStateKey, manifestKey: dataSafetyManifestKey });
    expect(result.error).toContain("metadata could not be saved");
    expect(result.after).toBe(result.before);
    expect(result.afterEntry).toEqual(result.entry);
    profile.id = "org-b-actor"; profile.app_metadata.organization_id = "org-b";
    store.entries[scheduleStateKey] = '{"events":[{"id":"org-b-central","date":"2026-09-28","title":"B central","type":"training"}]}';
    store.metadataEntries[scheduleStateKey] = createMetadata(10, store.entries[scheduleStateKey]);
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "org-b-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").events?.[0]?.id, scheduleStateKey)).toBe("org-b-central");
    expect(writes.some((body) => JSON.stringify(body).includes("private-rejected-quota-edit"))).toBe(false);
  } finally { await closeCentralStateContext(tab.context); }
});

test("a failed Medical deletion survives real fresh hydration before its server retry", async ({ browser, baseURL }) => {
  const key = medicalTeamStateKey;
  const value = JSON.stringify({ players: [], records: [], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [key]: value }, metadataEntries: { [key]: createMetadata(7, value) } };
  let armed = false, release, held = false;
  const barrier = new Promise((resolve) => { release = resolve; }), deletes = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "failed-medical-delete", {
    initScript: () => { window.__qaNativeGetItem = Storage.prototype.getItem; },
    appStateWriteHandler: async ({ body, request }) => {
      if (body.key !== key) return null;
      if (armed && body.removed) {
        deletes.push({ body, method: request.method() });
        if (deletes.length === 1) return { status: 503, body: { ok: false, reason: "Failed before commit" } };
        held = true; await barrier;
      }
      const revision = store.metadataEntries[key].revision;
      if (body.baseRevision !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
      if (body.removed) {
        delete store.entries[key]; store.absentKeys = [key];
        store.metadataEntries[key] = { ...createMetadata(revision + 1, ""), removed: true };
      } else {
        store.entries[key] = body.value;
        store.metadataEntries[key] = createMetadata(revision + 1, body.value);
      }
      return { body: { ok: true, key, value: body.value, metadata: store.metadataEntries[key] } };
    },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    await expect.poll(() => tab.page.evaluate((key) => !window.footballScienceCentralState.getStatus().hydrating &&
      !JSON.parse(localStorage.getItem("football-data-safety-v1")).entries[key]?.pendingCentralSync, key)).toBe(true);
    armed = true;
    const pending = await tab.page.evaluate(({ key, manifestKey }) => {
      const bridge = window.footballScienceCentralState, sync = bridge.syncKey;
      bridge.syncKey = async (...args) => {
        const result = await sync(...args);
        if (args[0] === key && args[2]?.removed) window.__qaDeleteSettled = true;
        return result;
      };
      localStorage.removeItem(key);
      return JSON.parse(localStorage.getItem(manifestKey)).entries[key];
    }, { key, manifestKey: dataSafetyManifestKey });
    await tab.page.waitForFunction(() => window.__qaDeleteSettled);
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    expect(await tab.page.evaluate(({ key, manifestKey }) => ({
      raw: window.__qaNativeGetItem.call(localStorage, key),
      entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key],
    }), { key, manifestKey: dataSafetyManifestKey })).toEqual({ raw: null, entry: pending });
    await expect.poll(() => held).toBe(true);
    expect(deletes).toHaveLength(2);
    expect(deletes.map(({ body, method }) => [method, body.baseRevision])).toEqual([
      ["DELETE", pending.pendingBaseRevision], ["DELETE", pending.pendingBaseRevision],
    ]);
    release();
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
      return { pending: entry.pendingCentralSync, revision: entry.serverRevision };
    }, { key, manifestKey: dataSafetyManifestKey })).toEqual({ pending: false, revision: pending.pendingBaseRevision + 1 });
    expect(store.entries[key]).toBeUndefined();
  } finally { release(); await closeCentralStateContext(tab.context); }
});

for (const overlap of [false, true]) {
for (const rotateToken of [false, true]) {
test(`a committed deletion with a lost receipt is read-acknowledged without retry (token: ${rotateToken}, mid-flush read: ${overlap})`, async ({ browser, baseURL }) => {
  const key = "football-dashboard-tutorial-prefs-v1", value = '{"dismissed":true}';
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [key]: value }, metadataEntries: { [key]: createMetadata(4, value) } };
  let release, releaseOther, releaseRead, held = false, otherHeld = false, readHeld = false, holdReads = false;
  const barrier = new Promise((resolve) => { release = resolve; }), writes = [];
  const otherBarrier = new Promise((resolve) => { releaseOther = resolve; });
  const readBarrier = new Promise((resolve) => { releaseRead = resolve; });
  const tab = await bootCentralPage(browser, baseURL, store, [], "lost-delete-receipt", {
    appStateReadHandler: async () => {
      if (holdReads) { readHeld = true; await readBarrier; }
      return null;
    },
    appStateWriteHandler: async ({ body, request }) => {
      if (overlap && body.key === scheduleStateKey && body.value?.includes("mid-flush-schedule")) {
        otherHeld = true; await otherBarrier;
        return null;
      }
      if (body.key !== key) return null;
      writes.push({ body, method: request.method() });
      if (body.removed && !held) { held = true; await barrier; }
      const revision = store.metadataEntries[key].revision;
      if (body.baseRevision !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
      if (body.removed) {
        delete store.entries[key]; store.absentKeys = [key];
        store.metadataEntries[key] = { ...createMetadata(revision + 1, ""), removed: true };
      } else {
        store.entries[key] = body.value; store.absentKeys = [];
        store.metadataEntries[key] = createMetadata(revision + 1, body.value);
      }
      return { status: rotateToken ? 200 : 503, body: { ok: rotateToken, key, metadata: store.metadataEntries[key] } };
    },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    const base = store.metadataEntries[key].revision;
    await tab.page.evaluate(({ key, other }) => {
      const bridge = window.footballScienceCentralState, sync = bridge.syncKey;
      bridge.syncKey = async (...args) => {
        const result = await sync(...args);
        if (args[0] === key && args[2]?.removed) window.__qaDeleteSettled = true;
        if (args[0] === other) window.__qaOtherSettled = true;
        return result;
      };
      localStorage.removeItem(key);
    }, { key, other: scheduleStateKey });
    await expect.poll(() => held).toBe(true);
    if (overlap) await tab.page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ events: [
      { id: "mid-flush-schedule", date: "2026-09-29", title: "Concurrent schedule", type: "training" },
    ] })), scheduleStateKey);
    if (rotateToken && !overlap) {
      // The real ready event records manifest retry intent while DELETE is still in flight.
      await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
      holdReads = true;
    }
    if (rotateToken) await tab.page.evaluate(async () => {
      window.__qaSession = { ...window.__qaSession, access_token: "rotated-delete-token" };
      await window.__qaAuthStateCallback("TOKEN_REFRESHED", window.__qaSession);
    });
    release();
    await tab.page.waitForFunction(() => window.__qaDeleteSettled);
    if (rotateToken && !overlap) {
      await expect.poll(() => readHeld).toBe(true);
      await tab.page.waitForTimeout(400);
      expect(writes.filter(({ body }) => body.removed)).toHaveLength(1);
      expect(await tab.page.evaluate(({ key, manifestKey }) =>
        JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
      { key, manifestKey: dataSafetyManifestKey })).toBe(true);
      releaseRead();
    }
    if (overlap) {
      await expect.poll(() => otherHeld).toBe(true);
      holdReads = true;
      const reading = tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
      try {
        await expect.poll(() => readHeld).toBe(true);
        releaseOther();
        await tab.page.waitForFunction(() => window.__qaOtherSettled);
        expect(writes.filter(({ body }) => body.removed)).toHaveLength(1);
      } finally { releaseRead(); await reading; }
    } else await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
      return { pending: entry.pendingCentralSync, revision: entry.serverRevision, raw: localStorage.getItem(key) };
    }, { key, manifestKey: dataSafetyManifestKey })).toEqual({ pending: false, revision: base + 1, raw: null });
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    expect(writes.filter(({ body }) => body.removed)).toHaveLength(1);
    expect(writes.find(({ body }) => body.removed).method).toBe("DELETE");
    expect(store.entries[key]).toBeUndefined();
  } finally { release(); releaseOther(); releaseRead(); await closeCentralStateContext(tab.context); }
});
}
}

for (const rotateToken of [false, true]) {
for (const newerDraft of [false, true]) {
test(`Medical replacement reconciles a lost receipt without adopting a newer draft (token: ${rotateToken}, newer: ${newerDraft})`, async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach", organization_id: "org-a" } };
  const central = JSON.stringify({ players: [{ id: "ncc-2026-madison-white", name: "Madison White" }], records: [], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [medicalTeamStateKey]: central }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, central) } };
  let release, held = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const writes = [], reads = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "medical-lost-receipt", {
    fixedDate: "2026-09-28T12:00:00.000Z", sessionUser: profile, profileUser: profile,
    appStateReadHandler: ({ request }) => { reads.push(request.headers().authorization); return null; },
    appStateWriteHandler: async ({ body }) => {
      if (body.key !== medicalTeamStateKey) return null;
      writes.push(body);
      const lostReceipt = body.value.includes("lost-receipt-edit") && !held;
      if (lostReceipt) { held = true; await barrier; }
      const metadata = store.metadataEntries[medicalTeamStateKey];
      if (body.baseRevision !== metadata.revision) return { status: 409, body: { ok: false, currentRevision: metadata.revision } };
      store.entries[medicalTeamStateKey] = body.value;
      store.metadataEntries[medicalTeamStateKey] = createMetadata(metadata.revision + 1, body.value);
      if (lostReceipt && !rotateToken) return { status: 503, body: { ok: false, reason: "Receipt lost after server commit" } };
      return { body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[body.key] } };
    },
    initScript: ({ key, manifestKey }) => {
      window.__qaNativeGetItem = Storage.prototype.getItem;
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, '{"players":[],"records":[],"injuryPlans":[{"id":"private-legacy"}]}');
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "legacy", writes: 7 } } }));
    }, initArg: { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    profile.app_metadata.role = "medical";
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "medical-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const bridge = window.footballScienceCentralState;
      return !bridge.getStatus().hydrating && bridge.getCachedValueInfo(key).source === "local-write" &&
        !JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toBe(true);
    const originalRevision = store.metadataEntries[medicalTeamStateKey].revision;
    const archives = await tab.page.evaluate(() => window.footballScienceDataSafety.createBackup().recoveryCopies);
    await tab.page.evaluate((key) => {
      const bridge = window.footballScienceCentralState, sync = bridge.syncKey;
      bridge.syncKey = async (...args) => {
        const result = await sync(...args);
        if (args[0] === key && args[1].includes("lost-receipt-edit")) window.__qaReceiptSettled = true;
        return result;
      };
      const value = JSON.parse(localStorage.getItem(key));
      value.records = [{ id: "lost-receipt-edit", playerId: "ncc-2026-madison-white", date: "2026-09-28", status: "controlled",
        participation: 50, actualParticipation: 50, comment: "", coachNote: "Original save", shareWithCoach: false,
        rtpPhase: "modified-team", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z",
        createdBy: "qa-user-1", archivedAt: "", archivedBy: "", archiveReason: "" }];
      localStorage.setItem(key, JSON.stringify(value));
    }, medicalTeamStateKey);
    await expect.poll(() => held).toBe(true);
    if (rotateToken) {
      await tab.page.evaluate(async () => {
        window.__qaSession = { ...window.__qaSession, access_token: "rotated-medical-token" };
        await window.__qaAuthStateCallback("TOKEN_REFRESHED", window.__qaSession);
      });
      await expect.poll(() => reads.includes("Bearer rotated-medical-token")).toBe(true);
      await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
    }
    if (newerDraft) await tab.page.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key)); value.records[0].coachNote = "Newer unsent edit";
      localStorage.setItem(key, JSON.stringify(value));
    }, medicalTeamStateKey);
    release();
    await tab.page.waitForFunction(() => window.__qaReceiptSettled);
    expect(store.metadataEntries[medicalTeamStateKey].revision).toBe(originalRevision + 1);
    await tab.page.evaluate((forceApply) => window.footballScienceCentralState.hydrate({ fresh: true, forceApply }), !rotateToken);
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
      return { pending: Boolean(entry.pendingCentralSync), revision: entry.serverRevision,
        note: JSON.parse(window.__qaNativeGetItem.call(localStorage, key)).records[0].coachNote };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({ pending: newerDraft,
      revision: originalRevision + (newerDraft ? 0 : 1), note: newerDraft ? "Newer unsent edit" : "Original save" });
    expect(await tab.page.evaluate(() => window.footballScienceDataSafety.createBackup().recoveryCopies)).toEqual(archives);
    expect(JSON.parse(store.entries[medicalTeamStateKey]).records[0].coachNote).toBe("Original save");
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    await tab.page.waitForTimeout(400);
    expect(writes.filter((body) => body.value.includes("lost-receipt-edit") && !body.value.includes("Newer unsent edit"))).toHaveLength(1);
    if (!newerDraft) {
      await tab.page.evaluate((key) => {
        const value = JSON.parse(localStorage.getItem(key)); value.records[0].coachNote = "Follow-up save";
        localStorage.setItem(key, JSON.stringify(value));
      }, medicalTeamStateKey);
      await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
        const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
        return { pending: Boolean(entry.pendingCentralSync), revision: entry.serverRevision };
      }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({ pending: false, revision: originalRevision + 2 });
      expect(writes.at(-1).baseRevision).toBe(originalRevision + 1);
      expect(JSON.parse(store.entries[medicalTeamStateKey]).records[0].coachNote).toBe("Follow-up save");
    }
  } finally { release(); await closeCentralStateContext(tab.context); }
});
}
}

for (const fixedDate of ["2026-09-28T12:00:00.000Z", "2026-09-29T12:00:00.000Z"]) {
for (const { acknowledged, manifestQuota, returnPending = false, conflict = false, returnCacheQuota = false } of [
  { acknowledged: false, manifestQuota: false },
  { acknowledged: false, manifestQuota: false, conflict: true },
  { acknowledged: false, manifestQuota: false, returnPending: true },
  { acknowledged: true, manifestQuota: false },
  { acknowledged: true, manifestQuota: false, returnCacheQuota: true },
  { acknowledged: true, manifestQuota: true },
]) {
test(`a replacement Medical draft is never adopted after an organization switch and reload (acknowledged: ${acknowledged}, manifest quota: ${manifestQuota}, return pending: ${returnPending}, conflict: ${conflict}, return cache quota: ${returnCacheQuota}, clock: ${fixedDate})`, async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach", organization_id: "org-a" } };
  const record = { id: "org-a-pending-replacement", playerId: "ncc-2026-madison-white", date: "2026-09-28",
    status: "controlled", participation: 50, actualParticipation: 50, comment: "", coachNote: "", shareWithCoach: false,
    rtpPhase: "modified-team", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z",
    createdBy: qaUser.id, archivedAt: "", archivedBy: "", archiveReason: "" };
  const centralValue = JSON.stringify({ players: [{ id: record.playerId, name: "Madison White" }], records: [], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [medicalTeamStateKey]: centralValue }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, centralValue) } };
  const requests = [];
  let acceptWrites = true;
  const tab = await bootCentralPage(browser, baseURL, store, [], "medical-pending-owner-reload", {
    fixedDate,
    sessionUser: profile, profileUser: profile,
    appStateWriteHandler: ({ body, request }) => {
      // An old page may finish a request while the next profile is being prepared.
      const org = request.headers().authorization === "Bearer medical-token" ? "org-a" : profile.app_metadata.organization_id;
      requests.push({ org, body });
      if (body.key !== medicalTeamStateKey) return null;
      const metadata = store.metadataEntries[medicalTeamStateKey];
      if (!acceptWrites) return { status: conflict ? 409 : 500, body: { ok: false, currentRevision: metadata.revision, reason: "Temporary test failure" } };
      if (body.baseRevision !== metadata.revision) return { status: 409, body: { ok: false, currentRevision: metadata.revision } };
      store.entries[medicalTeamStateKey] = body.value;
      store.metadataEntries[medicalTeamStateKey] = createMetadata(metadata.revision + 1, body.value);
      return { status: 200, body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[body.key] } };
    },
    initScript: ({ key, manifestKey }) => {
      window.__qaNativeGetItem = Storage.prototype.getItem;
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, value) {
        if (window.__qaFailMedicalManifest && storageKey === manifestKey) throw new DOMException("Manifest quota", "QuotaExceededError");
        if (window.__qaFailMedicalCache && storageKey === key) throw new DOMException("Cache quota", "QuotaExceededError");
        return nativeSet.call(this, storageKey, value);
      };
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, '{"players":[],"records":[],"injuryPlans":[{"id":"legacy-private"}]}');
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "old", writes: 7 } } }));
    }, initArg: { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    profile.app_metadata.role = "medical";
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "medical-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey, revision }) => {
      const bridge = window.footballScienceCentralState, info = bridge.getCachedValueInfo(key);
      const pending = JSON.parse(localStorage.getItem(manifestKey)).entries[key]?.pendingCentralSync;
      return revision > 4 && !bridge.getStatus().hydrating && bridge.getStatus().metadata[key]?.revision === revision &&
        info.source === "local-write" && !pending;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey, revision: store.metadataEntries[medicalTeamStateKey].revision })).toBe(true);
    acceptWrites = acknowledged;
    if (conflict) store.metadataEntries[medicalTeamStateKey] = createMetadata(store.metadataEntries[medicalTeamStateKey].revision + 1, store.entries[medicalTeamStateKey]);
    const replacement = await tab.page.evaluate(({ key, record }) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.records = [record];
      const raw = JSON.stringify(value);
      localStorage.setItem(key, raw);
      return raw;
    }, { key: medicalTeamStateKey, record });
    await expect.poll(() => requests.some(({ body }) => body.value?.includes("org-a-pending-replacement"))).toBe(true);
    if (conflict) {
      await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
      expect(JSON.parse(store.entries[medicalTeamStateKey]).records).toEqual([]);
    }
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => Boolean(JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync),
      { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toBe(!acknowledged);
    if (acknowledged) expect(JSON.parse(store.entries[medicalTeamStateKey]).records[0].id).toBe("org-a-pending-replacement");
    const pending = await tab.page.evaluate(({ key, manifestKey }) => ({
      raw: window.__qaNativeGetItem.call(localStorage, key), entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key],
      owner: JSON.parse(localStorage.getItem(`${manifestKey}:medical-recovery`)),
    }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
    if (acknowledged) expect(JSON.parse(pending.raw)).toEqual(JSON.parse(replacement));
    else expect(pending.raw).toBe(replacement);
    const preservedValue = pending.raw;
    let expectedRecoveryValue = preservedValue;
    const ownerArchiveCount = await tab.page.evaluate(() => Object.keys(window.footballScienceDataSafety.createBackup().recoveryCopies).length);
    expect(Boolean(pending.entry.pendingCentralSync)).toBe(!acknowledged);
    expect(pending.owner.readScope).toContain("org-a");
    profile.id = "new-org-actor";
    profile.app_metadata.organization_id = "org-b";
    // Use the actual normalized schema so B's first replacement is the explicit edit under test.
    const otherValue = JSON.stringify({ ...JSON.parse(preservedValue),
      records: [{ ...record, id: "org-b-central", participation: 75, actualParticipation: 75 }], injuryPlans: [] });
    store.entries[medicalTeamStateKey] = otherValue;
    store.metadataEntries[medicalTeamStateKey] = createMetadata(10, otherValue);
    await tab.page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").records?.map((record) => record.id), medicalTeamStateKey)).toEqual(["org-b-central"]);
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
    if (manifestQuota) expect(await tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValueInfo(key).source, medicalTeamStateKey)).toBe("central-readonly-baseline");
    if ((acknowledged || returnPending) && !manifestQuota) {
      profile.id = qaUser.id;
      profile.app_metadata.organization_id = "org-a";
      store.entries[medicalTeamStateKey] = returnPending ? JSON.stringify({ ...JSON.parse(preservedValue), records: [] }) : preservedValue;
      if (returnCacheQuota) {
        const updated = JSON.parse(preservedValue);
        updated.records[0].coachNote = "Latest verified server note";
        store.entries[medicalTeamStateKey] = JSON.stringify(updated);
        await tab.page.evaluate(() => { window.__qaFailMedicalCache = true; });
      }
      store.metadataEntries[medicalTeamStateKey] = createMetadata(pending.entry.serverRevision + (returnCacheQuota ? 1 : 0), store.entries[medicalTeamStateKey]);
      acceptWrites = true;
      const previousWrites = requests.length;
      await tab.page.evaluate(async (user) => {
        window.__qaSession = { access_token: "medical-token", user };
        await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
      }, profile);
      await expect.poll(() => tab.page.evaluate((key) => !window.footballScienceCentralState.getStatus().hydrating && JSON.parse(localStorage.getItem(key) || "{}").records?.[0]?.id, medicalTeamStateKey)).toBe("org-a-pending-replacement");
      if (returnCacheQuota) {
        await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records[0].coachNote, medicalTeamStateKey)).toBe("Latest verified server note");
        const state = await tab.page.evaluate(({ key, manifestKey }) => ({
          info: window.footballScienceCentralState.getCachedValueInfo(key),
          status: window.footballScienceCentralState.getStatus(),
          raw: window.__qaNativeGetItem.call(localStorage, key),
          entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key],
        }), { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey });
        expect(state.info).toMatchObject({ durable: false, serverBacked: true });
        expect(state.status.lastError).toBe("");
        expect(state.status.metadata[medicalTeamStateKey].revision).toBe(pending.entry.serverRevision + 1);
        expect(state.entry.pendingCentralSync).toBe(false);
        expect(state.raw).toBe(preservedValue);
        expect(requests.slice(previousWrites).filter(({ body }) => body.key === medicalTeamStateKey)).toEqual([]);
        expect(await tab.page.evaluate(() => Object.keys(window.footballScienceDataSafety.createBackup().recoveryCopies).length)).toBe(ownerArchiveCount);
        return;
      }
      if (returnPending) {
        await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
          { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toBe(false);
        const retried = requests.slice(previousWrites).filter(({ body }) => body.key === medicalTeamStateKey);
        expect(retried).toHaveLength(1);
        expect(retried[0].body.baseRevision).toBe(pending.entry.serverRevision);
        expect(JSON.parse(store.entries[medicalTeamStateKey]).records[0].id).toBe("org-a-pending-replacement");
      }
      expect(await tab.page.evaluate(() => Object.keys(window.footballScienceDataSafety.createBackup().recoveryCopies).length)).toBe(ownerArchiveCount);
      // An acknowledged refresh may reorder UI keys, but cannot change any content.
      expectedRecoveryValue = await tab.page.evaluate((key) => window.__qaNativeGetItem.call(localStorage, key), medicalTeamStateKey);
      expect(JSON.parse(expectedRecoveryValue)).toEqual(JSON.parse(preservedValue));
      profile.id = "new-org-actor";
      profile.app_metadata.organization_id = "org-b";
      store.entries[medicalTeamStateKey] = otherValue;
      store.metadataEntries[medicalTeamStateKey] = createMetadata(10, otherValue);
      await tab.page.evaluate(async (user) => {
        window.__qaSession = { access_token: "qa-access-token", user };
        await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
      }, profile);
      await expect.poll(() => tab.page.evaluate((key) => !window.footballScienceCentralState.getStatus().hydrating && JSON.parse(localStorage.getItem(key) || "{}").records?.[0]?.id, medicalTeamStateKey)).toBe("org-b-central");
    }
    const replacementB = await tab.page.evaluate(({ key, manifestQuota }) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.records[0].coachNote = "org-b-explicit-edit";
      const raw = JSON.stringify(value);
      window.__qaFailMedicalManifest = manifestQuota;
      try { localStorage.setItem(key, raw); return { raw, error: "" }; }
      catch (error) { return { raw, error: error.message }; }
    }, { key: medicalTeamStateKey, manifestQuota });
    if (manifestQuota) {
      expect(replacementB.error).toContain("metadata could not be saved");
      await tab.page.reload({ waitUntil: "domcontentloaded" });
      await tab.page.waitForFunction(() => typeof window.footballScienceDataSafety?.createBackup === "function");
      await expect.poll(() => tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").records?.map((record) => record.id), medicalTeamStateKey)).toEqual(["org-b-central"]);
      await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
      expect(await tab.page.evaluate((key) => window.__qaNativeGetItem.call(localStorage, key), medicalTeamStateKey)).toBe(replacementB.raw);
      expect(requests.some(({ org, body }) => org === "org-b" && body.value?.includes("org-b-explicit-edit"))).toBe(false);
    } else {
      expect(replacementB.error).toBe("");
      await expect.poll(() => requests.some(({ org, body }) => org === "org-b" && body.value?.includes("org-b-explicit-edit"))).toBe(true);
    }
    await tab.page.waitForTimeout(400);
    const after = await tab.page.evaluate((key) => ({
      raw: window.__qaNativeGetItem.call(localStorage, key),
      copies: Object.values(window.footballScienceDataSafety.createBackup().recoveryCopies).map(JSON.parse),
    }), medicalTeamStateKey);
    expect(after.raw === expectedRecoveryValue || after.copies.some((copy) => copy.value === expectedRecoveryValue && Boolean(copy.entry.pendingCentralSync) === !(acknowledged || returnPending))).toBe(true);
    expect(requests.filter(({ org }) => org === "org-b").every(({ body }) => !JSON.stringify(body).includes("org-a-pending-replacement") && !JSON.stringify(body).includes("legacy-private"))).toBe(true);
    expect(await tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
  } finally { await closeCentralStateContext(tab.context); }
});
}
}

test("an old account Medical receipt cannot poison a new account's queued edit", async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, role: "coach", organization_id: "org-a" } };
  const initial = JSON.stringify({ players: [{ id: "qa-player", name: "QA Player" }], records: [], injuryPlans: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [medicalTeamStateKey]: initial }, metadataEntries: { [medicalTeamStateKey]: createMetadata(4, initial) } };
  let release, held = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const requests = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "medical-late-owner-receipt", {
    sessionUser: profile, profileUser: profile,
    appStateWriteHandler: async ({ body, request }) => {
      if (body.key !== medicalTeamStateKey) return null;
      requests.push({ body, token: request.headers().authorization });
      const current = store.metadataEntries[body.key];
      if (body.baseRevision !== current.revision) return { status: 409, body: { ok: false, currentRevision: current.revision } };
      store.entries[body.key] = body.value;
      store.metadataEntries[body.key] = createMetadata(current.revision + 1, body.value);
      const receipt = { status: 200, body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[body.key] } };
      if (body.value.includes("held-org-a")) { held = true; await barrier; }
      return receipt;
    },
    initScript: ({ key, manifestKey }) => {
      localStorage.setItem(key, '{"records":[],"injuryPlans":[{"id":"legacy-private"}]}');
      localStorage.setItem(manifestKey, JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "old", writes: 7 } } }));
    }, initArg: { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    profile.app_metadata.role = "medical";
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "org-a-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey, revision }) => {
      const bridge = window.footballScienceCentralState, info = bridge.getCachedValueInfo(key);
      const pending = JSON.parse(localStorage.getItem(manifestKey)).entries[key]?.pendingCentralSync;
      // Finish the module's real default normalization before holding the next runtime receipt.
      return revision > 4 && !bridge.getStatus().hydrating && bridge.getStatus().metadata[key]?.revision === revision &&
        info.source === "local-write" && !pending;
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey, revision: store.metadataEntries[medicalTeamStateKey].revision })).toBe(true);
    const normalized = await tab.page.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.records = [{ id: "held-org-a", playerId: "qa-player", date: "2026-09-28", participation: 40 }];
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    }, medicalTeamStateKey);
    await expect.poll(() => held).toBe(true);
    profile.id = "org-b-actor";
    profile.app_metadata.organization_id = "org-b";
    store.entries[medicalTeamStateKey] = JSON.stringify({ ...normalized, records: [{ ...normalized.records[0], id: "org-b-central", participation: 80 }] });
    store.metadataEntries[medicalTeamStateKey] = createMetadata(10, store.entries[medicalTeamStateKey]);
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "org-b-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => tab.page.evaluate((key) => {
      const bridge = window.footballScienceCentralState;
      const info = bridge.getCachedValueInfo(key);
      return !bridge.getStatus().hydrating && (info.canEdit || info.source === "local-write") && JSON.parse(localStorage.getItem(key)).records[0]?.id;
    }, medicalTeamStateKey)).toBe("org-b-central");
    await tab.page.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.records[0].coachNote = "new-org-b-edit";
      localStorage.setItem(key, JSON.stringify(value));
    }, medicalTeamStateKey);
    expect(await tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValueInfo(key).source, medicalTeamStateKey)).toBe("local-write");
    release();
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
      return { pending: entry.pendingCentralSync, revision: entry.serverRevision };
    }, { key: medicalTeamStateKey, manifestKey: dataSafetyManifestKey })).toEqual({ pending: false, revision: 11 });
    const bWrites = requests.filter(({ token }) => token === "Bearer org-b-token");
    expect(bWrites).toHaveLength(1);
    expect(bWrites[0].body.baseRevision).toBe(10);
    expect(bWrites[0].body.value).toContain("new-org-b-edit");
    expect(bWrites[0].body.value).not.toContain("held-org-a");
    expect(await tab.page.evaluate((key) => window.footballScienceCentralState.getStatus().metadata[key].revision, medicalTeamStateKey)).toBe(11);
  } finally { release(); await closeCentralStateContext(tab.context); }
});

for (const newerDraft of [false, true]) {
test(`Schedule reconciles a committed write after same-principal token rotation (newer draft: ${newerDraft})`, async ({ browser, baseURL }) => {
  const baseline = JSON.stringify({ events: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [scheduleStateKey]: baseline }, metadataEntries: { [scheduleStateKey]: createMetadata(1, baseline) } };
  let release, held = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const writes = [], reads = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "schedule-token-receipt", {
    appStateReadHandler: ({ request }) => { reads.push({ token: request.headers().authorization, revision: store.metadataEntries[scheduleStateKey].revision }); return null; },
    appStateWriteHandler: async ({ body }) => {
      if (body.key !== scheduleStateKey) return null;
      writes.push(body);
      if (writes.length === 1) { held = true; await barrier; }
      const metadata = store.metadataEntries[scheduleStateKey];
      if (body.baseRevision !== metadata.revision) return { status: 409, body: { ok: false, currentRevision: metadata.revision } };
      store.entries[scheduleStateKey] = body.value;
      store.metadataEntries[scheduleStateKey] = createMetadata(metadata.revision + 1, body.value);
      return { body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[scheduleStateKey] } };
    },
  });
  try {
    await tab.page.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.events = [{ id: "same-actor-edit", date: "2026-09-28", title: "Training", type: "training", time: "", note: "" }];
      localStorage.setItem(key, JSON.stringify(value));
    }, scheduleStateKey);
    await expect.poll(() => held).toBe(true);
    await tab.page.evaluate(async () => {
      window.__qaSession = { ...window.__qaSession, access_token: "rotated-token" };
      await window.__qaAuthStateCallback("TOKEN_REFRESHED", window.__qaSession);
    });
    await expect.poll(() => reads.some((read) => read.token === "Bearer rotated-token" && read.revision === 1)).toBe(true);
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getStatus().hydrating)).toBe(false);
    if (newerDraft) await tab.page.evaluate((key) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.events[0].title = "Newer unsent edit";
      localStorage.setItem(key, JSON.stringify(value));
    }, scheduleStateKey);
    release();
    await expect.poll(() => reads.some((read) => read.token === "Bearer rotated-token" && read.revision === 2)).toBe(true);
    if (newerDraft) {
      await tab.page.waitForTimeout(600);
      expect(await tab.page.evaluate(({ key, manifestKey }) => ({
        title: JSON.parse(localStorage.getItem(key)).events[0].title,
        pending: JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
      }), { key: scheduleStateKey, manifestKey: dataSafetyManifestKey })).toEqual({ title: "Newer unsent edit", pending: true });
      expect(JSON.parse(store.entries[scheduleStateKey]).events[0].title).toBe("Training");
      expect(writes.length).toBeLessThanOrEqual(2);
      return;
    }
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => {
      const entry = JSON.parse(localStorage.getItem(manifestKey)).entries[key];
      return { pending: Boolean(entry.pendingCentralSync), revision: entry.serverRevision };
    }, { key: scheduleStateKey, manifestKey: dataSafetyManifestKey })).toEqual({ pending: false, revision: 2 });
    expect(reads.some((read) => read.token === "Bearer rotated-token" && read.revision === 2)).toBe(true);
    expect(await tab.page.evaluate((key) => window.footballScienceCentralState.getStatus().metadata[key].revision, scheduleStateKey)).toBe(2);
    expect(JSON.parse(store.entries[scheduleStateKey]).events[0].id).toBe("same-actor-edit");
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    await tab.page.waitForTimeout(400);
    expect(writes).toHaveLength(1);
  } finally { release(); await closeCentralStateContext(tab.context); }
});
}

for (const delayedRead of ["profile", "users"]) {
test(`late ${delayedRead} from the previous account cannot invalidate a pending Schedule receipt`, async ({ browser, baseURL }) => {
  const previous = { ...qaUser, id: "previous-actor", app_metadata: { ...qaUser.app_metadata, organization_id: "previous-org" } };
  const next = { ...qaUser, app_metadata: { ...qaUser.app_metadata, organization_id: "next-org" } };
  // This receipt race starts after the legacy import, not during Schedule migration.
  const schedule = cloneScheduleState({ selectedYear: 2026, selectedMonthIndex: 8,
    selectedDate: "2026-09-28", importVersion: "ncc-2026-numbers-v1", events: [] });
  const baseline = JSON.stringify(schedule);
  const draft = JSON.stringify(cloneScheduleState({ ...schedule, events: [
    { id: "next-owner-draft", date: "2026-09-28", title: "Next owner's session", type: "training" },
  ] }));
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [scheduleStateKey]: baseline }, metadataEntries: { [scheduleStateKey]: createMetadata(1, baseline) } };
  let releaseProfile, releaseWrite, profileHeld = false, writeHeld = false;
  const profileBarrier = new Promise((resolve) => { releaseProfile = resolve; });
  const writeBarrier = new Promise((resolve) => { releaseWrite = resolve; });
  const writes = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], `late-${delayedRead}-schedule-receipt`, {
    sessionUser: previous, profileUser: previous,
    appStateWriteHandler: async ({ body, request }) => {
      if (body.key !== scheduleStateKey) return null;
      writes.push({ body, token: request.headers().authorization });
      writeHeld = true; await writeBarrier;
      const revision = store.metadataEntries[scheduleStateKey].revision;
      if (body.baseRevision !== revision) return { status: 409, body: { ok: false, currentRevision: revision } };
      store.entries[scheduleStateKey] = body.value;
      store.metadataEntries[scheduleStateKey] = createMetadata(revision + 1, body.value);
      return { body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[scheduleStateKey] } };
    },
    initScript: () => {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (response.headers.get("x-qa-held-profile") === "true") {
          await response.clone().text();
          setTimeout(() => { window.__qaHeldProfileConsumed = true; }, 0);
        }
        return response;
      };
    },
  });
  try {
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    await tab.context.route("**/api/admin-users**", async (route) => {
      const isProfile = new URL(route.request().url()).searchParams.has("me");
      const oldToken = route.request().headers().authorization === "Bearer qa-access-token";
      const actor = oldToken ? previous : next;
      const body = isProfile ? { ok: true, user: actor } : { ok: true, users: [actor], roles: ["admin"] };
      const hold = oldToken && !profileHeld && isProfile === (delayedRead === "profile");
      if (hold) { profileHeld = true; await profileBarrier; }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body),
        headers: hold ? { "x-qa-held-profile": "true" } : {} });
    });
    await tab.page.evaluate(() => window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession));
    await expect.poll(() => profileHeld).toBe(true);
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "next-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, next);
    await expect.poll(() => tab.page.evaluate(() => !window.footballScienceCentralState.getStatus().hydrating &&
      window.platformAuthStore.getCurrentUser().id)).toBe(next.id);
    const ownerScope = await tab.page.evaluate(() => window.footballScienceCentralState.getReadScope());
    await tab.page.evaluate(({ key, value }) => localStorage.setItem(key, value),
      { key: scheduleStateKey, value: draft });
    await expect.poll(() => writeHeld).toBe(true);
    releaseProfile();
    await tab.page.waitForFunction(() => window.__qaHeldProfileConsumed === true);
    expect(await tab.page.evaluate(() => window.platformAuthStore.getCurrentUser().id)).toBe(next.id);
    expect(await tab.page.evaluate(() => window.footballScienceCentralState.getReadScope())).toBe(ownerScope);
    expect(await tab.page.evaluate(() => window.platformAuthStore.getUsers().map((user) => user.id))).not.toContain(previous.id);
    releaseWrite();
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
      { key: scheduleStateKey, manifestKey: dataSafetyManifestKey })).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0].token).toBe("Bearer next-token");
    expect(store.metadataEntries[scheduleStateKey].revision).toBe(2);
    expect(store.entries[scheduleStateKey]).toBe(draft);
    expect(await tab.page.evaluate((key) => localStorage.getItem(key), scheduleStateKey)).toBe(draft);
  } finally { releaseProfile(); releaseWrite(); await closeCentralStateContext(tab.context); }
});
}

for (const reload of [false, true]) {
for (const serverState of ["unchanged", "advanced", "absent", "empty"]) {
test(`Schedule pending ownership survives account changes and the owner can retry (reload: ${reload}, server: ${serverState})`, async ({ browser, baseURL }) => {
  const profile = { ...qaUser, app_metadata: { ...qaUser.app_metadata, organization_id: "org-a" } };
  const baseline = JSON.stringify({ events: [] });
  const store = { value: createStateValue("Original central sequence"), metadata: createMetadata(1, "sequence"),
    entries: { [scheduleStateKey]: baseline }, metadataEntries: { [scheduleStateKey]: createMetadata(1, baseline) } };
  const absent = serverState === "absent" || serverState === "empty";
  if (absent) { delete store.entries[scheduleStateKey]; delete store.metadataEntries[scheduleStateKey]; store.absentKeys = [scheduleStateKey]; }
  let releaseA, releaseB, heldA = false, heldB = false, holdB = false, acknowledgeA = false;
  const aBarrier = new Promise((resolve) => { releaseA = resolve; });
  const bBarrier = new Promise((resolve) => { releaseB = resolve; });
  const requests = [];
  const tab = await bootCentralPage(browser, baseURL, store, [], "schedule-pending-principal", {
    sessionUser: profile, profileUser: profile,
    appStateReadHandler: async () => {
      if (holdB) { heldB = true; await bBarrier; }
      if (acknowledgeA && serverState === "empty") return { body: {
        ok: true, entries: store.entries, metadata: store.metadataEntries, absentKeys: store.absentKeys,
      } };
      return null;
    },
    appStateWriteHandler: async ({ body, request }) => {
      if (body.entries?.[scheduleStateKey]) {
        requests.push({ body, token: request.headers().authorization });
        store.entries[scheduleStateKey] = body.entries[scheduleStateKey];
        store.metadataEntries[scheduleStateKey] = createMetadata(1, body.entries[scheduleStateKey]);
        return { body: { ok: true, results: [{ key: scheduleStateKey, metadata: store.metadataEntries[scheduleStateKey] }] } };
      }
      if (body.key !== scheduleStateKey) return null;
      requests.push({ body, token: request.headers().authorization });
      if (acknowledgeA) {
        const metadata = store.metadataEntries[scheduleStateKey] || { revision: 0 };
        if (body.baseRevision !== metadata.revision) return { status: 409, body: { ok: false, currentRevision: metadata.revision } };
        store.entries[scheduleStateKey] = body.value;
        store.metadataEntries[scheduleStateKey] = createMetadata(metadata.revision + 1, body.value);
        return { status: 200, body: { ok: true, key: body.key, value: body.value, metadata: store.metadataEntries[scheduleStateKey] } };
      }
      if (body.value.includes("private-org-a")) { heldA = true; await aBarrier; }
      return { status: 500, body: { ok: false, reason: "Synthetic old request failure" } };
    },
    initScript: () => { window.__qaNativeGetItem = Storage.prototype.getItem; },
  });
  try {
    const draft = await tab.page.evaluate((key) => {
      const bridge = window.footballScienceCentralState, original = bridge.syncKey;
      bridge.syncKey = async (...args) => {
        const result = await original(...args);
        if (args[0] === key && args[1].includes("private-org-a")) window.__qaASyncSettled = true;
        return result;
      };
      const value = JSON.parse(localStorage.getItem(key) || '{"events":[]}');
      value.events = [{ id: "private-org-a", date: "2026-09-28", title: "Private A", type: "training", time: "", note: "" }];
      const raw = JSON.stringify(value);
      localStorage.setItem(key, raw);
      return raw;
    }, scheduleStateKey);
    await expect.poll(() => heldA).toBe(true);
    const aEntry = await tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key],
      { key: scheduleStateKey, manifestKey: dataSafetyManifestKey });
    expect(aEntry.principalScope).toContain("org-a");
    profile.id = "org-b-actor";
    profile.app_metadata.organization_id = "org-b";
    store.entries[scheduleStateKey] = JSON.stringify({ events: [{ id: "org-b-central", date: "2026-09-28", title: "B central", type: "training" }] });
    store.metadataEntries[scheduleStateKey] = createMetadata(10, store.entries[scheduleStateKey]);
    store.absentKeys = [];
    holdB = true;
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "org-b-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => heldB).toBe(true);
    releaseA();
    await tab.page.waitForFunction(() => window.__qaASyncSettled === true);
    releaseB(); holdB = false;
    if (reload) await tab.page.reload({ waitUntil: "domcontentloaded" });
    await tab.page.waitForFunction(() => typeof window.footballScienceDataSafety?.createBackup === "function");
    // Finish boot before measuring read isolation; module initialization can still block the page.
    await tab.page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
    await expect.poll(() => tab.page.evaluate((key) => !window.footballScienceCentralState.getStatus().hydrating && JSON.parse(localStorage.getItem(key) || "{}").events?.[0]?.id, scheduleStateKey)).toBe("org-b-central");
    await tab.page.evaluate(() => window.footballScienceCentralState.hydrate({ fresh: true }));
    const retained = await tab.page.evaluate(({ key, manifestKey }) => ({ raw: window.__qaNativeGetItem.call(localStorage, key),
      entry: JSON.parse(localStorage.getItem(manifestKey)).entries[key] }), { key: scheduleStateKey, manifestKey: dataSafetyManifestKey });
    expect(retained).toEqual({ raw: draft, entry: aEntry });
    expect(requests).toHaveLength(1);
    expect(requests[0].token).toBe("Bearer qa-access-token");
    profile.id = qaUser.id;
    profile.app_metadata.organization_id = "org-a";
    store.entries[scheduleStateKey] = baseline;
    store.metadataEntries[scheduleStateKey] = createMetadata(1, baseline);
    if (serverState === "advanced") {
      store.entries[scheduleStateKey] = JSON.stringify({ events: [{ id: "colleague", title: "New central edit" }] });
      store.metadataEntries[scheduleStateKey] = createMetadata(2, store.entries[scheduleStateKey]);
    } else if (absent) {
      delete store.entries[scheduleStateKey]; delete store.metadataEntries[scheduleStateKey]; store.absentKeys = [scheduleStateKey];
    }
    acknowledgeA = true;
    await tab.page.evaluate(async (user) => {
      window.__qaSession = { access_token: "org-a-return-token", user };
      await window.__qaAuthStateCallback("SIGNED_IN", window.__qaSession);
    }, profile);
    await expect.poll(() => tab.page.evaluate(() => window.footballScienceCentralState.getReadScope())).toBe(aEntry.principalScope);
    await expect.poll(() => tab.page.evaluate((key) => window.footballScienceCentralState.getCachedValueInfo(key).source, scheduleStateKey)).not.toBe("central-readonly-baseline");
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].token).toBe("Bearer org-a-return-token");
    expect(requests[1].body.baseRevision).toBe(absent ? 0 : 1);
    if (serverState === "advanced") {
      await tab.page.waitForTimeout(400);
      expect(requests).toHaveLength(2);
      expect(JSON.parse(store.entries[scheduleStateKey]).events[0].id).toBe("colleague");
      expect(await tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
        { key: scheduleStateKey, manifestKey: dataSafetyManifestKey })).toBe(true);
      expect(await tab.page.evaluate((key) => JSON.parse(window.__qaNativeGetItem.call(localStorage, key)), scheduleStateKey)).toEqual(JSON.parse(draft));
      return;
    }
    await expect.poll(() => tab.page.evaluate(({ key, manifestKey }) => JSON.parse(localStorage.getItem(manifestKey)).entries[key].pendingCentralSync,
      { key: scheduleStateKey, manifestKey: dataSafetyManifestKey })).toBe(false);
    expect(JSON.parse(requests[1].body.value).events).toEqual(JSON.parse(draft).events);
    expect(JSON.parse(store.entries[scheduleStateKey]).events).toEqual(JSON.parse(draft).events);
    expect(store.metadataEntries[scheduleStateKey].revision).toBe(absent ? 1 : 2);
    expect(await tab.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).events, scheduleStateKey)).toEqual(JSON.parse(draft).events);
    await tab.page.waitForTimeout(400);
    expect(requests).toHaveLength(2);
  } finally { releaseA(); releaseB(); await closeCentralStateContext(tab.context); }
});
}
}

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
