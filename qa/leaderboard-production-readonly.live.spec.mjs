import { expect, request, test } from "@playwright/test";
import { assertSupabaseUrl, sanitizedApiRequest } from "../scripts/lib/leaderboard-production-release-security.mjs";

const liveBaseUrl = String(process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz").trim();
const expectedOrigin = String(process.env.LEADERBOARD_READONLY_EXPECTED_ORIGIN || "https://footballscience.xyz").trim();
const expectedRef = String(process.env.LEADERBOARD_READONLY_EXPECTED_SUPABASE_REF || "bustidorxevacosqhkcz").trim();
const deniedRef = String(process.env.LEADERBOARD_READONLY_DENIED_SUPABASE_REF || "pokrksgempkuraueglpu").trim();
const hasCredentials = Boolean(process.env.LIVE_QA_USERNAME && process.env.LIVE_QA_PASSWORD);
const leaderboardViewRoles = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);

if (new URL(liveBaseUrl).href !== `${expectedOrigin}/`) throw new Error("Leaderboard smoke base URL did not match the exact reviewed origin.");

test.skip(!hasCredentials, "Protected Leaderboard smoke requires reviewed QA credentials.");

function teamIsCovered(identity, teamId) {
  const teams = Array.isArray(identity?.scope?.teams) ? identity.scope.teams : [];
  const memberships = Array.isArray(identity?.scope?.memberships) ? identity.scope.memberships : [];
  const team = teams.find((entry) => entry.id === teamId && entry.status === "active");
  if (!team) return false;
  return memberships.some((membership) => {
    if (membership.status !== "active") return false;
    if (membership.scope === "team") return membership.teamId === team.id;
    if (membership.scope === "club") return Boolean(team.clubId && membership.clubId === team.clubId);
    return membership.scope === "organization" && membership.organizationId === team.organizationId;
  });
}

async function waitForReady(page) {
  await page.waitForFunction(() => Boolean(window.platformAuthReadyPromise), null, { timeout: 20_000 });
  await page.evaluate(() => window.platformAuthReadyPromise);
  await expect.poll(() => page.evaluate(() => {
    if (document.body.dataset.appLoadError) return `error:${document.body.dataset.appLoadError}`;
    return window.__footballScienceAppReady ? "ready" : "loading";
  }), { timeout: 75_000 }).toBe("ready");
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
  const close = page.locator("button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]").first();
  if (await close.isVisible().catch(() => false)) await close.click({ force: true });
}

async function tokenFrom(page) {
  await expect.poll(() => page.evaluate(async () => String((await window.platformAuthStore?.getAccessToken?.()) || "")), {
    timeout: 20_000,
  }).not.toBe("");
  return page.evaluate(async () => String((await window.platformAuthStore.getAccessToken()) || ""));
}

async function authenticatePage(page) {
  await page.goto(liveBaseUrl, { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).origin === expectedOrigin).toBe(true);
  await page.waitForFunction(() => Boolean(window.platformAuthReadyPromise), null, { timeout: 20_000 });
  await page.evaluate(() => window.platformAuthReadyPromise);
  const loginResponse = await sanitizedApiRequest("login", () => page.request.post(`${expectedOrigin}/api/client-config`, {
    data: { email: process.env.LIVE_QA_USERNAME, password: process.env.LIVE_QA_PASSWORD },
    maxRedirects: 0,
  }));
  const login = await loginResponse.json().catch(() => null);
  expect(loginResponse.status()).toBe(200);
  expect(login?.ok === true).toBe(true);
  expect(Boolean(login?.session?.access_token)).toBe(true);
  expect(Boolean(login?.session?.refresh_token)).toBe(true);
  const sessionOk = await page.evaluate(async (session) => {
    const client = window.platformAuthStore?.getSupabaseClient?.();
    if (!client?.auth?.setSession) return false;
    const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    return !error;
  }, login.session);
  expect(sessionOk).toBe(true);
  await waitForReady(page);
  await expect.poll(() => page.evaluate(() => {
    const user = window.platformAuthStore?.getCurrentUser?.();
    return user?.id && user?.role ? `${user.id}|${user.role}` : "";
  }), { timeout: 30_000, intervals: [250, 500, 1_000, 2_000] }).toMatch(/^[^|]+\|[^|]+$/);
}

