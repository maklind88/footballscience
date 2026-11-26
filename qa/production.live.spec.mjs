import crypto from "node:crypto";
import { verifyRecoveryDraftLive } from "./helpers/recovery-draft-live-probe.mjs";
import { verifyAuthenticatedHistory } from "./helpers/history-live-probe.mjs";
import { verifyStorageGrowthLive } from "./helpers/storage-growth-live-probe.mjs";
import { createLiveReadinessProbe } from "./helpers/live-readiness-probe.mjs";
import { createStagingChatProbe, installStagingChatBrowserGuard, trackStagingChatPeer } from "./helpers/staging-chat-probe.mjs";
import { test } from "./helpers/live-browser-readonly.mjs";
import { expect, test as stagingChatTest } from "@playwright/test";
import { openScoutingDatabaseTab, startScoutingDatabaseLoad } from "./helpers/scouting-database-readiness.mjs";

const primaryLiveCredentials = {
  username: String(process.env.LIVE_QA_USERNAME || "").trim(),
  password: String(process.env.LIVE_QA_PASSWORD || "").trim(),
};
const hasLiveCredentials = Boolean(primaryLiveCredentials.username && primaryLiveCredentials.password);
const expectsAdminCredentials = process.env.LIVE_QA_EXPECT_ADMIN === "1";

// Authenticated production artifacts can contain session data or saved history.
// Worker-scoped options must be declared at file level, not inside describe.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(!hasLiveCredentials, "Set LIVE_QA_USERNAME and LIVE_QA_PASSWORD for production-safe live smoke.");
let readinessTestStartedAt = 0;
let readinessAttempt = 0;
test.beforeEach(() => {
  readinessTestStartedAt = performance.now();
  readinessAttempt = 0;
});


function getLiveBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL || process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz";
}

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
    }

    await page.waitForTimeout(150);
  }
}

async function waitForAuthReady(page) {
  await page.waitForFunction(() => Boolean(window.platformAuthReadyPromise), null, { timeout: 15_000 });
  await page.evaluate(() => window.platformAuthReadyPromise);
}

async function waitForAppReady(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const loadError = document.body.dataset.appLoadError || "";
          if (loadError) {
            return `error: ${loadError}`;
          }
          return window.__footballScienceAppReady ? "ready" : "loading";
        }),
      { timeout: 75_000 }
    )
    .toBe("ready");
}

async function waitForCentralStateReady(page, options = {}) {
  await expect
    .poll(
      async () => {
        const readiness = await page.evaluate(async () => {
          const bridge = window.footballScienceCentralState;
          if (!bridge?.getStatus) {
            return "missing";
          }
          const status = bridge.getStatus() || {};
          if (status.hydrated && !status.hydrating && !status.lastError) {
            return "ready";
          }
          if (!status.hydrating && typeof bridge.hydrate === "function") {
            try {
              await bridge.hydrate({ forceApply: true });
            } catch {}
          }
          const nextStatus = bridge.getStatus?.() || status;
          if (nextStatus.hydrated && !nextStatus.hydrating && !nextStatus.lastError) {
            return "ready";
          }
          const lastError = String(nextStatus.lastError || "").trim() || "none";
          return `hydrated=${Boolean(nextStatus.hydrated)} hydrating=${Boolean(nextStatus.hydrating)} error=${lastError}`;
        });
        options.probe?.readiness(readiness);
        return readiness;
      },
      { timeout: options.timeout ?? 75_000, intervals: [500, 1_000, 2_000, 3_000] }
    )
    .toBe("ready");
}

