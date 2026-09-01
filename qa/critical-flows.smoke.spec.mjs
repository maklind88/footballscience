import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const sessionPlannerLibraryKey = "football-session-exercise-library-v1";
const medicalKey = "football-medical-team-v1";
const playerProfilesKey = "football-player-profiles-v1";
const presentationKey = "football-dashboard-presentation-mode-v1";
const workspaceHubKey = "football-workspace-hub-v3";
const workspaceLastActiveKey = "football-workspace-last-active-local-v1";
const qaSessionPlannerTrainingDate = "2026-05-19";
const qaChatCurrentUserId = "dev-user-mak";
const qaChatTeamThreadId = "team";

function createQaPlayerProfilesState(players = [], options = {}) {
  const normalizedPlayers = players.map((player, index) => ({
    rosterType: "squad",
    countsInSquad: true,
    rosterOrder: index + 1,
    ...player,
  }));
  return {
    rosterVersion: options.rosterVersion || "qa-player-profiles-v1",
    schemaVersion: 3,
    selectedPlayerId: options.selectedPlayerId || normalizedPlayers[0]?.id || "",
    players: normalizedPlayers,
    removedPlayerIds: [],
  };
}

function getQaAgeFromBirthDate(birthDate, referenceDate = new Date()) {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < day)) {
    age -= 1;
  }
  return String(age);
}

function createQaSessionPlannerState(dateValue = qaSessionPlannerTrainingDate) {
  return {
    selectedDate: dateValue,
    sessions: {
      [dateValue]: {
        id: `session-${dateValue}`,
        date: dateValue,
        title: "QA Training",
        theme: "QA seeded session",
        selectedBlockId: "qa-block-1",
        blocks: [
          {
            id: "qa-block-1",
            label: "Block 1",
            title: "QA Exercise",
            focus: "QA",
            phase: "In Possession",
            subPhase: "Build Up",
            minutes: 15,
            time: "",
            intensity: 3,
            pitchSize: "SSG",
            material: "",
            objective: "",
            why: "",
            organization: "",
            principles: "",
            diagram: "half-pitch",
            tacticalElements: [],
            playerBoardPositions: {},
            playerBoardColors: {},
          },
        ],
      },
    },
  };
}

async function seedQaSessionPlannerTrainingSession(page, dateValue = qaSessionPlannerTrainingDate) {
  await page.addInitScript(
    ({ storageKey, state }) => {
      if (!window.localStorage.getItem(storageKey)) {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      }
    },
    { storageKey: sessionPlannerKey, state: createQaSessionPlannerState(dateValue) }
  );
}

async function dismissDashboardModal(page) {
  const wasOpen = await page
    .evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      if (!modalRoot || modalRoot.hidden) return false;
      const closeButton = modalRoot.querySelector(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
      );
      closeButton?.click();
      return true;
    })
    .catch(() => false);

  if (!wasOpen) return;

  await expect
    .poll(
      () =>
        page
          .locator("#dashboardModalRoot")
          .evaluate((node) => node.hidden)
          .catch(() => true),
      { timeout: 5_000 }
    )
    .toBe(true);
}

async function confirmPlatformDialog(page, expectedTitle = "") {
  const dialog = page.locator(".platform-confirm-dialog");
  await expect(dialog).toBeVisible();
  if (expectedTitle) {
    await expect(dialog.locator("h2")).toHaveText(expectedTitle);
  }
  await dialog.locator("[data-platform-confirm-ok]").click();
  await expect(dialog).toHaveCount(0);
}

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => {
      const shell = document.getElementById("hubShell");
      const loginScreen = document.getElementById("loginScreen");
      return Boolean(
        window.__footballScienceAppReady &&
          document.body?.dataset.appReady === "true" &&
          shell &&
          !shell.hidden &&
          loginScreen &&
          loginScreen.hidden &&
          !document.body.classList.contains("is-booting")
      );
    },
    null,
    { timeout: 20_000 }
  );
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
}

async function bootApp(page, options = {}) {
  const clientConfigRequests = [];
  const pageErrors = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/client-config")) {
      clientConfigRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    await dialog.dismiss().catch(() => {});
  });

  await page.goto(options.path || "/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);

  return {
    clientConfigRequests,
    pageErrors,
  };
}

function getQaChatMessageThreadId(message = {}) {
  return String(message.threadId || message.thread_id || qaChatTeamThreadId).trim() || qaChatTeamThreadId;
}

function getQaChatNewestMessage(messages = []) {
  return [...messages].sort((first, second) => {
    const firstTime = Date.parse(first?.createdAt || first?.created_at || "") || 0;
    const secondTime = Date.parse(second?.createdAt || second?.created_at || "") || 0;
    return secondTime - firstTime;
  })[0] || null;
}

function createQaChatThread(threadId = qaChatTeamThreadId, messages = [], options = {}) {
  const normalizedThreadId = String(threadId || qaChatTeamThreadId).trim() || qaChatTeamThreadId;
  const threadMessages = messages.filter((message) => getQaChatMessageThreadId(message) === normalizedThreadId);
  const lastMessage = options.lastMessage || getQaChatNewestMessage(threadMessages);
  const type = options.type || (normalizedThreadId === qaChatTeamThreadId ? "team" : normalizedThreadId.startsWith("dm:") ? "dm" : "group");
  const unreadCount = options.unreadCount ?? threadMessages.filter((message) => {
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    return message.userId !== qaChatCurrentUserId && !readBy.includes(qaChatCurrentUserId);
  }).length;

  return {
    id: options.id || `db-${normalizedThreadId}`,
    threadId: normalizedThreadId,
    legacyThreadId: normalizedThreadId,
    type,
    title: options.title || (type === "team" ? "North Carolina Courage Chat" : type === "dm" ? "Direct message" : "QA Chat"),
    visibility: options.visibility || (type === "dm" ? "private" : "members"),
    messageCount: options.messageCount ?? threadMessages.length,
    unreadCount,
    lastMessage,
    lastMessageId: options.lastMessageId || lastMessage?.id || "",
    lastMessageAt: options.lastMessageAt || lastMessage?.createdAt || "",
    participants: Array.isArray(options.participants) ? options.participants : [],
    permissions: options.permissions || {},
    settings: options.settings || {},
    metadata: { legacyThreadId: normalizedThreadId, ...(options.metadata || {}) },
  };
}

function createQaChatPayload(messages = [], options = {}) {
  const threadIds = options.threadIds || Array.from(new Set(messages.map(getQaChatMessageThreadId)));
  const threads = Array.isArray(options.threads) && options.threads.length
    ? options.threads
    : threadIds.map((threadId) => createQaChatThread(threadId, messages, options.threadOptions?.[threadId] || {}));

  return {
    ok: true,
    scope: {
      organizationId: "qa-org",
      teamId: "qa-team",
      teamName: "North Carolina Courage",
    },
    threads,
    messages,
    pagination: options.pagination || {},
  };
}

async function fulfillQaChatPayload(route, messages = [], options = {}) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(createQaChatPayload(messages, options)),
  });
}

async function installQaChatApiAuth(page) {
  await page.addInitScript((token) => {
    const patchAuthStore = (store) => {
      if (!store || typeof store !== "object") return store;
      store.getAccessToken = async () => token;
      store.refreshAccessToken = async () => token;
      return store;
    };

    const descriptor = Object.getOwnPropertyDescriptor(window, "platformAuthStore");
    if (descriptor?.configurable === false) {
      const timer = window.setInterval(() => {
        if (window.platformAuthStore) {
          patchAuthStore(window.platformAuthStore);
          window.clearInterval(timer);
        }
      }, 0);
      return;
    }

    let currentStore = descriptor?.get ? descriptor.get.call(window) : window.platformAuthStore;
    Object.defineProperty(window, "platformAuthStore", {
      configurable: true,
      enumerable: true,
      get() {
        return currentStore;
      },
      set(value) {
        currentStore = patchAuthStore(value);
      },
    });
    patchAuthStore(currentStore);
  }, "qa-chat-token");
}

async function readQaChatLayoutMetrics(page) {
  return page.evaluate(() => {
    const list = document.querySelector("[data-dashboard-chat-list]");
    const firstMessage = list?.querySelector("[data-dashboard-chat-message-card]");
    const listRect = list?.getBoundingClientRect();
    const firstMessageRect = firstMessage?.getBoundingClientRect();
    return {
      listTop: listRect?.top ?? 0,
      listHeight: listRect?.height ?? 0,
      scrollTop: list?.scrollTop ?? 0,
      scrollHeight: list?.scrollHeight ?? 0,
      clientHeight: list?.clientHeight ?? 0,
      firstMessageTop: firstMessageRect?.top ?? 0,
      syncStatusCount: document.querySelectorAll("[data-dashboard-chat-sync-status]").length,
      statusOverlayCount: document.querySelectorAll("[data-dashboard-chat-status-overlay]").length,
    };
  });
}

async function readQaChatLayoutMetricsWhenAttached(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const list = document.querySelector("[data-dashboard-chat-list]");
    const firstMessage = list?.querySelector("[data-dashboard-chat-message-card]");
    const listRect = list?.getBoundingClientRect();
    const firstMessageRect = firstMessage?.getBoundingClientRect();
    return {
      listTop: listRect?.top ?? 0,
      listHeight: listRect?.height ?? 0,
      scrollTop: list?.scrollTop ?? 0,
      scrollHeight: list?.scrollHeight ?? 0,
      clientHeight: list?.clientHeight ?? 0,
      firstMessageTop: firstMessageRect?.top ?? 0,
      syncStatusCount: element?.matches?.("[data-dashboard-chat-sync-status]") ? 1 : 0,
      statusOverlayCount: element?.closest?.("[data-dashboard-chat-status-overlay]") ? 1 : 0,
    };
  });
}

function expectQaChatLayoutStable(baseline, current, label) {
  const listDelta = Math.abs(current.listTop - baseline.listTop);
  const scrollDelta = Math.abs(current.scrollTop - baseline.scrollTop);
  const firstMessageDelta = Math.abs(current.firstMessageTop - baseline.firstMessageTop);
  expect(listDelta, `${label}: chat list top moved ${listDelta}px`).toBeLessThanOrEqual(1);
  expect(scrollDelta, `${label}: chat scrollTop moved ${scrollDelta}px`).toBeLessThanOrEqual(1);
  expect(firstMessageDelta, `${label}: first message top moved ${firstMessageDelta}px`).toBeLessThanOrEqual(1);
}

async function readQaChatThreadGeometry(page) {
  return page.evaluate(() => {
    const list = document.querySelector("[data-dashboard-chat-thread-list]");
    const items = Array.from(document.querySelectorAll("[data-dashboard-chat-thread]")).slice(0, 6);
    const listRect = list?.getBoundingClientRect();
    return {
      listTop: listRect?.top ?? 0,
      listHeight: listRect?.height ?? 0,
      listScrollTop: list?.scrollTop ?? 0,
      items: items.map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          threadId: item.getAttribute("data-dashboard-chat-thread") || "",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          transform: window.getComputedStyle(item).transform,
        };
      }),
    };
  });
}

function expectQaChatThreadGeometryStable(baseline, current, label) {
  expect(current.items.length, `${label}: thread item count changed`).toBe(baseline.items.length);
  expect(Math.abs(current.listTop - baseline.listTop), `${label}: thread list top moved`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(current.listHeight - baseline.listHeight), `${label}: thread list height moved`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(current.listScrollTop - baseline.listScrollTop), `${label}: thread list scrolled`).toBeLessThanOrEqual(0.5);

  baseline.items.forEach((baseItem, index) => {
    const currentItem = current.items[index];
    expect(currentItem.threadId, `${label}: thread ${index} changed identity`).toBe(baseItem.threadId);
    expect(Math.abs(currentItem.top - baseItem.top), `${label}: ${baseItem.threadId} top moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.left - baseItem.left), `${label}: ${baseItem.threadId} left moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.width - baseItem.width), `${label}: ${baseItem.threadId} width moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.height - baseItem.height), `${label}: ${baseItem.threadId} height moved`).toBeLessThanOrEqual(0.5);
    expect(currentItem.transform, `${label}: ${baseItem.threadId} hover transform`).toBe("none");
  });
}

async function readQaChatMessageGeometry(page) {
  return page.evaluate(() => {
    const list = document.querySelector("[data-dashboard-chat-list]");
    const listRect = list?.getBoundingClientRect();
    const allItems = Array.from(list?.querySelectorAll("[data-dashboard-chat-message-card]") || []);
    const items = allItems
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const bubble = item.querySelector(".dashboard-chat-bubble p") || item.querySelector(".dashboard-chat-bubble");
        const bubbleRect = bubble?.getBoundingClientRect();
        return { item, rect, bubbleRect };
      })
      .filter(({ rect }) => !listRect || (rect.top >= listRect.top + 1 && rect.bottom <= listRect.bottom - 1))
      .slice(0, 6)
      .map(({ item, rect, bubbleRect }) => ({
        messageId: item.getAttribute("data-dashboard-chat-message-id") || "",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bubbleWidth: bubbleRect?.width || 0,
        transform: window.getComputedStyle(item).transform,
      }));

    return {
      listTop: listRect?.top ?? 0,
      listWidth: listRect?.width ?? 0,
      listHeight: listRect?.height ?? 0,
      listScrollTop: list?.scrollTop ?? 0,
      items,
    };
  });
}

function expectQaChatMessageGeometryStable(baseline, current, label) {
  expect(current.items.length, `${label}: message item count changed`).toBe(baseline.items.length);
  expect(Math.abs(current.listTop - baseline.listTop), `${label}: chat list top moved`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(current.listHeight - baseline.listHeight), `${label}: chat list height moved`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(current.listScrollTop - baseline.listScrollTop), `${label}: chat list scrolled`).toBeLessThanOrEqual(0.5);

  baseline.items.forEach((baseItem, index) => {
    const currentItem = current.items[index];
    expect(currentItem.messageId, `${label}: message ${index} changed identity`).toBe(baseItem.messageId);
    expect(Math.abs(currentItem.top - baseItem.top), `${label}: ${baseItem.messageId} top moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.left - baseItem.left), `${label}: ${baseItem.messageId} left moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.width - baseItem.width), `${label}: ${baseItem.messageId} width moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.bubbleWidth - baseItem.bubbleWidth), `${label}: ${baseItem.messageId} bubble width moved`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(currentItem.height - baseItem.height), `${label}: ${baseItem.messageId} height moved`).toBeLessThanOrEqual(0.5);
    expect(currentItem.transform, `${label}: ${baseItem.messageId} hover transform`).toBe("none");
  });
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    await page.evaluate((targetWorkspaceId) => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
    }, workspaceId);
  }
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function waitForSessionPlannerWorkspace(page) {
  const activeWorkspace = page.locator('[data-workspace-view="session-planner"].is-active');
  await expect(activeWorkspace).toBeVisible();
  await expect(activeWorkspace.locator("[data-session-field]").first()).toBeVisible();
  await expect(activeWorkspace.locator("[data-session-open-player-board]")).toBeVisible();
  return activeWorkspace;
}

async function expectStorageContains(page, key, text) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ storageKey, expectedText }) => window.localStorage.getItem(storageKey)?.includes(expectedText) ?? false,
          { storageKey: key, expectedText: text }
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
}

test("localhost boots through dev auth and keeps Supabase config off the local path", async ({ page }) => {
  const boot = await bootApp(page);

  expect(boot.clientConfigRequests).toEqual([]);
  expect(boot.pageErrors).toEqual([]);
  await expect(page.locator("#workspaceTitle")).toContainText("Football Science");

  await page.locator("#profileMenuButton").click();
  await expect(page.locator("#dataSafetyStatus")).toBeVisible();
  await expect(page.locator("#dataSafetyStatus")).toContainText(/sync|autosave|saved|cache/i);
  await expect(page.locator("#dataSafetyExportButton")).toBeVisible();
  await expect(page.locator("#dataSafetyImportButton")).toBeVisible();
});

test("Workspace hub ignores stale shared active workspace on boot", async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          activeWorkspaceId: "game-simulator",
          workspaceAccess: {
            home: { view: ["admin", "coach"], edit: ["admin", "coach"] },
            "game-simulator": { view: ["admin", "coach"], edit: ["admin", "coach"] },
          },
        })
      );
    },
    { key: workspaceHubKey }
  );

  await bootApp(page);

  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "home");
  const storedHubState = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), workspaceHubKey));
  expect(storedHubState.activeWorkspaceId).toBeUndefined();
});

test("Refresh keeps the active workspace without flashing the login screen", async ({ page }) => {
  await bootApp(page);
  await openWorkspace(page, "schedule");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), workspaceLastActiveKey), { timeout: 5_000 })
    .toBe("schedule");

  await page.addInitScript(() => {
    window.__qaLoginFlashDuringBoot = false;
    const markLoginVisibility = () => {
      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen && !loginScreen.hidden) {
        window.__qaLoginFlashDuringBoot = true;
      }
    };
    const observer = new MutationObserver(markLoginVisibility);
    const startObserver = () => {
      markLoginVisibility();
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "hidden", "style"],
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    }
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__qaLoginFlashDuringBoot)).toBe(false);
});

test("Browser back returns to the previous platform workspace instead of leaving the app", async ({ page }) => {
  await bootApp(page);

  await openWorkspace(page, "schedule");
  await expect(page).toHaveURL(/workspace=schedule/);

  await openWorkspace(page, "medical-team");
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "medical-team");
  await expect(page).toHaveURL(/workspace=medical-team/);

  await page.goBack();

  await waitForPlatformShell(page);
  await expect(page.locator("body")).toHaveAttribute("data-active-workspace", "schedule");
  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  await expect(page).toHaveURL(/workspace=schedule/);
  await expect(page.locator("#hubShell")).toBeVisible();
});

test("Profile updates sync to the account menu and local dev keeps Mak signed in", async ({ page }) => {
  const stamp = Date.now();
  await bootApp(page);

  await page.locator("#profileMenuButton").click();
  await page.locator('#profileMenu [data-open-workspace="my-profile"]').click();
  await expect(page.locator('[data-workspace-view="profile"].is-active')).toBeVisible();

  await page.locator('#profileForm input[name="firstName"]').fill("QA");
  await page.locator('#profileForm input[name="lastName"]').fill(`Account ${stamp}`);
  await page.locator('#profileForm input[name="title"]').fill("Account Tester");
  await page.locator('#profileForm input[name="department"]').fill("Football Ops");
  await page.locator('#profileForm input[name="team"]').fill(`Central Team ${stamp}`);
  await page.locator('#profileForm button[type="submit"]').click();

  await expect(page.locator("#profileWorkspace")).toContainText("Saved.");
  await expect(page.locator("#profileWorkspace .profile-title")).toContainText(`QA Account ${stamp}`);
  await expect(page.locator("#coachName")).toContainText(`QA Account ${stamp}`);

  await page.locator("#profileMenuButton").click();
  await expect(page.locator("#profileMenuPanelName")).toContainText(`QA Account ${stamp}`);
  await expect(page.locator("#profileMenuPanelClub")).toContainText(`Central Team ${stamp}`);
  await page.locator("#logoutButton").click();
  await waitForPlatformShell(page);
  await expect(page.locator("#coachName")).toContainText("Mak Lind");
});

test("Chat launcher shows unread chat until the thread is opened", async ({ page }) => {
  const messageId = `qa-chat-unread-${Date.now()}`;
  const now = new Date().toISOString();
  const chatActions = [];
  const serverMessages = [
    {
      id: messageId,
      userId: "qa-colleague",
      threadId: "team",
      text: "QA unread chat notification",
      createdAt: now,
      deliveredAt: now,
      readBy: ["qa-colleague"],
      mentionedUserIds: [],
      author: {
        id: "qa-colleague",
        firstName: "QA",
        lastName: "Colleague",
        role: "coach",
        status: "active",
      },
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    const payload = request.postDataJSON();
    chatActions.push(payload);
    if (payload.action === "markThreadRead") {
      serverMessages.forEach((message) => {
        if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
          message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
        }
      });
    }
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);

  await expect(page.locator('#workspaceList > .platform-nav-item[data-open-workspace="set-pieces-room"]')).toBeVisible();
  await expect(page.locator('.platform-nav-more-menu [data-open-workspace="set-pieces-room"]')).toHaveCount(0);
  await expect(page.locator(".dashboard-chat-launcher .dashboard-chat-header-badge")).toContainText("1", { timeout: 8_000 });
  await expect(page.locator('.top-icon-menu-item[data-open-workspace="home"].has-notification')).toHaveCount(0);
  expect(serverMessages[0].readBy.includes(qaChatCurrentUserId)).toBe(false);

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  const railToggle = page.locator(".dashboard-chat-rail-toggle");
  await expect(railToggle).toHaveCount(0);
  await expect
    .poll(() => serverMessages[0].readBy.includes(qaChatCurrentUserId), { timeout: 5_000 })
    .toBe(true);
  expect(chatActions.some((payload) => payload.action === "markThreadRead" && payload.threadId === "team")).toBe(true);
  await expect(page.locator(".dashboard-chat-launcher .dashboard-chat-header-badge")).toHaveCount(0);
  await expect(page.locator('.top-icon-menu-item[data-open-workspace="home"].has-notification')).toHaveCount(0);

  await page.locator(".dashboard-chat-widget-close").click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toHaveCount(0);
  await expect(page.locator(".dashboard-chat-launcher")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  await expect(page.locator(".dashboard-chat-launcher .dashboard-chat-header-badge")).toHaveCount(0);
  await expect(page.locator('.top-icon-menu-item[data-open-workspace="home"].has-notification')).toHaveCount(0);
  expect(serverMessages[0].readBy.includes(qaChatCurrentUserId)).toBe(true);
});

test("Chat launcher mobile stays inside the viewport and opens chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = new Date().toISOString();
  const serverMessages = [
    {
      id: `qa-chat-mobile-launcher-${Date.now()}`,
      userId: "qa-colleague",
      threadId: "team",
      text: "QA mobile launcher unread chat",
      createdAt: now,
      deliveredAt: now,
      readBy: ["qa-colleague"],
      mentionedUserIds: [],
      author: {
        id: "qa-colleague",
        firstName: "QA",
        lastName: "Colleague",
        role: "coach",
        status: "active",
      },
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON();
      if (payload.action === "markThreadRead") {
        serverMessages.forEach((message) => {
          if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
            message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
          }
        });
      }
    }
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  const launcher = page.locator("[data-dashboard-chat-widget-toggle]").first();
  await expect(launcher).toBeVisible();
  const launcherRect = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(launcherRect.width).toBeGreaterThan(0);
  expect(launcherRect.height).toBeGreaterThan(0);
  expect(launcherRect.left).toBeGreaterThanOrEqual(0);
  expect(launcherRect.top).toBeGreaterThanOrEqual(0);
  expect(launcherRect.right).toBeLessThanOrEqual(launcherRect.viewportWidth);
  expect(launcherRect.bottom).toBeLessThanOrEqual(launcherRect.viewportHeight);

  await launcher.click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText("QA mobile launcher unread chat");
});

test("Chat launcher moves without opening and hides during immersive work", async ({ page }) => {
  await bootApp(page);
  const launcher = page.locator(".dashboard-chat-launcher");
  await expect(launcher).toBeVisible();

  const initialBox = await launcher.boundingBox();
  expect(initialBox).not.toBeNull();
  const targetX = Math.max(90, initialBox.x - 180);
  const targetY = Math.max(90, initialBox.y - 120);
  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".dashboard-chat-widget.is-open")).toHaveCount(0);
  await expect
    .poll(async () => {
      const movedBox = await launcher.boundingBox();
      return movedBox ? Math.abs(movedBox.x - (targetX - initialBox.width / 2)) <= 2 : false;
    })
    .toBe(true);
  const storedPosition = await page.evaluate(() => JSON.parse(window.localStorage.getItem("football-dashboard-chat-launcher-position-v1") || "null"));
  expect(Number.isFinite(storedPosition?.left)).toBe(true);
  expect(Number.isFinite(storedPosition?.top)).toBe(true);

  await launcher.click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator(".dashboard-chat-widget-close").click();
  await expect(launcher).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  const restoredBox = await page.locator(".dashboard-chat-launcher").boundingBox();
  expect(restoredBox).not.toBeNull();
  expect(Math.abs(restoredBox.x - storedPosition.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(restoredBox.y - storedPosition.top)).toBeLessThanOrEqual(2);

  await page.evaluate(() => document.body.classList.add("is-video-analysis-fs-player-code-mode"));
  await expect(page.locator(".dashboard-chat-launcher")).toBeHidden();
  await page.evaluate(() => document.body.classList.remove("is-video-analysis-fs-player-code-mode"));
  await expect(page.locator(".dashboard-chat-launcher")).toBeVisible();

  await page.evaluate(() => {
    const dialog = document.createElement("section");
    dialog.dataset.qaExternalDialog = "true";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.style.cssText = "position:fixed;inset:1rem;display:block";
    document.body.append(dialog);
  });
  await expect(page.locator(".dashboard-chat-launcher")).toBeHidden();
  await page.evaluate(() => document.querySelector("[data-qa-external-dialog]")?.remove());
  await expect(page.locator(".dashboard-chat-launcher")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const mobileBox = await page.locator(".dashboard-chat-launcher").boundingBox();
      return Boolean(
        mobileBox
        && mobileBox.x >= 12
        && mobileBox.y >= 12
        && mobileBox.x + mobileBox.width <= 378
        && mobileBox.y + mobileBox.height <= 832
      );
    })
    .toBe(true);
});

test("Chat launcher sync overlay does not shift the open message list", async ({ page }) => {
  const nowMs = Date.now();
  const serverMessages = Array.from({ length: 18 }, (_, index) => {
    const createdAt = new Date(nowMs + index * 1000).toISOString();
    return {
      id: `qa-chat-stable-sync-${nowMs}-${index}`,
      userId: index % 5 === 1 ? qaChatCurrentUserId : "qa-colleague",
      threadId: "team",
      text: `QA stable sync message ${index + 1}`,
      createdAt,
      deliveredAt: createdAt,
      readBy: index % 5 === 1 ? [qaChatCurrentUserId] : ["qa-colleague", qaChatCurrentUserId],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: index % 5 === 1 ? qaChatCurrentUserId : "qa-colleague",
        firstName: index % 5 === 1 ? "Mak" : "QA",
        lastName: index % 5 === 1 ? "Lind" : "Colleague",
        role: "coach",
        status: "active",
      },
    };
  });
  let heldChatGets = null;
  let pendingChatRequests = 0;
  let forceChatGetError = false;

  function holdNextChatGets(mode = "ok") {
    let resolveStarted;
    let release;
    const hold = {
      mode,
      count: 0,
      started: new Promise((resolve) => {
        resolveStarted = resolve;
      }),
      released: new Promise((resolve) => {
        release = resolve;
      }),
      resolveStarted: () => {
        hold.count += 1;
        resolveStarted(hold.count);
      },
      release: () => {
        if (hold.mode === "error") {
          forceChatGetError = true;
        }
        if (heldChatGets === hold) {
          heldChatGets = null;
        }
        release();
      },
    };
    heldChatGets = hold;
    return hold;
  }

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    pendingChatRequests += 1;
    try {
      const request = route.request();
      if (request.method() === "GET") {
        const activeHold = heldChatGets;
        if (activeHold) {
          activeHold.resolveStarted();
          await activeHold.released;
          if (activeHold.mode === "error") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: false, reason: "QA transient sync failure." }),
            });
            return;
          }
        }
        if (forceChatGetError) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, reason: "QA transient sync failure." }),
          });
          return;
        }
        await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
        return;
      }

      const payload = request.postDataJSON();
      if (payload.action === "markThreadRead") {
        serverMessages.forEach((message) => {
          if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
            message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
          }
        });
      }
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
    } finally {
      pendingChatRequests -= 1;
    }
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator(".dashboard-chat-inbox-head")).not.toContainText("conversations");
  await expect(page.locator(".dashboard-chat-inbox-head")).not.toContainText("active");
  await expect(page.locator(".dashboard-chat-inbox-head")).not.toContainText("No mentions");
  await expect(page.locator(".dashboard-chat-inbox-head")).not.toContainText("Synced");
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText("QA stable sync message 18");
  await expect.poll(() => pendingChatRequests, { timeout: 5_000 }).toBe(0);
  await page.waitForTimeout(200);
  await expect.poll(() => pendingChatRequests, { timeout: 5_000 }).toBe(0);
  await page.locator("[data-dashboard-chat-list]").evaluate((element) => {
    element.scrollTop = 0;
  });

  const baseline = await readQaChatLayoutMetrics(page);
  expect(baseline.listTop).toBeGreaterThan(0);
  expect(baseline.firstMessageTop).toBeGreaterThan(0);
  expect(baseline.scrollHeight).toBeGreaterThan(baseline.clientHeight + 96);
  expect(baseline.syncStatusCount).toBe(0);
  expect(baseline.statusOverlayCount).toBe(0);

  forceChatGetError = true;
  const failedSync = holdNextChatGets("error");
  await page.locator('[data-dashboard-chat-thread="team"]').first().click();
  await failedSync.started;
  await page.waitForTimeout(80);
  const syncingLayout = await readQaChatLayoutMetrics(page);
  expect(syncingLayout.syncStatusCount).toBe(0);
  expect(syncingLayout.statusOverlayCount).toBe(0);
  expectQaChatLayoutStable(baseline, syncingLayout, "syncing refresh");

  failedSync.release();
  const failedLayout = await readQaChatLayoutMetricsWhenAttached(page, "[data-dashboard-chat-status-overlay] [data-dashboard-chat-sync-status]");
  expect(failedLayout.syncStatusCount).toBe(1);
  expect(failedLayout.statusOverlayCount).toBe(1);
  expectQaChatLayoutStable(baseline, failedLayout, "sync failure overlay");
});

