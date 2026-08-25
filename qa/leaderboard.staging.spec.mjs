import { expect, test as base } from "@playwright/test";
import {
  convergeLeaderboardStagingCleanup,
  createLeaderboardQaRunId,
  leaderboardQaNotePrefix,
  leaderboardQaTitlePrefix,
  sweepStaleLeaderboardQaEvents,
} from "./helpers/leaderboard-staging-cleanup.mjs";
import { requestLeaderboardStagingJson } from "./helpers/leaderboard-staging-http.mjs";
import { isExpectedSupabaseProjectUrl } from "../scripts/lib/leaderboard-staging-qa-env.mjs";

const managerRoles = new Set(["admin", "club-admin", "team-admin", "coach"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectRefPattern = /^[a-z0-9]{20}$/;
const qa = {
  baseUrl: String(process.env.PLAYWRIGHT_BASE_URL || process.env.STAGING_QA_BASE_URL || "").trim(),
  declaredBaseUrl: String(process.env.STAGING_QA_BASE_URL || "").trim(),
  productionBaseUrl: String(process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz").trim(),
  username: String(process.env.LEADERBOARD_STAGING_QA_USERNAME || "").trim(),
  password: String(process.env.LEADERBOARD_STAGING_QA_PASSWORD || "").trim(),
  teamId: String(process.env.LEADERBOARD_STAGING_QA_TEAM_ID || "").trim().toLowerCase(),
  stagingRef: String(process.env.STAGING_SUPABASE_PROJECT_REF || "").trim(),
  productionRef: String(process.env.SUPABASE_PROJECT_REF || "").trim(),
};

const cleanupState = {
  token: "",
  month: "",
  run: null,
  awardBody: null,
  baseline: null,
  mutationMayBeInFlight: false,
  cleanupProven: false,
};

function validateConfiguration() {
  let url = null;
  let declaredUrl = null;
  let productionUrl = null;
  try { url = new URL(qa.baseUrl); } catch {}
  try { declaredUrl = new URL(qa.declaredBaseUrl); } catch {}
  try { productionUrl = new URL(qa.productionBaseUrl); } catch {}
  expect(url?.protocol, "Leaderboard staging smoke requires an HTTPS staging origin.").toBe("https:");
  expect(declaredUrl?.origin, "STAGING_QA_BASE_URL must be a valid HTTPS origin.").toBe(url?.origin);
  expect([productionUrl?.hostname, "footballscience.xyz", "www.footballscience.xyz"], "Leaderboard staging smoke cannot target production.").not.toContain(url?.hostname);
  expect(projectRefPattern.test(qa.stagingRef), "STAGING_SUPABASE_PROJECT_REF must be a valid project ref.").toBe(true);
  expect(projectRefPattern.test(qa.productionRef), "SUPABASE_PROJECT_REF must be a valid project ref for isolation proof.").toBe(true);
  expect(qa.stagingRef, "Staging and production Supabase refs must differ.").not.toBe(qa.productionRef);
  expect(uuidPattern.test(qa.teamId), "LEADERBOARD_STAGING_QA_TEAM_ID must be a Platform team UUID.").toBe(true);
  expect(qa.username, "Dedicated or generic staging QA username is required.").toBeTruthy();
  expect(qa.password, "Dedicated or generic staging QA password is required.").toBeTruthy();
}

function assertSafeUtcWriteWindow(now = new Date()) {
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  expect(nextMonth.getTime() - now.getTime(), "Do not start the mutable smoke within 15 minutes of a UTC month boundary.").toBeGreaterThan(15 * 60 * 1000);
}

async function verifyStagingBackend() {
  const payload = await requestLeaderboardStagingJson({
    baseUrl: qa.baseUrl,
    path: "/api/client-config",
    requireAuth: false,
    label: "Staging client config",
  });
  expect(payload.ok).toBe(true);
  expect(isExpectedSupabaseProjectUrl(payload.url, qa.stagingRef), "The deployed staging app must use the exact expected Supabase HTTPS origin.").toBe(true);
  expect(isExpectedSupabaseProjectUrl(payload.url, qa.productionRef), "The deployed staging app must not use production Supabase.").toBe(false);
}

function membershipCoversTeam(membership = {}, team = {}) {
  if (membership.status !== "active" || team.status !== "active") return false;
  if (membership.scope === "team") return membership.teamId === team.id;
  if (membership.scope === "club") return Boolean(team.clubId && membership.clubId === team.clubId);
  if (membership.scope === "organization") return membership.organizationId === team.organizationId;
  return false;
}

function assertTargetTeamManager(identity = {}) {
  const targetTeam = (identity.scope?.teams || []).find((team) => team.id === qa.teamId);
  expect(targetTeam, "The staging identity must expose the exact active target team.").toBeTruthy();
  expect(targetTeam.status, "The target staging team must be active.").toBe("active");
  const coveringMemberships = (identity.scope?.memberships || []).filter((membership) => membershipCoversTeam(membership, targetTeam));
  expect(coveringMemberships.some((membership) => managerRoles.has(membership.role)), "The staging account needs a fresh manager membership covering the exact target team.").toBe(true);
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function standingPoints(snapshot, playerId) {
  const standing = (Array.isArray(snapshot?.standings) ? snapshot.standings : [])
    .find((row) => String(row?.playerId || "") === playerId);
  return Number(standing?.points || 0);
}

function eventByTitle(snapshot, title) {
  return (Array.isArray(snapshot?.events) ? snapshot.events : [])
    .filter((event) => String(event?.title || "") === title);
}

function isReversed(event = {}) {
  return event.status === "reversed" || Boolean(event.reversedAt || event.reversed_at);
}

function reversalReason(event = {}) {
  return String(event.reverseReason || event.reversalReason || event.reversal_reason || "");
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => Boolean(window.platformAuthReadyPromise), null, { timeout: 20_000 });
  await page.evaluate(() => window.platformAuthReadyPromise);
  await expect.poll(() => page.evaluate(() => {
    if (document.body.dataset.appLoadError) return `error:${document.body.dataset.appLoadError}`;
    return window.__footballScienceAppReady ? "ready" : "loading";
  }), { timeout: 75_000 }).toBe("ready");
}

async function dismissDashboardModal(page) {
  const close = page.locator("button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]").first();
  if (await close.isVisible().catch(() => false)) await close.click({ force: true });
}

async function signIn(page) {
  await page.goto(qa.baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  if (await page.locator("#loginScreen:visible").count()) {
    await page.locator("#loginUsername").fill(qa.username);
    await page.locator("#loginPassword").fill(qa.password);
    await page.locator('#loginForm button[type="submit"]').click();
  }
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#loginScreen")).toBeHidden();
  await dismissDashboardModal(page);
  await expect.poll(() => page.evaluate(async () => Boolean(await window.platformAuthStore?.getAccessToken?.())), {
    timeout: 20_000,
  }).toBe(true);
  return page.evaluate(async () => String((await window.platformAuthStore.getAccessToken()) || ""));
}

async function requestJson(_page, token, path, options = {}) {
  return requestLeaderboardStagingJson({
    baseUrl: qa.baseUrl,
    path,
    token,
    method: options.method || "GET",
    data: options.data,
    timeoutMs: options.timeoutMs || 45_000,
    label: options.label || "Leaderboard staging API",
  });
}

async function readLeaderboard(page, token, month, timeoutMs = 45_000) {
  const params = new URLSearchParams({ month, teamId: qa.teamId });
  const payload = await requestJson(page, token, `/api/leaderboard?${params}`, { timeoutMs, label: "Leaderboard server read" });
  if (payload.schema !== "footballscience-leaderboard-v1" || payload.month !== month || !Array.isArray(payload.roster)) {
    throw new Error("Leaderboard staging server read contract failed.");
  }
  return {
    ...payload,
    qaTeamId: qa.teamId,
    events: (Array.isArray(payload.events) ? payload.events : []).map((event) => ({ ...event, teamId: qa.teamId })),
  };
}

async function postLeaderboard(page, token, body, label, timeoutMs = 45_000) {
  return requestJson(page, token, "/api/leaderboard", { method: "POST", data: body, label, timeoutMs });
}

function cleanupOptions(state, budgetMs) {
  return {
    run: state.run,
    awardBody: state.awardBody,
    baseline: state.baseline,
    budgetMs,
    requestTimeoutMs: Math.min(12_000, budgetMs),
    retryAward: (body, timeoutMs) => postLeaderboard(null, state.token, body, "QA cleanup award replay", timeoutMs),
    readSnapshot: (timeoutMs) => readLeaderboard(null, state.token, state.month, timeoutMs),
    reverseEvent: (body, timeoutMs) => postLeaderboard(null, state.token, body, "QA cleanup reversal", timeoutMs),
  };
}

const test = base.extend({
  leaderboardWorkerCleanup: [async ({}, use) => {
    await use();
    if (!cleanupState.mutationMayBeInFlight || cleanupState.cleanupProven) return;
    await convergeLeaderboardStagingCleanup(cleanupOptions(cleanupState, 90_000));
    cleanupState.cleanupProven = true;
  }, { auto: true, scope: "worker", timeout: 100_000 }],
});

async function openLeaderboard(page, month) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "schedule" } })));
  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  const readResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/leaderboard" && response.request().method() === "GET";
  }, { timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "home" } })));
  await expect(page.locator('[data-workspace-view="home"].is-active')).toBeVisible();
  const response = await readResponse;
  const url = new URL(response.url());
  expect(url.searchParams.get("teamId"), "Leaderboard UI must request the explicit active staging team.").toBe(qa.teamId);
  expect(url.searchParams.get("month")).toBe(month);
  const payload = await response.json().catch(() => ({}));
  expect(response.ok(), `Leaderboard UI read failed with HTTP ${response.status()}.`).toBe(true);
  expect(payload.ok).toBe(true);
  await expect(page.locator("#leaderboardSummary")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-leaderboard-home-open]").click();
  await expect(page.locator("[data-leaderboard-dialog-workspace] [data-leaderboard-root]")).toBeVisible({ timeout: 30_000 });
  return payload;
}

