import crypto from "node:crypto";
import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const primaryLiveCredentials = {
  username: String(process.env.LIVE_QA_USERNAME || "").trim(),
  password: String(process.env.LIVE_QA_PASSWORD || "").trim(),
};
const peerLiveCredentials = {
  username: String(process.env.LIVE_QA_PEER_USERNAME || "").trim(),
  password: String(process.env.LIVE_QA_PEER_PASSWORD || "").trim(),
};
const hasLiveCredentials = Boolean(primaryLiveCredentials.username && primaryLiveCredentials.password);
const hasPeerLiveCredentials = Boolean(peerLiveCredentials.username && peerLiveCredentials.password);
const expectsAdminCredentials = process.env.LIVE_QA_EXPECT_ADMIN === "1";
const dynamicPeerEmail = String(process.env.LIVE_QA_DYNAMIC_PEER_EMAIL || "live-chat-peer@footballscience.qa").trim().toLowerCase();
const dynamicPeerUsername = String(process.env.LIVE_QA_DYNAMIC_PEER_USERNAME || "live.chat.peer").trim().toLowerCase();
const canCreateDynamicPeerLiveAccount = expectsAdminCredentials;

test.skip(!hasLiveCredentials, "Set LIVE_QA_USERNAME and LIVE_QA_PASSWORD for production-safe live smoke.");

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
      async () =>
        page.evaluate(async () => {
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
        }),
      { timeout: options.timeout ?? 75_000, intervals: [500, 1_000, 2_000, 3_000] }
    )
    .toBe("ready");
}