async function establishServerBackedSession(page, credentials = primaryLiveCredentials) {
  const endpointBase = new URL(getLiveBaseUrl()).origin;
  expect(new URL(page.url()).origin).toBe(endpointBase);
  const loginResponse = await page.request.post(`${endpointBase}/api/client-config`, {
    data: {
      email: credentials.username,
      password: credentials.password,
    },
    timeout: 75_000, maxRedirects: 0,
  });
  const loginPayload = await loginResponse.json().catch(() => ({}));
  expect(
    loginResponse.ok(),
    `API login failed: ${loginResponse.status()} ${loginPayload?.reason || loginPayload?.message || "no reason"}`
  ).toBeTruthy();

  const session = loginPayload?.session || {};
  expect(session.access_token, "API login did not return an access token.").toBeTruthy();
  expect(session.refresh_token, "API login did not return a refresh token.").toBeTruthy();

  const centralResponse = await page.request.get(
    `${endpointBase}/api/app-state?keys=${encodeURIComponent("football-schedule-v1")}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      timeout: 15_000, maxRedirects: 0,
    }
  );
  const centralPayload = await centralResponse.json().catch(() => ({}));
  expect(
    centralResponse.ok(),
    `API app-state auth failed: ${centralResponse.status()} ${centralPayload?.reason || centralPayload?.message || "no reason"}`
  ).toBeTruthy();

  const setSessionStatus = await page.evaluate(async (nextSession) => {
    const client = window.platformAuthStore?.getSupabaseClient?.();
    if (!client?.auth?.setSession) {
      return "missing Supabase client";
    }
    const { error } = await client.auth.setSession({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
    });
    return error?.message || "ok";
  }, session);
  expect(setSessionStatus).toBe("ok");

  await expect
    .poll(() => page.evaluate(async () => String((await window.platformAuthStore?.getAccessToken?.()) || "")), {
      timeout: 15_000,
    })
    .not.toBe("");
}

async function signIn(page, credentials = primaryLiveCredentials) {
  const probe = createLiveReadinessProbe(page, {
    origin: new URL(getLiveBaseUrl()).origin,
    attempt: ++readinessAttempt,
    testStartedAt: readinessTestStartedAt,
    budgetMs: test.info().timeout,
  });
  let passed = false;
  try {
    await probe.step("navigation", () => page.goto(getLiveBaseUrl(), { waitUntil: "domcontentloaded" }));
    await probe.step("auth-ready", () => waitForAuthReady(page));
    await probe.step("app-ready", () => waitForAppReady(page));
    await probe.step("login-ui", async () => {
      if (await page.locator("#loginScreen:visible").count()) {
        await expect(page.locator('#loginForm button[type="submit"]')).toBeEnabled();
        await page.locator("#loginUsername").fill(credentials.username);
        await page.locator("#loginPassword").fill(credentials.password);
        await page.locator('#loginForm button[type="submit"]').click();
      }
      await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("#loginScreen")).toBeHidden();
    });
    try {
      await probe.step("central-initial", () => waitForCentralStateReady(page, { timeout: 15_000, probe }));
    } catch {
      await probe.step("server-session", () => establishServerBackedSession(page, credentials));
      await probe.step("central-retry", () => waitForCentralStateReady(page, { probe }));
    }
    await probe.step("dismiss", () => dismissDashboardModal(page));
    passed = true;
  } finally {
    probe.finish(passed);
  }
}

async function getLiveCurrentUser(page) {
  await expect
    .poll(
      () => page.evaluate(() => String(window.platformAuthStore?.getCurrentUser?.()?.id || "")),
      { timeout: 20_000 }
    )
    .not.toBe("");

  return page.evaluate(() => {
    const user = window.platformAuthStore?.getCurrentUser?.() || {};
    return {
      id: String(user.id || ""),
      email: String(user.email || ""),
      username: String(user.username || ""),
      role: String(user.role || ""),
      clubId: String(user.clubId || ""),
      clubName: String(user.clubName || ""),
      teamId: String(user.teamId || ""),
      teamName: String(user.teamName || ""),
      team: String(user.team || ""),
      name: String(user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || ""),
    };
  });
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    const moreMenu = page.locator(".platform-nav-more").first();
    if ((await moreMenu.count()) > 0) {
      await moreMenu.evaluate((node) => {
        node.open = true;
      });
    }
    const sidebarTrigger = page.locator(`#workspaceList [data-open-workspace="${workspaceId}"]`).first();
    if ((await sidebarTrigger.count()) > 0) {
      await sidebarTrigger.evaluate((button) => button.click());
    } else {
      await page.evaluate((targetWorkspaceId) => {
        window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
      }, workspaceId);
    }
  }
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function getLiveAccessToken(page) {
  await expect
    .poll(() => page.evaluate(async () => String((await window.platformAuthStore?.getAccessToken?.()) || "")), {
      timeout: 20_000,
    })
    .not.toBe("");
  return page.evaluate(async () => String((await window.platformAuthStore?.getAccessToken?.()) || ""));
}

async function requestStagingChat(page, staging, token, query = "threadId=team&threadType=team&limit=80") {
  await staging.identity();
  const response = await page.request.get(`${staging.origin}/api/chat?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-footballscience-chat-active": "active",
    },
    timeout: 45_000, maxRedirects: 0,
  });
  const payload = await response.json().catch(() => ({}));
  expect(
    response.ok(),
    `Staging Chat read failed: ${response.status()}`
  ).toBeTruthy();
  expect(payload.ok, "Staging Chat read did not return ok=true.").toBe(true);
  return payload;
}

async function postStagingChatAction(page, staging, token, data, label) {
  await staging.identity();
  const response = await page.request.post(`${staging.origin}/api/chat`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data,
    timeout: 45_000, maxRedirects: 0,
  });
  const payload = await response.json().catch(() => ({}));
  expect(
    response.ok(),
    `${label} failed: ${response.status()}`
  ).toBeTruthy();
  expect(payload.ok, `${label} did not return ok=true.`).toBe(true);
  return payload;
}

function getLiveChatMessageText(message = {}) {
  return String(message.text ?? message.body ?? message.message ?? "").trim();
}

function findLiveChatThreadById(payload, threadId) {
  return (Array.isArray(payload?.threads) ? payload.threads : []).find((thread) => String(thread?.threadId || thread?.legacyThreadId || "") === threadId) || null;
}

function findLiveChatMessageInPayload(payload, text) {
  return (Array.isArray(payload?.messages) ? payload.messages : []).find((message) => getLiveChatMessageText(message) === text) || null;
}

async function findStagingTeamChatMessage(page, staging, token, text) {
  const payload = await requestStagingChat(page, staging, token);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.find((message) => getLiveChatMessageText(message) === text) || null;
}

async function deleteStagingChatMessage(page, staging, token, messageId) {
  if (!messageId) {
    return false;
  }
  await postStagingChatAction(
    page,
    staging,
    token,
    {
      action: "deleteMessage",
      messageId,
    },
    "Staging Chat message cleanup"
  );
  return true;
}

async function openChatWidget(page) {
  await dismissDashboardModal(page);
  const alreadyOpen = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!alreadyOpen) {
    const toggle = page.locator("[data-dashboard-chat-widget-toggle]").first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await toggle.click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible({ timeout: 20_000 });
}

async function openTeamChat(page) {
  await openChatWidget(page);
  const teamThread = page.locator('[data-dashboard-chat-thread="team"]').first();
  if ((await teamThread.count()) > 0) {
    await teamThread.click();
  }
  await expect(page.locator("[data-dashboard-chat-input]")).toBeVisible({ timeout: 20_000 });
}

async function openLiveChatThread(page, threadId) {
  const threadButton = page.locator(`[data-dashboard-chat-thread="${threadId}"]`).first();
  await expect(threadButton).toBeVisible({ timeout: 45_000 });
  await threadButton.click();
  const activeThread = page.locator(`[data-dashboard-chat-list][data-dashboard-chat-active-thread="${threadId}"]`);
  await expect(activeThread).toBeVisible({ timeout: 20_000 });
  return activeThread;
}

test.describe('authenticated saved-copy history', () => {
  test('production recovery creates separate drafts and preserves work under quota and revoked access', async ({ page }) => {
    test.skip(!expectsAdminCredentials, 'Requires the configured live QA admin account.');
    await signIn(page);
    await verifyRecoveryDraftLive(page);
  });
  test('production storage diagnostics preserve pending work and stop restore under quota pressure', async ({ page }) => {
    test.skip(!expectsAdminCredentials, 'Requires the configured live QA admin account.');
    await signIn(page);
    await verifyStorageGrowthLive(page);
  });
  test('production history reads both formats and revokes access during export', async ({ page }) => {
    test.skip(!expectsAdminCredentials, 'Requires the configured live QA admin account.');
    await signIn(page);
    await verifyAuthenticatedHistory(page);
  });
});

test("production admin account can open Access & Users", async ({ page }) => {
  test.skip(!expectsAdminCredentials, "This live smoke account is not expected to have admin access.");

  await signIn(page);

  await expect
    .poll(() => page.evaluate(() => window.platformAuthStore?.getCurrentUser?.()?.role || ""), { timeout: 10_000 })
    .toBe("admin");

  await openWorkspace(page, "admin");
  await expect(page.locator("#adminWorkspace")).toContainText("Access & Users");
  await expect(page.locator("#adminWorkspace")).toContainText("Platform Admin");
});

test("production test account can open the unified Scouting database", async ({ page }) => {
  await signIn(page);

  const endpointBase = new URL("/", page.url()).origin;
  const token = await page.evaluate(() => window.platformAuthStore?.getAccessToken?.() || "");
  expect(token).toBeTruthy();

  const statusResponse = await page.request.get(`${endpointBase}/api/football-science-db?action=status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(statusResponse.ok()).toBeTruthy();
  const statusPayload = await statusResponse.json();
  expect(statusPayload.canRead).toBe(true);

  await openWorkspace(page, "scouting");
  await openScoutingDatabaseTab(page);

  await expect(page.locator("[data-scouting-load-fsdb]")).toHaveCount(0);
  await startScoutingDatabaseLoad(page, { startTimeout: 15_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
          const text = workspace?.innerText || "";
          const playerRows = workspace?.querySelectorAll("[data-open-scouting-record]").length || 0;
          if (/must be signed in|needs sign-in|requires an authenticated session/i.test(text)) {
            return "auth-error";
          }
          if (/Scouting database failed/i.test(text)) {
            return "terminal-error";
          }
          if (
            playerRows > 0 ||
            /players match/i.test(text) ||
            /No players found this page/i.test(text)
          ) {
            return "ready";
          }
          return "loading";
        }),
      { timeout: 45_000 }
    )
    .toMatch(/^(ready|terminal-error)$/);
});

