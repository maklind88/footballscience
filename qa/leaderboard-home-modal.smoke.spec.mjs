import { expect, test } from "@playwright/test";

function leaderboardPayload(month = "2026-08") {
  const current = month === "2026-08";
  const prefix = current ? "" : "July ";
  return {
    ok: true,
    schema: "footballscience-leaderboard-v1",
    month,
    competition: { id: `competition-${month}`, status: current ? "live" : "completed" },
    summary: { eventCount: 1, totalPoints: 21, scoredPlayerCount: 3, leaderGap: 0 },
    roster: [
      { playerId: "p1", displayName: `${prefix}Alex Morgan`, number: "13", position: "Forward" },
      { playerId: "p2", displayName: `${prefix}Sam Coffey`, number: "17", position: "Midfielder" },
      { playerId: "p3", displayName: `${prefix}Emily Fox`, number: "2", position: "Defender" },
      { playerId: "p4", displayName: `${prefix}Casey Murphy`, number: "1", position: "Goalkeeper" },
    ],
    standings: [
      { playerId: "p1", displayName: `${prefix}Alex Morgan`, points: 9, rank: 1, awardCount: 3 },
      { playerId: "p2", displayName: `${prefix}Sam Coffey`, points: 9, rank: 1, awardCount: 2 },
      { playerId: "p3", displayName: `${prefix}Emily Fox`, points: 3, rank: 3, awardCount: 1 },
    ],
    events: [{
      id: "e1",
      occurredOn: `${month}-24`,
      title: `${prefix}5v5 tournament`,
      createdByName: "Coach Taylor",
      createdAt: `${month}-24T15:00:00Z`,
      points: 6,
      awards: [{ playerId: "p1", playerName: `${prefix}Alex Morgan`, points: 3, placement: 1 }],
    }],
  };
}