test("Chat message timestamp stays inside the message bubble", async ({ page }) => {
  const serverMessages = [
    {
      id: "qa-chat-bubble-time",
      userId: "qa-colleague",
      threadId: "team",
      text: "QA older message keeps its timestamp inside the bubble.",
      createdAt: "2026-06-04T07:45:00.000Z",
      deliveredAt: "2026-06-04T07:45:00.000Z",
      readBy: ["qa-colleague", qaChatCurrentUserId],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: "qa-colleague",
        firstName: "QA",
        lastName: "Colleague",
        role: "coach",
        status: "active",
      },
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  const message = page.locator('[data-dashboard-chat-message-id="qa-chat-bubble-time"]');
  await expect(message).toContainText("QA older message keeps its timestamp inside the bubble.");

  const timestamp = message.locator(".dashboard-chat-bubble-footer time");
  await expect(timestamp).toHaveText(/^\d{2}:\d{2}$/);
  await expect(timestamp).not.toContainText("Jun");

  const geometry = await message.evaluate((node) => {
    const bubbleSurface = node.querySelector(".dashboard-chat-bubble p");
    const footer = node.querySelector(".dashboard-chat-bubble-footer");
    const bubbleRect = bubbleSurface?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      bubbleTop: bubbleRect?.top ?? 0,
      bubbleRight: bubbleRect?.right ?? 0,
      bubbleBottom: bubbleRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
      footerRight: footerRect?.right ?? 0,
      footerBottom: footerRect?.bottom ?? 0,
      footerPosition: footer ? window.getComputedStyle(footer).position : "",
    };
  });

  expect(geometry.footerPosition).toBe("absolute");
  expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.bubbleTop);
  expect(geometry.footerRight).toBeLessThanOrEqual(geometry.bubbleRight + 0.5);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.bubbleBottom + 0.5);
});

test("Chat delivery checks and emoji composer follow the WhatsApp baseline", async ({ page }) => {
  const serverMessages = [
    {
      id: "qa-chat-own-read-status",
      userId: qaChatCurrentUserId,
      threadId: "team",
      text: "QA own message with a read receipt.",
      createdAt: "2026-06-04T08:15:00.000Z",
      deliveredAt: "2026-06-04T08:15:00.000Z",
      readBy: [qaChatCurrentUserId, "qa-colleague"],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: qaChatCurrentUserId,
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();

  const message = page.locator('[data-dashboard-chat-message-id="qa-chat-own-read-status"]');
  const status = message.locator('[data-dashboard-chat-message-delivery-status="read"]');
  await expect(status.locator(".dashboard-chat-check")).toHaveCount(2);

  const statusGeometry = await message.evaluate((node) => {
    const footer = node.querySelector(".dashboard-chat-bubble-footer");
    const statusWrapper = node.querySelector(".dashboard-chat-message-status");
    const check = node.querySelector(".dashboard-chat-check");
    const footerRect = footer?.getBoundingClientRect();
    const statusRect = statusWrapper?.getBoundingClientRect();
    return {
      footerRight: footerRect?.right ?? 0,
      footerCenter: footerRect ? footerRect.top + footerRect.height / 2 : 0,
      statusLeft: statusRect?.left ?? 0,
      statusCenter: statusRect ? statusRect.top + statusRect.height / 2 : 0,
      checkColor: check ? window.getComputedStyle(check).color : "",
    };
  });

  expect(statusGeometry.statusLeft).toBeGreaterThanOrEqual(statusGeometry.footerRight - 0.5);
  expect(Math.abs(statusGeometry.statusCenter - statusGeometry.footerCenter)).toBeLessThanOrEqual(3);
  expect(statusGeometry.checkColor).toBe("rgb(83, 189, 235)");

  await page.locator(".dashboard-chat-emoji-menu summary").click();
  const thumbsUp = page.locator('[data-dashboard-chat-emoji="👍"]');
  await expect(thumbsUp).toBeVisible();
  await thumbsUp.click();
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("👍");
  await expect(page.locator(".dashboard-chat-emoji-menu")).not.toHaveAttribute("open", "");
});

test("Chat message grouping hover keeps message geometry stable", async ({ page }) => {
  const nowMs = Date.now();
  const serverMessages = Array.from({ length: 18 }, (_, index) => {
    const isOwnMessage = index % 4 === 1;
    const createdAt = new Date(nowMs + index * 1000).toISOString();
    return {
      id: `qa-chat-message-hover-${nowMs}-${index}`,
      userId: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
      threadId: "team",
      text: `QA message hover stability line ${index + 1} with enough text to make the bubble menu edge meaningful`,
      createdAt,
      deliveredAt: createdAt,
      readBy: ["qa-colleague", qaChatCurrentUserId],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
        firstName: isOwnMessage ? "Mak" : "QA",
        lastName: isOwnMessage ? "Lind" : "Colleague",
        role: "coach",
        status: "active",
      },
    };
  });
  const chatActionPayloads = [];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON();
      chatActionPayloads.push(payload);
      if (payload.action === "markThreadRead") {
        serverMessages.forEach((message) => {
          if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
            message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
          }
        });
      } else if (payload.action === "addReaction" || payload.action === "removeReaction") {
        const message = serverMessages.find((candidate) => candidate.id === payload.messageId);
        if (message && payload.reaction) {
          const reactions = { ...(message.reactions || {}) };
          const currentSet = new Set(reactions[payload.reaction] || []);
          if (payload.action === "addReaction") {
            currentSet.add(qaChatCurrentUserId);
          } else {
            currentSet.delete(qaChatCurrentUserId);
          }
          reactions[payload.reaction] = Array.from(currentSet);
          message.reactions = reactions;
        }
      }
    }
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText("QA message hover stability line 18");
  await page.waitForTimeout(120);

  const baseline = await readQaChatMessageGeometry(page);
  expect(baseline.items.length).toBeGreaterThanOrEqual(2);
  expect(baseline.listWidth).toBeGreaterThan(0);
  baseline.items.forEach((item) => {
    expect(item.transform, `${item.messageId}: baseline transform`).toBe("none");
    expect(item.width, `${item.messageId}: message card should use the row width`).toBeGreaterThan(baseline.listWidth * 0.88);
    expect(item.bubbleWidth, `${item.messageId}: message bubble should use the row width`).toBeGreaterThan(baseline.listWidth * 0.88);
  });

  const hoverTargets = baseline.items.slice(0, Math.min(4, baseline.items.length)).map((item) => ({
    messageId: item.messageId,
    x: item.left + item.width - 12,
    y: Math.min(
      baseline.listTop + baseline.listHeight - 8,
      Math.max(baseline.listTop + 8, item.top + Math.min(18, Math.max(8, item.height / 2)))
    ),
  }));
  for (const [index, target] of hoverTargets.entries()) {
    await page.mouse.move(target.x, target.y);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest("[data-dashboard-chat-message-card]")?.getAttribute("data-dashboard-chat-message-id") || "",
            { x: target.x, y: target.y }
          ),
        { timeout: 2_000 }
      )
      .toBe(target.messageId);
    await page.waitForTimeout(index === 0 ? 150 : 50);
    if (index === 0) {
      let hoverActionMetrics = null;
      await expect
        .poll(
          async () => {
            const metrics = await page.evaluate((messageId) => {
              const card = document.querySelector(`[data-dashboard-chat-message-id="${messageId}"]`);
              const menu = card?.querySelector(".dashboard-chat-message-menu");
              const menuSummary = menu?.querySelector("summary");
              const menuRect = menuSummary?.getBoundingClientRect();
              return {
                menuLabel: menuSummary?.getAttribute("aria-label") || "",
                menuOpacity: Number(menu ? window.getComputedStyle(menu).opacity : 0),
                menuWidth: menuRect?.width || 0,
                menuHeight: menuRect?.height || 0,
                quickReactionPresent: Boolean(card?.querySelector(".dashboard-chat-message-reaction-menu")),
                quickReactionPanelPresent: Boolean(card?.querySelector(".dashboard-chat-message-reaction-panel .dashboard-chat-reactions")),
              };
            }, target.messageId);
            if (metrics.menuOpacity > 0.9) {
              hoverActionMetrics = metrics;
            }
            return metrics.menuOpacity;
          },
          { timeout: 2_000 }
        )
        .toBeGreaterThan(0.9);

      expect(hoverActionMetrics.menuLabel).toBe("Open message actions");
      expect(hoverActionMetrics.menuOpacity).toBeGreaterThan(0.9);
      expect(hoverActionMetrics.menuWidth).toBeLessThanOrEqual(24);
      expect(hoverActionMetrics.menuHeight).toBeLessThanOrEqual(24);
      expect(hoverActionMetrics.quickReactionPresent).toBe(false);
      expect(hoverActionMetrics.quickReactionPanelPresent).toBe(false);
    }
    const hovered = await readQaChatMessageGeometry(page);
    expectQaChatMessageGeometryStable(baseline, hovered, `message hover ${index + 1}`);
  }

  const reactionTargetId = hoverTargets[0]?.messageId || "";
  await page.locator(`[data-dashboard-chat-message-id="${reactionTargetId}"] .dashboard-chat-message-menu summary`).click();
  const reactionButton = page
    .locator(
      `[data-dashboard-chat-message-id="${reactionTargetId}"] .dashboard-chat-menu-reaction-group [data-dashboard-message-reaction="${reactionTargetId}"][data-dashboard-reaction-key]`
    )
    .first();
  await expect(reactionButton).toBeVisible();
  const reactionKey = await reactionButton.getAttribute("data-dashboard-reaction-key");
  await reactionButton.click();
  await expect
    .poll(
      () =>
        chatActionPayloads.some(
          (payload) => payload.action === "addReaction" && payload.messageId === reactionTargetId && payload.reaction === reactionKey
        ),
      { timeout: 2_000 }
    )
    .toBe(true);
});

test("Chat launcher thread hover keeps conversation geometry stable", async ({ page }) => {
  test.setTimeout(90_000);
  const nowMs = Date.now();
  const threadIds = ["team", "medical", "training", "matchday", "dm:qa-austin"];
  const threadOptions = {
    team: { type: "team", title: "North Carolina Courage Chat" },
    medical: { type: "group", title: "Medical staff" },
    training: { type: "group", title: "Training planning" },
    matchday: { type: "group", title: "Matchday staff" },
    "dm:qa-austin": {
      type: "dm",
      title: "Austin Da Luz",
      participants: [{ userId: qaChatCurrentUserId }, { userId: "qa-chat-austin" }],
    },
  };
  const serverMessages = threadIds.map((threadId, index) => {
    const createdAt = new Date(nowMs + index * 1000).toISOString();
    const isOwnMessage = index === 2;
    return {
      id: `qa-chat-hover-stable-${nowMs}-${index}`,
      userId: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
      threadId,
      text: `QA hover stable message ${index + 1}`,
      createdAt,
      deliveredAt: createdAt,
      readBy: ["qa-colleague", qaChatCurrentUserId],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
        firstName: isOwnMessage ? "Mak" : "QA",
        lastName: isOwnMessage ? "Lind" : "Colleague",
        role: "coach",
        status: "active",
      },
    };
  });

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON();
      if (payload.action === "markThreadRead") {
        serverMessages.forEach((message) => {
          if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
            message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
          }
        });
      }
    }

    await fulfillQaChatPayload(route, serverMessages, { threadIds, threadOptions });
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  const threads = page.locator("[data-dashboard-chat-thread]");
  await expect(threads.nth(4)).toBeVisible();
  await page.waitForTimeout(120);

  const baseline = await readQaChatThreadGeometry(page);
  expect(baseline.items.length).toBeGreaterThanOrEqual(5);
  baseline.items.forEach((item) => {
    expect(item.transform, `${item.threadId}: baseline transform`).toBe("none");
  });

  const hoverTargets = baseline.items.slice(0, Math.min(5, baseline.items.length)).map((item) => ({
    threadId: item.threadId,
    x: item.left + item.width / 2,
    y: item.top + item.height / 2,
  }));
  for (const [index, target] of hoverTargets.entries()) {
    await page.mouse.move(target.x, target.y);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest("[data-dashboard-chat-thread]")?.getAttribute("data-dashboard-chat-thread") || "",
            { x: target.x, y: target.y }
          ),
        { timeout: 2_000 }
      )
      .toBe(target.threadId);
    await page.waitForTimeout(40);
    const hovered = await readQaChatThreadGeometry(page);
    expectQaChatThreadGeometryStable(baseline, hovered, `thread hover ${index + 1}`);
  }
});

test("Chat group creator creates a focused group from the plus menu", async ({ page }) => {
  const groupTitle = `QA Group ${Date.now()}`;
  const chatActions = [];
  const createdThreads = [];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threads: createdThreads, messages: [], pagination: {} }),
      });
      return;
    }

    let payload = {};
    try {
      payload = request.postDataJSON();
    } catch {
      payload = {};
    }
    chatActions.push(payload);

    if (payload.action !== "createThread") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threads: createdThreads, messages: [], pagination: {} }),
      });
      return;
    }

    const participantIds = Array.isArray(payload.participantIds) ? payload.participantIds : [];
    const thread = {
      id: `db-${payload.threadId || "qa-group"}`,
      threadId: payload.threadId || "qa-group",
      legacyThreadId: payload.threadId || "qa-group",
      type: payload.type || "group",
      title: payload.title || groupTitle,
      visibility: payload.visibility || "members",
      messageCount: 0,
      participants: participantIds.map((userId, index) => ({
        userId,
        participantRole: index === 0 ? "owner" : "member",
        joinedAt: new Date().toISOString(),
      })),
      permissions: { canManageParticipants: true },
      metadata: { legacyThreadId: payload.threadId || "qa-group", avatarLabel: payload.avatarLabel || "" },
    };
    createdThreads.push(thread);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, thread, threads: [thread], messages: [], pagination: {} }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const teammates = [
      {
        ...currentUser,
        id: currentUser.id || "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
      {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ];
    window.platformAuthStore.writeUsers?.(teammates);
    window.platformAuthStore.setCurrentUser?.(currentUser.id || "dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-thread-presets] > summary").click();
  await expect(page.locator("[data-dashboard-chat-open-group-creator]")).toBeVisible();
  await page.locator("[data-dashboard-chat-open-group-creator]").click();

  const overlay = page.locator(".dashboard-chat-group-create-overlay");
  await expect(overlay).toBeVisible();
  const closeButtonMetrics = await overlay.locator("[data-dashboard-chat-group-create-close]").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const styles = window.getComputedStyle(button);
    const before = window.getComputedStyle(button, "::before");
    const after = window.getComputedStyle(button, "::after");
    return {
      width: rect.width,
      height: rect.height,
      fontSize: styles.fontSize,
      beforeWidth: before.width,
      beforeTransform: before.transform,
      afterTransform: after.transform,
    };
  });
  expect(closeButtonMetrics.width).toBeGreaterThanOrEqual(32);
  expect(closeButtonMetrics.width).toBeLessThanOrEqual(36);
  expect(closeButtonMetrics.height).toBeGreaterThanOrEqual(32);
  expect(closeButtonMetrics.height).toBeLessThanOrEqual(36);
  expect(closeButtonMetrics.fontSize).toBe("0px");
  expect(closeButtonMetrics.beforeWidth).not.toBe("auto");
  expect(closeButtonMetrics.beforeTransform).not.toBe("none");
  expect(closeButtonMetrics.afterTransform).not.toBe("none");
  await overlay.locator("[data-dashboard-chat-group-name-input]").fill(groupTitle);
  await overlay.locator("[data-dashboard-chat-group-user-search]").filter({ hasText: "Ceri Bowley" }).click();
  await expect(overlay.locator("[data-dashboard-chat-group-selected-list]")).toContainText("Ceri Bowley");
  await expect(overlay.locator("[data-dashboard-chat-group-create-submit]")).toBeEnabled();
  await overlay.locator("[data-dashboard-chat-group-create-submit]").click();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("placeholder", "Message");
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("aria-label", `Message ${groupTitle}`);
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toContainText(groupTitle);
  expect(chatActions.some((payload) => payload.action === "createThread" && payload.type === "group" && payload.title === groupTitle)).toBe(true);
});

test("Chat direct creator opens a private chat by tapping a teammate", async ({ page }) => {
  const chatActions = [];
  const createdThreads = [];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threads: createdThreads, messages: [], pagination: {} }),
      });
      return;
    }

    let payload = {};
    try {
      payload = request.postDataJSON();
    } catch {
      payload = {};
    }
    chatActions.push(payload);

    if (payload.action !== "createThread") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threads: createdThreads, messages: [], pagination: {} }),
      });
      return;
    }

    const now = new Date().toISOString();
    const participantIds = Array.isArray(payload.participantIds) ? payload.participantIds : [];
    const participants = Array.isArray(payload.participants)
      ? payload.participants.map((participant, index) => ({
          id: participant.id,
          userId: participant.id,
          name: participant.name,
          email: participant.email || "",
          username: participant.username || "",
          participantRole: index === 0 ? "owner" : "member",
          joinedAt: now,
        }))
      : participantIds.map((userId, index) => ({
          userId,
          id: userId,
          participantRole: index === 0 ? "owner" : "member",
          joinedAt: now,
        }));
    const thread = {
      id: `db-${payload.threadId || "qa-dm"}`,
      threadId: payload.threadId || "qa-dm",
      legacyThreadId: payload.threadId || "qa-dm",
      type: "dm",
      title: payload.title || "Direct message",
      visibility: "private",
      createdAt: now,
      created_at: now,
      messageCount: 0,
      participants,
      permissions: {},
      metadata: { legacyThreadId: payload.threadId || "qa-dm" },
    };
    createdThreads.push(thread);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, thread, threads: [thread], messages: [], pagination: {} }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const teammates = [
      {
        ...currentUser,
        id: currentUser.id || "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: "team-admin",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
      {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "coach",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ];
    window.platformAuthStore.writeUsers?.(teammates);
    window.platformAuthStore.setCurrentUser?.(currentUser.id || "dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-thread-presets] > summary").click();
  await expect(page.locator("[data-dashboard-chat-open-direct-creator]")).toBeVisible();
  await page.locator("[data-dashboard-chat-open-direct-creator]").click();

  const overlay = page.locator(".dashboard-chat-group-create-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("[data-dashboard-chat-direct-filter-status]")).toContainText("start new or open existing");
  const austinRow = overlay.locator("[data-dashboard-chat-direct-user-search]").filter({ hasText: "Austin Da Luz" }).first();
  await expect(austinRow.locator(".dashboard-chat-direct-user-action")).toHaveText("Start");
  await austinRow.click();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("placeholder", "Message");
  await expect(page.locator("[data-dashboard-chat-thread]").filter({ hasText: "Austin Da Luz" })).toHaveCount(1);
  expect(chatActions.some((payload) => (
    payload.action === "createThread"
    && payload.type === "dm"
    && Array.isArray(payload.participantIds)
    && payload.participantIds.includes("qa-chat-austin")
  ))).toBe(true);
});

test("Chat direct creator opens an existing private chat instead of recreating it", async ({ page }) => {
  const chatActions = [];
  const now = new Date().toISOString();
  const existingThread = {
    id: "db-dm-existing-ceri",
    threadId: "dm:dev-user-mak:qa-chat-ceri",
    legacyThreadId: "dm:dev-user-mak:qa-chat-ceri",
    type: "dm",
    title: "Direct message",
    visibility: "private",
    createdAt: now,
    created_at: now,
    messageCount: 0,
    participants: [
      { id: "dev-user-mak", userId: "dev-user-mak", name: "Mak Lind", participantRole: "owner", joinedAt: now },
      { id: "qa-chat-ceri", userId: "qa-chat-ceri", name: "Ceri Bowley", participantRole: "member", joinedAt: now },
    ],
    permissions: {},
    metadata: { legacyThreadId: "dm:dev-user-mak:qa-chat-ceri" },
  };

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      let payload = {};
      try {
        payload = request.postDataJSON();
      } catch {
        payload = {};
      }
      chatActions.push(payload);
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, threads: [existingThread], messages: [], pagination: {} }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "team-admin",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.("dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-thread-presets] > summary").click();
  await page.locator("[data-dashboard-chat-open-direct-creator]").click();

  const overlay = page.locator(".dashboard-chat-group-create-overlay");
  await expect(overlay).toBeVisible();
  const ceriRow = overlay.locator("[data-dashboard-chat-direct-user-search]").filter({ hasText: "Ceri Bowley" }).first();
  await expect(ceriRow.locator(".dashboard-chat-direct-user-action")).toHaveText("Open");
  await expect(ceriRow.locator("input[name='participantId']")).toHaveAttribute(
    "data-dashboard-chat-direct-existing-thread",
    "dm:dev-user-mak:qa-chat-ceri"
  );
  await ceriRow.click();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("aria-label", /Ceri Bowley|Direct message/i);
  expect(chatActions.some((payload) => payload.action === "createThread")).toBe(false);
});

test("Chat compose send delivers inside a direct message thread", async ({ page }) => {
  const messageText = `QA direct message ${Date.now()}`;
  const chatActions = [];
  const createdThreads = [];
  const serverMessages = [];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, threads: createdThreads, messages: serverMessages, pagination: {} }),
      });
      return;
    }

    let payload = {};
    try {
      payload = request.postDataJSON();
    } catch {
      payload = {};
    }
    chatActions.push(payload);

    if (payload.action === "createThread") {
      const now = new Date().toISOString();
      const participantIds = Array.isArray(payload.participantIds) ? payload.participantIds : [];
      const participants = Array.isArray(payload.participants)
        ? payload.participants.map((participant, index) => ({
            id: participant.id,
            userId: participant.id,
            name: participant.name,
            email: participant.email || "",
            username: participant.username || "",
            participantRole: index === 0 ? "owner" : "member",
            joinedAt: now,
          }))
        : participantIds.map((userId, index) => ({
            userId,
            id: userId,
            participantRole: index === 0 ? "owner" : "member",
            joinedAt: now,
          }));
      const thread = {
        id: `db-${payload.threadId || "qa-dm"}`,
        threadId: payload.threadId || "qa-dm",
        legacyThreadId: payload.threadId || "qa-dm",
        type: "dm",
        title: payload.title || "Direct message",
        visibility: "private",
        createdAt: now,
        created_at: now,
        messageCount: 0,
        participants,
        permissions: {},
        metadata: { legacyThreadId: payload.threadId || "qa-dm" },
      };
      createdThreads.splice(0, createdThreads.length, thread);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, action: "createThread", thread }),
      });
      return;
    }

    if (payload.action === "sendMessage") {
      const now = new Date().toISOString();
      const thread = createdThreads.find((candidate) => candidate.threadId === payload.threadId) || createdThreads[0];
      const message = {
        id: payload.clientMessageId || payload.id || `qa-direct-sent-${Date.now()}`,
        clientMessageId: payload.clientMessageId || payload.id || "",
        userId: qaChatCurrentUserId,
        threadId: payload.threadId,
        text: payload.text,
        createdAt: now,
        deliveredAt: now,
        readBy: [qaChatCurrentUserId],
        mentionedUserIds: payload.mentionedUserIds || [],
        status: "sent",
        author: {
          id: qaChatCurrentUserId,
          firstName: "Mak",
          lastName: "Lind",
          role: "coach",
          status: "active",
        },
      };
      serverMessages.push(message);
      if (thread) {
        thread.messageCount = serverMessages.filter((item) => item.threadId === thread.threadId).length;
        thread.lastMessage = message;
        thread.lastMessageId = message.id;
        thread.lastMessageAt = now;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, action: "sendMessage", thread, message }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, threads: createdThreads, messages: serverMessages, pagination: {} }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: currentUser.id || "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: "team-admin",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.(currentUser.id || "dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-thread-presets] > summary").click();
  await page.locator("[data-dashboard-chat-open-direct-creator]").click();
  const overlay = page.locator(".dashboard-chat-group-create-overlay");
  await expect(overlay).toBeVisible();
  await overlay.locator("[data-dashboard-chat-direct-user-search]").filter({ hasText: "Ceri Bowley" }).first().click();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("aria-label", /Ceri Bowley|Direct message/i);
  await page.locator("[data-dashboard-chat-input]").fill(messageText);
  await page.locator("[data-dashboard-chat-form] button[type='submit']").click();

  await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText);
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
  expect(chatActions.some((payload) => (
    payload.action === "sendMessage" &&
    payload.type !== "team" &&
    payload.threadType === "dm" &&
    payload.text === messageText &&
    Array.isArray(payload.participantIds) &&
    payload.participantIds.includes("qa-chat-ceri")
  ))).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  if (!(await page.locator(".dashboard-chat-widget.is-open").count())) {
    await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  }

  await expect(page.locator("[data-dashboard-chat-thread]").filter({ hasText: "Ceri Bowley" })).toHaveCount(1);
  await page.locator("[data-dashboard-chat-thread]").filter({ hasText: "Ceri Bowley" }).first().click();
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText);
});