async function establishServerBackedSession(page, credentials = primaryLiveCredentials) {
  const endpointBase = new URL("/", page.url()).origin;
  const loginResponse = await page.request.post(`${endpointBase}/api/client-config`, {
    data: {
      email: credentials.username,
      password: credentials.password,
    },
    timeout: 75_000,
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
      timeout: 15_000,
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
  await page.goto(getLiveBaseUrl(), { waitUntil: "domcontentloaded" });
  await waitForAuthReady(page);
  await waitForAppReady(page);
  if (await page.locator("#loginScreen:visible").count()) {
    await expect(page.locator('#loginForm button[type="submit"]')).toBeEnabled();
    await page.locator("#loginUsername").fill(credentials.username);
    await page.locator("#loginPassword").fill(credentials.password);
    await page.locator('#loginForm button[type="submit"]').click();
  }

  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#loginScreen")).toBeHidden();
  try {
    await waitForCentralStateReady(page, { timeout: 15_000 });
  } catch {
    await establishServerBackedSession(page, credentials);
    await waitForCentralStateReady(page);
  }
  await dismissDashboardModal(page);
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

async function requestLiveChat(page, token, query = "threadId=team&threadType=team&limit=80") {
  const endpointBase = new URL("/", page.url()).origin;
  const response = await page.request.get(`${endpointBase}/api/chat?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-footballscience-chat-active": "active",
    },
    timeout: 45_000,
  });
  const payload = await response.json().catch(() => ({}));
  expect(
    response.ok(),
    `Live chat read failed: ${response.status()} ${payload?.reason || payload?.message || "no reason"}`
  ).toBeTruthy();
  expect(payload.ok, "Live chat read did not return ok=true.").toBe(true);
  return payload;
}

async function postLiveChatAction(page, token, data, label) {
  const endpointBase = new URL("/", page.url()).origin;
  const response = await page.request.post(`${endpointBase}/api/chat`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data,
    timeout: 45_000,
  });
  const payload = await response.json().catch(() => ({}));
  expect(
    response.ok(),
    `${label} failed: ${response.status()} ${payload?.reason || payload?.message || "no reason"}`
  ).toBeTruthy();
  expect(payload.ok, `${label} did not return ok=true.`).toBe(true);
  return payload;
}

function generateLiveQaPassword() {
  return `LiveQa-${crypto.randomBytes(12).toString("base64url")}!7`;
}

async function requestLiveAdminUsers(page, token, options = {}) {
  const endpointBase = new URL("/", page.url()).origin;
  const method = String(options.method || "GET").toUpperCase();
  const requestOptions = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 45_000,
  };
  if (options.data) {
    requestOptions.data = options.data;
  }

  const url = `${endpointBase}/api/admin-users${options.query || ""}`;
  const response =
    method === "POST"
      ? await page.request.post(url, requestOptions)
      : method === "PUT"
        ? await page.request.put(url, requestOptions)
        : method === "DELETE"
          ? await page.request.delete(url, requestOptions)
          : await page.request.get(url, requestOptions);
  const payload = await response.json().catch(() => ({}));
  expect(
    response.ok(),
    `Live admin users ${method} failed: ${response.status()} ${payload?.reason || payload?.message || "no reason"}`
  ).toBeTruthy();
  expect(payload.ok, `Live admin users ${method} did not return ok=true.`).toBe(true);
  return payload;
}

async function ensureLivePeerCredentials(page, token, primaryUser = {}) {
  if (hasPeerLiveCredentials) {
    return {
      credentials: peerLiveCredentials,
      source: "secrets",
      user: null,
    };
  }

  expect(canCreateDynamicPeerLiveAccount, "Dynamic peer live QA needs LIVE_QA_EXPECT_ADMIN=1.").toBe(true);

  const usersPayload = await requestLiveAdminUsers(page, token);
  const users = Array.isArray(usersPayload.users) ? usersPayload.users : [];
  const existingPeer = users.find((user) => {
    const email = String(user?.email || "").trim().toLowerCase();
    const username = String(user?.username || "").trim().toLowerCase();
    return email === dynamicPeerEmail || username === dynamicPeerUsername;
  });
  const password = generateLiveQaPassword();
  const teamName = primaryUser.teamName || primaryUser.team || "North Carolina Courage";
  const peerPayload = {
    email: dynamicPeerEmail,
    password,
    username: dynamicPeerUsername,
    firstName: "Live",
    lastName: "Chat QA",
    role: "coach",
    title: "QA Peer",
    department: "Football",
    status: "active",
    clubId: primaryUser.clubId || "club-ncc",
    clubName: primaryUser.clubName || "North Carolina Courage",
    teamId: primaryUser.teamId || "team-ncc-first",
    teamName,
    team: teamName,
  };
  const payload = existingPeer?.id
    ? await requestLiveAdminUsers(page, token, {
        method: "PUT",
        query: `?userId=${encodeURIComponent(existingPeer.id)}`,
        data: peerPayload,
      })
    : await requestLiveAdminUsers(page, token, {
        method: "POST",
        data: peerPayload,
      });
  const user = payload.user || existingPeer || {};

  return {
    credentials: {
      username: String(user.email || dynamicPeerEmail),
      password,
    },
    source: existingPeer?.id ? "dynamic-existing" : "dynamic-created",
    user,
  };
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

async function findLiveChatMessageByText(page, token, text) {
  const payload = await requestLiveChat(page, token);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.find((message) => getLiveChatMessageText(message) === text) || null;
}

async function deleteLiveChatMessage(page, token, messageId) {
  if (!messageId) {
    return false;
  }
  await postLiveChatAction(
    page,
    token,
    {
      action: "deleteMessage",
      messageId,
    },
    "Live chat cleanup"
  );
  return true;
}

async function openTeamChat(page) {
  await dismissDashboardModal(page);
  const alreadyOpen = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!alreadyOpen) {
    const toggle = page.locator("[data-dashboard-chat-widget-toggle]").first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await toggle.click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible({ timeout: 20_000 });
  const teamThread = page.locator('[data-dashboard-chat-thread="team"]').first();
  if ((await teamThread.count()) > 0) {
    await teamThread.click();
  }
  await expect(page.locator("[data-dashboard-chat-input]")).toBeVisible({ timeout: 20_000 });
}

async function expectStorageContains(page, key, text) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ storageKey, expectedText }) => window.localStorage.getItem(storageKey)?.includes(expectedText) ?? false,
          { storageKey: key, expectedText: text }
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
}

async function expectCentralSyncContains(page, key, text) {
  const endpointBase = new URL("/", page.url()).origin;
  const token = await getLiveAccessToken(page);

  await expect
    .poll(
      async () => {
        const localValue = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey) || "", key);
        if (!localValue.includes(text)) {
          return false;
        }
        const centralResponse = await page.request.get(
          `${endpointBase}/api/app-state?fresh=1&keys=${encodeURIComponent(key)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "x-footballscience-fresh-state": "1",
            },
            timeout: 75_000,
          }
        );
        const centralPayload = centralResponse.ok() ? await centralResponse.json() : {};
        return String(centralPayload?.entries?.[key] || "").includes(text);
      },
      { timeout: 45_000, intervals: [500, 1_000, 2_000, 3_000] }
    )
    .toBe(true);
}

