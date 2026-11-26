import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createIsolatedStagingProbe } from "./helpers/isolated-staging-probe.mjs";
import { createScheduleProbeFixture, showScheduleDateInPlanner } from "./helpers/live-schedule-probe.mjs";
import { createScheduleStagingWriteGuard } from "./helpers/schedule-staging-write-guard.mjs";
import { scheduleStorageKey } from "../src/modules/schedule/schedule-state.mjs";

const centralPath = "/api/app-state";
const readPath = centralPath + "?fresh=1&keys=" + encodeURIComponent(scheduleStorageKey);

async function centralSchedule(qa, authorization) {
  if (!authorization?.startsWith("Bearer ")) throw new Error("An authenticated staging QA session is required.");
  const response = await fetch(qa.origin + readPath, {
    headers: { authorization, "x-footballscience-fresh-state": "1" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null);
  const revision = payload?.metadata?.[scheduleStorageKey]?.revision;
  if (!response.ok || payload?.ok !== true || !Number.isInteger(revision) || typeof payload.entries?.[scheduleStorageKey] !== "string") {
    throw new Error("Existing central Schedule state and revision are required.");
  }
  let state;
  try { state = JSON.parse(payload.entries[scheduleStorageKey]); } catch {}
  if (!Array.isArray(state?.events)) throw new Error("Central Schedule state is malformed.");
  return { state, revision };
}

async function readAuthorization(page) {
  const token = await page.evaluate(() => window.platformAuthStore?.getAccessToken?.());
  if (!token) throw new Error("Staging QA login did not create an authenticated session.");
  return "Bearer " + token;
}

async function openSchedule(page) {
  await page.evaluate(() => {
    document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click();
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "schedule" } }));
  });
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
}

async function assertCentralEvent(qa, page, record, present) {
  const authorization = await readAuthorization(page);
  await expect.poll(async () => {
    const { state } = await centralSchedule(qa, authorization);
    return state.events.some(event => event.title === record.title && event.date === record.date);
  }, { timeout: 45000 }).toBe(present);
}

async function commitScheduleAction(page, action) {
  const receipt = page.waitForResponse(response => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(request.url()).pathname !== centralPath) return false;
    try { return request.postDataJSON()?.key === scheduleStorageKey; }
    catch { return false; }
  }, { timeout: 45000 });
  const [response] = await Promise.all([receipt, action()]);
  expect(response.ok(), "Schedule write must return success to the browser.").toBe(true);
  expect(await response.headerValue("server-timing"), "Schedule must receive its database receipt.")
    .toMatch(/(?:^|,)\s*database;dur=/);
}

async function visibleLocalEvent(page, record, present) {
  // Read the disposable browser's local copy as well as the separately fetched server state.
  await expect.poll(() => page.evaluate(({ key, title, date }) => {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value.events?.some(event => event.title === title && event.date === date) ?? false;
  }, { key: scheduleStorageKey, ...record })).toBe(present);
}

async function findEmptyDay(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const empty = page.locator(".schedule-planner-day:not(.has-events):not(.has-note)").first();
    if (await empty.count()) return empty;
    const firstDate = await page.locator(".schedule-planner-day").first().getAttribute("data-schedule-date");
    await page.locator("#scheduleNextMonthButton").click();
    await expect(page.locator(".schedule-planner-day").first()).not.toHaveAttribute("data-schedule-date", firstDate);
  }
  throw new Error("No empty staging Schedule date was visible.");
}

async function guardedContextRoute(route, { qa, guard, operation, report }) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(method);
  const stageAuth = url.origin === qa.backend && /^\/auth\/v1\/(user|token)$/.test(url.pathname);
  if (readOnly && (url.origin === qa.origin || stageAuth)) return route.continue();
  if (method === "GET" && url.href === "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js") {
    const response = await route.fetch({ maxRedirects: 0, timeout: 20000 });
    if (response.ok()) return route.fulfill({ response });
    return route.abort("blockedbyclient");
  }

  let phase = "staging authentication";
  try {
    if (method === "POST" && (stageAuth && url.pathname.endsWith("/token") ||
        url.origin === qa.origin && url.pathname === "/api/client-config" && !url.search)) {
      await qa.identity();
      const response = await route.fetch({ maxRedirects: 0, timeout: 40000 });
      if (response.status() >= 300 && response.status() < 400) throw new Error();
      return route.fulfill({ response });
    }
    if (method !== "POST" || url.origin !== qa.origin || url.pathname !== centralPath || url.search || !operation()) {
      return route.abort("blockedbyclient");
    }
    phase = "Schedule request envelope";
    const body = request.postDataJSON();
    if (body?.key !== scheduleStorageKey) {
      report.blockedUnrelated += 1;
      return route.abort("blockedbyclient");
    }
    phase = "Schedule target identity";
    await qa.identity();
    phase = "Schedule central revision";
    const authorization = await request.headerValue("authorization");
    const current = await centralSchedule(qa, authorization);
    phase = "owned Schedule change";
    const payload = guard.prepare(body, current, operation());
    phase = "Schedule database response";
    report.forwarded += 1;
    const response = await route.fetch({ postData: payload, maxRedirects: 0, timeout: 45000 });
    if (response.status() >= 300 && response.status() < 400) throw new Error();
    if (response.ok() && /(?:^|,)\s*database;dur=/.test(response.headers()["server-timing"] || "")) {
      report.databaseReceipts += 1;
    }
    return route.fulfill({ response });
  } catch {
    report.refused.push(phase);
    return route.abort("blockedbyclient");
  }
}