test("production Chat is reachable for authenticated QA without product writes", async ({ page }) => {
  const origin = "https://footballscience.xyz";
  test.skip(new URL(getLiveBaseUrl()).href !== `${origin}/`, "Production-only Chat read boundary.");

  // Active Chat GETs can bootstrap a scope. Only the inactive read boundary is
  // forwarded by this probe; opening the widget must never send a message or receipt.
  await page.route(url => url.origin === origin && url.pathname === "/api/chat", route => route.abort("blockedbyclient"));
  const endpoint = `${origin}/api/chat`;
  const anonymous = await page.request.get(endpoint, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(401);

  await signIn(page);
  const token = await getLiveAccessToken(page);
  const inactive = await page.request.get(endpoint, {
    headers: { Authorization: `Bearer ${token}` }, maxRedirects: 0,
  });
  expect(inactive.status()).toBe(429);
  const payload = await inactive.json();
  expect({ code: payload.code, retryable: payload.retryable }).toEqual({ code: "chat_read_inactive", retryable: true });
  await openChatWidget(page);
});

async function requireStagingChat() {
  const staging = await createStagingChatProbe({ browserOrigin: getLiveBaseUrl() });
  if (primaryLiveCredentials.username !== staging.username.trim() || primaryLiveCredentials.password !== staging.password.trim()) {
    throw new Error("Chat fixture login differs from the verified staging QA account");
  }
  return staging;
}

stagingChatTest("staging test account can send, reload, and clean up a chat message", async ({ page }) => {
  test.skip(!process.env.CHAT_QA_EXPECTED_BUILD, "Chat write probe requires a verified isolated staging build.");
  const staging = await requireStagingChat();
  const messageText = `QA Staging Chat ${crypto.randomUUID()}`;
  let token = "";
  let messageId = "";
  let attemptedSend = false;

  await installStagingChatBrowserGuard(page.context(), staging);
  await signIn(page);
  const author = await getLiveCurrentUser(page);
  token = await getLiveAccessToken(page);

  try {
    await openTeamChat(page);
    const initialPayload = await requestStagingChat(page, staging, token);
    expect(Array.isArray(initialPayload.messages), "Staging Chat response must include messages.").toBe(true);
    expect(findLiveChatMessageInPayload(initialPayload, messageText)).toBeNull();

    await staging.identity();
    await page.locator("[data-dashboard-chat-input]").fill(messageText);
    attemptedSend = true;
    await page.locator("[data-dashboard-chat-form] button[type='submit']").click();
    await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
    await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });

    await expect
      .poll(
        async () => {
          const message = await findStagingTeamChatMessage(page, staging, token, messageText);
          if (message) expect(String(message.authorId || message.author_id || "")).toBe(author.id);
          messageId = String(message?.id || message?.messageId || "");
          return Boolean(messageId);
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await signIn(page);
    expect((await getLiveCurrentUser(page)).id).toBe(author.id);
    token = await getLiveAccessToken(page);
    await openTeamChat(page);
    await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });

    await deleteStagingChatMessage(page, staging, token, messageId);
    await expect
      .poll(
        async () => {
          const message = await findStagingTeamChatMessage(page, staging, token, messageText);
          return Boolean(message);
        },
        { timeout: 30_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(false);
    messageId = "";
    attemptedSend = false;
  } finally {
    if (attemptedSend) {
      const message = await findStagingTeamChatMessage(page, staging, token, messageText);
      if (message) {
        expect(String(message.authorId || message.author_id || "")).toBe(author.id);
        await deleteStagingChatMessage(page, staging, token, String(message.id || message.messageId || ""));
      }
    }
  }
});

const stagingChatWithPeer = stagingChatTest.extend({
  provisionPeer: [async ({}, use) => {
    const peers = [];
    try {
      await use(async (options) => {
        const peer = await trackStagingChatPeer(options);
        peers.push(peer);
        return peer.create();
      });
    } finally {
      const cleanup = await Promise.allSettled(peers.map(peer => peer.cleanup()));
      const errors = cleanup.filter(result => result.status === "rejected").map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, "Temporary staging Chat account cleanup failed.");
    }
  }, { timeout: 90_000 }],
});