async function removeScheduleEventIfPresent(page, title) {
  await openWorkspace(page, "schedule");
  const eventChip = page.locator(".schedule-planner-event-chip").filter({ hasText: title }).first();
  if ((await eventChip.count()) === 0 || !(await eventChip.isVisible())) {
    return;
  }
  await eventChip.click();
  await page.keyboard.press("Delete");
  await expect(page.locator("#schedulePlannerGrid")).not.toContainText(title);
}

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
  const databaseTab = page.locator('.scouting-tab[data-scouting-tab="database"]').first();
  await expect(databaseTab).toBeVisible({ timeout: 15_000 });
  await databaseTab.click();

  await expect(page.locator("[data-scouting-load-fsdb]")).toHaveCount(0);
  const loadButton = page.locator("[data-scouting-load-database], [data-scouting-retry-database]").first();
  await expect(loadButton).toBeVisible({ timeout: 15_000 });
  await loadButton.click();

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

test("production test account can send, reload, and clean up a chat message", async ({ page }) => {
  const messageText = `QA Live Chat ${Date.now()}`;
  let token = "";
  let messageId = "";

  await signIn(page);
  token = await getLiveAccessToken(page);

  try {
    await openTeamChat(page);
    const initialPayload = await requestLiveChat(page, token);
    expect(Array.isArray(initialPayload.messages), "Live chat response must include messages.").toBe(true);

    await page.locator("[data-dashboard-chat-input]").fill(messageText);
    await page.locator("[data-dashboard-chat-form] button[type='submit']").click();
    await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
    await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });

    await expect
      .poll(
        async () => {
          const message = await findLiveChatMessageByText(page, token, messageText);
          messageId = String(message?.id || message?.messageId || "");
          return Boolean(messageId);
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await signIn(page);
    token = await getLiveAccessToken(page);
    await openTeamChat(page);
    await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });

    await deleteLiveChatMessage(page, token, messageId);
    await expect
      .poll(
        async () => {
          const message = await findLiveChatMessageByText(page, token, messageText);
          return Boolean(message);
        },
        { timeout: 30_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(false);
    messageId = "";
  } finally {
    if (!messageId && token) {
      const message = await findLiveChatMessageByText(page, token, messageText).catch(() => null);
      messageId = String(message?.id || message?.messageId || "");
    }
    if (messageId && token) {
      await deleteLiveChatMessage(page, token, messageId).catch(() => {});
    }
  }
});