async function reloadLeaderboard(page, month) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
  await dismissDashboardModal(page);
  return openLeaderboard(page, month);
}

async function standingRowFor(page, playerId) {
  const rows = page.locator("tr[data-leaderboard-player-detail]");
  const index = await rows.evaluateAll((nodes, id) => nodes.findIndex((node) => node.dataset.leaderboardPlayerDetail === id), playerId);
  expect(index, `Standing row for server player ${playerId} must exist.`).toBeGreaterThanOrEqual(0);
  return rows.nth(index);
}

async function selectSamePointPlayer(page, playerId) {
  const selected = await page.locator("[data-leaderboard-toggle-winner]").evaluateAll((buttons, id) => {
    const button = buttons.find((candidate) => candidate.dataset.leaderboardToggleWinner === id);
    button?.click();
    return Boolean(button);
  }, playerId);
  expect(selected, `Server roster player ${playerId} must be selectable in the UI.`).toBe(true);
}

async function expectExactAwardRoster(page, roster = []) {
  const expectedIds = [...new Set(roster.map((player) => String(player.playerId || "")).filter(Boolean))].sort();
  const renderedIds = await page.locator("[data-leaderboard-toggle-winner]").evaluateAll((buttons) => buttons
    .map((button) => button.dataset.leaderboardToggleWinner || "")
    .filter(Boolean)
    .sort());
  expect(renderedIds, "The UI award list must contain only the server-authoritative target-team roster.").toEqual(expectedIds);
}