test("Chat compose send scrolls the sent message into view", async ({ page }) => {
  const messageText = `QA visible sent message ${Date.now()}`;
  const nowMs = Date.now();
  const chatActions = [];
  const serverMessages = Array.from({ length: 20 }, (_, index) => {
    const isOwnMessage = index % 4 === 1;
    const createdAt = new Date(nowMs - (20 - index) * 1000).toISOString();
    return {
      id: `qa-chat-visible-send-${nowMs}-${index}`,
      userId: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
      threadId: "team",
      text: `QA visible send history ${index + 1}`,
      createdAt,
      deliveredAt: createdAt,
      readBy: [qaChatCurrentUserId, "qa-colleague"],
      mentionedUserIds: [],
      status: "sent",
      author: {
        id: isOwnMessage ? qaChatCurrentUserId : "qa-colleague",
        firstName: isOwnMessage ? "Mak" : "QA",
        lastName: isOwnMessage ? "Lind" : "Colleague",
        role: "coach",
        status: "active",
      },
    };
  });

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    const payload = request.postDataJSON();
    chatActions.push(payload);
    if (payload.action === "markThreadRead") {
      serverMessages.forEach((message) => {
        if (getQaChatMessageThreadId(message) === (payload.threadId || "team")) {
          message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
        }
      });
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }
    if (payload.action === "sendMessage") {
      const createdAt = new Date().toISOString();
      const message = {
        id: payload.clientMessageId || payload.id || `qa-visible-sent-${Date.now()}`,
        clientMessageId: payload.clientMessageId || payload.id || "",
        userId: qaChatCurrentUserId,
        threadId: payload.threadId || "team",
        text: payload.text,
        createdAt,
        deliveredAt: createdAt,
        readBy: [qaChatCurrentUserId],
        mentionedUserIds: payload.mentionedUserIds || [],
        status: "sent",
        author: {
          id: qaChatCurrentUserId,
          firstName: "Mak",
          lastName: "Lind",
          role: "coach",
          status: "active",
        },
      };
      serverMessages.push(message);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          message,
          messages: serverMessages,
          threads: [createQaChatThread("team", serverMessages)],
          thread: createQaChatThread("team", serverMessages),
          pagination: {},
        }),
      });
      return;
    }
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText("QA visible send history 20");

  const chatList = page.locator("[data-dashboard-chat-list]");
  await chatList.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => chatList.evaluate((element) => element.scrollTop)).toBe(0);

  await page.locator("[data-dashboard-chat-input]").fill(messageText);
  await page.locator("[data-dashboard-chat-form] button[type='submit']").click();
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
  await expect(chatList).toContainText(messageText);
  await expect
    .poll(
      () =>
        chatList.evaluate((element, expectedText) => {
          const listRect = element.getBoundingClientRect();
          const sentCard = Array.from(element.querySelectorAll("[data-dashboard-chat-message-card]"))
            .find((card) => (card.textContent || "").includes(expectedText));
          if (!sentCard) {
            return false;
          }
          const sentRect = sentCard.getBoundingClientRect();
          return sentRect.top >= listRect.top && sentRect.bottom <= listRect.bottom;
        }, messageText),
      { timeout: 5_000 }
    )
    .toBe(true);
  expect(chatActions.some((payload) => payload.action === "sendMessage" && payload.text === messageText)).toBe(true);
});

test("Chat group settings can rename, set avatar, and delete a group", async ({ page }) => {
  const groupTitle = `QA Manage Group ${Date.now()}`;
  const renamedTitle = `QA Renamed Group ${Date.now()}`;
  const avatarInitials = "RG";
  const chatActions = [];
  let createdThread = null;

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          threads: createdThread && !createdThread.archivedAt ? [createdThread] : [],
          messages: [],
          pagination: {},
        }),
      });
      return;
    }

    let payload = {};
    try {
      payload = request.postDataJSON();
    } catch {
      payload = {};
    }
    chatActions.push(payload);

    if (payload.action === "createThread") {
      const now = new Date().toISOString();
      const participantIds = Array.isArray(payload.participantIds) ? payload.participantIds : [];
      createdThread = {
        id: `db-${payload.threadId || "qa-group"}`,
        threadId: payload.threadId || "qa-group",
        legacyThreadId: payload.threadId || "qa-group",
        type: payload.type || "group",
        title: payload.title || groupTitle,
        visibility: payload.visibility || "members",
        createdAt: now,
        created_at: now,
        messageCount: 0,
        participants: participantIds.map((userId, index) => ({
          userId,
          participantRole: index === 0 ? "owner" : "member",
          joinedAt: now,
        })),
        permissions: { canManageParticipants: true },
        settings: {},
        metadata: { legacyThreadId: payload.threadId || "qa-group", avatarLabel: payload.avatarLabel || "" },
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, thread: createdThread, threads: [createdThread], messages: [], pagination: {} }),
      });
      return;
    }

    if (payload.action === "setThreadSettings" && createdThread) {
      createdThread = {
        ...createdThread,
        title: payload.settings?.customTitle || createdThread.title,
        settings: { ...(createdThread.settings || {}), ...(payload.settings || {}) },
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, thread: createdThread, threads: [createdThread], messages: [], pagination: {} }),
      });
      return;
    }

    if (payload.action === "archiveThread" && createdThread) {
      createdThread = { ...createdThread, archivedAt: new Date().toISOString() };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, thread: createdThread, threads: [], messages: [], pagination: {} }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, threads: createdThread ? [createdThread] : [], messages: [], pagination: {} }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const teammates = [
      {
        ...currentUser,
        id: currentUser.id || "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: "team-admin",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ];
    window.platformAuthStore.writeUsers?.(teammates);
    window.platformAuthStore.setCurrentUser?.(currentUser.id || "dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-thread-presets] > summary").click();
  await page.locator("[data-dashboard-chat-open-group-creator]").click();

  const overlay = page.locator(".dashboard-chat-group-create-overlay");
  await expect(overlay).toBeVisible();
  await overlay.locator("[data-dashboard-chat-group-name-input]").fill(groupTitle);
  await overlay.locator("[data-dashboard-chat-group-user-search]").filter({ hasText: "Ceri Bowley" }).click();
  await overlay.locator("[data-dashboard-chat-group-create-submit]").click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toContainText(groupTitle);

  const createdGroupThread = page.locator("[data-dashboard-chat-thread]").filter({ hasText: groupTitle }).first();
  await createdGroupThread.click();
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("placeholder", "Message");
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveAttribute("aria-label", `Message ${groupTitle}`);
  const detailsToggle = page.locator("[data-dashboard-chat-details-toggle]");
  await expect(detailsToggle).toBeVisible();
  await detailsToggle.click();
  await expect(page.locator(".dashboard-chat-details-panel")).toBeVisible();
  await page.locator('[data-dashboard-chat-thread-setting="rename"]').click();
  const settingsDialog = page.locator(".dashboard-chat-settings-dialog");
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.locator("[data-dashboard-chat-settings-input]").fill(renamedTitle);
  await settingsDialog.locator("button[type='submit']").click();
  await expect(settingsDialog).toHaveCount(0);
  await expect(page.locator("header .dashboard-chat-widget-title")).toContainText(renamedTitle);
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toContainText(renamedTitle);

  await page.locator('[data-dashboard-chat-thread-setting="avatar"]').click();
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.locator("[data-dashboard-chat-settings-input]").fill(avatarInitials);
  await settingsDialog.locator("button[type='submit']").click();
  await expect(settingsDialog).toHaveCount(0);
  await expect(page.locator('[data-dashboard-chat-thread-setting="avatar"] small')).toContainText(avatarInitials);

  await page.locator("[data-dashboard-chat-archive-thread]").click();
  await expect(page.locator(".dashboard-chat-confirm-card")).toBeVisible();
  await page.locator("[data-dashboard-chat-confirm-apply]").click();
  await expect(page.locator("[data-dashboard-chat-thread]").filter({ hasText: renamedTitle })).toHaveCount(0);
  expect(chatActions.some((payload) => payload.action === "setThreadSettings" && payload.settings?.customTitle === renamedTitle)).toBe(true);
  expect(chatActions.some((payload) => payload.action === "setThreadSettings" && payload.settings?.avatarLabel === avatarInitials)).toBe(true);
  expect(chatActions.some((payload) => payload.action === "archiveThread")).toBe(true);
});

test("Chat message grouping and latest thread sorting survive reload", async ({ page }) => {
  const baseTime = Date.now();
  const teamFirstId = `qa-chat-grouped-first-${baseTime}`;
  const teamSecondId = `qa-chat-grouped-second-${baseTime}`;
  const olderDirectId = `qa-chat-older-direct-${baseTime}`;
  const makeIso = (offsetMs) => new Date(baseTime + offsetMs).toISOString();
  const serverMessages = [
    {
      id: olderDirectId,
      userId: "qa-chat-austin",
      threadId: "dm:dev-user-mak:qa-chat-austin",
      text: "Older direct message",
      createdAt: makeIso(-120_000),
      deliveredAt: makeIso(-120_000),
      readBy: ["qa-chat-austin"],
      mentionedUserIds: [],
      author: {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "scout",
        status: "active",
      },
    },
    {
      id: teamFirstId,
      userId: "dev-user-mak",
      threadId: "team",
      text: "QA grouped message one",
      createdAt: makeIso(-20_000),
      deliveredAt: makeIso(-20_000),
      readBy: ["dev-user-mak"],
      mentionedUserIds: [],
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
    },
    {
      id: teamSecondId,
      userId: "dev-user-mak",
      threadId: "team",
      text: "QA grouped message two",
      createdAt: makeIso(-10_000),
      deliveredAt: makeIso(-10_000),
      readBy: ["dev-user-mak"],
      mentionedUserIds: [],
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
    },
  ];
  const directParticipants = [
    { id: "dev-user-mak", userId: "dev-user-mak", participantRole: "owner" },
    { id: "qa-chat-austin", userId: "qa-chat-austin", participantRole: "member" },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await fulfillQaChatPayload(route, serverMessages, {
        threadIds: ["team", "dm:dev-user-mak:qa-chat-austin"],
        threadOptions: { "dm:dev-user-mak:qa-chat-austin": { participants: directParticipants } },
      });
      return;
    }

    await fulfillQaChatPayload(route, serverMessages, {
      threadIds: ["team", "dm:dev-user-mak:qa-chat-austin"],
      threadOptions: { "dm:dev-user-mak:qa-chat-austin": { participants: directParticipants } },
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const currentUserId = currentUser.id || "dev-user-mak";
    const teammates = [
      {
        ...currentUser,
        id: currentUserId,
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        status: "active",
      },
      {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ];
    window.platformAuthStore.writeUsers?.(teammates);
    window.platformAuthStore.setCurrentUser?.(currentUserId);
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");
  await expect(page.locator(`[data-dashboard-chat-message-id="${teamFirstId}"]`)).toHaveClass(/is-grouped-with-next/);
  await expect(page.locator(`[data-dashboard-chat-message-id="${teamSecondId}"]`)).toHaveClass(/is-grouped-with-previous/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  const openWidgetCount = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!openWidgetCount) {
    await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");
  await expect(page.locator(`[data-dashboard-chat-message-id="${teamSecondId}"]`)).toHaveClass(/is-grouped-with-previous/);
});

test("Chat thread click does not change latest activity sorting", async ({ page }) => {
  const baseTime = Date.now();
  const latestTeamId = `qa-chat-latest-team-${baseTime}`;
  const olderDirectId = `qa-chat-clicked-direct-${baseTime}`;
  const makeIso = (offsetMs) => new Date(baseTime + offsetMs).toISOString();
  const serverMessages = [
    {
      id: olderDirectId,
      userId: "qa-chat-austin",
      threadId: "dm:dev-user-mak:qa-chat-austin",
      text: "Older clicked thread should stay below latest team chat",
      createdAt: makeIso(-180_000),
      deliveredAt: makeIso(-180_000),
      readBy: ["qa-chat-austin"],
      mentionedUserIds: [],
      author: {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "scout",
        status: "active",
      },
    },
    {
      id: latestTeamId,
      userId: "dev-user-mak",
      threadId: "team",
      text: "Latest team activity",
      createdAt: makeIso(-10_000),
      deliveredAt: makeIso(-10_000),
      readBy: ["dev-user-mak"],
      mentionedUserIds: [],
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
    },
  ];
  const directParticipants = [
    { id: "dev-user-mak", userId: "dev-user-mak", participantRole: "owner" },
    { id: "qa-chat-austin", userId: "qa-chat-austin", participantRole: "member" },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    await fulfillQaChatPayload(route, serverMessages, {
      threadIds: ["team", "dm:dev-user-mak:qa-chat-austin"],
      threadOptions: { "dm:dev-user-mak:qa-chat-austin": { participants: directParticipants } },
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const currentUserId = currentUser.id || "dev-user-mak";
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: currentUserId,
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        status: "active",
      },
      {
        id: "qa-chat-austin",
        firstName: "Austin",
        lastName: "Da Luz",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.(currentUserId);
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");

  const olderDirectThread = page.locator("[data-dashboard-chat-thread]").filter({ hasText: "Austin Da Luz" }).first();
  await expect(olderDirectThread).toBeVisible();
  await olderDirectThread.click();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  const openWidgetCount = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!openWidgetCount) {
    await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");
});

test("Chat thread click keeps long histories scrollable during background sync", async ({ page }) => {
  const baseTime = Date.now();
  const directThreadId = "dm:dev-user-mak:qa-chat-ceri";
  const pageErrors = [];
  const makeIso = (offsetMs) => new Date(baseTime + offsetMs).toISOString();
  const makeAuthor = (id, firstName, lastName, role = "coach") => ({
    id,
    firstName,
    lastName,
    role,
    status: "active",
  });
  const teamMessages = Array.from({ length: 80 }, (_, index) => {
    const isOwn = index % 3 === 0;
    const createdAt = makeIso(120_000 + index * 1000);
    return {
      id: `qa-chat-long-team-${baseTime}-${index + 1}`,
      userId: isOwn ? qaChatCurrentUserId : "qa-chat-ceri",
      threadId: "team",
      text: `QA long team thread message ${index + 1}`,
      createdAt,
      deliveredAt: createdAt,
      readBy: isOwn ? [qaChatCurrentUserId] : [],
      mentionedUserIds: [],
      author: isOwn
        ? makeAuthor(qaChatCurrentUserId, "Mak", "Lind", "team-admin")
        : makeAuthor("qa-chat-ceri", "Ceri", "Bowley", "scout"),
    };
  });
  const directMessages = Array.from({ length: 55 }, (_, index) => {
    const isOwn = index % 2 === 0;
    const createdAt = makeIso(index * 1000);
    return {
      id: `qa-chat-long-dm-${baseTime}-${index + 1}`,
      userId: isOwn ? qaChatCurrentUserId : "qa-chat-ceri",
      threadId: directThreadId,
      text: `QA long DM thread message ${index + 1}`,
      createdAt,
      deliveredAt: createdAt,
      readBy: isOwn ? [qaChatCurrentUserId] : [],
      mentionedUserIds: [],
      author: isOwn
        ? makeAuthor(qaChatCurrentUserId, "Mak", "Lind", "team-admin")
        : makeAuthor("qa-chat-ceri", "Ceri", "Bowley", "scout"),
    };
  });
  const serverMessages = [...directMessages, ...teamMessages];
  const directParticipants = [
    { id: qaChatCurrentUserId, userId: qaChatCurrentUserId, participantRole: "owner" },
    { id: "qa-chat-ceri", userId: "qa-chat-ceri", participantRole: "member" },
  ];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON();
      if (payload.action === "markThreadRead") {
        const threadId = getQaChatMessageThreadId({ threadId: payload.threadId });
        serverMessages.forEach((message) => {
          if (getQaChatMessageThreadId(message) === threadId) {
            message.readBy = Array.from(new Set([...(message.readBy || []), qaChatCurrentUserId]));
          }
        });
      }
    }
    await fulfillQaChatPayload(route, serverMessages, {
      threadIds: ["team", directThreadId],
      threadOptions: {
        [directThreadId]: {
          title: "Ceri Bowley",
          participants: directParticipants,
        },
      },
    });
  });

  const readThreadViewState = () =>
    page.locator("[data-dashboard-chat-list]").evaluate((list) => {
      const listRect = list.getBoundingClientRect();
      const visibleText = Array.from(list.querySelectorAll("[data-dashboard-chat-message-card]"))
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        })
        .map((item) => item.textContent || "")
        .join("\n");
      const styles = window.getComputedStyle(list);
      return {
        activeThread: list.getAttribute("data-dashboard-chat-active-thread") || "",
        display: styles.display,
        scrollBehavior: styles.scrollBehavior,
        scrollTop: list.scrollTop,
        maxScrollTop: Math.max(0, list.scrollHeight - list.clientHeight),
        visibleText,
      };
    });

  const boot = await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: "team-admin",
        status: "active",
      },
      {
        id: "qa-chat-ceri",
        firstName: "Ceri",
        lastName: "Bowley",
        role: "scout",
        status: "active",
        team: currentUser.team || "North Carolina Courage",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.("dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-thread]").first()).toHaveAttribute("data-dashboard-chat-thread", "team");
  await expect
    .poll(async () => (await readThreadViewState()).visibleText, { timeout: 7_000 })
    .toContain("QA long team thread message 80");

  await expect
    .poll(
      async () => {
        const state = await readThreadViewState();
        return {
          activeThread: state.activeThread,
          display: state.display,
          scrollBehavior: state.scrollBehavior,
          isScrolled: state.scrollTop > 0,
          hasLongHistory: state.maxScrollTop > 400,
        };
      },
      { timeout: 7_000 }
    )
    .toEqual({
      activeThread: "team",
      display: "flex",
      scrollBehavior: "auto",
      isScrolled: true,
      hasLongHistory: true,
    });

  const idleMutationCount = await page.evaluate(async () => {
    const root = document.querySelector(".dashboard-chat-widget");
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.reduce(
        (total, record) => total + record.addedNodes.length + record.removedNodes.length + (record.type === "attributes" ? 1 : 0),
        0
      );
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "class"] });
    await new Promise((resolve) => window.setTimeout(resolve, 4200));
    observer.disconnect();
    return count;
  });
  expect(idleMutationCount).toBeLessThanOrEqual(60);

  await page.locator("[data-dashboard-chat-list]").evaluate((list) => {
    list.scrollTo({ top: 0, behavior: "auto" });
  });
  await expect.poll(async () => (await readThreadViewState()).scrollTop, { timeout: 3_000 }).toBeLessThan(4);
  await page.locator("[data-dashboard-chat-list]").hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => (await readThreadViewState()).scrollTop, { timeout: 3_000 }).toBeGreaterThan(80);

  const directThread = page.locator(`[data-dashboard-chat-thread="${directThreadId}"]`).first();
  await expect(directThread).toBeVisible();
  await directThread.click();
  await expect
    .poll(async () => (await readThreadViewState()).activeThread, { timeout: 7_000 })
    .toBe(directThreadId);
  await expect
    .poll(async () => (await readThreadViewState()).visibleText, { timeout: 7_000 })
    .toContain("QA long DM thread message 55");

  const directState = await readThreadViewState();
  expect(directState.scrollTop).toBeGreaterThan(0);
  expect(directState.maxScrollTop).toBeGreaterThan(400);
  expect(directState.visibleText).not.toContain("QA long team thread message 80");
  expect(pageErrors).toEqual([]);
  expect(boot.pageErrors).toEqual([]);
});

test("Chat delete message does not resurrect after reload", async ({ page }) => {
  const messageId = `qa-chat-delete-${Date.now()}`;
  const messageText = `QA delete stays deleted ${Date.now()}`;
  const deleteActions = [];
  const now = new Date().toISOString();
  const serverMessages = [
    {
      id: messageId,
      userId: "dev-user-mak",
      threadId: "team",
      text: messageText,
      createdAt: now,
      deliveredAt: now,
      readBy: ["dev-user-mak"],
      mentionedUserIds: [],
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "admin",
        status: "active",
      },
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    const payload = request.postDataJSON();
    if (payload.action === "deleteMessage") {
      deleteActions.push(payload);
      serverMessages.splice(0, serverMessages.length);
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: "dev-user-mak",
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: "admin",
        status: "active",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.("dev-user-mak");
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator(`[data-dashboard-chat-message-id="${messageId}"]`)).toBeVisible();

  const message = page.locator(`[data-dashboard-chat-message-id="${messageId}"]`);
  await message.locator(".dashboard-chat-message-menu summary").click();
  const removeMessageButton = page.locator(`[data-dashboard-remove-message="${messageId}"]`);
  await expect(removeMessageButton).toHaveCount(1);
  await removeMessageButton.dispatchEvent("click");
  await expect(page.locator(".dashboard-chat-confirm-card")).toBeVisible();
  await page.locator("[data-dashboard-chat-confirm-apply]").click();

  await expect(page.locator(`[data-dashboard-chat-message-id="${messageId}"]`)).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-list]")).not.toContainText(messageText);
  expect(deleteActions.some((payload) => payload.action === "deleteMessage" && payload.messageId === messageId)).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  const openWidgetCount = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!openWidgetCount) {
    await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator(`[data-dashboard-chat-message-id="${messageId}"]`)).toHaveCount(0);
  await expect(page.locator("[data-dashboard-chat-list]")).not.toContainText(messageText);
});

test("Chat compose send clears input and keeps sent message after reload", async ({ page }) => {
  const messageText = `QA compose send ${Date.now()}`;
  const chatActions = [];
  const serverMessages = [];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    const payload = request.postDataJSON();
    chatActions.push(payload);
    if (payload.action !== "sendMessage") {
      await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
      return;
    }

    const now = new Date().toISOString();
    const message = {
      id: payload.clientMessageId || payload.id || `qa-sent-${Date.now()}`,
      userId: "dev-user-mak",
      threadId: payload.threadId || "team",
      text: payload.text,
      createdAt: now,
      deliveredAt: now,
      readBy: ["dev-user-mak"],
      mentionedUserIds: payload.mentionedUserIds || [],
      status: "sent",
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
    };
    serverMessages.push(message);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        message,
        messages: serverMessages,
        thread: {
          id: "team",
          threadId: "team",
          legacyThreadId: "team",
          type: "team",
          title: "North Carolina Courage Chat",
          messageCount: 1,
          unreadCount: 0,
          lastMessage: message,
          lastMessageAt: now,
        },
        threads: [createQaChatThread("team", serverMessages)],
        pagination: {},
      }),
    });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    const currentUser = window.platformAuthStore.getCurrentUser?.() || {};
    const currentUserId = currentUser.id || "dev-user-mak";
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.writeUsers?.([
      {
        ...currentUser,
        id: currentUserId,
        firstName: currentUser.firstName || "Mak",
        lastName: currentUser.lastName || "Lind",
        role: currentUser.role || "coach",
        status: "active",
      },
    ]);
    window.platformAuthStore.setCurrentUser?.(currentUserId);
  });

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await page.locator("[data-dashboard-chat-input]").fill(messageText);
  await page.locator("[data-dashboard-chat-form] button[type='submit']").click();

  await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText);
  expect(chatActions.some((payload) => payload.action === "sendMessage" && payload.text === messageText)).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  const openWidgetCount = await page.locator(".dashboard-chat-widget.is-open").count();
  if (!openWidgetCount) {
    await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  }

  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();
  await expect(page.locator("[data-dashboard-chat-input]")).toHaveValue("");
  await expect(page.locator("[data-dashboard-chat-list]")).toContainText(messageText);
});

test("Chat attachment preview opens above chat with toolbar controls", async ({ page }) => {
  const messageId = `qa-chat-attachment-${Date.now()}`;
  const attachmentName = "qa-preview.svg";
  const signedUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="18" fill="#0f172a"/><text x="160" y="96" text-anchor="middle" font-family="Arial" font-size="24" fill="#ffffff">QA preview</text></svg>')}`;
  const now = new Date().toISOString();
  const serverMessages = [
    {
      id: messageId,
      userId: "dev-user-mak",
      threadId: "team",
      text: `Attachment: ${attachmentName}`,
      createdAt: now,
      deliveredAt: now,
      readBy: ["dev-user-mak"],
      mentionedUserIds: [],
      author: {
        id: "dev-user-mak",
        firstName: "Mak",
        lastName: "Lind",
        role: "coach",
        status: "active",
      },
      attachments: [
        {
          id: `${messageId}-file`,
          bucket: "chat-attachments",
          path: "qa/preview.svg",
          fileName: attachmentName,
          mimeType: "image/svg+xml",
          byte_size: 2048,
          status: "ready",
        },
      ],
    },
  ];

  await installQaChatApiAuth(page);
  await page.route("**/api/chat**", async (route) => {
    await fulfillQaChatPayload(route, serverMessages, { threadIds: ["team"] });
  });

  await bootApp(page);
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate((previewUrl) => {
    window.platformAuthStore.getAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-chat-token";
    window.platformAuthStore.getSupabaseClient = () => ({
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: previewUrl } }),
        }),
      },
      channel: () => ({
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      }),
      removeChannel: () => {},
    });
  }, signedUrl);

  await page.locator("[data-dashboard-chat-widget-toggle]").first().click();
  await expect(page.locator(".dashboard-chat-widget.is-open")).toBeVisible();

  const attachmentButton = page.locator("[data-dashboard-chat-attachment-preview]").filter({ hasText: attachmentName }).first();
  await expect(attachmentButton).toBeEnabled({ timeout: 6_000 });
  await attachmentButton.click();

  const preview = page.locator(".dashboard-chat-attachment-preview");
  await expect(preview).toBeVisible();
  await expect(page.locator("[data-chat-attachment-preview-title]")).toContainText(attachmentName);
  await expect(page.locator("[data-chat-attachment-preview-body]")).toBeVisible();
  await expect(page.locator("[data-chat-attachment-preview-download]")).toBeVisible();
  await expect(page.locator("[data-chat-attachment-preview-save]")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
});