stagingChatWithPeer("staging peer accounts prove DM unread state and read receipt end-to-end", async ({ browser, page: adminPage, provisionPeer }) => {
  test.skip(!process.env.CHAT_QA_EXPECTED_BUILD, "Chat write probe requires a verified isolated staging build.");
  test.setTimeout(180_000);
  const staging = await requireStagingChat();
  const messageText = `QA Staging DM ${crypto.randomUUID()}`;
  let primaryToken = "";
  let attemptedCreate = false;
  let attemptedSend = false;

  await installStagingChatBrowserGuard(adminPage.context(), staging);
  await signIn(adminPage);
  const provisionOptions = {
    staging, token: await getLiveAccessToken(adminPage), primaryUser: await getLiveCurrentUser(adminPage),
  };
  // The admin can have an existing first Chat membership that differs from
  // its account profile. Fresh peers both bootstrap from the same fixture scope.
  const primaryAccount = await provisionPeer(provisionOptions);
  const peerAccount = await provisionPeer(provisionOptions);
  expect(primaryAccount.id).not.toBe(peerAccount.id);
  const threadId = `dm:${[primaryAccount.id, peerAccount.id].sort().join(":")}`;
  const threadQuery = `threadId=${encodeURIComponent(threadId)}&threadType=dm&limit=80`;
  const contextOptions = { baseURL: staging.origin, serviceWorkers: "block", storageState: { cookies: [], origins: [] } };
  const primaryContext = await browser.newContext(contextOptions);
  const peerContext = await browser.newContext(contextOptions);
  const page = await primaryContext.newPage();

  try {
    await installStagingChatBrowserGuard(primaryContext, staging);
    await signIn(page, primaryAccount.credentials);
    primaryToken = await getLiveAccessToken(page);
    const primaryUser = await getLiveCurrentUser(page);
    expect(primaryUser.id, "Sender sign-in must resolve to the fixture account.").toBe(primaryAccount.id);

    await installStagingChatBrowserGuard(peerContext, staging);
    const peerPage = await peerContext.newPage();
    await signIn(peerPage, peerAccount.credentials);
    const peerToken = await getLiveAccessToken(peerPage);
    const peerUser = await getLiveCurrentUser(peerPage);

    expect(peerUser.id, "Peer sign-in must resolve to the fixture account.").toBe(peerAccount.id);
    const senderInbox = await requestStagingChat(page, staging, primaryToken, "limit=80");
    const peerInbox = await requestStagingChat(peerPage, staging, peerToken, "limit=80");
    const scopeOf = inbox => [inbox.scope?.organizationId, inbox.scope?.teamId];
    expect(scopeOf(senderInbox).every(Boolean), "Chat must confirm the sender's organization and team.").toBe(true);
    expect(scopeOf(peerInbox).every(Boolean), "Chat must confirm the receiver's organization and team.").toBe(true);
    expect(JSON.stringify(scopeOf(peerInbox)) === JSON.stringify(scopeOf(senderInbox)),
      "Both temporary staging accounts must share the same Chat scope before creating a DM.").toBe(true);
    expect(findLiveChatThreadById(senderInbox, threadId)).toBeNull();
    expect(findLiveChatThreadById(peerInbox, threadId)).toBeNull();

    attemptedCreate = true;
    const createPayload = await postStagingChatAction(
      page,
      staging,
      primaryToken,
      {
        action: "createThread",
        threadId,
        type: "dm",
        title: "Direct message",
        visibility: "private",
        participantIds: [primaryUser.id, peerUser.id],
      },
      "Create staging peer DM"
    );
    expect(String(createPayload?.thread?.threadId || createPayload?.thread?.legacyThreadId || createPayload?.thread?.metadata?.legacyThreadId || ""),
      "Staging DM must use the fixture pair's exact logical thread.").toBe(threadId);

    attemptedSend = true;
    const sendPayload = await postStagingChatAction(
      page,
      staging,
      primaryToken,
      {
        action: "sendMessage",
        threadId,
        threadType: "dm",
        text: messageText,
        clientMessageId: `qa-staging-dm-${crypto.randomUUID()}`,
      },
      "Send staging peer DM"
    );
    expect(String(sendPayload?.message?.id || sendPayload?.message?.messageId || ""), "Staging DM send did not return a message id.").toBeTruthy();

    await expect
      .poll(
        async () => {
          const peerInbox = await requestStagingChat(peerPage, staging, peerToken, "limit=80");
          const peerThread = findLiveChatThreadById(peerInbox, threadId);
          return {
            hasThread: Boolean(peerThread),
            unreadCount: Number(peerThread?.unreadCount || 0) || 0,
            preview: String(peerThread?.lastMessagePreview || peerThread?.lastMessage?.text || ""),
          };
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toEqual({ hasThread: true, unreadCount: 1, preview: messageText });

    await peerPage.reload({ waitUntil: "domcontentloaded" });
    await signIn(peerPage, peerAccount.credentials);
    expect((await getLiveCurrentUser(peerPage)).id).toBe(peerAccount.id);
    await openTeamChat(peerPage);
    const peerThreadButton = peerPage.locator(`[data-dashboard-chat-thread="${threadId}"]`).first();
    await expect(peerThreadButton).toBeVisible({ timeout: 45_000 });
    await expect(peerThreadButton.locator(".dashboard-chat-thread-unread")).toContainText("1", { timeout: 15_000 });
    const peerActiveThread = await openLiveChatThread(peerPage, threadId);
    await expect(peerActiveThread).toContainText(messageText, { timeout: 45_000 });

    await expect
      .poll(
        async () => {
          const primaryThreadPayload = await requestStagingChat(page, staging, primaryToken, threadQuery);
          const message = findLiveChatMessageInPayload(primaryThreadPayload, messageText);
          return Array.isArray(message?.readBy) && message.readBy.includes(peerUser.id);
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await signIn(page, primaryAccount.credentials);
    expect((await getLiveCurrentUser(page)).id).toBe(primaryAccount.id);
    primaryToken = await getLiveAccessToken(page);
    await openTeamChat(page);
    const primaryActiveThread = await openLiveChatThread(page, threadId);
    await expect(primaryActiveThread).toContainText(messageText, { timeout: 45_000 });
    const readReceiptStatus = page.locator('[data-dashboard-chat-message-delivery-status="read"]').last();
    await expect(readReceiptStatus).toHaveAttribute("title", /Read by 1/, { timeout: 45_000 });
  } finally {
    try {
      if (attemptedCreate) {
        const inbox = await requestStagingChat(page, staging, primaryToken, "limit=80");
        if (findLiveChatThreadById(inbox, threadId)) {
          if (attemptedSend) {
            const thread = await requestStagingChat(page, staging, primaryToken, threadQuery);
            const message = findLiveChatMessageInPayload(thread, messageText);
            if (message) {
              expect(String(message.authorId || message.author_id || "")).toBe(primaryAccount.id);
              await deleteStagingChatMessage(page, staging, primaryToken, String(message.id || message.messageId || ""));
              const cleaned = await requestStagingChat(page, staging, primaryToken, threadQuery);
              expect(findLiveChatMessageInPayload(cleaned, messageText)).toBeNull();
            }
          }
          await postStagingChatAction(page, staging, primaryToken, {
            action: "setThreadUserState", operation: "delete", threadType: "dm", threadId,
          }, "Hide the fixture DM for the synthetic sender");
        }
      }
    } finally {
      await Promise.all([primaryContext.close(), peerContext.close()]);
    }
  }
});

test.describe("authenticated Schedule", () => {
  test.use({ serviceWorkers: "block" });

  test("production test account can open Schedule", async ({ page }) => {
    await page.context().route(
      url => url.pathname === "/api/app-state",
      route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
        ? route.continue()
        : route.abort("blockedbyclient"),
    );

    await signIn(page);
    await openWorkspace(page, "schedule");
    await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
    await expect(page.locator("#schedulePlannerGrid .schedule-planner-day").first()).toBeVisible();
  });
});