test("production peer accounts prove DM unread state and read receipt end-to-end", async ({ browser, page }) => {
  test.skip(
    !hasPeerLiveCredentials && !canCreateDynamicPeerLiveAccount,
    "Set LIVE_QA_PEER_USERNAME/LIVE_QA_PEER_PASSWORD or run with LIVE_QA_EXPECT_ADMIN=1 for dynamic peer live smoke."
  );

  const messageText = `QA Live DM ${Date.now()}`;
  let primaryToken = "";
  let messageId = "";
  let threadId = "";
  let peerContext = null;

  await signIn(page);
  primaryToken = await getLiveAccessToken(page);
  const primaryUser = await getLiveCurrentUser(page);
  const peerAccount = await ensureLivePeerCredentials(page, primaryToken, primaryUser);

  peerContext = await browser.newContext({
    baseURL: getLiveBaseUrl(),
    storageState: { cookies: [], origins: [] },
  });
  const peerPage = await peerContext.newPage();
  await signIn(peerPage, peerAccount.credentials);
  const peerToken = await getLiveAccessToken(peerPage);
  const peerUser = await getLiveCurrentUser(peerPage);

  expect(peerUser.id, "Peer account must be a different live user.").not.toBe(primaryUser.id);

  try {
    const createPayload = await postLiveChatAction(
      page,
      primaryToken,
      {
        action: "createThread",
        threadId: `dm:${primaryUser.id}:${peerUser.id}`,
        type: "dm",
        title: "Direct message",
        visibility: "private",
        participantIds: [primaryUser.id, peerUser.id],
      },
      "Create peer live DM"
    );
    threadId = String(createPayload?.thread?.threadId || createPayload?.thread?.legacyThreadId || createPayload?.thread?.metadata?.legacyThreadId || "");
    expect(threadId, "Live DM create did not return a logical threadId.").toBeTruthy();

    const sendPayload = await postLiveChatAction(
      page,
      primaryToken,
      {
        action: "sendMessage",
        threadId,
        threadType: "dm",
        text: messageText,
        clientMessageId: `live-dm-${Date.now()}`,
      },
      "Send peer live DM"
    );
    messageId = String(sendPayload?.message?.id || sendPayload?.message?.messageId || "");
    expect(messageId, "Live DM send did not return a message id.").toBeTruthy();

    await expect
      .poll(
        async () => {
          const peerInbox = await requestLiveChat(peerPage, peerToken, "limit=80");
          const peerThread = findLiveChatThreadById(peerInbox, threadId);
          return {
            hasThread: Boolean(peerThread),
            unreadCount: Number(peerThread?.unreadCount || 0) || 0,
            preview: String(peerThread?.lastMessagePreview || peerThread?.lastMessage?.text || ""),
          };
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toMatchObject({ hasThread: true, unreadCount: 1 });

    await peerPage.reload({ waitUntil: "domcontentloaded" });
    await signIn(peerPage, peerAccount.credentials);
    await openTeamChat(peerPage);
    const peerThreadButton = peerPage.locator(`[data-dashboard-chat-thread="${threadId}"]`).first();
    await expect(peerThreadButton).toBeVisible({ timeout: 45_000 });
    await expect(peerThreadButton.locator(".dashboard-chat-thread-unread")).toContainText("1", { timeout: 15_000 });
    await peerThreadButton.click();
    await expect(peerPage.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });

    await expect
      .poll(
        async () => {
          const primaryThreadPayload = await requestLiveChat(page, primaryToken, `threadId=${encodeURIComponent(threadId)}&threadType=dm&limit=80`);
          const message = findLiveChatMessageInPayload(primaryThreadPayload, messageText);
          return Array.isArray(message?.readBy) && message.readBy.includes(peerUser.id);
        },
        { timeout: 45_000, intervals: [750, 1_500, 3_000] }
      )
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await signIn(page);
    primaryToken = await getLiveAccessToken(page);
    await openTeamChat(page);
    const primaryThreadButton = page.locator(`[data-dashboard-chat-thread="${threadId}"]`).first();
    await expect(primaryThreadButton).toBeVisible({ timeout: 45_000 });
    await primaryThreadButton.click();
    await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText, { timeout: 45_000 });
    const readReceiptStatus = page.locator('[data-dashboard-chat-message-delivery-status="read"]').last();
    await expect(readReceiptStatus).toHaveAttribute("title", /Read by 1/, { timeout: 45_000 });

    await deleteLiveChatMessage(page, primaryToken, messageId);
    messageId = "";
  } finally {
    if (messageId && primaryToken) {
      await deleteLiveChatMessage(page, primaryToken, messageId).catch(() => {});
    }
    await peerContext?.close().catch(() => {});
  }
});

test("production test account can save and reload a schedule record", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    await dialog.dismiss().catch(() => {});
  });

  const title = `QA Live ${Date.now()}`;

  await signIn(page);

  try {
    await openWorkspace(page, "schedule");
    await page.locator("#scheduleTodayButton").click();
    const targetDay = page.locator(".schedule-planner-day:not(.has-events)").first();
    const targetDate = await targetDay.getAttribute("data-schedule-date");
    expect(targetDate).toBeTruthy();
    await targetDay.dblclick();
    const addInput = page.locator(`[data-schedule-planner-add-date="${targetDate}"] [name="plannerTitle"]`);
    await expect(addInput).toBeFocused();
    await addInput.fill(title);
    await addInput.press("Enter");
    await expect(page.locator(`.schedule-planner-day[data-schedule-date="${targetDate}"]`)).toContainText(title);
    await expectStorageContains(page, scheduleKey, title);
    await expectCentralSyncContains(page, scheduleKey, title);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#hubShell")).toBeVisible();
    await openWorkspace(page, "schedule");
    await expect(page.locator(`.schedule-planner-day[data-schedule-date="${targetDate}"]`)).toContainText(title);
    await expectStorageContains(page, scheduleKey, title);
  } finally {
    await removeScheduleEventIfPresent(page, title).catch(() => {});
  }
});