test("Schedule edits persist after refresh", async ({ page }) => {
  const title = `QA Schedule ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "schedule");

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

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openWorkspace(page, "schedule");
  await expectStorageContains(page, scheduleKey, title);
  await expect(page.locator(`.schedule-planner-day[data-schedule-date="${targetDate}"]`)).toContainText(title);
});

test("Schedule Today anchors Planner to the real current date", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 0,
        selectedDate: "2026-01-15",
        viewMode: "overview",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [],
      })
    );
  }, { key: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");
  await page.locator("#scheduleTodayButton").click();

  await expect(page.locator("#scheduleOverviewViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
  await expect(page.locator(".schedule-planner-month h3").first()).toHaveText("May");
  await expect(page.locator('.schedule-planner-day.is-selected[data-schedule-date="2026-05-09"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          selectedDate: state.selectedDate,
          selectedMonthIndex: state.selectedMonthIndex,
        };
      }, scheduleKey)
    )
    .toEqual({
      selectedDate: "2026-05-09",
      selectedMonthIndex: 4,
    });
});

test("Home places compact meeting cards side by side beside the calendar and opens selected day details", async ({ page }) => {
  const lineupSlotIds = ["gk", "lb", "lcb", "rcb", "rb", "lcm", "cm", "rcm", "lw", "st", "rw"];
  const lineupPlayers = lineupSlotIds.map((slotId, index) => ({
    id: `home-lineup-${index + 1}`,
    name:
      index === 0
        ? "Avery Stone"
        : index === 1
          ? "Blake River"
          : index === 2
            ? "Casey Vale"
            : index === 3
              ? "Drew Lane"
              : `${slotId.toUpperCase()} Player`,
    number: String(index + 1),
    primaryRole: index === 0 ? "Goalkeeper" : "",
    birthDate:
      index === 0
        ? "2001-05-12"
        : index === 1
          ? "2000-05-14"
          : index === 2
            ? "2003-05-18"
            : index === 3
              ? "1999-06-02"
              : "",
  }));
  const lineupAssignments = Object.fromEntries(
    lineupSlotIds.map((slotId, index) => [slotId, lineupPlayers[index].id])
  );
  await page.addInitScript(({ key, profilesKey, presentationStorageKey, players, assignments }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        viewMode: "overview",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          { id: "home-schedule-past-match", date: "2026-05-02", time: "18:00", type: "match", title: "NCC - Orlando" },
          { id: "home-schedule-match", date: "2026-05-16", time: "19:00", type: "match", title: "NCC - Boston" },
        ],
      })
    );
    window.localStorage.setItem(
      profilesKey,
      JSON.stringify({
        rosterVersion: "qa-home-lineup-v1",
        schemaVersion: 3,
        selectedPlayerId: players[0].id,
        players,
        removedPlayerIds: [],
      })
    );
    window.localStorage.setItem(
      presentationStorageKey,
      JSON.stringify({
        decks: {
          "2026-05-01": {
            updatedAt: "2026-05-01T15:00:00.000Z",
            infoSlides: [
              { layout: "starting-xi", formation: "4-3-3", lineup: assignments },
            ],
          },
          "2026-05-02": {
            updatedAt: "2026-05-02T08:00:00.000Z",
            infoSlides: [
              { layout: "match-squad", matchSquadPlayerIds: players.map((player) => player.id) },
            ],
          },
          "2026-05-15": {
            updatedAt: "2026-05-15T15:00:00.000Z",
            infoSlides: [
              { layout: "starting-xi", formation: "4-3-3", lineup: assignments },
            ],
          },
          "2026-05-16": {
            updatedAt: "2026-05-16T08:00:00.000Z",
            infoSlides: [
              { layout: "match-squad", matchSquadPlayerIds: players.map((player) => player.id) },
            ],
          },
        },
      })
    );
  }, {
    key: scheduleKey,
    profilesKey: playerProfilesKey,
    presentationStorageKey: presentationKey,
    players: lineupPlayers,
    assignments: lineupAssignments,
  });

  await bootApp(page);
  await openWorkspace(page, "home");

  const presentationBand = page.locator(".dashboard-presentation-band");
  await expect(presentationBand.locator(".dashboard-presentation-card")).toHaveCount(2);
  await expect(presentationBand.locator("#dashboardSchedulePreview")).toBeVisible();
  const birthdayCard = presentationBand.locator(".dashboard-birthday-card");
  const birthdaySpotlight = birthdayCard.locator(".dashboard-birthday-spotlight");
  await expect(birthdaySpotlight).toContainText("Avery Stone");
  await expect(birthdaySpotlight).toContainText("May 12 · In 3 days");
  await expect(birthdaySpotlight).not.toContainText("#1");
  await expect(birthdaySpotlight).not.toContainText("Goalkeeper");
  await expect(birthdayCard.locator("[data-dashboard-birthday-countdown]")).toHaveCount(0);
  await expect(birthdayCard.locator(".dashboard-birthday-item")).toHaveCount(2);
  await expect(birthdayCard).toContainText("Blake River");
  await expect(birthdayCard).toContainText("Casey Vale");
  await expect(birthdayCard).not.toContainText("Drew Lane");
  await expect(birthdayCard.locator("[data-dashboard-open-birthday-calendar]")).toBeVisible();
  await birthdayCard.locator("[data-dashboard-open-birthday-calendar]").click();
  const birthdayModal = page.locator("[data-dashboard-birthday-modal]");
  await expect(birthdayModal).toBeVisible();
  await expect(birthdayModal).toContainText("Avery Stone");
  await expect(birthdayModal).toContainText("Blake River");
  await expect(birthdayModal).toContainText("Casey Vale");
  await expect(birthdayModal).toContainText("Drew Lane");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-dashboard-birthday-modal]")).toHaveCount(0);
  const layoutBoxes = await presentationBand
    .locator(":scope > .dashboard-presentation-stack > .dashboard-presentation-card, :scope > .dashboard-presentation-stack > .dashboard-upcoming-lineup-card, :scope > .dashboard-schedule-preview")
    .evaluateAll((columns) =>
      columns.map((column) => {
        const rect = column.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    );
  expect(layoutBoxes).toHaveLength(4);
  const [teamMeeting, technicalMeeting, lineupCard, calendarBox] = layoutBoxes;
  expect(Math.abs(teamMeeting.y - technicalMeeting.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(teamMeeting.width - technicalMeeting.width)).toBeLessThanOrEqual(1);
  expect(technicalMeeting.x).toBeGreaterThan(teamMeeting.x + teamMeeting.width);
  expect(calendarBox.x).toBeGreaterThan(technicalMeeting.x + technicalMeeting.width);
  expect(Math.abs(lineupCard.x - technicalMeeting.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(lineupCard.width - technicalMeeting.width)).toBeLessThanOrEqual(1);
  expect(lineupCard.y).toBeGreaterThanOrEqual(technicalMeeting.y + technicalMeeting.height);
  expect(Math.abs(lineupCard.y + lineupCard.height - (calendarBox.y + calendarBox.height))).toBeLessThanOrEqual(1.5);
  expect(calendarBox.height).toBeGreaterThan(teamMeeting.height * 1.9);
  expect(teamMeeting.width).toBeGreaterThan(260);
  expect(teamMeeting.width).toBeLessThan(calendarBox.width * 1.45);
  expect(calendarBox.width).toBeGreaterThan(320);
  expect(calendarBox.width).toBeLessThanOrEqual(352);
  const stableHomeCardLocator = presentationBand.locator(
    ".dashboard-presentation-stack > .dashboard-presentation-card, .dashboard-presentation-stack > .dashboard-birthday-strip .dashboard-birthday-card, .dashboard-presentation-stack > .dashboard-upcoming-lineup-card"
  );
  const stableHomeCardHeightsBefore = await stableHomeCardLocator.evaluateAll((cards) =>
    cards.map((card) => card.getBoundingClientRect().height)
  );
  expect(stableHomeCardHeightsBefore).toHaveLength(4);
  const meetingTitleBoxes = await presentationBand
    .locator(".dashboard-presentation-copy h2")
    .evaluateAll((titles) =>
      titles.map((title) => {
        const styles = window.getComputedStyle(title);
        return {
          clientWidth: title.clientWidth,
          scrollWidth: title.scrollWidth,
          clientHeight: title.clientHeight,
          lineHeight: parseFloat(styles.lineHeight),
          whiteSpace: styles.whiteSpace,
        };
      })
    );
  for (const titleBox of meetingTitleBoxes) {
    expect(titleBox.whiteSpace).toBe("nowrap");
    expect(titleBox.scrollWidth).toBeLessThanOrEqual(titleBox.clientWidth + 1);
    expect(titleBox.clientHeight).toBeLessThanOrEqual(titleBox.lineHeight * 1.35);
  }
  const presentationButtonBoxes = await presentationBand
    .locator(".dashboard-presentation-card")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const cardRect = card.getBoundingClientRect();
        const buttonRect = card.querySelector("[data-dashboard-open-presentation]")?.getBoundingClientRect();
        return {
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          buttonLeft: buttonRect?.left ?? 0,
          buttonRight: buttonRect?.right ?? 0,
          buttonWidth: buttonRect?.width ?? 0,
        };
      })
    );
  for (const box of presentationButtonBoxes) {
    expect(box.buttonWidth).toBeGreaterThan(48);
    expect(box.buttonLeft).toBeGreaterThan(box.cardLeft);
    expect(box.buttonRight).toBeLessThanOrEqual(box.cardRight - 1);
  }
  const lineupPanel = presentationBand.locator(".dashboard-upcoming-lineup-card");
  await expect(lineupPanel).toContainText("NCC - Boston");
  await expect(lineupPanel).toContainText("11 selected");
  await expect(lineupPanel).toContainText("11/11");
  await expect(lineupPanel).toContainText("4-3-3");
  await expect(lineupPanel.locator(".dashboard-lineup-pitch, .dashboard-lineup-slot")).toHaveCount(0);
  await expect(lineupPanel).not.toContainText("Avery Stone");
  await expect(lineupPanel.locator(".dashboard-match-gateway-head h2")).toHaveText(
    "NCC - Boston (Sat 16 May · 19:00)"
  );
  await expect(lineupPanel.locator(".dashboard-match-gateway-head > span")).toHaveCount(0);
  await expect(lineupPanel.locator(".dashboard-match-gateway-summary")).toHaveCount(0);
  await expect(lineupPanel).not.toContainText("Prepare the matchday squad");
  await expect(lineupPanel.locator(".dashboard-match-selection-actions [data-dashboard-open-match-selection]")).toHaveCount(2);
  await expect(
    lineupPanel.locator('.dashboard-match-selection-actions [data-match-selection-target="match-squad"]')
  ).toHaveAttribute("data-match-selection-date", "2026-05-16");
  await expect(
    lineupPanel.locator('.dashboard-match-selection-actions [data-match-selection-target="starting-xi"]')
  ).toHaveAttribute("data-match-selection-date", "2026-05-15");
  const calendarDaySize = await presentationBand.locator(".dashboard-schedule-day").first().evaluate((day) => {
    const rect = day.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(Math.abs(calendarDaySize.width - calendarDaySize.height)).toBeLessThanOrEqual(1);

  const calendar = presentationBand.locator("#dashboardSchedulePreview");
  await expect(calendar.locator("[data-dashboard-schedule-prev]")).toBeVisible();
  await expect(calendar.locator("[data-dashboard-schedule-today]")).toBeVisible();
  await expect(calendar.locator("[data-dashboard-schedule-next]")).toBeVisible();

  await calendar.locator("[data-dashboard-schedule-next]").click();
  await expect(calendar.locator("h2")).toHaveText("June");
  await calendar.locator("[data-dashboard-schedule-prev]").click();
  await expect(calendar.locator("h2")).toHaveText("May");
  await calendar.locator("[data-dashboard-schedule-next]").click();
  await calendar.locator("[data-dashboard-schedule-today]").click();
  await expect(calendar.locator("h2")).toHaveText("May");
  await expect(calendar.locator("#dashboardScheduleDayTitle")).toHaveText("Saturday 9 May");
  const expandedCalendarHeight = await calendar.evaluate((element) => element.getBoundingClientRect().height);
  const stableHomeCardHeightsAfter = await stableHomeCardLocator.evaluateAll((cards) =>
    cards.map((card) => card.getBoundingClientRect().height)
  );
  expect(expandedCalendarHeight).toBeGreaterThan(calendarBox.height + 60);
  stableHomeCardHeightsAfter.forEach((height, index) => {
    expect(Math.abs(height - stableHomeCardHeightsBefore[index])).toBeLessThanOrEqual(1.5);
  });
  await expect
    .poll(() => calendar.locator(".dashboard-schedule-day-panel").evaluate((panel) => window.getComputedStyle(panel).opacity))
    .toBe("1");

  await calendar.locator('[data-dashboard-select-schedule-date="2026-05-16"]').click();
  await expect(page.locator('[data-workspace-view="home"].is-active')).toBeVisible();
  await expect(calendar.locator("#dashboardScheduleDayTitle")).toHaveText("Saturday 16 May");
  await expect(calendar.locator(".dashboard-schedule-day-event")).toContainText("NCC - Boston");
  await calendar.locator('[data-dashboard-open-schedule-date="2026-05-16"]').click();

  await expect(page.locator('[data-workspace-view="schedule"].is-active')).toBeVisible();
  await expect(page.locator("#scheduleOverviewViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
  await expect(page.locator('.schedule-planner-day.is-selected[data-schedule-date="2026-05-16"]')).toBeVisible();

  await openWorkspace(page, "home");
  const homeLineupPanel = page.locator(".dashboard-upcoming-lineup-card");
  await homeLineupPanel.locator(".dashboard-match-history summary").click();
  const pastMatch = homeLineupPanel.locator(".dashboard-match-history-item", { hasText: "NCC - Orlando" });
  await expect(pastMatch).toBeVisible();
  const historyActions = pastMatch.locator(".dashboard-match-history-actions > .dashboard-match-selection-row");
  await expect(historyActions).toHaveCount(2);
  const measureHistoryLayout = () => pastMatch.evaluate((item) => {
    const header = item.querySelector("header")?.getBoundingClientRect();
    const actionElements = Array.from(item.querySelectorAll(".dashboard-match-history-actions > .dashboard-match-selection-row"));
    const actions = actionElements.map((action) => action.getBoundingClientRect());
    return {
      headerBottom: header?.bottom || 0,
      firstTop: actions[0]?.top || 0,
      secondTop: actions[1]?.top || 0,
      firstRight: actions[0]?.right || 0,
      secondLeft: actions[1]?.left || 0,
      actionWidths: actions.map((action) => action.width),
      labelsFit: actionElements.every((action) => {
        const label = action.querySelector(".dashboard-match-selection-copy strong");
        return !label || label.scrollWidth <= label.clientWidth;
      }),
    };
  });
  const historyLayout = await measureHistoryLayout();
  expect(historyLayout.firstTop).toBeGreaterThanOrEqual(historyLayout.headerBottom - 1);
  expect(Math.abs(historyLayout.firstTop - historyLayout.secondTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(historyLayout.firstRight - historyLayout.secondLeft)).toBeLessThanOrEqual(1);
  expect(historyLayout.labelsFit).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHistoryLayout = await measureHistoryLayout();
  const mobileMatchHeadingFits = await homeLineupPanel.locator(".dashboard-match-gateway-head h2").evaluate((heading) => {
    const headingRect = heading.getBoundingClientRect();
    const cardRect = heading.closest(".dashboard-upcoming-lineup-card")?.getBoundingClientRect();
    return Boolean(cardRect && headingRect.left >= cardRect.left && headingRect.right <= cardRect.right);
  });
  expect(Math.abs(mobileHistoryLayout.firstTop - mobileHistoryLayout.secondTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(mobileHistoryLayout.firstRight - mobileHistoryLayout.secondLeft)).toBeLessThanOrEqual(1);
  expect(Math.min(...mobileHistoryLayout.actionWidths)).toBeGreaterThan(120);
  expect(mobileHistoryLayout.labelsFit).toBe(true);
  expect(mobileMatchHeadingFits).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await pastMatch.locator('[data-match-selection-target="starting-xi"]').click();
  const presentation = page.locator("#presentationModeRoot");
  await expect(presentation).toBeVisible();
  await expect(presentation.locator(".presentation-lineup-layout")).toBeVisible();
  await expect(presentation).toContainText("Starting XI vs NCC - Orlando");
  await presentation.getByRole("button", { name: "Close presentation" }).click();
  await homeLineupPanel.locator(".dashboard-match-history summary").click();

  await homeLineupPanel
    .locator('.dashboard-match-selection-actions [data-match-selection-target="starting-xi"]')
    .click();
  await expect(presentation).toBeVisible();
  await expect(presentation.locator(".presentation-lineup-layout")).toBeVisible();
  await expect(presentation).toContainText("Starting XI vs NCC - Boston");
  await expect(presentation.locator("[data-presentation-date-input]")).toHaveValue("2026-05-15");
});

test("Home highlights a birthday today and Team Meeting opens the generated birthday slide", async ({ page }) => {
  await page.addInitScript(({ profilesKey }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-09-12T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      profilesKey,
      JSON.stringify({
        rosterVersion: "qa-home-birthday-v1",
        schemaVersion: 3,
        selectedPlayerId: "birthday-player-1",
        players: [
          {
            id: "birthday-player-1",
            name: "Evelyn Ijeh",
            birthDate: "2001-09-12",
            countsInSquad: true,
            rosterType: "squad",
            rosterOrder: 1,
          },
        ],
        removedPlayerIds: [],
      })
    );
  }, { profilesKey: playerProfilesKey });

  await bootApp(page);
  await openWorkspace(page, "home");

  const birthdayCard = page.locator(".dashboard-birthday-card");
  const spotlight = birthdayCard.locator(".dashboard-birthday-spotlight");
  const age = spotlight.locator(".dashboard-birthday-age");
  await expect(birthdayCard).toHaveClass(/has-birthday-today/);
  await expect(birthdayCard).toContainText("Birthday today");
  await expect(spotlight).toContainText("Evelyn Ijeh");
  await expect(spotlight).toContainText("Sep 12 · Today");
  await expect(age).toContainText("25");
  await expect(page.locator(".dashboard-birthday-cake")).toHaveCount(0);
  const spotlightStyles = await spotlight.evaluate((element) => {
    const spotlightStyle = window.getComputedStyle(element);
    const ageStyle = window.getComputedStyle(element.querySelector(".dashboard-birthday-age"));
    return {
      backgroundImage: spotlightStyle.backgroundImage,
      ageBackgroundImage: ageStyle.backgroundImage,
      ageBorderRadius: ageStyle.borderRadius,
    };
  });
  expect(spotlightStyles.backgroundImage).toBe("none");
  expect(spotlightStyles.ageBackgroundImage).toBe("none");
  expect(spotlightStyles.ageBorderRadius).toBe("0px");

  await page
    .locator('.dashboard-presentation-card[data-dashboard-presentation-type="team"] [data-dashboard-open-presentation]')
    .click();
  const presentation = page.locator("#presentationModeRoot");
  await expect(presentation).toBeVisible();
  await expect(presentation.locator('[data-presentation-goto="1"]')).toContainText("Birthday");
  await expect(presentation.locator('[data-presentation-goto="1"]')).toHaveAttribute("draggable", "false");
  await presentation.locator('[data-presentation-goto="1"]').click();
  const birthdaySlide = presentation.locator(".presentation-info-sheet.is-system-birthday");
  await expect(birthdaySlide).toBeVisible();
  await expect(birthdaySlide).toContainText("Happy Birthday, Evelyn Ijeh!");
  await expect(birthdaySlide).toContainText("Evelyn Ijeh turns 25 today.");
  await expect(birthdaySlide.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-send-slide-menu]")).toHaveCount(0);
  await expect(presentation.locator("[data-presentation-delete-slide]")).toBeDisabled();
  await expect(presentation).not.toContainText("Generated from player profiles");
  await birthdaySlide.click({ button: "right" });
  await expect(presentation.locator("[data-presentation-context-menu]")).toHaveCount(0);
  await presentation.getByRole("button", { name: "Close presentation" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await spotlight.evaluate((element) => {
    const card = element.getBoundingClientRect();
    const ageBox = element.querySelector(".dashboard-birthday-age")?.getBoundingClientRect();
    return {
      cardLeft: card.left,
      cardRight: card.right,
      ageLeft: ageBox?.left || 0,
      ageRight: ageBox?.right || 0,
    };
  });
  expect(mobileBounds.ageLeft).toBeGreaterThan(mobileBounds.cardLeft);
  expect(mobileBounds.ageRight).toBeLessThanOrEqual(mobileBounds.cardRight + 1);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .locator('.dashboard-presentation-card[data-dashboard-presentation-type="technical"] [data-dashboard-open-presentation]')
    .click();
  await expect(presentation).toBeVisible();
  await expect(presentation.locator(".presentation-info-sheet.is-system-birthday")).toHaveCount(0);
  await expect(presentation.locator(".presentation-slide-tabs")).not.toContainText("Birthday");
});

test("Schedule Planner copies and pastes selected days with command shortcuts", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        viewMode: "overview",
        overviewSpan: 3,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          {
            id: "copy-source-training",
            date: "2026-05-09",
            time: "10:00",
            type: "training",
            title: "Copied Training",
            note: "Overview copy source",
          },
          {
            id: "copy-source-meeting",
            date: "2026-05-09",
            time: "13:00",
            type: "meeting",
            title: "Copied Meeting",
            note: "Second source plan",
          },
          {
            id: "paste-target-existing",
            date: "2026-05-12",
            time: "09:00",
            type: "off",
            title: "Existing Target",
            note: "Should be replaced",
          },
        ],
      })
    );
  }, { key: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
  await page.locator('.schedule-planner-date[data-schedule-date="2026-05-09"]').click();
  await expect(page.locator('.schedule-planner-day[data-schedule-date="2026-05-09"]')).toContainText("Copied Training");

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }));
  });
  await page.locator('.schedule-planner-date[data-schedule-date="2026-05-12"]').click();
  await expect(page.locator('.schedule-planner-day.is-selected[data-schedule-date="2026-05-12"]')).toBeVisible();

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "v", metaKey: true, bubbles: true, cancelable: true }));
  });

  const targetDay = page.locator('.schedule-planner-day[data-schedule-date="2026-05-12"]');
  await expect(targetDay).toContainText("Existing Target");
  await confirmPlatformDialog(page);
  await expect(targetDay).toContainText("Copied Training");
  await expect(targetDay).toContainText("Copied Meeting");
  await expect(targetDay).not.toContainText("Existing Target");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return state.events
          .filter((event) => event.date === "2026-05-12")
          .map((event) => event.title)
          .sort();
      }, scheduleKey)
    )
    .toEqual(["Copied Meeting", "Copied Training"]);
});

test("Schedule Planner supports modifier multi-select and confirms every delete", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        viewMode: "planner",
        overviewSpan: 3,
        importVersion: "ncc-2026-numbers-v1",
        dayNotes: { "2026-05-11": "Keep this note until deletion is confirmed" },
        events: [
          { id: "multi-first", date: "2026-05-09", time: "10:00", type: "training", title: "First plan" },
          { id: "multi-second", date: "2026-05-10", time: "13:00", type: "meeting", title: "Second plan" },
          { id: "multi-third", date: "2026-05-11", time: "15:00", type: "travel", title: "Third plan" },
        ],
      })
    );
  }, { key: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");

  const first = page.locator('[data-planner-event-id="multi-first"]');
  const second = page.locator('[data-planner-event-id="multi-second"]');
  const third = page.locator('[data-planner-event-id="multi-third"]');

  await first.click();
  await second.click({ modifiers: ["Meta"] });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await third.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  });
  await expect(page.locator(".schedule-planner-event-chip.is-selected")).toHaveCount(3);

  await second.click();
  await expect(page.locator(".schedule-planner-event-chip.is-selected")).toHaveCount(1);
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await first.click();
  await second.click({ modifiers: ["Meta"] });
  await expect(page.locator(".schedule-planner-event-chip.is-selected")).toHaveCount(2);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }));
  });
  await expect(page.locator("[data-schedule-feedback-portal]")).toContainText("Copied 2 plans");

  await page.keyboard.press("Delete");
  const deleteDialog = page.locator(".platform-confirm-dialog");
  await expect(deleteDialog.locator("h2")).toHaveText("Delete 2 plans?");
  await deleteDialog.locator("[data-platform-confirm-cancel]").last().click();
  await expect(deleteDialog).toHaveCount(0);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").events?.map((event) => event.id), scheduleKey)
    )
    .toEqual(["multi-first", "multi-second", "multi-third"]);

  await page.keyboard.press("Delete");
  await confirmPlatformDialog(page, "Delete 2 plans?");
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  await expect(third).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").events?.map((event) => event.id), scheduleKey)
    )
    .toEqual(["multi-third"]);

  const noteDay = page.locator('.schedule-planner-date[data-schedule-date="2026-05-11"]');
  await noteDay.click({ button: "right" });
  await page.locator('.schedule-planner-context-menu [data-open-schedule-day-note="2026-05-11"]').click();
  await page.locator('[data-clear-schedule-day-note="2026-05-11"]').click();
  await expect(page.locator(".platform-confirm-dialog h2")).toHaveText("Clear note?");
  await page.locator(".platform-confirm-dialog [data-platform-confirm-cancel]").last().click();
  await expect(page.locator('[data-schedule-day-note="2026-05-11"]')).toHaveValue(
    "Keep this note until deletion is confirmed"
  );

  await page.locator('[data-clear-schedule-day-note="2026-05-11"]').click();
  await confirmPlatformDialog(page, "Clear note?");
  await expect(page.locator('[data-schedule-planner-note-dialog="2026-05-11"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").dayNotes?.["2026-05-11"], scheduleKey)
    )
    .toBeUndefined();
});

test("Schedule Planner confirms a duplicate merge before edit removes a plan", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-14",
        viewMode: "planner",
        overviewSpan: 3,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          { id: "merge-existing", date: "2026-05-14", time: "10:00", type: "training", title: "Training" },
          { id: "merge-editing", date: "2026-05-14", time: "10:00", type: "meeting", title: "Meeting" },
        ],
      })
    );
  }, { key: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");

  await page.locator('[data-planner-event-id="merge-editing"]').dblclick();
  const editor = page.locator('[data-schedule-planner-edit-event="merge-editing"] [name="plannerTitle"]');
  await editor.fill("Training");
  await editor.press("Enter");

  const dialog = page.locator(".platform-confirm-dialog");
  await expect(dialog.locator("h2")).toHaveText("Merge duplicate plans?");
  await dialog.locator("[data-platform-confirm-cancel]").last().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-planner-event-id="merge-existing"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").events?.map((event) => event.id), scheduleKey)
    )
    .toEqual(["merge-existing", "merge-editing"]);

  await editor.press("Enter");
  await confirmPlatformDialog(page, "Merge duplicate plans?");
  await expect(page.locator('[data-planner-event-id="merge-existing"]')).toBeVisible();
  await expect(page.locator('[data-planner-event-id="merge-editing"]')).toHaveCount(0);
});

test("Schedule Planner migrates legacy state and removes duplicate plans", async ({ page }) => {
  await page.addInitScript(({ scheduleKey, sessionPlannerKey, periodizationKey }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        viewMode: "month",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          {
            id: "qa-week-training",
            date: "2026-05-09",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "QA week operations",
          },
          {
            id: "qa-week-training-duplicate",
            date: "2026-05-09",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "Same imported training with a slightly different note",
          },
        ],
      })
    );
    window.localStorage.setItem(
      sessionPlannerKey,
      JSON.stringify({
        selectedDate: "2026-05-09",
        sessions: {
          "2026-05-09": {
            id: "session-2026-05-09",
            date: "2026-05-09",
            title: "Training Session",
            theme: "QA operations",
            selectedBlockId: "warm-up",
            blocks: [
              {
                id: "warm-up",
                label: "Warm Up",
                title: "Activation",
                focus: "Ready the group",
                minutes: 15,
                intensity: 2,
                pitchSize: "20m x 20m",
                diagram: "build-up",
              },
            ],
          },
        },
      })
    );
    window.localStorage.setItem(
      periodizationKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-09",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-09": {
            seasonPhase: "Competition",
            daySchedule: "Training",
            matchDay: "MD-1",
            matchPhases: ["In Possession"],
            subPhases: ["Build-up"],
          },
        },
      })
    );
  }, { scheduleKey, sessionPlannerKey, periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");

  await expect(page.locator("#scheduleOverviewViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
  const selectedDay = page.locator('.schedule-planner-day.is-selected[data-schedule-date="2026-05-09"]');
  await expect(selectedDay).toBeVisible();
  const trainingChip = selectedDay.locator(".schedule-planner-event-chip");
  await expect(trainingChip).toHaveCount(1);
  await expect(trainingChip).toContainText("Training");
});

test("Schedule migrates legacy Week state while the selected day shows all plans", async ({ page }) => {
  await page.addInitScript(({ scheduleKey, sessionPlannerKey, periodizationKey }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-10T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-10",
        viewMode: "week",
        overviewSpan: 6,
        importVersion: "ncc-2026-numbers-v1",
        events: [
          {
            id: "qa-layer-training",
            date: "2026-05-10",
            time: "10:00",
            type: "training",
            title: "Training",
            note: "Layer QA",
          },
          {
            id: "qa-layer-match",
            date: "2026-05-10",
            time: "10:00",
            type: "match",
            title: "QA Match",
            note: "Same slot",
          },
          {
            id: "qa-layer-off",
            date: "2026-05-10",
            type: "off",
            title: "Off",
            note: "Conflict seed",
          },
        ],
      })
    );
    window.localStorage.setItem(
      sessionPlannerKey,
      JSON.stringify({
        selectedDate: "2026-05-10",
        sessions: {},
      })
    );
    window.localStorage.setItem(
      periodizationKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-10",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-10": {
            daySchedule: "Off",
          },
        },
      })
    );
  }, { scheduleKey, sessionPlannerKey, periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "schedule");

  await expect(page.locator("#scheduleOverviewViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerViewButton")).toHaveCount(0);
  await expect(page.locator("#schedulePlannerGrid")).toBeVisible();
  await expect(page.locator('[data-schedule-layer]')).toHaveCount(0);
  const selectedDay = page.locator('.schedule-planner-day.is-selected[data-schedule-date="2026-05-10"]');
  await expect(selectedDay).toHaveClass(/is-main-match/);
  await expect(selectedDay).not.toContainText("alert");
  await expect(selectedDay).toContainText("Training");
  await expect(selectedDay).toContainText("QA Match");
  await expect(selectedDay).toContainText("Off");
});

test("Periodization Today opens the real current date", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-09T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 0,
        selectedDate: "2026-01-15",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-04": {
            seasonPhase: "Competition",
            daySchedule: "Recovery",
            matchDay: "MD+1",
            physicalLoad: "Low",
            pitchSize: "SSG",
            matchPhases: ["Defensive Transition"],
            subPhases: ["Immediate reaction after loss"],
          },
          "2026-05-05": {
            seasonPhase: "Competition",
            daySchedule: "Main tactical day",
            matchDay: "MD-4",
            physicalLoad: "Medium-High",
            pitchSize: "Half pitch",
            matchPhases: ["In Possession"],
            subPhases: ["Build-up"],
          },
          "2026-05-06": {
            seasonPhase: "Competition",
            daySchedule: "Load day",
            matchDay: "MD-3",
            physicalLoad: "High",
            pitchSize: "BSG",
            matchPhases: ["Transition"],
            subPhases: ["Counter-press"],
          },
          "2026-05-09": {
            seasonPhase: "Competition",
            daySchedule: "Matchday",
            matchDay: "MD",
            physicalLoad: "Match Load",
            pitchSize: "Full pitch",
            matchPhases: ["Full match"],
            subPhases: ["All game states"],
            sessionNotes: "QA today anchor",
          },
        },
      })
    );
  }, { key: periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "periodization");
  await page.locator("#periodizationTodayButton").click();

  await expect(page.locator("#periodizationHeading")).toHaveText("May 2026");
  const selectedCard = page.locator('[data-periodization-date="2026-05-09"]');
  await expect(selectedCard).toHaveClass(/is-selected/);
  await expect(selectedCard.locator(".periodization-day-md")).toHaveText("Match Day +1");
  await expect(selectedCard.locator(".periodization-day-main")).toHaveText("Matchday");
  const cardContentPositions = await selectedCard.evaluate((element) => ({
    activityY: element.querySelector(".periodization-day-main")?.getBoundingClientRect().y,
    matchDayY: element.querySelector(".periodization-day-md")?.getBoundingClientRect().y,
  }));
  expect(cardContentPositions.activityY ?? Number.POSITIVE_INFINITY).toBeLessThan(
    cardContentPositions.matchDayY ?? 0
  );
  const microcycle = page.locator('[data-periodization-week-start="2026-05-04"]');
  await expect(microcycle.locator(".periodization-microcycle-load-rail")).toBeVisible();
  await expect(microcycle.locator(".periodization-microcycle-load-day")).toHaveCount(7);
  await expect(page.locator("[data-periodization-overlay]")).toHaveCount(0);

  await selectedCard.click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await expect(page.locator("[data-periodization-overlay] h2").first()).toHaveText("Saturday, May 9");
  await expect(page.locator("[data-periodization-overlay] .periodization-view-microcycle")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        return {
          selectedDate: state.selectedDate,
          selectedMonthIndex: state.selectedMonthIndex,
          note: state.days?.["2026-05-09"]?.sessionNotes || "",
        };
      }, periodizationKey)
    )
    .toEqual({
      selectedDate: "2026-05-09",
      selectedMonthIndex: 4,
      note: "QA today anchor",
    });
});

test("Periodization Today scrolls to the selected day without opening overlay", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const realDate = Date;
    const fixedNow = new realDate("2026-05-30T12:00:00-04:00").getTime();
    class FixedDate extends realDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = realDate.UTC;
    FixedDate.parse = realDate.parse;
    FixedDate.prototype = realDate.prototype;
    window.Date = FixedDate;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 0,
        selectedDate: "2026-01-15",
        importVersion: "ncc-2026-periodization-v1",
        days: {},
      })
    );
  }, { key: periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "periodization");
  await page.locator("#periodizationTodayButton").click();

  const selectedCard = page.locator('[data-periodization-date="2026-05-30"]');
  await expect(page.locator("#periodizationHeading")).toHaveText("May 2026");
  await expect(selectedCard).toHaveClass(/is-selected/);
  await expect(page.locator("[data-periodization-overlay]")).toHaveCount(0);
  await expect
    .poll(() =>
      selectedCard.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 80 && rect.bottom <= window.innerHeight - 20;
      })
    )
    .toBe(true);
});

test("Periodization derives match day tags from schedule while preserving manual overrides", async ({ page }) => {
  await page.addInitScript(({ scheduleKey, periodizationKey }) => {
    if (window.localStorage.getItem("qa-periodization-auto-matchday-seeded") === "1") {
      return;
    }
    window.localStorage.setItem("qa-periodization-auto-matchday-seeded", "1");
    window.localStorage.setItem(
      scheduleKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-08",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "ncc-2026-numbers-v1",
        events: [
          { id: "qa-auto-training", date: "2026-05-08", time: "10:00", type: "training", title: "Training", note: "" },
          { id: "qa-auto-match", date: "2026-05-10", time: "19:00", type: "match", title: "QA Match", note: "" },
        ],
      })
    );
    window.localStorage.setItem(
      periodizationKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-08",
        importVersion: "ncc-2026-periodization-v1",
        days: {
          "2026-05-08": {
            daySchedule: "Training",
            sessionType: "Training",
          },
          "2026-05-07": {
            daySchedule: "Training",
            matchDay: "Match Day +3",
            fieldUpdatedAt: {
              matchDay: "2026-05-01T12:00:00.000Z",
            },
          },
          "2026-05-11": {
            daySchedule: "Off",
            sessionType: "Off",
            physicalLoad: "Off",
          },
          "2026-05-12": {
            daySchedule: "Off",
            sessionType: "Off",
            physicalLoad: "Off",
            matchDay: "Match Day +2",
            fieldUpdatedAt: {
              matchDay: "2026-05-01T12:00:00.000Z",
            },
          },
        },
      })
    );
  }, { scheduleKey, periodizationKey });

  await bootApp(page);
  await openWorkspace(page, "periodization");

  await expect(page.locator('[data-periodization-date="2026-05-08"] .periodization-day-md')).toHaveText("Match Day -2");
  await expect(page.locator('[data-periodization-date="2026-05-07"] .periodization-day-md')).toHaveText("Match Day +3");
  await expect(page.locator('[data-periodization-date="2026-05-11"] .periodization-day-md')).toHaveCount(0);
  await expect(page.locator('[data-periodization-date="2026-05-12"] .periodization-day-md')).toHaveText("Match Day +2");

  await page.locator('[data-periodization-date="2026-05-08"]').click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const matchDayField = page.locator('input[data-periodization-field="matchDay"]').first();
  await expect(matchDayField).toHaveValue("Match Day -2");
  await matchDayField.fill("Match Day +1");
  await matchDayField.blur();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const day = JSON.parse(window.localStorage.getItem(key) || "{}").days?.["2026-05-08"] || {};
        return {
          matchDay: day.matchDay || "",
          hasManualTimestamp: Boolean(day.fieldUpdatedAt?.matchDay),
        };
      }, periodizationKey)
    )
    .toEqual({ matchDay: "Match Day +1", hasManualTimestamp: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openWorkspace(page, "periodization");
  await expect(page.locator('[data-periodization-date="2026-05-08"] .periodization-day-md')).toHaveText("Match Day +1");
});

test("Periodization day notes persist after refresh", async ({ page }) => {
  const note = `QA Periodization ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "periodization");

  await page.locator("#periodizationTodayButton").click();
  await expect(page.locator("[data-periodization-overlay]")).toHaveCount(0);
  await page.locator(".periodization-day-card[data-periodization-date]").first().click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const notesField = page.locator('textarea[data-periodization-field="sessionNotes"]').first();
  await expect(notesField).toBeVisible();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, periodizationKey, note);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const state = JSON.parse(window.localStorage.getItem(key) || "{}");
        const selectedDate = state.selectedDate || "";
        return Boolean(state.days?.[selectedDate]?.fieldUpdatedAt?.sessionNotes);
      }, periodizationKey)
    )
    .toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await expectStorageContains(page, periodizationKey, note);
});