test("Home summary mounts one shared full-screen Leaderboard dialog with safe nested flows", async ({ page }) => {
  const browserErrors = [];
  let awardPostCount = 0;
  let signalAwardPostStarted;
  let releaseAwardPost;
  const awardPostStarted = new Promise((resolve) => { signalAwardPostStarted = resolve; });
  const awardPostReleased = new Promise((resolve) => { releaseAwardPost = resolve; });
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/__leaderboard_home_harness__", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head></head><body></body></html>" }));
  await page.route("**/api/leaderboard**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "award") {
        awardPostCount += 1;
        signalAwardPostStarted();
        await awardPostReleased;
      }
    }
    const month = new URL(route.request().url()).searchParams.get("month") || "2026-08";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(leaderboardPayload(month)) });
  });
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto("/__leaderboard_home_harness__");

  await page.evaluate(async () => {
    document.head.innerHTML = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;background:#edf2ee;font-family:Inter,system-ui,sans-serif}#dialogHost{position:relative}</style>`;
    document.body.innerHTML = `<div id="appShell"><nav id="appNav" aria-hidden="false">Navigation</nav><main id="app"><section class="dashboard-home-grid"><section class="dashboard-presentation-band"><div class="dashboard-presentation-stack"><section class="dashboard-birthday-strip"><article id="birthdayReference" class="dashboard-panel dashboard-birthday-card">Birthday calendar</article></section></div><div class="dashboard-presentation-stack"><article class="dashboard-panel dashboard-presentation-card"><div id="presentationVisualReference" class="dashboard-presentation-visual" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 21h8"/></svg></div><div class="dashboard-presentation-action"><button id="presentationOpenReference" type="button">Open</button></div></article></div><aside></aside></section><section class="dashboard-leaderboard-slot"><section id="summary"></section></section></section></main><div id="dialogHost"></div></div><aside id="outsideApp" aria-hidden="false">Outside app</aside>`;
    await Promise.all([
      "/styles.css",
      "/presentation-mode.css",
      "/src/modules/home/home-leaderboard.css",
      "/src/modules/leaderboard/leaderboard.css",
    ].map((href) => new Promise((resolve, reject) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = href;
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      document.head.append(stylesheet);
    })));
    const module = await import(`/src/modules/leaderboard/index.mjs?home=${Date.now()}`);
    const context = {
      ui: {
        leaderboardSummary: document.querySelector("#summary"),
        leaderboardDialogHost: document.querySelector("#dialogHost"),
      },
      win: window,
      team: { id: "team-1", name: "North Carolina Courage" },
      teamName: "North Carolina Courage",
      currentUser: { id: "coach-1" },
      getAuthToken: () => "",
      getNow: () => new Date("2026-08-25T12:00:00"),
      canEdit: () => true,
      getPlayerProfilesState: () => ({ players: [
        { id: "p1", photoUrl: "/assets/football-science-mark.png" },
        { id: "p2", photoUrl: "/assets/football-science-logo.png" },
        { id: "p3", photoUrl: "/assets/pwa/icon-192.png" },
      ] }),
    };
    window.leaderboardHomeContext = context;
    window.leaderboardHomeModule = module;
    window.leaderboardHomeHandle = module.mountLeaderboardHome(context);
  });

  const summary = page.locator("#summary");
  await expect(summary.getByRole("heading", { name: "NCC Leaderboard" })).toBeVisible();
  await expect(summary.locator(".leaderboard-home-visual svg")).toHaveCount(1);
  await expect(summary.locator(".leaderboard-team-mark")).toHaveCount(0);
  await expect(summary.locator(".leaderboard-podium-card")).toHaveCount(3);
  await expect(summary.locator(".leaderboard-podium-avatar img")).toHaveCount(3);
  await expect.poll(() => summary.locator(".leaderboard-podium-avatar img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(summary.locator(".leaderboard-home-standings")).toHaveCount(0);
  const homePodiumLayout = await summary.locator(".leaderboard-podium").evaluate((podium) => {
    const first = podium.querySelector(".is-place-1").getBoundingClientRect();
    const second = podium.querySelector(".is-place-2").getBoundingClientRect();
    const third = podium.querySelector(".is-place-3").getBoundingClientRect();
    return {
      height: podium.getBoundingClientRect().height,
      centerIsFirst: second.x < first.x && first.x < third.x,
      firstIsRaised: first.height > second.height && first.height > third.height,
    };
  });
  expect(homePodiumLayout).toEqual({ height: expect.any(Number), centerIsFirst: true, firstIsRaised: true });
  expect(homePodiumLayout.height).toBeLessThan(112);
  const openButton = summary.getByRole("button", { name: "Open", exact: true });
  await expect(openButton).toBeVisible();
  const homeWidths = await page.evaluate(() => ({
    birthday: document.querySelector("#birthdayReference")?.getBoundingClientRect().width || 0,
    leaderboard: document.querySelector(".dashboard-leaderboard-slot")?.getBoundingClientRect().width || 0,
  }));
  expect(homeWidths.birthday).toBeGreaterThan(0);
  expect(Math.abs(homeWidths.leaderboard - homeWidths.birthday)).toBeLessThanOrEqual(1);
  const iconStyles = await page.evaluate(() => {
    const homeIcon = document.querySelector(".leaderboard-home-visual");
    const referenceIcon = document.querySelector("#presentationVisualReference");
    const properties = ["width", "height", "borderRadius", "backgroundColor", "color", "borderTopWidth", "borderTopStyle", "borderTopColor"];
    const values = (style) => Object.fromEntries(properties.map((property) => [property, style[property]]));
    return { home: values(getComputedStyle(homeIcon)), reference: values(getComputedStyle(referenceIcon)) };
  });
  expect(iconStyles.home).toEqual(iconStyles.reference);
  const expectedOpenButtonStyles = {
    minHeight: "43.2px",
    borderRadius: "7px",
    backgroundColor: "rgb(29, 29, 31)",
    color: "rgb(255, 255, 255)",
    fontSize: "13.44px",
    fontWeight: "650",
    paddingLeft: "14.72px",
    paddingRight: "14.72px",
  };
  await expect.poll(() => page.evaluate(() => {
    const homeButton = document.querySelector("[data-leaderboard-home-open]");
    const referenceButton = document.querySelector("#presentationOpenReference");
    const properties = ["minHeight", "borderRadius", "backgroundColor", "color", "fontSize", "fontWeight", "paddingLeft", "paddingRight"];
    const values = (style) => Object.fromEntries(properties.map((property) => [property, style[property]]));
    return { home: values(getComputedStyle(homeButton)), reference: values(getComputedStyle(referenceButton)) };
  })).toEqual({ home: expectedOpenButtonStyles, reference: expectedOpenButtonStyles });

  await openButton.click();
  const outerDialog = page.locator(".leaderboard-home-dialog");
  await expect(outerDialog).toBeVisible();
  const commandTitle = outerDialog.locator(".leaderboard-command-title h1");
  await expect(commandTitle).toBeVisible();
  expect(await commandTitle.evaluate((node) => {
    const style = getComputedStyle(node);
    const header = node.closest(".leaderboard-command-bar").getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()];
    return {
      fullTextInsideHeader: lines.every((line) => line.left >= header.left && line.right <= header.right),
      lineCount: lines.length,
      overflowX: style.overflowX,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  })).toEqual({ fullTextInsideHeader: true, lineCount: 1, overflowX: "visible", textOverflow: "clip", whiteSpace: "normal" });
  const fullPodium = outerDialog.locator(".leaderboard-content > .leaderboard-podium");
  await expect(fullPodium.locator(".leaderboard-podium-avatar img")).toHaveCount(3);
  expect(await fullPodium.evaluate((podium) => podium.getBoundingClientRect().height)).toBeLessThan(125);
  await expect(outerDialog.locator(".leaderboard-metrics")).toHaveCount(0);
  const standingPhotos = outerDialog.locator(".leaderboard-table .leaderboard-player-cell .leaderboard-avatar img");
  await expect(standingPhotos).toHaveCount(3);
  await expect.poll(() => standingPhotos.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  const tiedRankBadges = outerDialog.locator(".leaderboard-table .leaderboard-rank.is-shared");
  await expect(tiedRankBadges).toHaveCount(2);
  await expect(tiedRankBadges.first().getByText("Tie", { exact: true })).toBeVisible();
  expect(await tiedRankBadges.first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { backgroundImage: style.backgroundImage, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
  })).toEqual({
    backgroundImage: expect.stringContaining("linear-gradient"),
    borderRadius: "14px",
    boxShadow: expect.not.stringContaining("none"),
  });
  await expect(page.getByRole("button", { name: "Close Leaderboard" })).toBeFocused();
  expect(await page.locator("#app").evaluate((node) => node.inert)).toBe(true);
  expect(await page.locator("#appNav").evaluate((node) => node.inert)).toBe(true);
  expect(await page.locator("#outsideApp").evaluate((node) => node.inert)).toBe(true);
  expect(await page.locator("#dialogHost").evaluate((node) => node.inert)).toBe(false);
  expect(await page.locator("#appShell").evaluate((node) => node.inert)).toBe(false);
  await page.getByRole("button", { name: "Close Leaderboard" }).click();
  await expect(outerDialog).toBeHidden();
  await expect(openButton).toBeFocused();
  expect(await page.locator("#app").evaluate((node) => node.inert)).toBe(false);
  expect(await page.locator("#appNav").getAttribute("aria-hidden")).toBe("false");
  expect(await page.locator("#outsideApp").getAttribute("aria-hidden")).toBe("false");

  await summary.locator(".leaderboard-podium-card").first().click();
  await expect(outerDialog).toBeVisible();
  const playerDialog = page.getByRole("dialog", { name: "Alex Morgan" });
  await expect(playerDialog).toBeVisible();
  await expect(playerDialog).toHaveAttribute("aria-modal", "true");
  await expect(outerDialog).toHaveAttribute("aria-modal", "false");
  expect(await page.locator(".leaderboard-home-dialog-head").evaluate((node) => node.inert)).toBe(true);
  await expect(page.locator(".leaderboard-home-dialog-head")).toHaveAttribute("aria-hidden", "true");
  expect(await outerDialog.locator(".leaderboard-command-bar").evaluate((node) => node.inert)).toBe(true);
  await expect(playerDialog.getByRole("button", { name: "Close player detail" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(playerDialog).toBeHidden();
  await expect(outerDialog).toHaveAttribute("aria-modal", "true");
  expect(await page.locator(".leaderboard-home-dialog-head").evaluate((node) => node.inert)).toBe(false);
  await expect(page.locator(".leaderboard-home-dialog-head")).not.toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(outerDialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.leaderboardHomePlayer || document.activeElement?.dataset?.leaderboardPlayerDetail || "")).toBe("p1");

  const awardState = await page.evaluate(async () => {
    const before = window.leaderboardHomeModule.getLeaderboardRuntimeState().draft.idempotencyKey;
    const opened = await window.leaderboardHomeHandle.openAward({ occurredOn: "2026-08-25", title: "Session finishing" });
    return { opened, before, after: window.leaderboardHomeModule.getLeaderboardRuntimeState().draft.idempotencyKey };
  });
  const awardOpened = awardState.opened;
  expect(awardOpened).toBe(true);
  expect(awardState.after).toBe(awardState.before);
  await expect(page.getByRole("dialog", { name: "Award Points" })).toBeVisible();
  await expect(page.locator("[data-leaderboard-award-title]")).toHaveValue("Session finishing");
  const awardDialog = page.getByRole("dialog", { name: "Award Points" });
  const fieldsetLayout = await awardDialog.locator(".leaderboard-award-fieldset").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      minInlineSize: style.minInlineSize,
      marginInline: `${style.marginInlineStart} ${style.marginInlineEnd}`,
      borderInline: `${style.borderInlineStartWidth} ${style.borderInlineEndWidth}`,
      fits: node.scrollWidth <= node.clientWidth,
    };
  });
  expect(fieldsetLayout).toEqual({ minInlineSize: "0px", marginInline: "0px 0px", borderInline: "0px 0px", fits: true });
  await awardDialog.locator('[data-leaderboard-assign-placement="1"][data-leaderboard-player-id="p1"]').click();
  await awardDialog.getByRole("button", { name: "Save award" }).click();
  await awardPostStarted;
  await expect(awardDialog.locator("[data-leaderboard-award-form]")).toHaveAttribute("aria-busy", "true");
  await expect(awardDialog.getByRole("button", { name: "Close award points", includeHidden: true })).toBeDisabled();
  await expect(awardDialog.getByRole("button", { name: "Cancel", includeHidden: true })).toBeDisabled();
  await expect(awardDialog.getByRole("button", { name: "Saving…", includeHidden: true })).toBeDisabled();
  await expect(page.locator("button[data-leaderboard-home-close]")).toBeDisabled();
  await expect(outerDialog).toHaveAttribute("aria-busy", "true");
  await expect(outerDialog).toHaveAttribute("aria-modal", "false");
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
  expect(await page.locator(".leaderboard-home-dialog-head").evaluate((node) => node.inert)).toBe(true);
  await expect(awardDialog).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(awardDialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(awardDialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(awardDialog).toBeVisible();
  await page.locator(".leaderboard-layer").evaluate((node) => node.click());
  await page.locator("[data-leaderboard-home-dialog-layer]").evaluate((node) => node.click());
  await expect(awardDialog).toBeVisible();
  expect(await page.evaluate(() => window.leaderboardHomeHandle.requestClose())).toBe(false);
  expect(await page.evaluate(() => window.leaderboardHomeHandle.unmount())).toBe(false);
  expect(awardPostCount).toBe(1);
  releaseAwardPost();
  await expect(awardDialog).toBeHidden();
  await expect(outerDialog).toHaveAttribute("aria-busy", "false");
  await expect(outerDialog).toHaveAttribute("aria-modal", "true");
  expect(await page.locator(".leaderboard-home-dialog-head").evaluate((node) => node.inert)).toBe(false);
  await page.getByRole("button", { name: "Close Leaderboard" }).click();

  expect(await page.evaluate(() => window.leaderboardHomeHandle.openAward({ occurredOn: "2026-07-24", title: "Historical session" }))).toBe(false);
  await expect(outerDialog).toBeVisible();
  await expect(page.getByText("Completed Leaderboard months are read-only.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Award Points" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close Leaderboard" }).click();

  await summary.getByRole("button", { name: "Open", exact: true }).click();
  const julyResponse = page.waitForResponse((response) => response.url().includes("month=2026-07"));
  await outerDialog.getByRole("button", { name: "Previous month" }).click();
  await julyResponse;
  await expect(outerDialog.getByText("July Alex Morgan", { exact: true }).first()).toBeVisible();
  await expect(summary.getByText("Alex Morgan", { exact: true }).first()).toBeAttached();
  await expect(summary.getByText("July Alex Morgan", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close Leaderboard" }).click();
  expect(await page.evaluate(() => window.leaderboardHomeModule.getLeaderboardRuntimeState().month)).toBe("2026-08");

  await summary.getByRole("button", { name: "Open", exact: true }).click();
  await page.evaluate(async () => {
    const runtime = (await import("/src/modules/leaderboard/leaderboard-runtime.mjs")).getActiveLeaderboardRuntime();
    runtime.store.setState({ ui: { reverseEventId: "e1", reverseReason: "Correction", pendingAction: "reverse" } });
  });
  await expect(page.getByRole("button", { name: "Close correction" })).toBeDisabled();
  expect(await page.evaluate(() => window.leaderboardHomeHandle.requestClose())).toBe(false);
  expect(await page.evaluate(() => window.leaderboardHomeHandle.unmount())).toBe(false);
  await page.keyboard.press("Escape");
  await expect(outerDialog).toBeVisible();
  expect(await page.evaluate(() => window.leaderboardHomeHandle.unmount({ force: true }))).toBe(true);
  await expect(outerDialog).toBeHidden();
  expect(await page.locator("#app").evaluate((node) => node.inert)).toBe(false);
  expect(await page.evaluate(async () => (await import("/src/modules/leaderboard/leaderboard-runtime.mjs")).getActiveLeaderboardRuntime() === null)).toBe(true);
  await page.evaluate(() => {
    const context = {
      ...window.leaderboardHomeContext,
      team: { id: "team-2", name: "Team B" },
      teamName: "Team B",
      currentUser: { id: "coach-2" },
    };
    window.leaderboardHomeContext = context;
    window.leaderboardHomeHandle = window.leaderboardHomeModule.mountLeaderboardHome(context);
  });
  await expect(summary.getByRole("heading", { name: "NCC Leaderboard" })).toBeVisible();
  expect(await page.evaluate(() => window.leaderboardHomeModule.getLeaderboardRuntimeState().ui.pendingAction)).toBe("");

  await page.setViewportSize({ width: 390, height: 844 });
  await summary.getByRole("button", { name: "Open", exact: true }).click();
  const bounds = await outerDialog.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(bounds.width).toBe(bounds.viewportWidth);
  expect(bounds.height).toBe(bounds.viewportHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Close Leaderboard" }).click();
  expect(await page.evaluate(() => window.leaderboardHomeHandle.unmount())).toBe(true);
  await expect(summary).toBeEmpty();
  expect(browserErrors).toEqual([]);
});