test("Leaderboard is authenticated, tenant-bound, empty, and read-only", async ({ page }) => {
  let forbiddenMethodCount = 0;
  let crossOriginApiCount = 0;
  let apiFailureCount = 0;
  let pageErrorCount = 0;
  let leaderboardConsoleErrorCount = 0;

  await page.route("**/*", async (route) => {
    const method = route.request().method().toUpperCase();
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.startsWith("/api/") && requestUrl.origin !== expectedOrigin) {
      crossOriginApiCount += 1;
      await route.abort("blockedbyclient");
      return;
    }
    if (requestUrl.pathname === "/api/leaderboard" && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      forbiddenMethodCount += 1;
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    const authorization = String(response.request().headers().authorization || "");
    if (responseUrl.pathname === "/api/leaderboard" && authorization && (responseUrl.origin !== expectedOrigin || response.status() >= 400)) apiFailureCount += 1;
  });
  page.on("pageerror", () => { pageErrorCount += 1; });
  page.on("console", (message) => {
    if (message.type() === "error" && /leaderboard|\/api\/leaderboard/i.test(message.text())) leaderboardConsoleErrorCount += 1;
  });

  await authenticatePage(page);
  const token = await tokenFrom(page);
  expect(new URL(page.url()).origin === expectedOrigin).toBe(true);

  const clientConfigResponse = await sanitizedApiRequest("client-config", () => page.request.get(`${expectedOrigin}/api/client-config`, { maxRedirects: 0 }));
  const clientConfig = await clientConfigResponse.json().catch(() => null);
  expect(clientConfigResponse.status()).toBe(200);
  assertSupabaseUrl(clientConfig?.url, expectedRef, deniedRef);

  const identityResponse = await sanitizedApiRequest("identity", () => page.request.get(`${expectedOrigin}/api/platform-identity`, {
    headers: { Authorization: `Bearer ${token}` },
    maxRedirects: 0,
  }));
  const identity = await identityResponse.json().catch(() => null);
  expect(identityResponse.status()).toBe(200);
  expect(identity?.ok === true).toBe(true);

  const clientUser = await page.evaluate(() => {
    const user = window.platformAuthStore?.getCurrentUser?.() || {};
    return {
      id: String(user.id || ""),
      role: String(user.role || "").trim().toLowerCase(),
      teamId: String(user.teamId || user.team_id || ""),
    };
  });
  expect(clientUser.id).not.toBe("");
  expect(leaderboardViewRoles.has(clientUser.role), `Client identity role ${clientUser.role || "unknown"} cannot view Leaderboard.`).toBe(true);

  const fallbackTeamId = (Array.isArray(identity?.scope?.teams) ? identity.scope.teams : [])
    .filter((team) => team.status === "active" && teamIsCovered(identity, team.id))
    .map((team) => String(team.id || ""))
    .filter(Boolean)
    .sort()[0] || "";
  const teamId = teamIsCovered(identity, clientUser.teamId) ? clientUser.teamId : fallbackTeamId;
  expect(/^[0-9a-f-]{36}$/i.test(teamId) && teamIsCovered(identity, teamId), "Live QA identity must expose a deterministic active team.").toBe(true);

  const month = new Date().toISOString().slice(0, 7);
  const params = new URLSearchParams({ month, teamId });
  const directResponse = await sanitizedApiRequest("leaderboard", () => page.request.get(`${expectedOrigin}/api/leaderboard?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    maxRedirects: 0,
  }));
  const direct = await directResponse.json().catch(() => null);
  expect(directResponse.status()).toBe(200);
  expect(direct?.ok === true && direct?.schema === "footballscience-leaderboard-v1" && direct?.month === month).toBe(true);
  expect(Number(direct?.summary?.totalPoints)).toBe(0);
  expect(Number(direct?.summary?.eventCount)).toBe(0);
  expect(Array.isArray(direct?.events) ? direct.events.length : -1).toBe(0);
  expect(Array.isArray(direct?.standings) ? direct.standings.length : -1).toBe(0);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "schedule" } })));
  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "home" } })));
  await expect(page.locator('[data-workspace-view="home"].is-active')).toBeVisible();

  // The Home surface may reuse an existing runtime, so request timing is not part of this proof.
  // The authenticated API payload is asserted above; here we verify the rendered surface and dialog.
  await expect.poll(() => page.evaluate(() => {
    const user = window.platformAuthStore?.getCurrentUser?.() || {};
    const summary = document.getElementById("leaderboardSummary");
    if (!summary) return `missing-summary:${String(user.role || "unknown")}`;
    if (summary.querySelector(".dashboard-leaderboard-load-error")) return `load-error:${String(user.role || "unknown")}`;
    if (summary.querySelector("[data-leaderboard-home-root]")) return "ready";
    return `loading:${String(user.role || "unknown")}`;
  }), { timeout: 30_000, intervals: [250, 500, 1_000, 2_000] }).toBe("ready");
  await expect(page.locator("#leaderboardSummary [data-leaderboard-home-root]")).toBeVisible();
  await expect(page.locator("#leaderboardSummary .leaderboard-home-standings, #leaderboardSummary .leaderboard-home-state").first()).toBeVisible();
  await expect(page.locator("#leaderboardSummary [data-leaderboard-home-open]")).toBeVisible();
  await page.locator("#leaderboardSummary [data-leaderboard-home-open]").click();
  await expect(page.locator("[data-leaderboard-dialog-workspace] [data-leaderboard-root]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-leaderboard-open-award]")).toBeVisible();

  const anonymous = await request.newContext({ baseURL: expectedOrigin });
  try {
    const denied = await sanitizedApiRequest("anonymous-leaderboard", () => anonymous.get(`/api/leaderboard?${params}`, { maxRedirects: 0 }));
    expect([401, 403]).toContain(denied.status());
    const payload = await denied.json().catch(() => null);
    expect(payload?.ok === false).toBe(true);
  } finally {
    await sanitizedApiRequest("anonymous-dispose", () => anonymous.dispose());
  }

  expect(forbiddenMethodCount, "Leaderboard live smoke attempted a write.").toBe(0);
  expect(crossOriginApiCount, "Authenticated API traffic crossed the exact reviewed origin.").toBe(0);
  expect(apiFailureCount, "Authenticated Leaderboard requests must not fail.").toBe(0);
  expect(pageErrorCount).toBe(0);
  expect(leaderboardConsoleErrorCount).toBe(0);
});