test("Periodization edit overlay keeps scroll position while saving fields", async ({ page }) => {
  const note = `QA Periodization Scroll ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "periodization");

  await page.locator("#periodizationTodayButton").click();
  await expect(page.locator("[data-periodization-overlay]")).toHaveCount(0);
  await page.locator(".periodization-day-card[data-periodization-date]").first().click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const panel = page.locator("[data-periodization-overlay] .periodization-day-panel").first();
  await expect(panel).toBeVisible();
  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => panel.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(120);

  const notesField = page.locator('textarea[data-periodization-field="sessionNotes"]').first();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, periodizationKey, note);
  await expect.poll(() => panel.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(120);
});

test("Session Planner block edits persist after refresh", async ({ page }) => {
  const value = `QA Session ${Date.now()}`;
  await seedQaSessionPlannerTrainingSession(page);
  await bootApp(page);
  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);

  let field = sessionPlannerWorkspace.locator('[data-session-field="objective"]:visible').first();
  if ((await field.count()) === 0) {
    field = sessionPlannerWorkspace.locator("[data-session-field]:visible").first();
  }
  await expect(field).toBeVisible();
  await field.fill(value);
  await field.blur();
  await expectStorageContains(page, sessionPlannerKey, value);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await expectStorageContains(page, sessionPlannerKey, value);
});

test("Session Planner save feedback stays hidden until a real change", async ({ page }) => {
  const value = `QA saved feedback ${Date.now()}`;
  await seedQaSessionPlannerTrainingSession(page);
  await bootApp(page);
  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  const autosaveStatus = page.locator("[data-platform-autosave-status]");

  await expect(autosaveStatus).toHaveClass(/is-idle/);
  await expect(autosaveStatus).not.toBeVisible();

  let field = sessionPlannerWorkspace.locator('[data-session-field="objective"]:visible').first();
  if ((await field.count()) === 0) {
    field = sessionPlannerWorkspace.locator("[data-session-field]:visible").first();
  }
  await field.fill(value);
  await field.blur();

  await expect(autosaveStatus).toBeVisible();
  await expect(autosaveStatus).toContainText(/Saving|Saved/);
});

test("Session Planner date and block browsing does not persist view-only selection", async ({ page }) => {
  const state = createQaSessionPlannerState();
  state.sessions[qaSessionPlannerTrainingDate].blocks.push({
    ...state.sessions[qaSessionPlannerTrainingDate].blocks[0],
    id: "qa-block-2",
    label: "Block 2",
    title: "QA Game",
  });
  await page.addInitScript(
    ({ storageKey, nextState }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    },
    { storageKey: sessionPlannerKey, nextState: state }
  );

  await bootApp(page);
  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  const persistedBeforeBrowsing = await page.evaluate(
    (storageKey) => window.localStorage.getItem(storageKey),
    sessionPlannerKey
  );

  await sessionPlannerWorkspace.locator('[data-session-date="2026-05-20"]').click();
  await expect(sessionPlannerWorkspace.locator('[data-session-date="2026-05-20"]')).toHaveClass(/is-active/);
  await expect.poll(() =>
    page.evaluate((storageKey) => window.localStorage.getItem(storageKey), sessionPlannerKey)
  ).toBe(persistedBeforeBrowsing);

  const persistedAfterDateBrowsing = JSON.parse(persistedBeforeBrowsing);
  expect(persistedAfterDateBrowsing.sessions["2026-05-20"]).toBeUndefined();

  await sessionPlannerWorkspace.locator(`[data-session-date="${qaSessionPlannerTrainingDate}"]`).click();
  await sessionPlannerWorkspace.locator('[data-session-block-id="qa-block-2"]').click();
  await expect(sessionPlannerWorkspace.locator('[data-session-block-id="qa-block-2"]')).toHaveClass(/is-active/);
  await expect.poll(() =>
    page.evaluate((storageKey) => window.localStorage.getItem(storageKey), sessionPlannerKey)
  ).toBe(persistedBeforeBrowsing);
});

test("Session Planner post-session notes stay attached to library exercises", async ({ page }) => {
  const note = `QA post-session review ${Date.now()}`;
  const exerciseId = "qa-library-review-exercise";
  await page.addInitScript(
    ({ sessionKey, libraryKey, exerciseId }) => {
      const dateValue = "2026-05-19";
      window.localStorage.setItem(
        sessionKey,
        JSON.stringify({
          selectedDate: dateValue,
          sessions: {
            [dateValue]: {
              id: `session-${dateValue}`,
              date: dateValue,
              title: "QA Training",
              theme: "QA review notes",
              selectedBlockId: "qa-review-block",
              blocks: [
                {
                  id: "qa-review-block",
                  label: "Block 1",
                  title: "QA Library Exercise",
                  focus: "Review attachment",
                  phase: "In Possession",
                  subPhase: "Build Up",
                  minutes: 18,
                  intensity: 3,
                  pitchSize: "SSG",
                  material: "",
                  objective: "",
                  why: "",
                  organization: "",
                  principles: "",
                  diagram: "empty",
                  libraryExerciseId: exerciseId,
                  postSessionNotes: "",
                  tacticalElements: [],
                  playerBoardPositions: {},
                  playerBoardColors: {},
                },
              ],
            },
          },
        })
      );
      window.localStorage.setItem(
        libraryKey,
        JSON.stringify([
          {
            id: exerciseId,
            label: "Library Exercise",
            title: "QA Library Exercise",
            focus: "Review attachment",
            phase: "In Possession",
            subPhase: "Build Up",
            minutes: 18,
            intensity: 3,
            pitchSize: "SSG",
            material: "",
            objective: "",
            why: "",
            organization: "",
            principles: "",
            diagram: "empty",
            tags: [],
            versions: [],
            reviewNotes: [],
            createdAt: "2026-05-01T12:00:00.000Z",
            updatedAt: "2026-05-01T12:00:00.000Z",
          },
        ])
      );
    },
    { sessionKey: sessionPlannerKey, libraryKey: sessionPlannerLibraryKey, exerciseId }
  );

  await bootApp(page);
  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  const postNotesCard = sessionPlannerWorkspace.locator(".session-post-notes-card").first();
  await expect(postNotesCard).not.toHaveAttribute("open", "");
  await expect(postNotesCard.locator("summary")).toContainText("Ready after training");
  await postNotesCard.locator("[data-session-post-notes-toggle]").click();
  const notesField = sessionPlannerWorkspace.locator('[data-session-field="postSessionNotes"]').first();
  await expect(notesField).toBeVisible();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, sessionPlannerKey, note);
  await expect
    .poll(() =>
      page.evaluate(
        ({ libraryKey, exerciseId }) => {
          const library = JSON.parse(window.localStorage.getItem(libraryKey) || "[]");
          const exercise = Array.isArray(library)
            ? library.find((candidate) => candidate.id === exerciseId)
            : null;
          const reviewNote = exercise?.reviewNotes?.[0] || null;
          return reviewNote
            ? {
                notes: reviewNote.notes,
                sessionDate: reviewNote.sessionDate,
                blockId: reviewNote.blockId,
              }
            : null;
        },
        { libraryKey: sessionPlannerLibraryKey, exerciseId }
      )
    )
    .toEqual({
      notes: note,
      sessionDate: "2026-05-19",
      blockId: "qa-review-block",
    });

  await sessionPlannerWorkspace.locator("[data-session-open-library]").click();
  const libraryModal = page.locator(".session-library-modal").first();
  await expect(libraryModal).toBeVisible();
  await expect(libraryModal.locator(".session-library-item", { hasText: "1 review note" })).toBeVisible();
  await libraryModal.locator(`[data-session-view-exercise="${exerciseId}"]`).click();
  await expect(page.locator(".session-library-view-dialog")).toContainText(note);
});

test("Session Planner player board tidy selected keeps nearby player tokens readable", async ({ page }) => {
  const dateValue = "2026-05-19";
  const playerIds = [
    "player-board-person-qa-tidy-p1",
    "player-board-person-qa-tidy-p2",
    "player-board-person-qa-tidy-p3",
  ];
  const anchorId = "player-board-person-qa-tidy-anchor";
  await page.addInitScript(
    ({ sessionKey, dateValue, playerIds, anchorId }) => {
      window.localStorage.setItem(
        sessionKey,
        JSON.stringify({
          selectedDate: dateValue,
          sessions: {
            [dateValue]: {
              id: `session-${dateValue}`,
              date: dateValue,
              title: "QA Training",
              theme: "QA tidy player board",
              selectedBlockId: "qa-tidy-block",
              blocks: [
                {
                  id: "qa-tidy-block",
                  label: "Block 1",
                  title: "QA Tidy Board",
                  focus: "Player board",
                  phase: "Out of Possession",
                  subPhase: "Block Defending",
                  minutes: 12,
                  intensity: 3,
                  pitchSize: "SSG",
                  material: "",
                  objective: "",
                  why: "",
                  organization: "",
                  principles: "",
                  diagram: "empty",
                  playerBoardLayoutMode: "manual",
                  playerBoardPositions: {
                    [playerIds[0]]: { x: 39, y: 42 },
                    [playerIds[1]]: { x: 44, y: 42.2 },
                    [playerIds[2]]: { x: 49, y: 42.3 },
                    [anchorId]: { x: 82, y: 74 },
                  },
                  playerBoardColors: {},
                  playerBoardCustomPeople: [
                    { id: playerIds[0], name: "Tidy Alpha", role: "CB", kind: "player", createdAt: "2026-05-19T10:00:00.000Z" },
                    { id: playerIds[1], name: "Tidy Beta", role: "CB", kind: "player", createdAt: "2026-05-19T10:01:00.000Z" },
                    { id: playerIds[2], name: "Tidy Gamma", role: "CB", kind: "player", createdAt: "2026-05-19T10:02:00.000Z" },
                    { id: anchorId, name: "Tidy Anchor", role: "ST", kind: "player", createdAt: "2026-05-19T10:03:00.000Z" },
                  ],
                },
              ],
            },
          },
        })
      );
    },
    { sessionKey: sessionPlannerKey, dateValue, playerIds, anchorId }
  );

  await bootApp(page);
  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  await sessionPlannerWorkspace.locator("[data-session-open-player-board]").click();
  const boardOverlay = page.locator(".session-player-board-overlay");
  await expect(boardOverlay).toBeVisible();
  await boardOverlay.locator(`[data-session-player-board-token="${playerIds[0]}"]`).click();
  await boardOverlay.locator(`[data-session-player-board-token="${playerIds[1]}"]`).click({ modifiers: ["Shift"] });
  await boardOverlay.locator(`[data-session-player-board-token="${playerIds[2]}"]`).click({ modifiers: ["Shift"] });
  await expect(boardOverlay.locator("[data-session-player-board-selected-count]")).toContainText("3 selected");
  await boardOverlay.locator("[data-session-player-board-tidy-selected]").click();

  await expect
    .poll(
      () =>
        page.evaluate(
          ({ sessionKey, dateValue, playerIds, anchorId }) => {
            const state = JSON.parse(window.localStorage.getItem(sessionKey) || "{}");
            const block = state.sessions?.[dateValue]?.blocks?.find((candidate) => candidate.id === "qa-tidy-block");
            const positions = block?.playerBoardPositions || {};
            const selectedPositions = playerIds.map((playerId) => positions[playerId]).filter(Boolean);
            const sortedX = [...selectedPositions].sort((first, second) => Number(first.x) - Number(second.x));
            const xGaps = sortedX.slice(1).map((position, index) => Number(position.x) - Number(sortedX[index].x));
            const yValues = selectedPositions.map((position) => Number(position.y));
            const pairsReadable = selectedPositions.every((position, index) =>
              selectedPositions.slice(index + 1).every((otherPosition) => {
                const dx = Math.abs(Number(otherPosition.x) - Number(position.x));
                const dy = Math.abs(Number(otherPosition.y) - Number(position.y));
                return dx >= 6 || dy >= 5.4;
              })
            );
            const center = selectedPositions.reduce(
              (sum, position) => ({ x: sum.x + Number(position.x), y: sum.y + Number(position.y) }),
              { x: 0, y: 0 }
            );
            center.x /= Math.max(selectedPositions.length, 1);
            center.y /= Math.max(selectedPositions.length, 1);
            return {
              mode: block?.playerBoardLayoutMode,
              count: selectedPositions.length,
              pairsReadable,
              rowAligned: Math.max(...yValues) - Math.min(...yValues) < 0.8,
              symmetricSpacing: Math.max(...xGaps) - Math.min(...xGaps) < 0.8,
              keptNearOriginalArea: Math.abs(center.x - 44) < 18 && Math.abs(center.y - 42.2) < 18,
              anchorStable: positions[anchorId]?.x === 82 && positions[anchorId]?.y === 74,
            };
          },
          { sessionKey: sessionPlannerKey, dateValue, playerIds, anchorId }
        ),
      { timeout: 10_000 }
    )
    .toEqual({
      mode: "manual",
      count: 3,
      pairsReadable: true,
      rowAligned: true,
      symmetricSpacing: true,
      keptNearOriginalArea: true,
      anchorStable: true,
    });
});

test("Medical workspace uses responsive width without clipping recommendations", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...current,
        selectedDate: "2026-05-16",
      })
    );
  }, { storageKey: medicalKey });
  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await expect(page.locator("#medicalTeamWorkspace .medical-quick-rec-row").first()).toBeVisible();
  const medicalLayout = await page.evaluate(() => {
    const view = document.querySelector(".platform-medical-view");
    const shell = document.querySelector("#medicalTeamWorkspace .medical-shell");
    const rosterPanel = document.querySelector("#medicalTeamWorkspace .medical-roster-panel");
    const dateStrip = document.querySelector("#medicalTeamWorkspace .medical-date-strip");
    if (!view || !shell || !rosterPanel || !dateStrip) return null;
    const viewRect = view.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const panelRect = rosterPanel.getBoundingClientRect();
    const quickRows = Array.from(document.querySelectorAll("#medicalTeamWorkspace .medical-quick-rec-row"));
    return {
      balancedMargins: Math.abs(shellRect.left - viewRect.left - (viewRect.right - shellRect.right)) <= 2,
      dateControlOrder: Array.from(dateStrip.children)
        .slice(0, 4)
        .map((element) => {
          if (element.matches("[data-medical-date-picker]")) return "date";
          if (element.matches('[data-medical-shift-date="-1"]')) return "previous";
          if (element.matches("[data-medical-today]")) return "today";
          if (element.matches('[data-medical-shift-date="1"]')) return "next";
          return "unknown";
        }),
      hasRecommendationRows: quickRows.length > 0,
      noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      quickRowsFit: quickRows.every((row) => {
        const rect = row.getBoundingClientRect();
        return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1;
      }),
      viewportWidth: window.innerWidth,
      widthRatio: shellRect.width / viewRect.width,
    };
  });
  expect(medicalLayout).toMatchObject({
    balancedMargins: true,
    dateControlOrder: ["date", "previous", "today", "next"],
    hasRecommendationRows: true,
    noPageOverflow: true,
    quickRowsFit: true,
  });
  expect(medicalLayout?.widthRatio).toBeGreaterThan((medicalLayout?.viewportWidth || 0) <= 760 ? 0.92 : 0.96);

  const medicalDatePicker = page.locator("[data-medical-date-picker]");
  await page.locator('[data-medical-shift-date="-1"]').click();
  await expect(medicalDatePicker).toHaveValue("2026-05-15");
  await page.locator('[data-medical-shift-date="1"]').click();
  await expect(medicalDatePicker).toHaveValue("2026-05-16");
});

test("Medical recommendation edits persist after refresh", async ({ page }) => {
  const comment = `QA Medical ${Date.now()}`;
  await page.addInitScript(({ storageKey }) => {
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...current,
        selectedDate: "2026-05-16",
      })
    );
  }, { storageKey: medicalKey });
  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await expect(page.locator(".medical-hero h1")).toHaveText("Medical Room");
  await expect(page.locator(".medical-team-name")).toHaveText("North Carolina Courage");
  await expect(page.locator(".medical-access-chip")).toHaveCount(0);
  await expect(page.locator(".medical-hero-meta")).toHaveCount(0);

  await page.locator("[data-medical-roster-row]:visible .medical-roster-player-cell").first().click();
  const form = page.locator("#medicalRecommendationForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('textarea[name="comment"]').fill(comment);
  await form.locator('button[type="submit"]').click();
  await expectStorageContains(page, medicalKey, comment);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await expectStorageContains(page, medicalKey, comment);
});

test("Medical archive keeps clinical records and plans protected", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, playerProfilesStorageKey, scheduleStorageKey, playerProfilesState }) => {
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-15",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-archive-v1",
        events: [{ id: "qa-archive-training", date: "2026-05-15", time: "10:00", type: "training", title: "Training", note: "" }],
      })
    );
    window.localStorage.setItem(playerProfilesStorageKey, JSON.stringify(playerProfilesState));
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-archive-player",
        rosterVersion: "qa-medical-archive-v1",
        players: [{ id: "qa-archive-player", name: "QA Archive Player", position: "Forward", rosterOrder: 1 }],
        records: [
          {
            id: "qa-archive-record",
            playerId: "qa-archive-player",
            date: "2026-05-15",
            status: "modified",
            participation: 75,
            actualParticipation: "not-logged",
            rtpPhase: "modified-team",
            createdAt: "2026-05-15T08:00:00.000Z",
            updatedAt: "2026-05-15T08:00:00.000Z",
          },
          {
            id: "qa-full-record",
            playerId: "qa-archive-player",
            date: "2026-05-14",
            status: "full",
            participation: 100,
            actualParticipation: "not-logged",
            rtpPhase: "full-training",
            createdAt: "2026-05-14T08:00:00.000Z",
            updatedAt: "2026-05-14T08:00:00.000Z",
          },
        ],
        injuryPlans: [
          {
            id: "qa-archive-plan",
            playerId: "qa-archive-player",
            injuryType: "Load management",
            startDate: "2026-05-15",
            endDate: "2026-05-21",
            duration: 1,
            durationUnit: "weeks",
            status: "modified",
            participation: 75,
            rtpPhase: "modified-team",
            createdAt: "2026-05-15T07:00:00.000Z",
            updatedAt: "2026-05-15T07:00:00.000Z",
          },
        ],
      })
    );
  }, {
    medicalStorageKey: medicalKey,
    playerProfilesStorageKey: playerProfilesKey,
    scheduleStorageKey: scheduleKey,
    playerProfilesState: createQaPlayerProfilesState(
      [{ id: "qa-archive-player", name: "QA Archive Player", position: "Forward", rosterOrder: 1 }],
      { rosterVersion: "qa-medical-archive-v1", selectedPlayerId: "qa-archive-player" }
    ),
  });

  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await page.locator('[data-medical-ops-tab="availability"]').click();
  await expect(page.locator("[data-medical-data-safety]")).toHaveCount(0);
  await page.locator('[data-medical-roster-row="qa-archive-player"] .medical-roster-player-cell').click();
  await page.locator('[data-medical-modal-tab="profile"]').click();
  const medicalLogCard = page.locator(".medical-modal-card .medical-log-card");
  await expect(medicalLogCard.locator(".medical-card-headline span")).toHaveText("1");
  await expect(medicalLogCard).toContainText("75% recommended");
  await expect(medicalLogCard).not.toContainText("100% recommended");
  const archiveRecordButton = page.locator('[data-medical-delete-record="qa-archive-record"]');
  await expect(archiveRecordButton).toHaveText("Archive");
  await expect(archiveRecordButton).not.toHaveText("x");
  const archiveRecordBox = await archiveRecordButton.boundingBox();
  expect(archiveRecordBox?.width ?? 0).toBeGreaterThan(56);
  expect(archiveRecordBox?.height ?? 99).toBeLessThan(40);
  await archiveRecordButton.click();
  await confirmPlatformDialog(page, "Archive log entry?");

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return {
          recordCount: state.records?.length || 0,
          archived: Boolean(state.records?.find((record) => record.id === "qa-archive-record")?.archivedAt),
          archiveCount: state.dataSafety?.archivedRecordCount || 0,
        };
      }, medicalKey)
    )
    .toEqual({ recordCount: 2, archived: true, archiveCount: 1 });

  await page.locator('[data-medical-modal-tab="plan"]').click();
  const archivePlanButton = page.locator('[data-medical-delete-injury-plan="qa-archive-plan"]');
  await expect(archivePlanButton).toHaveText("Archive");
  await archivePlanButton.click();
  await confirmPlatformDialog(page, "Archive availability plan?");

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return {
          planCount: state.injuryPlans?.length || 0,
          archived: Boolean(state.injuryPlans?.find((plan) => plan.id === "qa-archive-plan")?.archivedAt),
          archiveCount: state.dataSafety?.archivedPlanCount || 0,
        };
      }, medicalKey)
    )
    .toEqual({ planCount: 1, archived: true, archiveCount: 1 });
});

test("Medical plan draft survives modal rerenders and saves long-term zero availability", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, playerProfilesStorageKey, scheduleStorageKey, playerProfilesState }) => {
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-21",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-plan-draft-v1",
        events: [
          { id: "qa-plan-training", date: "2026-05-21", time: "10:00", type: "training", title: "Training", note: "" },
        ],
      })
    );
    window.localStorage.setItem(playerProfilesStorageKey, JSON.stringify(playerProfilesState));
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-21",
        selectedPlayerId: "qa-plan-player",
        rosterVersion: "qa-medical-plan-draft-v1",
        players: [{ id: "qa-plan-player", name: "QA Long Term Player", position: "Defender", rosterOrder: 1 }],
        records: [
          {
            id: "qa-plan-player-old-full",
            playerId: "qa-plan-player",
            date: "2026-05-21",
            status: "full",
            participation: 100,
            actualParticipation: "not-logged",
            rtpPhase: "full-training",
            createdAt: "2026-05-20T08:00:00.000Z",
            updatedAt: "2026-05-20T08:00:00.000Z",
          },
        ],
        injuryPlans: [],
      })
    );
  }, {
    medicalStorageKey: medicalKey,
    playerProfilesStorageKey: playerProfilesKey,
    scheduleStorageKey: scheduleKey,
    playerProfilesState: createQaPlayerProfilesState(
      [{ id: "qa-plan-player", name: "QA Long Term Player", position: "Defender", rosterOrder: 1 }],
      { rosterVersion: "qa-medical-plan-draft-v1", selectedPlayerId: "qa-plan-player" }
    ),
  });

  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await page.locator('[data-medical-ops-tab="availability"]').click();
  await page.locator('[data-medical-roster-row="qa-plan-player"] .medical-roster-player-cell').click();

  const modalTabs = page.locator(".medical-modal-tabs");
  await modalTabs.getByRole("tab", { name: "Medical Plan" }).click();
  const planForm = page.locator("#medicalInjuryPlanForm");
  await expect(planForm).toBeVisible();
  const expectPlanModalToFitViewport = async () => {
    const layout = await page.evaluate(() => {
      const selectors = [
        ".medical-modal-card",
        ".medical-modal-body",
        "#medicalInjuryPlanForm",
        ".medical-plan-case-section",
        ".medical-plan-program-section",
      ];
      return {
        viewportWidth: window.innerWidth,
        elements: selectors.map((selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return {
            selector,
            left: rect?.left ?? 0,
            right: rect?.right ?? 0,
            clientWidth: element?.clientWidth ?? 0,
            scrollWidth: element?.scrollWidth ?? 0,
          };
        }),
      };
    });
    layout.elements.forEach((element) => {
      expect(element.left, element.selector).toBeGreaterThanOrEqual(-1);
      expect(element.right, element.selector).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(element.scrollWidth, element.selector).toBeLessThanOrEqual(element.clientWidth + 2);
    });
  };
  await expectPlanModalToFitViewport();

  await planForm.locator('[name="injuryType"]').fill("ACL long-term injury");
  await planForm.locator('[name="bodyArea"]').fill("Knee");
  await planForm.locator('[name="duration"]').fill("6");
  await planForm.locator('[name="durationUnit"]').selectOption("months");
  await planForm.locator('[name="phase"]').fill("Protected rehab, no team football");
  await planForm.locator('[name="comment"]').fill("Long-term ACL plan. Keep availability at 0% until medical review.");
  await planForm.locator('[name="coachNote"]').fill("Unavailable long term");
  await planForm.locator('[name="shareWithCoach"]').check();

  await modalTabs.getByRole("tab", { name: "Medical Profile" }).click();
  await modalTabs.getByRole("tab", { name: "Medical Plan" }).click();
  await expect(planForm.locator('[name="injuryType"]')).toHaveValue("ACL long-term injury");
  await expect(planForm.locator('[name="duration"]')).toHaveValue("6");
  await expect(planForm.locator('[name="durationUnit"]')).toHaveValue("months");
  await expect(planForm.locator('[name="comment"]')).toHaveValue("Long-term ACL plan. Keep availability at 0% until medical review.");

  await planForm.locator('button[type="submit"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const plan = (state.injuryPlans || []).find((entry) => entry.playerId === "qa-plan-player");
        return plan
          ? {
              injuryType: plan.injuryType,
              bodyArea: plan.bodyArea,
              status: plan.status,
              participation: plan.participation,
              rtpPhase: plan.rtpPhase,
              duration: plan.duration,
              durationUnit: plan.durationUnit,
              startDate: plan.startDate,
              endDate: plan.endDate,
              comment: plan.comment,
              phase: plan.phase,
              coachNote: plan.coachNote,
              shareWithCoach: plan.shareWithCoach,
            }
          : null;
      }, medicalKey)
    )
    .toEqual({
      injuryType: "ACL long-term injury",
      bodyArea: "Knee",
      status: "unavailable",
      participation: 0,
      rtpPhase: "medical-restriction",
      duration: 6,
      durationUnit: "months",
      startDate: "2026-05-21",
      endDate: "2026-11-20",
      comment: "Long-term ACL plan. Keep availability at 0% until medical review.",
      phase: "Protected rehab, no team football",
      coachNote: "Unavailable long term",
      shareWithCoach: true,
    });

  const planList = page.locator(".medical-plan-list-card");
  await expect(planList).toContainText("ACL long-term injury");
  await expect(planList.locator("[data-medical-edit-injury-plan]").first()).toHaveText("Edit");
  await planList.locator("[data-medical-edit-injury-plan]").first().click();
  await expect(planForm.locator('button[type="submit"]')).toHaveText("Update plan");
  await expect(planForm.locator('[name="injuryType"]')).toHaveValue("ACL long-term injury");
  await planForm.locator('[name="duration"]').fill("9");
  await planForm.locator('[name="durationUnit"]').selectOption("months");
  await planForm.locator('[name="phase"]').fill("Protected rehab - months 1-9");
  await planForm.locator('button[type="submit"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const plans = (state.injuryPlans || []).filter((entry) => entry.playerId === "qa-plan-player");
        return {
          count: plans.length,
          duration: plans[0]?.duration,
          durationUnit: plans[0]?.durationUnit,
          phase: plans[0]?.phase,
          participation: plans[0]?.participation,
        };
      }, medicalKey)
    )
    .toEqual({
      count: 1,
      duration: 9,
      durationUnit: "months",
      phase: "Protected rehab - months 1-9",
      participation: 0,
    });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectPlanModalToFitViewport();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator(".medical-modal-close").click();
  const playerRow = page.locator('[data-medical-roster-row="qa-plan-player"]');
  await expect(playerRow.locator(".medical-quick-rec-button.is-active")).toHaveText("0%");
  await expect(playerRow).toContainText("ACL long-term injury");
});

test("Medical availability blocks training recommendations for Squad non-available players", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, playerProfilesStorageKey, scheduleStorageKey }) => {
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-19",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-squad-block-v1",
        events: [{ id: "qa-training", date: "2026-05-19", time: "10:00", type: "training", title: "Training", note: "" }],
      })
    );
    const players = [
      {
        id: "qa-international",
        name: "QA International",
        number: "9",
        position: "Forward",
        primaryRole: "ST",
        roleGroup: "forward",
        status: "national-team",
        squadStatus: "important",
        rosterType: "squad",
        countsInSquad: true,
        createdAt: "2026-05-18T08:00:00.000Z",
        updatedAt: "2026-05-18T08:00:00.000Z",
      },
      {
        id: "qa-future-injury",
        name: "QA Future Injury",
        number: "3",
        position: "Defender",
        primaryRole: "CB",
        roleGroup: "defender",
        status: "injured",
        squadStatus: "rotation",
        rosterType: "squad",
        countsInSquad: true,
        createdAt: "2026-05-18T08:00:00.000Z",
        updatedAt: "2026-05-20T08:00:00.000Z",
      },
      {
        id: "qa-available-training",
        name: "QA Available Training",
        number: "10",
        position: "Midfielder",
        primaryRole: "10",
        roleGroup: "midfielder",
        status: "available",
        squadStatus: "rotation",
        rosterType: "squad",
        countsInSquad: true,
        createdAt: "2026-05-18T08:00:00.000Z",
        updatedAt: "2026-05-18T08:00:00.000Z",
      },
    ];
    window.localStorage.setItem(
      playerProfilesStorageKey,
      JSON.stringify({
        rosterVersion: "qa-medical-squad-block-v1",
        schemaVersion: 3,
        selectedPlayerId: "qa-international",
        players,
        removedPlayerIds: [],
        changeLog: [
          {
            playerId: "qa-future-injury",
            createdAt: "2026-05-20T08:00:00.000Z",
            changes: [{ field: "Availability status", from: "Available", to: "Injured" }],
          },
        ],
        updatedAt: "2026-05-18T08:00:00.000Z",
      })
    );
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-19",
        selectedPlayerId: "qa-international",
        rosterVersion: "qa-medical-squad-block-v1",
        players: players.map((player) =>
          player.id === "qa-international" ? { ...player, status: "available" } : player
        ),
        records: [
          {
            id: "qa-stale-international-full",
            playerId: "qa-international",
            date: "2026-05-19",
            status: "full",
            participation: 100,
            actualParticipation: "not-logged",
            rtpPhase: "full-training",
            createdAt: "2026-05-18T09:00:00.000Z",
          },
        ],
        injuryPlans: [],
      })
    );
  }, { medicalStorageKey: medicalKey, playerProfilesStorageKey: playerProfilesKey, scheduleStorageKey: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");
  await page.locator('[data-medical-ops-tab="availability"]').click();

  const internationalRow = page.locator('[data-medical-roster-row="qa-international"]');
  const futureInjuryRow = page.locator('[data-medical-roster-row="qa-future-injury"]');
  const availableRow = page.locator('[data-medical-roster-row="qa-available-training"]');
  await expect(internationalRow.locator(".medical-squad-availability-badge")).toHaveText("International duty");
  await expect(internationalRow.locator(".medical-quick-rec-button.is-active")).toHaveText("0%");
  await expect(internationalRow.locator('[data-medical-quick-participation="100"]')).toBeDisabled();
  await expect(futureInjuryRow.locator(".medical-squad-availability-badge")).toHaveCount(0);
  await expect(futureInjuryRow.locator('[data-medical-quick-participation="100"]')).toBeEnabled();
  await expect(availableRow.locator('[data-medical-quick-participation="100"]')).toBeEnabled();
  await expect(page.locator(".medical-bulk-panel")).toHaveCount(0);
  await expect(page.locator("[data-medical-bulk-toggle]")).toHaveCount(0);
  await expect(page.locator("[data-medical-bulk-menu-toggle]")).toHaveCount(0);

  await availableRow.locator('[data-medical-quick-participation="75"]').click();
  await futureInjuryRow.locator('[data-medical-quick-participation="50"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const internationalRecords = (state.records || []).filter((record) => record.playerId === "qa-international");
        const futureInjuryRecords = (state.records || []).filter((record) => record.playerId === "qa-future-injury");
        const availableRecords = (state.records || []).filter((record) => record.playerId === "qa-available-training");
        return {
          internationalCount: internationalRecords.length,
          internationalParticipation: internationalRecords[0]?.participation,
          futureInjuryCount: futureInjuryRecords.length,
          futureInjuryParticipation: futureInjuryRecords[0]?.participation,
          availableCount: availableRecords.length,
          availableParticipation: availableRecords[0]?.participation,
        };
      }, medicalKey)
    )
    .toEqual({
      internationalCount: 1,
      internationalParticipation: 100,
      futureInjuryCount: 1,
      futureInjuryParticipation: 50,
      availableCount: 1,
      availableParticipation: 75,
    });
});

test("Medical metrics use current-month and planned-session averages", async ({ page }) => {
  await page.addInitScript(({ storageKey, scheduleStorageKey, playerProfilesStorageKey }) => {
    const fixedNow = new Date("2026-05-15T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-14",
        selectedPlayerId: "qa-player",
        rosterVersion: "qa-medical-average-v1",
        players: [{ id: "qa-player", name: "QA Player", position: "Forward", rosterOrder: 1 }],
        records: [
          { id: "month-start", playerId: "qa-player", date: "2026-05-01", participation: 10, createdAt: "2026-05-01T08:00:00.000Z" },
          { id: "trailing-start", playerId: "qa-player", date: "2026-05-08", participation: 25, createdAt: "2026-05-08T08:00:00.000Z" },
          { id: "selected-day", playerId: "qa-player", date: "2026-05-14", participation: 50, createdAt: "2026-05-14T08:00:00.000Z" },
          { id: "today", playerId: "qa-player", date: "2026-05-15", participation: 75, createdAt: "2026-05-15T08:00:00.000Z" },
          { id: "future", playerId: "qa-player", date: "2026-05-20", participation: 100, createdAt: "2026-05-20T08:00:00.000Z" },
        ],
        injuryPlans: [],
      })
    );
    window.localStorage.setItem(
      playerProfilesStorageKey,
      JSON.stringify({
        rosterVersion: "qa-medical-average-v1",
        schemaVersion: 3,
        selectedPlayerId: "qa-player",
        players: [
          { id: "qa-player", name: "QA Player", position: "Forward", rosterType: "squad", countsInSquad: true, rosterOrder: 1 },
        ],
        removedPlayerIds: [],
      })
    );
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-14",
        viewMode: "month",
        overviewSpan: 6,
        importVersion: "qa-medical-average-schedule-v1",
        events: [
          { id: "qa-medical-month-1", date: "2026-05-01", type: "training", title: "Training" },
          { id: "qa-medical-trailing-1", date: "2026-05-08", type: "training", title: "Training" },
          { id: "qa-medical-trailing-2", date: "2026-05-14", type: "training", title: "Training" },
          { id: "qa-medical-today", date: "2026-05-15", type: "training", title: "Training" },
          { id: "qa-medical-future", date: "2026-05-20", type: "training", title: "Training" },
        ],
      })
    );
  }, { storageKey: medicalKey, scheduleStorageKey: scheduleKey, playerProfilesStorageKey: playerProfilesKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const metricCards = page.locator(".medical-metric-card");
  await expect(metricCards.filter({ hasText: "Month average" })).toContainText("40%");
  await expect(metricCards.filter({ hasText: "Month average" })).not.toContainText("filled");
  await expect(metricCards.filter({ hasText: "5-session average" })).toContainText("38%");
  await expect(metricCards.filter({ hasText: "5-session average" })).toContainText("planned sessions");
  await expect(page.locator(".medical-availability-workspace .medical-huddle")).toHaveCount(0);
  await expect(page.locator(".medical-availability-workspace .medical-coach-handover")).toHaveCount(0);
  await expect(page.locator('[data-medical-ops-tab="overview"]')).toHaveCount(0);
});

test("Medical availability hides bulk controls while quick recommendations remain active", async ({ page }) => {
  await page.addInitScript(({ storageKey, playerProfilesStorageKey, playerProfilesState }) => {
    const fixedNow = new Date("2026-05-15T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(playerProfilesStorageKey, JSON.stringify(playerProfilesState));
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "bulk-one",
        rosterVersion: "qa-medical-bulk-v1",
        players: [
          { id: "bulk-one", name: "Bulk One", position: "Forward", rosterOrder: 1 },
          { id: "bulk-two", name: "Bulk Two", position: "Midfielder", rosterOrder: 2 },
        ],
        records: [
          { id: "existing-today", playerId: "bulk-one", date: "2026-05-15", participation: 100, createdAt: "2026-05-15T08:00:00.000Z" },
        ],
        injuryPlans: [],
      })
    );
  }, {
    storageKey: medicalKey,
    playerProfilesStorageKey: playerProfilesKey,
    playerProfilesState: createQaPlayerProfilesState(
      [
        { id: "bulk-one", name: "Bulk One", position: "Forward", rosterOrder: 1 },
        { id: "bulk-two", name: "Bulk Two", position: "Midfielder", rosterOrder: 2 },
      ],
      { rosterVersion: "qa-medical-bulk-v1", selectedPlayerId: "bulk-one" }
    ),
  });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  await expect(page.locator(".medical-bulk-panel")).toHaveCount(0);
  await expect(page.locator("[data-medical-bulk-menu-toggle]")).toHaveCount(0);
  await expect(page.locator("[data-medical-bulk-toggle]")).toHaveCount(0);
  await expect(page.locator("#medicalBulkRecommendationForm")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelector(".medical-position-group .medical-roster-list-head")?.children || []).map((element) =>
          element.textContent?.trim()
        )
      )
    )
    .toEqual(["Player", "Quick Recommendation"]);

  await page.locator('[data-medical-roster-row="bulk-two"] [data-medical-quick-participation="25"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return (state.records || [])
          .filter((record) => record.date === "2026-05-15" && !record.archivedAt)
          .map((record) => `${record.playerId}:${record.participation}`)
          .sort();
      }, medicalKey)
    )
    .toEqual(["bulk-one:100", "bulk-two:25"]);

  await page.locator('[data-medical-roster-row="bulk-two"] [data-medical-quick-participation="25"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return (state.records || [])
          .filter((record) => record.date === "2026-05-15" && !record.archivedAt)
          .map((record) => `${record.playerId}:${record.participation}`)
          .sort();
      }, medicalKey)
    )
    .toEqual(["bulk-one:100", "bulk-two:25"]);

  await page.locator('[data-medical-roster-row="bulk-two"] [data-medical-quick-clear]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        return {
          activeRecords: (state.records || [])
            .filter((record) => record.date === "2026-05-15" && !record.archivedAt)
            .map((record) => `${record.playerId}:${record.participation}`)
            .sort(),
          archivedBulkTwo: (state.records || []).some((record) =>
            record.playerId === "bulk-two" && record.date === "2026-05-15" && Boolean(record.archivedAt)
          ),
        };
      }, medicalKey)
    )
    .toEqual({ activeRecords: ["bulk-one:100"], archivedBulkTwo: true });
});

test("Medical recommendations use match context and lock non-activity days", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, playerProfilesStorageKey, scheduleStorageKey }) => {
    const fixedNow = new Date("2026-05-16T12:00:00Z").valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    window.Date = FixedDate;
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-16",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-activity-context-v1",
        events: [
          { id: "qa-training", date: "2026-05-15", time: "10:00", type: "training", title: "Training", note: "" },
          { id: "qa-match", date: "2026-05-16", time: "18:30", type: "match", title: "QA Match Day", note: "" },
          { id: "qa-off", date: "2026-05-17", time: "", type: "off", title: "Squad Off", note: "" },
          { id: "qa-training-travel", date: "2026-05-18", time: "10:00", type: "travel", title: "Training + Departure", note: "Travel after training" },
        ],
      })
    );
    const players = [
      {
        id: "qa-match-player",
        name: "QA Match Player",
        position: "Forward",
        rosterType: "squad",
        countsInSquad: true,
        rosterOrder: 1,
      },
    ];
    window.localStorage.setItem(
      playerProfilesStorageKey,
      JSON.stringify({
        rosterVersion: "qa-medical-activity-context-v1",
        schemaVersion: 3,
        selectedPlayerId: "qa-match-player",
        players,
        removedPlayerIds: [],
      })
    );
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-16",
        selectedPlayerId: "qa-match-player",
        rosterVersion: "qa-medical-activity-context-v1",
        players,
        records: [],
        injuryPlans: [],
      })
    );
  }, { medicalStorageKey: medicalKey, playerProfilesStorageKey: playerProfilesKey, scheduleStorageKey: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  await expect(page.locator("[data-medical-activity-context]")).toContainText("Match Recommendation");
  await expect(page.locator("[data-medical-activity-context]")).toBeHidden();
  const playerRow = page.locator('[data-medical-roster-row="qa-match-player"]');
  await playerRow.locator('[data-medical-quick-participation="100"]').click();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const record = (state.records || []).find((entry) => entry.playerId === "qa-match-player" && entry.date === "2026-05-16");
        return record ? `${record.participation}:${record.rtpPhase}` : "";
      }, medicalKey)
    )
    .toBe("100:match-available");
  await expect(playerRow).toHaveClass(/medical-tone-full/);
  await expect(playerRow).not.toHaveClass(/medical-tone-monitor/);
  await expect(playerRow.locator(".medical-roster-current-cell")).toHaveCount(0);
  await expect(playerRow.locator(".medical-roster-window-cell")).toHaveCount(0);
  await expect(playerRow).not.toContainText("Full Training");
  await expect(page.locator('[data-medical-ops-tab="overview"]')).toHaveCount(0);
  await expect(playerRow).toBeVisible();

  await playerRow.locator(".medical-roster-player-cell").click();
  await expect(page.locator(".medical-modal-current")).toContainText("Match Available");
  await expect(page.locator(".medical-modal-close")).toHaveText("");
  await expect(page.locator(".medical-modal-close")).toHaveAttribute("aria-label", "Close recommendation");
  const modalTabs = page.locator(".medical-modal-tabs");
  await expect(modalTabs.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(modalTabs.getByRole("tab", { name: "Medical Profile" })).toBeVisible();
  await expect(modalTabs.getByRole("tab", { name: "Medical Plan" })).toBeVisible();
  await expect(page.locator("[data-medical-recommendation-preview]")).toHaveText("100% / Match Available");
  await expect(page.locator(".medical-modal-card #medicalPlayerProfileForm")).toHaveCount(0);
  await expect(page.locator(".medical-modal-card")).not.toContainText("Save profile");
  await modalTabs.getByRole("tab", { name: "Medical Profile" }).click();
  await expect(modalTabs.getByRole("tab", { name: "Medical Profile" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".medical-modal-body-profile")).toContainText("Medical Profile");
  await expect(page.locator(".medical-modal-body-profile")).toContainText("Medical Log");
  await expect(page.locator("[data-medical-recommendation-preview]")).toHaveCount(0);
  await modalTabs.getByRole("tab", { name: "Medical Plan" }).click();
  await expect(modalTabs.getByRole("tab", { name: "Medical Plan" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".medical-modal-body-plan")).toContainText("Medical Plan");
  await expect(page.locator(".medical-modal-body-plan")).toContainText("Clearance Checklist");
  await expect(page.locator(".medical-modal-body-plan")).toContainText("Medical Plans");
  await modalTabs.getByRole("tab", { name: "Availability" }).click();
  await expect(page.locator("[data-medical-recommendation-preview]")).toHaveText("100% / Match Available");
  await page.locator(".medical-modal-close").click();

  await page.locator("[data-medical-date-picker]").evaluate((input) => {
    input.value = "2026-05-17";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("[data-medical-activity-context]")).toContainText("No Team Recommendation");
  await expect(page.locator('[data-medical-roster-row="qa-match-player"] [data-medical-quick-participation="100"]')).toBeDisabled();
  await expect(page.locator(".medical-bulk-panel")).toHaveCount(0);
  await expect(page.locator("#medicalBulkRecommendationForm")).toHaveCount(0);

  await page.locator('[data-medical-roster-row="qa-match-player"] .medical-roster-player-cell').click();
  await expect(page.locator(".medical-activity-lock")).toContainText("No scheduled training or match");
  await expect(page.locator('#medicalRecommendationForm button[type="submit"]')).toBeDisabled();
  await page.locator(".medical-modal-close").click();

  await page.locator("[data-medical-date-picker]").evaluate((input) => {
    input.value = "2026-05-18";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("[data-medical-activity-context]")).toContainText("Training Recommendation");
  await expect(page.locator("[data-medical-activity-context]")).toContainText("Training + Departure");
  await expect(page.locator('[data-medical-roster-row="qa-match-player"] [data-medical-quick-participation="100"]')).toBeEnabled();
  await page.locator('[data-medical-roster-row="qa-match-player"] [data-medical-quick-participation="100"]').click();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const record = (state.records || []).find((entry) => entry.playerId === "qa-match-player" && entry.date === "2026-05-18");
        return record ? `${record.participation}:${record.rtpPhase}` : "";
      }, medicalKey)
    )
    .toBe("100:full-training");
});

test("Medical roster overview groups by position and supports row quick recommendations", async ({ page }) => {
  await page.addInitScript(({ storageKey, playerProfilesStorageKey, playerProfilesState }) => {
    window.localStorage.setItem(playerProfilesStorageKey, JSON.stringify(playerProfilesState));
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-gk",
        rosterVersion: "qa-medical-roster-overview-v1",
        players: [
          { id: "qa-def", name: "QA Defender", position: "Defender", rosterOrder: 2 },
          { id: "qa-gk", name: "QA Goalkeeper", position: "Goalkeeper", rosterOrder: 1 },
          { id: "qa-mid", name: "QA Midfielder", position: "Midfielder", rosterOrder: 3 },
          { id: "qa-fwd", name: "QA Forward Alias", position: "F", primaryRole: "ST", roleGroup: "forward", rosterOrder: 4 },
        ],
        records: [],
        injuryPlans: [],
      })
    );
  }, {
    storageKey: medicalKey,
    playerProfilesStorageKey: playerProfilesKey,
    playerProfilesState: createQaPlayerProfilesState(
      [
        { id: "qa-def", name: "QA Defender", position: "Defender", rosterOrder: 2 },
        { id: "qa-gk", name: "QA Goalkeeper", position: "Goalkeeper", rosterOrder: 1 },
        { id: "qa-mid", name: "QA Midfielder", position: "Midfielder", rosterOrder: 3 },
        { id: "qa-fwd", name: "QA Forward Alias", position: "F", primaryRole: "ST", roleGroup: "forward", rosterOrder: 4 },
      ],
      { rosterVersion: "qa-medical-roster-overview-v1", selectedPlayerId: "qa-gk" }
    ),
  });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const positionGroups = page.locator(".medical-position-group");
  await expect(positionGroups.first()).toContainText("Goalkeeper");
  await expect(positionGroups.nth(1)).toContainText("Defender");
  await expect(positionGroups.nth(2)).toContainText("Midfielder");
  await expect(positionGroups.nth(3)).toContainText("Forward");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".medical-position-group-head strong")).map((element) =>
          element.textContent?.trim()
        )
      )
    )
    .toEqual(["Goalkeeper", "Defender", "Midfielder", "Forward"]);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bulkPanel = document.querySelector(".medical-bulk-panel");
        const commandBoard = document.querySelector(".medical-roster-panel > .medical-command-board");
        const positionOverview = document.querySelector(".medical-position-overview");
        if (!positionOverview) return "";
        const noCommandBoard = !commandBoard;
        return noCommandBoard && !bulkPanel ? "direct-list" : "wrong-order";
      })
    )
    .toBe("direct-list");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelector(".medical-position-group .medical-roster-list-head")?.children || []).map((element) =>
          element.textContent?.trim()
        )
      )
    )
    .toEqual(["Player", "Quick Recommendation"]);

  const searchInput = page.locator("[data-medical-roster-search]");
  await searchInput.click();
  await page.keyboard.type("Goal");
  await expect(searchInput).toHaveValue("Goal");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches("[data-medical-roster-search]") ?? false))
    .toBe(true);
  await expect(page.locator('[data-medical-roster-row="qa-gk"]')).toBeVisible();
  await expect(page.locator('[data-medical-roster-row="qa-def"]')).toHaveCount(0);

  const goalkeeperRow = page.locator('[data-medical-roster-row="qa-gk"]');
  await expect(goalkeeperRow).toBeVisible();
  await expect(goalkeeperRow.locator(".medical-quick-rec-button")).toHaveCount(6);
  await goalkeeperRow.locator('[data-medical-quick-participation="25"]').click();

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
        const record = (state.records || []).find((entry) => entry.playerId === "qa-gk" && entry.date === "2026-05-15");
        return record ? `${record.participation}:${record.rtpPhase}` : "";
      }, medicalKey)
    )
    .toBe("25:rehab");
});

test("Medical operations board separates signals, cases, history and season views", async ({ page }) => {
  await page.addInitScript(({ storageKey, playerProfilesStorageKey }) => {
    const localDateOffset = (offsetDays) => {
      const value = new Date();
      value.setHours(12, 0, 0, 0);
      value.setDate(value.getDate() + offsetDays);
      return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0"),
      ].join("-");
    };
    const players = [
      { id: "qa-risk", name: "QA Risk Player", position: "Forward", rosterType: "squad", countsInSquad: true, rosterOrder: 1 },
      { id: "qa-clear", name: "QA Clear Player", position: "Midfielder", rosterType: "squad", countsInSquad: true, rosterOrder: 2 },
      { id: "qa-long-term", name: "QA Long Term ACL", position: "Defender", rosterType: "squad", countsInSquad: true, rosterOrder: 3 },
      { id: "qa-guest-risk", name: "QA Guest Risk", position: "Forward", rosterType: "guest", countsInSquad: false, rosterOrder: 4 },
    ];
    window.localStorage.setItem(
      playerProfilesStorageKey,
      JSON.stringify({
        rosterVersion: "qa-medical-ops-v1",
        schemaVersion: 3,
        selectedPlayerId: "qa-risk",
        players,
        removedPlayerIds: [],
      })
    );
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-risk",
        rosterVersion: "qa-medical-ops-v1",
        players,
        records: [
          {
            id: "qa-risk-record",
            playerId: "qa-risk",
            date: "2026-05-15",
            status: "modified",
            participation: 75,
            actualParticipation: 100,
            rtpPhase: "modified-team",
            createdAt: "2026-05-15T08:00:00.000Z",
          },
          {
            id: "qa-clear-record",
            playerId: "qa-clear",
            date: "2026-05-15",
            status: "full",
            participation: 100,
            actualParticipation: 100,
            rtpPhase: "full-training",
            createdAt: "2026-05-15T08:05:00.000Z",
          },
          {
            id: "qa-guest-risk-record",
            playerId: "qa-guest-risk",
            date: "2026-05-15",
            status: "unavailable",
            participation: 0,
            actualParticipation: "not-logged",
            rtpPhase: "medical-restriction",
            createdAt: "2026-05-15T08:06:00.000Z",
          },
        ],
        injuryPlans: [
          {
            id: "qa-active-case",
            playerId: "qa-risk",
            injuryType: "ACL injury",
            bodyArea: "Knee",
            startDate: localDateOffset(-30),
            endDate: localDateOffset(90),
            duration: 4,
            durationUnit: "months",
            status: "modified",
            participation: 75,
            reviewDate: localDateOffset(-1),
            rtpPhase: "modified-team",
            phase: "Modified team integration",
            clearance: { doctor: false, physio: true, performance: false },
            gates: {
              strength: "monitor",
              gpsLoad: "pending",
              painResponse: "pass",
              wellness: "pass",
              psychologicalReadiness: "pending",
            },
            createdAt: "2026-05-01T08:00:00.000Z",
          },
          {
            id: "qa-long-term-case",
            playerId: "qa-long-term",
            injuryType: "ACL injury",
            bodyArea: "Knee",
            startDate: localDateOffset(-120),
            endDate: localDateOffset(30),
            duration: 5,
            durationUnit: "months",
            status: "unavailable",
            participation: 0,
            reviewDate: localDateOffset(-45),
            rtpPhase: "medical-restriction",
            phase: "Protected rehab",
            clearance: { doctor: false, physio: false, performance: false },
            gates: {
              strength: "pending",
              gpsLoad: "pending",
              painResponse: "pending",
              wellness: "pending",
              psychologicalReadiness: "pending",
            },
            createdAt: "2026-05-01T08:10:00.000Z",
          },
        ],
      })
    );
  }, { storageKey: medicalKey, playerProfilesStorageKey: playerProfilesKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const operationsMenu = page.locator("[data-medical-ops-top-menu]");
  await expect(operationsMenu).toBeVisible();
  await expect(operationsMenu).not.toContainText("Intelligence Board");
  await expect(operationsMenu.locator("[data-medical-ops-tab]")).toHaveCount(7);
  await expect(operationsMenu.locator('[data-medical-ops-tab="overview"]')).toHaveCount(0);
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveText("Availability");
  await expect(operationsMenu.locator('[data-medical-ops-tab="programs"]')).toHaveText("Rehab Programs");
  await expect(operationsMenu.locator('[data-medical-ops-tab="rtp-library"]')).toHaveText("RTP Library");
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-medical-availability-workspace]")).toBeVisible();
  await expect(page.locator(".medical-position-overview")).toBeVisible();
  await expect(page.locator("[data-medical-operations-system]")).toHaveCount(0);
  const menuPlacement = await page.evaluate(() => {
    const menu = document.querySelector("[data-medical-ops-top-menu]");
    const firstTab = menu?.querySelector("[data-medical-ops-tab]");
    const availabilityWorkspace = document.querySelector("[data-medical-availability-workspace]");
    return {
      menuTop: menu?.getBoundingClientRect().top ?? 0,
      menuLeft: menu?.getBoundingClientRect().left ?? 0,
      firstTabLeft: firstTab?.getBoundingClientRect().left ?? 0,
      workspaceTop: availabilityWorkspace?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(menuPlacement.menuTop).toBeLessThan(menuPlacement.workspaceTop);
  expect(menuPlacement.firstTabLeft - menuPlacement.menuLeft).toBeLessThan(20);

  await operationsMenu.locator('[data-medical-ops-tab="cases"]').click();
  const operations = page.locator("[data-medical-operations-system]");
  await expect(operations).toBeVisible();
  await expect(operations.locator("[data-medical-ops-tab]")).toHaveCount(0);
  await expect(page.locator("[data-medical-availability-workspace]")).toHaveCount(0);
  await expect(operations).toContainText("ACL injury");
  const activeCaseBoard = operations.locator(".medical-ops-cases-table");
  await expect(activeCaseBoard).toContainText("QA Long Term ACL");
  await expect(activeCaseBoard.locator('[data-medical-select-player="qa-long-term"]')).toContainText("ACL injury");

  await operationsMenu.locator('[data-medical-ops-tab="availability"]').click();
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-medical-availability-workspace]")).toBeVisible();
  await expect(page.locator(".medical-position-overview")).toBeVisible();
  await expect(page.locator("[data-medical-operations-system]")).toHaveCount(0);

  await operationsMenu.locator('[data-medical-ops-tab="signals"]').click();
  await expect(operations).toContainText("75% recommendation");
  await expect(operations).not.toContainText("Actual exceeded recommendation");
  const signalsTable = operations.locator(".medical-ops-signals-table");
  await expect(signalsTable).toContainText("QA Risk Player");
  await expect(signalsTable).not.toContainText("QA Clear Player");
  await expect(signalsTable).not.toContainText("QA Guest Risk");

  await operationsMenu.locator('[data-medical-ops-tab="cases"]').click();
  await expect(operations).toContainText("Review overdue");
  await expect(operations).toContainText("1/3 sign-off");

  await operationsMenu.locator('[data-medical-ops-tab="programs"]').click();
  const programsLayout = operations.locator(".medical-programs-layout");
  await expect(programsLayout).toBeVisible();
  await expect(programsLayout).toHaveAttribute("data-medical-program-view", "list");
  await expect(operations.locator(".medical-program-list-panel")).toContainText("QA Long Term ACL");
  await expect(operations.locator(".medical-program-board-card")).toBeHidden();
  await operations.locator('[data-medical-select-board-plan="qa-long-term-case"]').click();
  await expect(programsLayout).toHaveAttribute("data-medical-program-view", "detail");
  await expect(operations.locator(".medical-program-list-panel")).toBeHidden();
  await expect(operations.locator(".medical-program-board-card")).toBeVisible();
  await expect(operations.locator(".medical-program-board-card")).toContainText("Medical RTP program");
  await expect(operations.locator(".medical-program-board-card")).toContainText("Current player program");
  await expect(operations.locator(".medical-program-board-card")).toContainText("Next most important action");
  await expect(operations.locator(".medical-program-secondary-tool")).toContainText("Field Board");
  await operations.locator("[data-medical-programs-back]").click();
  await expect(programsLayout).toHaveAttribute("data-medical-program-view", "list");

  await operationsMenu.locator('[data-medical-ops-tab="history"]').click();
  await expect(operations).toContainText("Case opened");
  await expect(operations).toContainText("Recommendation");
  const historyTable = operations.locator(".medical-ops-history-table");
  const historyFilterForm = operations.locator("[data-medical-history-filter-form]");
  await expect(historyFilterForm).toBeVisible();
  await expect(historyFilterForm.locator("[data-medical-history-search]")).toBeVisible();
  await expect(historyFilterForm.locator("[data-medical-history-date-filter]")).toBeVisible();
  await expect(historyFilterForm.locator("[data-medical-history-player-filter]")).toBeVisible();
  await expect(historyTable).toContainText("QA Risk Player");
  await expect(historyTable).not.toContainText("QA Clear Player");
  await historyFilterForm.locator("[data-medical-history-search]").fill("long term");
  await historyFilterForm.locator(".medical-ops-history-search-button").click();
  await expect(historyTable).toContainText("QA Long Term ACL");
  await expect(historyTable).not.toContainText("QA Risk Player");
  await historyFilterForm.locator("[data-medical-history-search]").fill("");
  await historyFilterForm.locator(".medical-ops-history-search-button").click();
  await historyFilterForm.locator("[data-medical-history-date-filter]").selectOption("2026-05-15");
  await expect(historyTable).toContainText("Recommendation");
  await expect(historyTable).not.toContainText("Case opened");
  await historyFilterForm.locator("[data-medical-history-player-filter]").selectOption("qa-risk");
  await expect(historyTable).toContainText("QA Risk Player");
  await expect(historyTable).not.toContainText("QA Long Term ACL");

  await operationsMenu.locator('[data-medical-ops-tab="rtp-library"]').click();
  await expect(operations.locator(".medical-rtp-library-hero")).toHaveCount(0);
  await expect(operations).not.toContainText("Medical-safe injury knowledge");
  await expect(operations).toContainText("Clinical search");
  await expect(operations.locator("[data-medical-open-rtp-guide-draft]")).toBeVisible();
  const guideDraftModal = operations.locator("[data-medical-rtp-guide-draft-modal]");
  await expect(guideDraftModal).toBeHidden();
  await operations.locator("[data-medical-open-rtp-guide-draft]").click();
  await expect(guideDraftModal).toBeVisible();
  await expect(guideDraftModal).toContainText("Create guide draft");
  await expect(guideDraftModal).toContainText("Copy guide template");
  await guideDraftModal.locator("[data-medical-close-rtp-guide-draft]").last().click();
  await expect(guideDraftModal).toBeHidden();
  const rtpTrigger = operations.locator('.medical-rtp-profile-trigger[data-medical-open-rtp-profile="hamstring-strain"]');
  await expect(rtpTrigger).toBeVisible();
  await expect(operations.locator("[data-medical-rtp-library-shown]")).toHaveText("24");
  await expect(operations.locator("[data-medical-rtp-library-more]")).toBeVisible();
  await operations.locator("[data-medical-rtp-library-more]").click();
  await expect(operations.locator("[data-medical-rtp-library-shown]")).toHaveText("48");
  const rtpModal = operations.locator("[data-medical-rtp-profile-modal]");
  await expect(rtpModal).toBeHidden();
  await rtpTrigger.click();
  await expect(rtpModal).toBeVisible();
  await expect(rtpModal).toContainText("Quick clinical summary");
  await expect(rtpModal).toContainText("Medical-safe evidence");
  await expect(rtpModal).toContainText("Next field exposure");
  await expect(rtpModal).toContainText("Exercise starters");
  await expect(rtpModal).not.toContainText("Gold Standard Template");
  await expect(rtpModal).toContainText("37 sections");
  await expect(rtpModal).toContainText("Club-neutral knowledge");
  await expect(rtpModal).toContainText("To build a player program");
  await expect(rtpModal).toContainText("Knowledge only");
  await expect(rtpModal.locator("[data-medical-apply-rtp-starter]")).toHaveCount(0);
  const clinicalGroupButton = rtpModal.locator('[data-medical-rtp-guide-group="clinical"]');
  await clinicalGroupButton.click();
  await expect(clinicalGroupButton).toHaveAttribute("aria-pressed", "true");
  await expect(rtpModal.locator('[data-medical-rtp-guide-group-panel="clinical"]')).toBeVisible();
  await expect(rtpModal.locator('[data-medical-rtp-guide-group-panel="decision"]')).toBeHidden();
  await rtpModal.locator("[data-medical-close-rtp-profile]").last().click();
  await expect(rtpModal).toBeHidden();
  await expect(page.locator("[data-medical-availability-workspace]")).toHaveCount(0);

  await operationsMenu.locator('[data-medical-ops-tab="programs"]').click();
  await expect(operations.locator(".medical-rtp-case-workspace")).toHaveCount(0);
  await expect(operations.locator(".medical-rtp-case-linker")).toHaveCount(0);
  await expect(operations.locator(".medical-rtp-exercise-launcher")).toHaveCount(0);
  await expect(operations.locator(".medical-programs-resource-bar")).toBeVisible();
  const exerciseOverlay = operations.locator("[data-medical-rtp-exercise-overlay]");
  await expect(exerciseOverlay).toBeHidden();
  await operations.locator("[data-medical-rtp-exercise-open]").click();
  await expect(exerciseOverlay).toBeVisible();
  await expect(exerciseOverlay.locator("[data-medical-rtp-exercise]")).toHaveCount(72);
  await expect(exerciseOverlay.locator(".medical-rtp-exercise-diagram")).toHaveCount(72);
  await expect(exerciseOverlay).not.toContainText("diagram placeholder");
  await exerciseOverlay.locator("[data-medical-rtp-exercise-close]").click();
  await expect(exerciseOverlay).toBeHidden();

  await operationsMenu.locator('[data-medical-ops-tab="season"]').click();
  await expect(operations).toContainText("Managed days");
  await expect(operations).toContainText("Major");
});

test("Medical availability list keeps participation states after overview removal", async ({ page }) => {
  await page.addInitScript(({ medicalStorageKey, playerProfilesStorageKey, scheduleStorageKey }) => {
    const players = [
      { id: "qa-positive-missing", name: "QA Positive Missing", position: "Forward", rosterType: "squad", countsInSquad: true, rosterOrder: 1 },
      { id: "qa-unavailable", name: "QA Unavailable", position: "Defender", rosterType: "squad", countsInSquad: true, rosterOrder: 2 },
      { id: "qa-not-set", name: "QA Not Set", position: "Midfielder", rosterType: "squad", countsInSquad: true, rosterOrder: 3 },
      { id: "qa-logged", name: "QA Logged", position: "Goalkeeper", rosterType: "squad", countsInSquad: true, rosterOrder: 4 },
    ];
    window.localStorage.setItem(
      scheduleStorageKey,
      JSON.stringify({
        selectedYear: 2026,
        selectedMonthIndex: 4,
        selectedDate: "2026-05-15",
        viewMode: "month",
        overviewSpan: 6,
        visibleEventTypes: ["training", "match", "meeting", "travel", "recovery", "off"],
        importVersion: "qa-medical-actual-missing-v1",
        events: [{ id: "qa-training", date: "2026-05-15", time: "10:00", type: "training", title: "Training", note: "" }],
      })
    );
    window.localStorage.setItem(
      playerProfilesStorageKey,
      JSON.stringify({
        rosterVersion: "qa-medical-actual-missing-v1",
        schemaVersion: 3,
        selectedPlayerId: "qa-positive-missing",
        players,
        removedPlayerIds: [],
      })
    );
    window.localStorage.setItem(
      medicalStorageKey,
      JSON.stringify({
        selectedDate: "2026-05-15",
        selectedPlayerId: "qa-positive-missing",
        rosterVersion: "qa-medical-actual-missing-v1",
        players,
        records: [
          {
            id: "qa-positive-missing-record",
            playerId: "qa-positive-missing",
            date: "2026-05-15",
            status: "modified",
            participation: 75,
            actualParticipation: "not-logged",
            rtpPhase: "modified-team",
            createdAt: "2026-05-15T08:00:00.000Z",
          },
          {
            id: "qa-unavailable-record",
            playerId: "qa-unavailable",
            date: "2026-05-15",
            status: "unavailable",
            participation: 0,
            actualParticipation: "not-logged",
            rtpPhase: "medical-restriction",
            createdAt: "2026-05-15T08:01:00.000Z",
          },
          {
            id: "qa-logged-record",
            playerId: "qa-logged",
            date: "2026-05-15",
            status: "full",
            participation: 100,
            actualParticipation: 100,
            rtpPhase: "full-training",
            createdAt: "2026-05-15T08:02:00.000Z",
          },
        ],
        injuryPlans: [],
      })
    );
  }, { medicalStorageKey: medicalKey, playerProfilesStorageKey: playerProfilesKey, scheduleStorageKey: scheduleKey });

  await bootApp(page);
  await openWorkspace(page, "medical-team");

  const operationsMenu = page.locator("[data-medical-ops-top-menu]");
  await expect(operationsMenu.locator('[data-medical-ops-tab="overview"]')).toHaveCount(0);
  await expect(operationsMenu.locator('[data-medical-ops-tab="availability"]')).toHaveClass(/is-active/);
  await expect(page.locator("[data-medical-availability-workspace]")).toBeVisible();
  await expect(page.locator(".medical-command-card").filter({ hasText: "Recommendation Queue" })).toHaveCount(0);
  await expect(page.locator(".medical-metric-card").filter({ hasText: "Full" })).toContainText("1");
  await expect(page.locator(".medical-metric-card").filter({ hasText: "Modified" })).toContainText("1");
  await expect(page.locator(".medical-metric-card").filter({ hasText: "Unavailable" })).toContainText("1");
  await expect(page.locator(".medical-metric-card").filter({ hasText: "Not set" })).toContainText("no entry");
  await expect(page.locator('[data-medical-roster-row="qa-positive-missing"] .medical-quick-rec-button.is-active')).toHaveText("75%");
  await expect(page.locator('[data-medical-roster-row="qa-unavailable"] .medical-quick-rec-button.is-active')).toHaveText("0%");
  await expect(page.locator('[data-medical-roster-row="qa-logged"] .medical-quick-rec-button.is-active')).toHaveText("100%");
  await expect(page.locator('[data-medical-roster-row="qa-not-set"] .medical-quick-rec-button.is-active')).toHaveCount(0);
});

test("Squad removal keeps default roster players hidden after reload", async ({ page }) => {
  const removedPlayerId = "ncc-2026-ally-schlegel";
  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const nextUser = { ...currentUser, role: "admin" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });
  await openWorkspace(page, "player-profiles");

  const removedPlayerRow = page.locator(`[data-player-profile-select="${removedPlayerId}"]`);
  await expect(removedPlayerRow).toContainText("Ally Schlegel");
  await removedPlayerRow.click();
  await expect(page.locator(".squad-profile-modal")).toBeVisible();
  await page.locator('[data-player-profile-tab="history"]').click();
  await page.locator(`[data-player-profile-remove="${removedPlayerId}"]`).click();
  await confirmPlatformDialog(page, "Remove player?");

  await expect(page.locator(`[data-player-profile-select="${removedPlayerId}"]`)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, playerId }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          return {
            isListed: Array.isArray(state.players) ? state.players.some((player) => player.id === playerId) : false,
            isTombstoned: Array.isArray(state.removedPlayerIds) ? state.removedPlayerIds.includes(playerId) : false,
          };
        },
        { storageKey: playerProfilesKey, playerId: removedPlayerId }
      )
    )
    .toMatchObject({ isListed: false, isTombstoned: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await dismissDashboardModal(page);
  await openWorkspace(page, "player-profiles");
  await expect(page.locator(`[data-player-profile-select="${removedPlayerId}"]`)).toHaveCount(0);
});

test("Medical Room hides stale active players that were removed from Squad", async ({ page }) => {
  const removedPlayerId = "ncc-2026-cortnee-vine";
  await page.addInitScript(
    ({ profileStorageKey, medicalStorageKey, removedPlayerId }) => {
      const now = "2026-05-27T12:00:00.000Z";
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          rosterVersion: "qa-squad-removed-player-guard",
          schemaVersion: 3,
          selectedPlayerId: "",
          players: [],
          removedPlayerIds: [removedPlayerId],
          updatedAt: now,
        })
      );
      window.localStorage.setItem(
        medicalStorageKey,
        JSON.stringify({
          rosterVersion: "qa-medical-stale-removed-player",
          selectedDate: "2026-05-19",
          selectedPlayerId: removedPlayerId,
          players: [
            {
              id: removedPlayerId,
              name: "Cortnee Vine",
              number: "",
              position: "Forward",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: now,
              updatedAt: now,
            },
          ],
          records: [
            {
              id: "qa-cortnee-stale-record",
              playerId: removedPlayerId,
              date: "2026-05-19",
              status: "full",
              participation: 100,
              rtpPhase: "full-training",
              createdAt: now,
              updatedAt: now,
            },
          ],
          injuryPlans: [
            {
              id: "qa-cortnee-stale-plan",
              playerId: removedPlayerId,
              injuryType: "Old plan",
              bodyArea: "",
              startDate: "2026-05-19",
              endDate: "2026-05-26",
              duration: 1,
              durationUnit: "weeks",
              status: "unavailable",
              participation: 0,
              rtpPhase: "medical-restriction",
              createdAt: now,
              updatedAt: now,
            },
          ],
        })
      );
    },
    { profileStorageKey: playerProfilesKey, medicalStorageKey: medicalKey, removedPlayerId }
  );

  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const nextUser = { ...currentUser, role: "admin" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });
  await openWorkspace(page, "medical-team");

  await expect(page.locator(`[data-medical-roster-row="${removedPlayerId}"]`)).toHaveCount(0);
  await expect(page.locator("#medicalTeamWorkspace")).not.toContainText("Cortnee Vine");
  await expect
    .poll(() =>
      page.evaluate(
        ({ medicalStorageKey, removedPlayerId }) => {
          const medicalState = JSON.parse(window.localStorage.getItem(medicalStorageKey) || "{}");
          const player = Array.isArray(medicalState.players)
            ? medicalState.players.find((entry) => entry.id === removedPlayerId)
            : null;
          const record = Array.isArray(medicalState.records)
            ? medicalState.records.find((entry) => entry.id === "qa-cortnee-stale-record")
            : null;
          const plan = Array.isArray(medicalState.injuryPlans)
            ? medicalState.injuryPlans.find((entry) => entry.id === "qa-cortnee-stale-plan")
            : null;
          return {
            playerArchived: Boolean(player?.archivedAt),
            recordArchived: Boolean(record?.archivedAt),
            planArchived: Boolean(plan?.archivedAt),
          };
        },
        { medicalStorageKey: medicalKey, removedPlayerId }
      )
    )
    .toEqual({ playerArchived: true, recordArchived: true, planArchived: true });
});

test("Medical Room keeps current selection when another removed Squad player gets archived", async ({ page }) => {
  const removedPlayerId = "qa-removed-medical-player";
  const activePlayerId = "qa-active-medical-player";
  await page.addInitScript(
    ({ profileStorageKey, medicalStorageKey, removedPlayerId, activePlayerId }) => {
      const now = "2026-05-27T12:00:00.000Z";
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          rosterVersion: "qa-medical-selection-guard",
          schemaVersion: 3,
          selectedPlayerId: activePlayerId,
          players: [
            {
              id: activePlayerId,
              name: "QA Active Player",
              number: "8",
              position: "Midfielder",
              status: "available",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: now,
              updatedAt: now,
            },
          ],
          removedPlayerIds: [removedPlayerId],
          updatedAt: now,
        })
      );
      window.localStorage.setItem(
        medicalStorageKey,
        JSON.stringify({
          rosterVersion: "qa-medical-selection-guard",
          selectedDate: "2026-05-19",
          selectedPlayerId: activePlayerId,
          players: [
            {
              id: activePlayerId,
              name: "QA Active Player",
              number: "8",
              position: "Midfielder",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: removedPlayerId,
              name: "QA Removed Player",
              number: "17",
              position: "Forward",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: now,
              updatedAt: now,
            },
          ],
          records: [],
          injuryPlans: [],
        })
      );
    },
    { profileStorageKey: playerProfilesKey, medicalStorageKey: medicalKey, removedPlayerId, activePlayerId }
  );

  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const nextUser = { ...currentUser, role: "admin" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });
  await openWorkspace(page, "medical-team");

  await expect(page.locator(`[data-medical-roster-row="${removedPlayerId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-medical-roster-row="${activePlayerId}"]`)).toContainText("QA Active Player");
  await expect
    .poll(() =>
      page.evaluate(
        ({ medicalStorageKey }) => JSON.parse(window.localStorage.getItem(medicalStorageKey) || "{}").selectedPlayerId,
        { medicalStorageKey: medicalKey }
      )
    )
    .toBe(activePlayerId);
});

test("Squad removal archives matching Medical player and removes planner availability", async ({ page }) => {
  const playerName = `QA Remove Everywhere ${Date.now()}`;
  const squadPlayerId = "qa-squad-remove-everywhere";
  const medicalPlayerId = "qa-medical-remove-everywhere";
  await seedQaSessionPlannerTrainingSession(page);
  await page.addInitScript(
    ({ profileStorageKey, medicalStorageKey, playerName, squadPlayerId, medicalPlayerId }) => {
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          rosterVersion: "qa-squad-remove-everywhere",
          schemaVersion: 3,
          selectedPlayerId: squadPlayerId,
          players: [
            {
              id: squadPlayerId,
              name: playerName,
              number: "77",
              position: "Forward",
              primaryRole: "ST",
              roleGroup: "forward",
              status: "available",
              squadStatus: "important",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: "2026-05-27T12:00:00.000Z",
              updatedAt: "2026-05-27T12:00:00.000Z",
            },
          ],
          removedPlayerIds: [],
          updatedAt: "2026-05-27T12:00:00.000Z",
        })
      );
      window.localStorage.setItem(
        medicalStorageKey,
        JSON.stringify({
          rosterVersion: "qa-medical-remove-everywhere",
          selectedDate: "2026-05-19",
          selectedPlayerId: medicalPlayerId,
          players: [
            {
              id: medicalPlayerId,
              name: playerName,
              number: "77",
              position: "Forward",
              primaryRole: "ST",
              roleGroup: "forward",
              rosterType: "squad",
              countsInSquad: true,
              createdAt: "2026-05-27T12:00:00.000Z",
              updatedAt: "2026-05-27T12:00:00.000Z",
            },
          ],
          records: [
            {
              id: "qa-remove-medical-record",
              playerId: medicalPlayerId,
              date: "2026-05-19",
              status: "available",
              participation: 100,
              createdAt: "2026-05-27T12:00:00.000Z",
            },
          ],
          injuryPlans: [
            {
              id: "qa-remove-medical-plan",
              playerId: medicalPlayerId,
              startDate: "2026-05-19",
              endDate: "2026-05-26",
              duration: 1,
              durationUnit: "weeks",
              status: "active",
              participation: 50,
              createdAt: "2026-05-27T12:00:00.000Z",
            },
          ],
        })
      );
    },
    { profileStorageKey: playerProfilesKey, medicalStorageKey: medicalKey, playerName, squadPlayerId, medicalPlayerId }
  );
  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const nextUser = { ...currentUser, role: "admin" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });

  await openWorkspace(page, "player-profiles");
  await page.locator(`[data-player-profile-select="${squadPlayerId}"]`).click();
  await expect(page.locator(".squad-profile-modal")).toBeVisible();
  await page.locator('[data-player-profile-tab="history"]').click();
  await page.locator(`[data-player-profile-remove="${squadPlayerId}"]`).click();
  await confirmPlatformDialog(page, "Remove player?");
  await expect(page.locator(`[data-player-profile-select="${squadPlayerId}"]`)).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(
        ({ profileStorageKey, medicalStorageKey, squadPlayerId, medicalPlayerId }) => {
          const profileState = JSON.parse(window.localStorage.getItem(profileStorageKey) || "{}");
          const medicalState = JSON.parse(window.localStorage.getItem(medicalStorageKey) || "{}");
          const medicalPlayer = Array.isArray(medicalState.players)
            ? medicalState.players.find((player) => player.id === medicalPlayerId)
            : null;
          const medicalRecord = Array.isArray(medicalState.records)
            ? medicalState.records.find((record) => record.id === "qa-remove-medical-record")
            : null;
          const medicalPlan = Array.isArray(medicalState.injuryPlans)
            ? medicalState.injuryPlans.find((plan) => plan.id === "qa-remove-medical-plan")
            : null;
          return {
            profileListed: Array.isArray(profileState.players)
              ? profileState.players.some((player) => player.id === squadPlayerId)
              : false,
            profileTombstoned: Array.isArray(profileState.removedPlayerIds)
              ? profileState.removedPlayerIds.includes(squadPlayerId)
              : false,
            medicalArchived: Boolean(medicalPlayer?.archivedAt),
            medicalRecordArchived: Boolean(medicalRecord?.archivedAt),
            medicalPlanArchived: Boolean(medicalPlan?.archivedAt),
          };
        },
        { profileStorageKey: playerProfilesKey, medicalStorageKey: medicalKey, squadPlayerId, medicalPlayerId }
      )
    )
    .toMatchObject({
      profileListed: false,
      profileTombstoned: true,
      medicalArchived: true,
      medicalRecordArchived: true,
      medicalPlanArchived: true,
    });

  await openWorkspace(page, "medical-team");
  await expect(page.locator(`[data-medical-roster-row="${medicalPlayerId}"]`)).toHaveCount(0);

  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  await sessionPlannerWorkspace.locator("[data-session-open-player-board]").click();
  await expect(page.locator(".session-player-board-token", { hasText: playerName })).toHaveCount(0);
});