function uiCommandValidationError(body, expected) {
  if (!body || typeof body !== "object") return "UI command body was not valid JSON.";
  if (body.teamId !== qa.teamId) return "UI command did not use the exact active team.";
  if (body.action === "award") {
    const awards = Array.isArray(body.awards) ? body.awards : [];
    if (body.occurredOn !== expected.occurredOn || body.title !== expected.title || body.note !== expected.note) {
      return "UI award identity did not match the armed QA run.";
    }
    if (!/^leaderboard-award-/.test(String(body.idempotencyKey || ""))) return "UI award idempotency key was missing.";
    if (awards.length !== 1 || awards[0]?.playerId !== expected.playerId || Number(awards[0]?.points) !== 1 || awards[0]?.placement !== null) {
      return "UI award payload did not match the selected server roster player.";
    }
    return "";
  }
  if (body.action === "reverse-event") {
    if (body.eventId !== expected.eventId || body.reason !== expected.reason) return "UI reversal identity did not match the armed QA event.";
    if (!/^leaderboard-reverse-/.test(String(body.idempotencyKey || ""))) return "UI reversal idempotency key was missing.";
    return "";
  }
  return "Unexpected Leaderboard UI command action.";
}

async function installUiCommandCapture(page, expected) {
  const endpoint = new URL("/api/leaderboard", qa.baseUrl).href;
  const captured = { award: null, reverse: null, error: "" };
  await page.route(endpoint, async (route, request) => {
    if (request.method() !== "POST" || request.url() !== endpoint) return route.continue();
    let body = null;
    try { body = JSON.parse(request.postData() || ""); } catch {}
    const error = uiCommandValidationError(body, expected);
    if (body?.action === "award" && !captured.award) {
      captured.award = body;
      if (!error) {
        cleanupState.awardBody = body;
        cleanupState.mutationMayBeInFlight = true;
      }
    } else if (body?.action === "reverse-event" && !captured.reverse) {
      captured.reverse = body;
    }
    captured.error ||= error;
    if (error) return route.abort("blockedbyclient");
    return route.continue();
  });
  return captured;
}