async function authenticate(qa, page, handle) {
  await page.context().route("**/*", handle);
  await qa.identity();
  await page.goto(qa.origin, { waitUntil: "domcontentloaded" });
  const form = page.locator("#loginForm");
  await expect(form.locator('button[type="submit"]')).toBeEnabled({ timeout: 30000 });
  await page.locator("#loginUsername").fill(qa.username);
  await page.locator("#loginPassword").fill(qa.password);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 45000 });
  const ready = await page.waitForFunction(() => {
    const state = window.footballScienceCentralState?.getStatus?.();
    return Boolean(state?.hydrated && !state.hydrating && !state.lastError);
  }, undefined, { timeout: 45000 });
  await ready.dispose();
}

const scheduleTest = test.extend({
  stagingSchedule: [async ({ browser }, use) => {
    if (process.env.SCHEDULE_QA_DATABASE_MODE !== "database") {
      throw new Error("Exact staging runtime database mode must be verified before running the Schedule write probe.");
    }
    const qa = await createIsolatedStagingProbe();
    const guard = createScheduleStagingWriteGuard();
    let operation = "";
    const report = { forwarded: 0, databaseReceipts: 0, refused: [], blockedUnrelated: 0 };
    const handle = route => guardedContextRoute(route, { qa, guard, operation: () => operation, report });
    const signIn = page => authenticate(qa, page, handle);
    const getCurrentUser = page => page.evaluate(() => {
      const user = window.platformAuthStore?.getCurrentUser?.();
      return { id: user?.id, clubId: user?.clubId, teamId: user?.teamId };
    });
    const [fixture] = createScheduleProbeFixture({
      signIn,
      getCurrentUser,
      createContext: () => browser.newContext({ serviceWorkers: "block" }),
      removeRecord: async (page, title, date) => {
        const record = { title, date };
        const { state } = await centralSchedule(qa, await readAuthorization(page));
        if (!state.events.some(event => event.title === title && event.date === date)) return;
        await openSchedule(page);
        await showScheduleDateInPlanner(page, date);
        const eventChip = page.locator(`.schedule-planner-day[data-schedule-date="${date}"] .schedule-planner-event-chip`)
          .filter({ has: page.getByText(title, { exact: true }) });
        await expect(eventChip).toHaveCount(1);
        await eventChip.click();
        await expect(eventChip).toHaveAttribute("aria-pressed", "true");
        await page.keyboard.press("Delete");
        const confirmDialog = page.locator(".platform-confirm-dialog");
        await expect(confirmDialog.locator("h2")).toHaveText("Delete plan?");
        operation = "cleanup";
        try {
          await commitScheduleAction(page, () => confirmDialog.locator("[data-platform-confirm-ok]").click());
          await visibleLocalEvent(page, record, false);
          await assertCentralEvent(qa, page, record, false);
        } finally {
          operation = "";
        }
      },
    });
    await fixture({ browser }, probe => use({
      qa, guard, report, probe, signIn, getCurrentUser,
      openCreation() { operation = "create"; },
      closeCreation() { operation = ""; },
    }));
    await qa.identity();
    expect(report).toMatchObject({ forwarded: 2, databaseReceipts: 2, refused: [] });
    console.log(`Schedule QA blocked ${report.blockedUnrelated} unrelated background writes.`);
    console.log("Schedule QA isolation: staging database accepted exactly one owned create and cleanup.");
  }, { timeout: 270_000 }],
});

scheduleTest("isolated staging account saves, reopens, and removes one synthetic Schedule event", async ({ browser, stagingSchedule }) => {
  const { qa, guard, probe, signIn, getCurrentUser } = stagingSchedule;
  const writer = await browser.newContext({ serviceWorkers: "block" });
  const reader = await browser.newContext({ serviceWorkers: "block" });
  try {
    const page = await writer.newPage();
    await signIn(page);
    const user = await getCurrentUser(page);
    await openSchedule(page);
    await page.locator("#scheduleTodayButton").click();
    const emptyDay = await findEmptyDay(page);
    const date = await emptyDay.getAttribute("data-schedule-date");
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const record = { title: `QA Live ${Date.now()}-${randomUUID()}`, date };
    // The first empty day changes during renders. Pin the date before
    // interacting so the editor and both readers refer to the same record.
    const day = page.locator(`.schedule-planner-day[data-schedule-date="${record.date}"]`);
    await expect(day).not.toHaveClass(/has-events|has-note/);
    await day.dblclick();
    const addInput = page.locator(`[data-schedule-planner-add-date="${record.date}"] [name="plannerTitle"]`);
    await expect(addInput).toBeVisible();
    await addInput.fill(record.title);
    guard.arm(record);
    probe.arm({ title: record.title, targetDate: record.date, user });
    stagingSchedule.openCreation();
    try {
      await commitScheduleAction(page, () => addInput.press("Enter"));
      await expect(day.getByText(record.title, { exact: true })).toBeVisible();
      await visibleLocalEvent(page, record, true);
      await assertCentralEvent(qa, page, record, true);
    } finally {
      stagingSchedule.closeCreation();
    }

    const reopened = await reader.newPage();
    await signIn(reopened);
    await openSchedule(reopened);
    await showScheduleDateInPlanner(reopened, record.date);
    await expect(reopened.locator(`.schedule-planner-day[data-schedule-date="${record.date}"]`)
      .getByText(record.title, { exact: true })).toBeVisible();
    await visibleLocalEvent(reopened, record, true);
  } finally {
    await Promise.all([writer.close(), reader.close()]);
  }
});