test("Squad add creates a Medical roster slot and Session Planner placement", async ({ page }) => {
  const playerName = `QA Squad Placement ${Date.now()}`;
  let squadAgeRequests = 0;
  await seedQaSessionPlannerTrainingSession(page);
  await bootApp(page);
  await page.route("**/api/squad-ages", async (route) => {
    squadAgeRequests += 1;
    const body = route.request().postDataJSON();
    const players = Array.isArray(body?.players) ? body.players : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        schema: "footballscience-squad-age-hydration-v1",
        checkedAt: new Date().toISOString(),
        checkedProfileIds: players.map((player) => player.profileId).filter(Boolean),
        players: players
          .filter((player) => player.name === "Madison White")
          .map((player) => ({
            profileId: player.profileId,
            name: player.name,
            birthDate: "2000-01-01",
            databasePlayerId: "11111111-1111-4111-8111-111111111111",
            source: "squad_players",
          })),
      }),
    });
  });
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    store.getAccessToken = async () => "qa-token";
    window.localStorage.removeItem("football-player-profile-age-cache-v1");
    window.localStorage.setItem(
      "football-platform-structure-v1",
      JSON.stringify({
        version: 1,
        activeClubId: "club-riverside",
        activeTeamId: "team-riverside-first",
        clubs: [{ id: "club-riverside", name: "Riverside Club", shortName: "RC", status: "active" }],
        teams: [
          {
            id: "team-riverside-first",
            clubId: "club-riverside",
            name: "Riverside FC",
            shortName: "RFC",
            level: "First Team",
            season: "2026",
            status: "active",
          },
          {
            id: "team-football-science-live",
            clubId: "club-riverside",
            name: "Football Science Live",
            shortName: "FSL",
            level: "Legacy placeholder",
            season: "2026",
            status: "active",
          },
        ],
        memberships: [],
      })
    );
    const nextUser = { ...currentUser, team: "Football Science Live", teamName: "Football Science Live", teamId: "" };
    store.writeUsers([nextUser, ...store.getUsers().filter((user) => user.id !== nextUser.id)]);
    store.setCurrentUser(nextUser.id);
  });
  await openWorkspace(page, "player-profiles");
  await expect(page.locator('#workspaceList [data-open-workspace="player-profiles"]')).toHaveAttribute(
    "aria-label",
    "Squad Room"
  );
  await expect(page.locator(".squad-command-title h1")).toHaveText("Riverside FC");
  await expect(page.locator(".squad-command-title")).not.toContainText("Player profiles");
  await expect(page.locator(".squad-command-title .squad-command-list-summary")).toHaveCount(0);
  await expect(page.locator(".squad-command-actions [data-player-profile-new-open]")).toBeVisible();
  await expect(page.locator(".squad-command-tools [data-player-profile-new-open]")).toHaveCount(0);
  await expect(page.locator('[data-squad-roster-section="squad"] .squad-roster-section-head')).toContainText(
    "Squad List"
  );
  await expect(page.locator('[data-squad-roster-section="squad"] .squad-roster-section-head')).toContainText(
    /\d+\/\d+ squad/
  );
  await expect(page.locator(".squad-command-tools .squad-command-list-summary")).toHaveCount(0);
  await expect(page.locator(".squad-table thead").first()).toContainText("Age");
  await expect(page.locator(".squad-table thead").first()).not.toContainText("Medical");
  await expect(page.locator(".squad-table thead").first()).toContainText("IDP");
  await expect(page.locator(".squad-table thead").first()).not.toContainText("Profile");
  await expect(page.locator(".squad-table thead").first()).toContainText("Season availability");
  await expect(page.locator(".squad-table thead").first()).toContainText("Last 2 Weeks");
  await expect(page.locator(".squad-player-row").first()).toContainText("Goalkeeper");
  await expect(page.locator(".squad-player-row").first().locator(".squad-age-cell")).toHaveText(/^-|\d+$/);
  await expect(page.locator('[data-player-profile-select="ncc-2026-madison-white"] .squad-age-cell')).toHaveText(
    getQaAgeFromBirthDate("2000-01-01")
  );
  expect(squadAgeRequests).toBe(1);
  await openWorkspace(page, "home");
  await openWorkspace(page, "player-profiles");
  await page.waitForTimeout(200);
  expect(squadAgeRequests).toBe(1);
  await expect
    .poll(async () => {
      const playerCell = await page.locator(".squad-player-row").first().locator("td").nth(0).boundingBox();
      return playerCell ? Math.round(playerCell.width) : 999;
    })
    .toBeLessThanOrEqual(290);
  await expect
    .poll(async () => {
      const ageCell = await page.locator(".squad-player-row").first().locator("td").nth(1).boundingBox();
      return ageCell ? Math.round(ageCell.width) : 999;
    })
    .toBeLessThanOrEqual(90);
  await expect(page.locator(".squad-player-row").first().locator(".squad-role-cell small")).toHaveCount(0);
  await expect(page.locator(".squad-table thead").first()).not.toContainText("Planning");
  await expect(page.locator(".squad-player-row").first().locator(".squad-planning-cell")).toHaveCount(0);
  await expect(page.locator(".squad-player-row").first().locator(".squad-profile-progress-cell")).toHaveCount(0);
  await expect(page.locator(".squad-player-row").first().locator(".squad-availability-cell")).toHaveCount(2);
  await expect(page.locator(".squad-player-row").first()).not.toContainText("Squad player");
  const firstIdpCell = page.locator(".squad-player-row").first().locator(".squad-idp-cell");
  await expect(firstIdpCell).toContainText(/IDP|Review|Monitor/);
  await expect(firstIdpCell).toContainText(/Review|Next:|follow-up|No IDP focus|No active IDP/);
  await expect(firstIdpCell).not.toContainText("Distribution, claiming");
  const squadSearch = page.locator("[data-player-profile-search]").first();
  await squadSearch.click();
  await page.keyboard.type("Mad");
  await expect(squadSearch).toHaveValue("Mad");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches("[data-player-profile-search]") || false))
    .toBe(true);
  await squadSearch.fill("");
  await page.locator("[data-squad-team-logo-upload]").setInputFiles({
    name: "riverside-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const structure = JSON.parse(window.localStorage.getItem("football-platform-structure-v1") || "{}");
        return structure.teams?.find((team) => team.id === "team-riverside-first")?.logoUrl || "";
      })
    )
    .toMatch(/^data:image\//);
  await expect(page.locator(".squad-team-logo-mark img")).toBeVisible();
  await expect
    .poll(async () => {
      const box = await page.locator(".squad-team-logo-mark").first().boundingBox();
      return box ? Math.round(Math.min(box.width, box.height)) : 0;
    })
    .toBeGreaterThanOrEqual(68);

  await page.locator("[data-player-profile-new-open]").click();
  const form = page.locator("#playerProfileNewPlayerForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(playerName);
  await form.locator('input[name="number"]').fill("88");
  await form.locator('input[name="birthDate"]').fill("2005-02-03");
  await form.locator('input[name="position"]').fill("Midfielder");
  await form.locator('select[name="primaryRole"]').selectOption("8");
  await form.locator('button[type="submit"]').click();

  await expectStorageContains(page, playerProfilesKey, playerName);
  await expect(page.locator(".squad-player-row", { hasText: playerName }).first().locator(".squad-age-cell")).toHaveText(
    getQaAgeFromBirthDate("2005-02-03")
  );
  await expectStorageContains(page, medicalKey, playerName);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? {
                idMatchesProfile: Boolean(player.id),
                countsInSquad: player.countsInSquad,
              }
            : null;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toMatchObject({
      idMatchesProfile: true,
      countsInSquad: true,
    });

  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  await expect
    .poll(async () => {
      const warnings = sessionPlannerWorkspace.locator(".session-player-board-warning-row.is-unset small");
      const count = await warnings.count();
      if (!count) return "";
      return (await warnings.allTextContents()).join(" | ");
    })
    .toContain(playerName);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? Boolean((state.records || []).some((record) => record.playerId === player.id))
            : true;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toBe(false);
});