function waitForUiCommandResponse(page, action) {
  const endpoint = new URL("/api/leaderboard", qa.baseUrl).href;
  return page.waitForResponse((response) => {
    if (response.url() !== endpoint || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON()?.action === action; } catch { return false; }
  }, { timeout: 45_000 });
}

async function readUiCommandResponse(responsePromise, label) {
  const response = await responsePromise;
  expect(response.ok(), `${label} failed with HTTP ${response.status()}.`).toBe(true);
  const payload = await response.json().catch(() => ({}));
  expect(payload.ok, `${label} must return ok=true.`).toBe(true);
  return payload;
}

test("authenticated staging coach can award, replay, inspect, and reverse Leaderboard points", async ({ page }) => {
  validateConfiguration();
  assertSafeUtcWriteWindow();
  const runId = createLeaderboardQaRunId();
  const run = { runId };
  const title = `${leaderboardQaTitlePrefix}${runId}`;
  const note = `${leaderboardQaNotePrefix}${runId}`;
  const occurredOn = currentUtcDate();
  const month = occurredOn.slice(0, 7);

  try {
    expect(occurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(month).toBe(new Date().toISOString().slice(0, 7));
    await verifyStagingBackend();
    const token = await signIn(page);
    const identity = await requestJson(page, token, "/api/platform-identity", { label: "Platform identity read" });
    assertTargetTeamManager(identity);

    const initial = await readLeaderboard(page, token, month);
    await sweepStaleLeaderboardQaEvents({
      initialSnapshot: initial,
      teamId: qa.teamId,
      readSnapshot: (timeoutMs) => readLeaderboard(null, token, month, timeoutMs),
      reverseEvent: (body, timeoutMs) => postLeaderboard(null, token, body, "Stale QA safety reversal", timeoutMs),
    });
    const baseline = await readLeaderboard(page, token, month);
    expect(baseline.roster.length, "The target staging team needs an eligible active roster player.").toBeGreaterThan(0);
    const player = baseline.roster.find((row) => row?.playerId && row?.displayName);
    expect(player, "The server-authoritative roster needs a stable playerId and displayName.").toBeTruthy();
    const baselineProof = {
      playerId: player.playerId,
      playerPoints: standingPoints(baseline, player.playerId),
      totalPoints: Number(baseline.summary?.totalPoints || 0),
      eventCount: Number(baseline.summary?.eventCount || 0),
    };
    const expectedCommand = {
      occurredOn,
      title,
      note,
      playerId: player.playerId,
      eventId: "",
      reason: `QA staging smoke reversal ${runId}`,
    };
    Object.assign(cleanupState, {
      token,
      month,
      run,
      awardBody: null,
      baseline: baselineProof,
      mutationMayBeInFlight: false,
      cleanupProven: false,
    });
    const captured = await installUiCommandCapture(page, expectedCommand);

    const uiRead = await openLeaderboard(page, month);
    expect(uiRead.roster.some((row) => row.playerId === player.playerId && row.displayName === player.displayName)).toBe(true);
    await expect(page.locator("[data-leaderboard-dialog-workspace]")).toContainText(player.displayName);
    await page.locator("[data-leaderboard-open-award]").click();
    const dateInput = page.locator("[data-leaderboard-award-date]");
    await dateInput.fill(occurredOn);
    await expect(dateInput).toHaveValue(occurredOn);
    await page.locator("[data-leaderboard-award-title]").fill(title);
    await page.locator("[data-leaderboard-award-note]").fill(note);
    await page.locator('[data-leaderboard-award-mode="same"]').click();
    await page.locator('[data-leaderboard-same-points="1"]').click();
    await expectExactAwardRoster(page, baseline.roster);
    await selectSamePointPlayer(page, player.playerId);
    await expect(page.locator(".leaderboard-award-preview")).toContainText("1 points total");

    const awardResponse = waitForUiCommandResponse(page, "award");
    await page.locator('[data-leaderboard-award-form] button[type="submit"]').click();
    await expect.poll(() => Boolean(captured.award) || Boolean(captured.error), { message: "The deployed award form must issue one captured UI command." }).toBe(true);
    expect(captured.error, "The captured UI award command must match the armed QA run.").toBe("");
    expect(cleanupState.mutationMayBeInFlight, "Cleanup ownership must be armed before the UI request continues.").toBe(true);
    const award = await readUiCommandResponse(awardResponse, "Leaderboard UI award");
    await expect(page.locator("[data-leaderboard-award-form]")).toBeHidden();
    await expect(page.locator(".leaderboard-notice")).toContainText("Points awarded to 1 player.");
    const awardRetry = await postLeaderboard(null, token, captured.award, "Idempotent award retry");
    const awardEvents = eventByTitle(award, title);
    expect(awardEvents).toHaveLength(1);
    const eventId = String(awardEvents[0].id || "");
    expect(uuidPattern.test(eventId)).toBe(true);
    expect(eventByTitle(awardRetry, title)).toHaveLength(1);
    expect(standingPoints(awardRetry, player.playerId)).toBe(baselineProof.playerPoints + 1);
    expect(Number(awardRetry.summary?.totalPoints || 0)).toBe(baselineProof.totalPoints + 1);

    const row = await standingRowFor(page, player.playerId);
    await expect(row.locator(".leaderboard-points-cell strong")).toHaveText(String(baselineProof.playerPoints + 1));
    await page.locator('[data-leaderboard-tab="activity"]').click();
    let activity = page.locator(".leaderboard-event").filter({ hasText: title });
    await expect(activity).toHaveCount(1);
    await expect(activity).toContainText(player.displayName);

    expectedCommand.eventId = eventId;
    await activity.locator(`[data-leaderboard-open-reverse="${eventId}"]`).click();
    await page.locator("[data-leaderboard-reverse-reason]").fill(expectedCommand.reason);
    const reversalResponse = waitForUiCommandResponse(page, "reverse-event");
    await page.locator('[data-leaderboard-reverse-form] button[type="submit"]').click();
    await expect.poll(() => Boolean(captured.reverse) || Boolean(captured.error), { message: "The deployed reversal form must issue one captured UI command." }).toBe(true);
    expect(captured.error, "The captured UI reversal command must match the armed QA event.").toBe("");
    const reversal = await readUiCommandResponse(reversalResponse, "Leaderboard UI reversal");
    await expect(page.locator("[data-leaderboard-reverse-form]")).toBeHidden();
    await expect(page.locator(".leaderboard-notice")).toContainText("Point award reversed.");
    const reversalRetry = await postLeaderboard(null, token, captured.reverse, "Idempotent reversal retry");
    const reversedEvent = eventByTitle(reversal, title)[0];
    expect(isReversed(reversedEvent)).toBe(true);
    expect(reversalReason(reversedEvent)).toBe(expectedCommand.reason);
    expect(Number(reversedEvent.netPoints || 0)).toBe(0);
    expect(eventByTitle(reversalRetry, title)).toHaveLength(1);
    expect(standingPoints(reversalRetry, player.playerId)).toBe(baselineProof.playerPoints);
    expect(Number(reversalRetry.summary?.totalPoints || 0)).toBe(baselineProof.totalPoints);
    expect(Number(reversalRetry.summary?.eventCount || 0)).toBe(baselineProof.eventCount);

    await expect(activity).toHaveClass(/is-reversed/);
    await expect(activity).toContainText(expectedCommand.reason);

    await reloadLeaderboard(page, month);
    await page.locator('[data-leaderboard-tab="activity"]').click();
    activity = page.locator(".leaderboard-event").filter({ hasText: title });
    await expect(activity).toHaveClass(/is-reversed/);
    await expect(activity).toContainText(expectedCommand.reason);
    cleanupState.cleanupProven = true;
  } finally {
    if (cleanupState.mutationMayBeInFlight && !cleanupState.cleanupProven) {
      try {
        await convergeLeaderboardStagingCleanup(cleanupOptions(cleanupState, 20_000));
        cleanupState.cleanupProven = true;
      } catch {
        console.warn(`Leaderboard staging run ${cleanupState.run?.runId || "unknown"} needs worker cleanup retry.`);
      }
    }
  }
});