test("Academy Squad add is available for session planning without Medical clearance", async ({ page }) => {
  const playerName = `QA Academy Planner ${Date.now()}`;
  await seedQaSessionPlannerTrainingSession(page);
  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  await page.locator("[data-player-profile-new-open]").click();
  const form = page.locator("#playerProfileNewPlayerForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill(playerName);
  await form.locator('input[name="number"]').fill("89");
  await form.locator('input[name="position"]').fill("Forward");
  await form.locator('select[name="primaryRole"]').selectOption("ST");
  await form.locator('select[name="rosterType"]').selectOption("academy");
  await form.locator('button[type="submit"]').click();

  await expectStorageContains(page, playerProfilesKey, playerName);
  const squadSection = page.locator('[data-squad-roster-section="squad"]');
  const guestSection = page.locator('[data-squad-roster-section="temporary"]');
  await expect(squadSection).toBeVisible();
  await expect(guestSection).toBeVisible();
  const guestToggle = guestSection.locator("[data-squad-temporary-toggle]");
  const guestRow = guestSection.locator(".squad-player-row", { hasText: playerName });
  await expect(guestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(guestToggle).toContainText("Show");
  await expect(guestRow).toHaveCount(0);
  await guestToggle.click();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await expect(guestRow).toBeVisible();
  await expect(guestRow).toContainText("Academy training");
  await expect(guestRow).not.toContainText("Squad depth");
  await expect(squadSection.locator(".squad-player-row", { hasText: playerName })).toHaveCount(0);
  await page.locator("[data-player-profile-roster-filter]").selectOption("squad");
  await expect(guestSection).toBeVisible();
  await expect(guestRow).toBeVisible();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await guestToggle.click();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(guestSection.locator(".squad-player-row", { hasText: playerName })).toHaveCount(0);
  await guestToggle.click();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await expect(guestRow).toBeVisible();
  const squadBox = await squadSection.boundingBox();
  const guestBox = await guestSection.boundingBox();
  expect(squadBox).not.toBeNull();
  expect(guestBox).not.toBeNull();
  expect(guestBox.y).toBeGreaterThan(squadBox.y);
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, name }) => {
          const state = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          const player = Array.isArray(state.players)
            ? state.players.find((candidate) => candidate.name === name)
            : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                hasMedicalRecord: Boolean((state.records || []).some((record) => record.playerId === player.id)),
              }
            : null;
        },
        { storageKey: medicalKey, name: playerName }
      )
    )
    .toMatchObject({
      countsInSquad: false,
      rosterType: "academy",
      hasMedicalRecord: false,
    });

  await openWorkspace(page, "session-planner");
  const sessionPlannerWorkspace = await waitForSessionPlannerWorkspace(page);
  await sessionPlannerWorkspace.locator("[data-session-open-player-board]").click();
  await expect(
    page.locator(`.session-player-board-token[aria-label^="${playerName}, 100% available"]`)
  ).toBeVisible();
});

test("Squad training guests keeps inactive temporary players visible", async ({ page }) => {
  const playerName = `QA Inactive Guest ${Date.now()}`;
  await page.addInitScript(
    ({ storageKey, player }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          selectedPlayerId: player.id,
          players: [player],
          updatedAt: "2026-05-27T12:00:00.000Z",
        })
      );
    },
    {
      storageKey: playerProfilesKey,
      player: {
        id: "qa-inactive-training-guest",
        name: playerName,
        number: "91",
        position: "Forward",
        primaryRole: "ST",
        roleGroup: "forward",
        status: "unavailable",
        rosterType: "inactive",
        temporaryGroup: "Academy Training Group",
        temporaryFrom: "2026-05-01",
        temporaryTo: "2026-05-02",
        idp: { status: "none" },
      },
    }
  );

  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  const squadSection = page.locator('[data-squad-roster-section="squad"]');
  const guestSection = page.locator('[data-squad-roster-section="temporary"]');
  await expect(squadSection).toBeVisible();
  await expect(guestSection).toBeVisible();
  const guestToggle = guestSection.locator("[data-squad-temporary-toggle]");
  const guestRow = guestSection.locator(".squad-player-row", { hasText: playerName });
  await expect(guestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(guestRow).toHaveCount(0);
  await guestToggle.click();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await expect(guestRow).toBeVisible();
  await expect(guestRow).toContainText("Guest");
  await expect(guestRow).toContainText("Academy Training Group");
  await expect(guestRow).toContainText("Unavailable");
  await expect(squadSection.locator(".squad-player-row", { hasText: playerName })).toHaveCount(0);
});

test("Squad Room shows legacy Medical training guests outside their active dates", async ({ page }) => {
  const playerName = `QA Legacy Medical Guest ${Date.now()}`;
  await page.addInitScript(
    ({ medicalStorageKey, profileStorageKey, player }) => {
      window.localStorage.setItem(
        medicalStorageKey,
        JSON.stringify({
          rosterVersion: "qa-medical-training-guests",
          selectedDate: "2026-05-27",
          selectedPlayerId: player.id,
          players: [player],
          records: [],
          injuryPlans: [],
        })
      );
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          rosterVersion: "qa-empty-player-profiles",
          schemaVersion: 3,
          selectedPlayerId: "",
          players: [],
          removedPlayerIds: [],
          updatedAt: "2026-05-27T12:00:00.000Z",
        })
      );
    },
    {
      medicalStorageKey: medicalKey,
      profileStorageKey: playerProfilesKey,
      player: {
        id: "qa-legacy-medical-guest",
        name: playerName,
        number: "92",
        position: "Forward",
        primaryRole: "ST",
        roleGroup: "forward",
        rosterType: "guest",
        countsInSquad: false,
        temporaryGroup: "Academy Training Group",
        temporaryFrom: "2026-05-01",
        temporaryTo: "2026-05-02",
      },
    }
  );

  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  const guestSection = page.locator('[data-squad-roster-section="temporary"]');
  await expect(guestSection).toBeVisible();
  const guestToggle = guestSection.locator("[data-squad-temporary-toggle]");
  const guestRow = guestSection.locator(".squad-player-row", { hasText: playerName });
  await expect(guestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(guestRow).toHaveCount(0);
  await guestToggle.click();
  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await expect(guestRow).toBeVisible();
  await expect(guestRow).toContainText("Academy Training Group");
  await expect(guestRow).toContainText("2026-05-01 to 2026-05-02");
  await page.locator("[data-player-profile-roster-filter]").selectOption("squad");
  await expect(guestRow).toBeVisible();

  await expect(guestToggle).toHaveAttribute("aria-expanded", "true");
  await guestToggle.click();
  await expect(guestSection.locator(".squad-player-row", { hasText: playerName })).toHaveCount(0);
  await guestToggle.click();
  await expect(guestRow).toBeVisible();

  await guestRow.click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="temporaryFrom"]')).toHaveValue("2026-05-01");
  await expect(modal.locator('input[name="temporaryTo"]')).toHaveValue("2026-05-02");
});

test("Squad profile modal autosaves edits and keeps its size across tabs", async ({ page }) => {
  const coachNote = `QA autosave note ${Date.now()}`;
  await bootApp(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "player-profiles" } }));
  });
  await dismissDashboardModal(page);
  await expect(page.locator('[data-workspace-view="player-profiles"].is-active')).toBeVisible();

  await page.locator("[data-player-profile-select]").first().click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await expect(modal.locator('button[type="submit"]')).toHaveCount(0);
  await expect(modal.locator("[data-player-profile-remove]")).toHaveCount(0);
  await modal.locator('[data-player-profile-tab="history"]').click();
  await expect(modal.locator("[data-player-profile-remove]")).toBeVisible();
  await modal.locator('[data-player-profile-tab="overview"]').click();
  await expect(modal.locator(".squad-profile-strip")).toHaveCount(0);
  await expect(modal.locator('input[name="photoUrl"]')).toHaveCount(0);
  await expect(modal.locator('select[name="rosterType"]')).toBeVisible();
  await expect(modal.locator('input[name="temporaryGroup"]')).toHaveCount(0);
  await expect(modal.locator('input[name="temporaryFrom"]')).toHaveCount(0);
  await expect(modal.locator('input[name="temporaryTo"]')).toHaveCount(0);

  const playerId = await modal.locator('input[name="playerId"]').inputValue();
  await page.evaluate(() => {
    const form = document.querySelector("#playerProfileEditForm");
    if (!form) return;
    [
      ["rosterType", "academy"],
      ["temporaryGroup", "Injected academy group"],
      ["temporaryFrom", "2026-05-01"],
      ["temporaryTo", "2026-05-14"],
    ].forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    form.querySelector('input[name="rosterType"]')?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                temporaryGroup: player.temporaryGroup || "",
                temporaryFrom: player.temporaryFrom || "",
                temporaryTo: player.temporaryTo || "",
              }
            : null;
        },
        { key: playerProfilesKey, id: playerId }
      )
    )
    .toMatchObject({
      countsInSquad: true,
      rosterType: "squad",
      temporaryGroup: "",
      temporaryFrom: "",
      temporaryTo: "",
    });
  const photoUploadInput = modal.locator("[data-player-profile-photo-upload]");
  await expect(photoUploadInput).toHaveCount(1);
  await photoUploadInput.setInputFiles({
    name: "player-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await expect
    .poll(
      () =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player?.photoUrl || "";
        },
        { key: playerProfilesKey, id: playerId }
      ),
      { timeout: 30_000 }
    )
    .toMatch(/^data:image\//);
  await expect(modal.locator(".squad-profile-avatar img")).toBeVisible();

  const readModalHeight = async () => {
    await expect(modal).toBeVisible();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const box = await modal.boundingBox();
      if (box) return Math.round(box.height);
      await page.waitForTimeout(100);
    }
    return 0;
  };
  const overviewHeight = await readModalHeight();
  expect(overviewHeight).toBeGreaterThan(0);
  await modal.locator('[data-player-profile-tab="notes"]').click();
  await expect.poll(readModalHeight, { timeout: 5_000 }).toBe(overviewHeight);

  await modal.locator('textarea[name="coachNotes"]').fill(coachNote);
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ key, id }) => {
            const state = JSON.parse(window.localStorage.getItem(key) || "{}");
            const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
            return player
              ? {
                  coachNotes: player.coachNotes || "",
                  countsInSquad: player.countsInSquad,
                  photoUploaded: /^data:image\//.test(player.photoUrl || ""),
                  rosterType: player.rosterType || "",
                  temporaryFrom: player.temporaryFrom || "",
                  temporaryTo: player.temporaryTo || "",
                }
              : null;
          },
          { key: playerProfilesKey, id: playerId }
        ),
      { timeout: 30_000 }
    )
    .toMatchObject({
      coachNotes: coachNote,
      countsInSquad: true,
      photoUploaded: true,
      rosterType: "squad",
      temporaryFrom: "",
      temporaryTo: "",
    });

  await modal.locator("[data-player-profile-modal-close]").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await expectStorageContains(page, playerProfilesKey, coachNote);
});

test("Squad profile roster type moves players between squad and training guests", async ({ page }) => {
  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  await page.locator("[data-player-profile-select]").first().click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  const playerId = await modal.locator('input[name="playerId"]').inputValue();
  const rosterTypeSelect = modal.locator('select[name="rosterType"]');
  await expect(rosterTypeSelect).toBeVisible();
  await expect(rosterTypeSelect).toHaveValue("squad");
  await expect(modal.locator('input[name="temporaryGroup"]')).toHaveCount(0);

  await rosterTypeSelect.selectOption("academy");
  await expect(modal.locator('input[name="temporaryGroup"]')).toBeVisible();
  await modal.locator('input[name="temporaryGroup"]').fill("QA academy call-up");
  await modal.locator('input[name="temporaryFrom"]').fill("2026-05-01");
  await modal.locator('input[name="temporaryTo"]').fill("2026-05-14");
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                temporaryGroup: player.temporaryGroup || "",
                temporaryFrom: player.temporaryFrom || "",
                temporaryTo: player.temporaryTo || "",
              }
            : null;
        },
        { key: playerProfilesKey, id: playerId }
      )
    )
    .toMatchObject({
      countsInSquad: false,
      rosterType: "academy",
      temporaryGroup: "QA academy call-up",
      temporaryFrom: "2026-05-01",
      temporaryTo: "2026-05-14",
    });

  await modal.locator('select[name="rosterType"]').selectOption("squad");
  await expect(modal.locator('input[name="temporaryGroup"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player
            ? {
                countsInSquad: player.countsInSquad,
                rosterType: player.rosterType || "",
                temporaryGroup: player.temporaryGroup || "",
                temporaryFrom: player.temporaryFrom || "",
                temporaryTo: player.temporaryTo || "",
              }
            : null;
        },
        { key: playerProfilesKey, id: playerId }
      )
    )
    .toMatchObject({
      countsInSquad: true,
      rosterType: "squad",
      temporaryGroup: "",
      temporaryFrom: "",
      temporaryTo: "",
    });
});

test("Squad availability status is editable and Medical injury status overrides the roster", async ({ page }) => {
  test.setTimeout(90_000);
  await bootApp(page);
  await openWorkspace(page, "player-profiles");

  const injuredPlayerRow = page.locator("[data-player-profile-select]").first();
  const manualPlayerRow = page.locator("[data-player-profile-select]").nth(1);
  const injuredPlayerId = await injuredPlayerRow.getAttribute("data-player-profile-select");
  const manualPlayerId = await manualPlayerRow.getAttribute("data-player-profile-select");
  expect(injuredPlayerId).toBeTruthy();
  expect(manualPlayerId).toBeTruthy();

  await page.evaluate(
    ({ medicalStorageKey, playerStorageKey, playerId, manualPlayerId }) => {
      const profiles = JSON.parse(window.localStorage.getItem(playerStorageKey) || "{}");
      const player = Array.isArray(profiles.players)
        ? profiles.players.find((candidate) => candidate.id === playerId)
        : null;
      if (!player) return;

      const now = new Date().toISOString();
      const medical = JSON.parse(window.localStorage.getItem(medicalStorageKey) || "{}");
      const medicalPlayer = {
        id: player.id,
        name: player.name,
        number: player.number || "",
        position: player.position || "",
        photoUrl: player.photoUrl || "",
        sourceUrl: player.sourceUrl || "",
        rosterType: player.rosterType || "squad",
        countsInSquad: player.countsInSquad !== false,
        temporaryGroup: player.temporaryGroup || "",
        temporaryFrom: player.temporaryFrom || "",
        temporaryTo: player.temporaryTo || "",
        rosterOrder: player.rosterOrder ?? null,
        createdAt: player.createdAt || now,
        updatedAt: now,
      };

      medical.players = [
        medicalPlayer,
        ...(Array.isArray(medical.players) ? medical.players.filter((candidate) => candidate.id !== player.id) : []),
      ];
      medical.injuryPlans = [
        {
          id: "qa-active-squad-injury-plan",
          playerId: player.id,
          injuryType: "QA availability restriction",
          bodyArea: "",
          startDate: "2026-01-01",
          endDate: "2099-12-31",
          duration: 1,
          durationUnit: "weeks",
          status: "unavailable",
          participation: 0,
          reviewDate: "",
          rtpPhase: "medical-restriction",
          phase: "Medical restriction",
          clearance: { doctor: false, physio: false, performance: false },
          gates: {},
          coachNote: "Unavailable until cleared by Medical.",
          shareWithCoach: true,
          comment: "",
          createdAt: now,
          updatedAt: now,
          createdBy: "qa",
        },
        ...(Array.isArray(medical.injuryPlans)
          ? medical.injuryPlans.filter(
              (plan) =>
                plan.id !== "qa-active-squad-injury-plan" &&
                plan.playerId !== player.id &&
                plan.playerId !== manualPlayerId
            )
          : []),
      ];
      medical.records = Array.isArray(medical.records)
        ? medical.records.filter((record) => record.playerId !== manualPlayerId)
        : [];
      window.localStorage.setItem(medicalStorageKey, JSON.stringify(medical));
    },
    { medicalStorageKey: medicalKey, playerStorageKey: playerProfilesKey, playerId: injuredPlayerId, manualPlayerId }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openWorkspace(page, "player-profiles");
  await expect(
    page.locator(`[data-player-profile-select="${injuredPlayerId}"] .squad-status-pill`).first()
  ).toContainText("Injured");
  await expect(
    page.locator(`[data-player-profile-select="${injuredPlayerId}"] .squad-return-date`).first()
  ).toHaveText("Expected back Thu 31 Dec");
  await expect(
    page.locator(`[data-player-profile-select="${injuredPlayerId}"] .squad-medical-cell`)
  ).toHaveCount(0);
  await page.locator(`[data-player-profile-select="${injuredPlayerId}"]`).click();
  await expect(page.locator(".squad-profile-identity .squad-return-date")).toHaveText("Expected back Thu 31 Dec");
  await page.locator('[data-player-profile-tab="medical"]').click();
  await expect(page.locator(".squad-medical-snapshot")).toContainText("Expected return");
  await expect(page.locator(".squad-medical-snapshot")).toContainText("Thu 31 Dec");
  await page.locator("[data-player-profile-modal-close]").click();
  await expect(page.locator(".squad-profile-modal")).toHaveCount(0);

  await page.locator(`[data-player-profile-select="${manualPlayerId}"]`).click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await modal.locator('[data-player-profile-tab="overview"]').click();
  const statusSelect = modal.locator('select[name="status"]');
  await expect(statusSelect).toContainText("International duty");
  await expect(statusSelect).toContainText("Vacation");
  await statusSelect.selectOption("national-team");

  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const state = JSON.parse(window.localStorage.getItem(key) || "{}");
          const player = Array.isArray(state.players) ? state.players.find((candidate) => candidate.id === id) : null;
          return player?.status || "";
        },
        { key: playerProfilesKey, id: manualPlayerId }
      )
    )
    .toBe("national-team");

  await modal.locator("[data-player-profile-modal-close]").click();
  await expect(
    page.locator(`[data-player-profile-select="${manualPlayerId}"] .squad-status-pill`).first()
  ).toContainText("International duty");
});

test("Squad profile remove is hidden for coach editors", async ({ page }) => {
  await bootApp(page);
  await page.evaluate(() => {
    const store = window.platformAuthStore;
    const currentUser = store?.getCurrentUser?.();
    if (!store || !currentUser) return;
    const coachUser = { ...currentUser, id: "qa-squad-coach-editor", email: "qa-squad-coach-editor@footballscience.local", firstName: "QA", lastName: "Coach", username: "qa-squad-coach-editor", role: "coach", title: "Coach" };
    store.writeUsers([coachUser, ...store.getUsers().filter((user) => user.id !== coachUser.id)]);
    store.setCurrentUser(coachUser.id);
  });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "player-profiles" } }));
  });
  await dismissDashboardModal(page);
  await expect(page.locator('[data-workspace-view="player-profiles"].is-active')).toBeVisible();

  await page.locator("[data-player-profile-select]").first().click();
  const modal = page.locator(".squad-profile-modal:has(#playerProfileEditForm)").first();
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="position"]')).toBeEnabled();
  await expect(modal.locator('button[type="submit"]')).toHaveCount(0);
  await expect(modal.locator("[data-player-profile-remove]")).toHaveCount(0);
  await modal.locator('[data-player-profile-tab="history"]').click();
  await expect(modal.locator("[data-player-profile-remove]")).toHaveCount(0);
});
