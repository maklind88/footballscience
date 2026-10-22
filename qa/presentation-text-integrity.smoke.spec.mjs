import { expect, test } from "@playwright/test";

async function openHarness(page, type = "team", options = {}) {
  await page.route("**/presentation-text-harness", (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/presentation-mode.css"></head><body></body></html>',
  }));
  // Reopening/reloading here is an explicit leave decision. The test below
  // separately proves that an unresolved conflict prompts before tab closure.
  const acceptLeave = (dialog) => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss();
  page.on("dialog", acceptLeave);
  try { await page.goto("/presentation-text-harness"); }
  finally { page.off("dialog", acceptLeave); }
  await page.evaluate(async ({ type, options }) => {
    const { createPresentationModeController, createPresentationModeRenderer, dashboardPresentationStorageKey,
      mergeDashboardPresentationStatePreservingLocalEdits } = await import("/src/modules/presentation-mode/index.mjs");
    const { createCentralSyncRuntimeService } = await import("/src/core/central-sync-runtime-service.mjs");
    const date = "2026-10-21";
    const key = dashboardPresentationStorageKey;
    const deck = { infoSlides: [
      { id: "team-info", title: "Team Information", body: "Original saved text", layout: "bullets" },
      { id: "second-info", title: "Second slide", body: "Other content", layout: "bullets" },
      ...(options.leaderboard ? [{ id: "rankings", title: "Leaderboard", layout: "leaderboard" }] : []),
    ] };
    if (options.media) Object.assign(deck.infoSlides[0], { mediaKind: "image", mediaId: "delayed-image", mediaLocal: true });
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(type === "team"
      ? { decks: { [date]: deck } } : { meetingDecks: { technical: { [date]: deck } } }));
    const stats = { renders: 0, writes: 0, syncRefreshes: 0 };
    const renderer = createPresentationModeRenderer();
    const render = renderer.render;
    renderer.render = (model) => { stats.renders++; return render(model); };
    let resolveMedia;
    const mediaPromise = new Promise((resolve) => { resolveMedia = resolve; });
    const controller = createPresentationModeController({
      documentRef: document, win: window, renderer,
      getTodayValue: () => date, getDraftScope: () => "coach-a",
      isEditableTarget: (element) => Boolean(element.closest("input,textarea,[contenteditable=true]")),
      readJson: (key, fallback) => JSON.parse(localStorage.getItem(key) || "null") || fallback,
      writeJson: (key, value) => {
        stats.writes++;
        if (!window.textHarness?.failWrites) localStorage.setItem(key, JSON.stringify(value));
      },
      canViewLeaderboard: () => Boolean(options.leaderboard),
      getLeaderboardSnapshot: () => ({ status: "loading", standings: [] }),
      localMediaStore: { resolve: () => mediaPromise },
    });
    const sync = createCentralSyncRuntimeService({
      win: window, dashboardPresentationStorageKey: key,
      rawGetItem: (key) => localStorage.getItem(key), rawSetItem: (key, value) => localStorage.setItem(key, value),
      mergeDashboardPresentationStatePreservingLocalEdits,
      handleSyncedStateValue: () => { stats.syncRefreshes++; controller.render(); },
    });
    const getDeck = () => {
      const store = JSON.parse(localStorage.getItem(key));
      return type === "team" ? store.decks[date] : store.meetingDecks.technical[date];
    };
    const deliverSync = (body = "Original saved text") => {
      const previous = localStorage.getItem(key);
      const incoming = JSON.parse(previous);
      const syncedDeck = type === "team" ? incoming.decks[date] : incoming.meetingDecks.technical[date];
      syncedDeck.updatedAt = "2099-01-01T00:00:00.000Z";
      syncedDeck.infoSlides[0].body = body;
      syncedDeck.infoSlides[0].fieldUpdatedAt = { body: "2099-01-01T00:00:00.000Z" };
      sync.applyCentralSyncedStateValue({ key, value: previous }, JSON.stringify(incoming));
    };
    window.textHarness = { controller, stats, date, type, key, getDeck, deliverSync,
      resolveMedia: () => resolveMedia({ status: "missing", name: "Image" }) };
    controller.bindInteractions();
    controller.open(date, type);
    const index = controller.buildModel().slides.findIndex((slide) => slide.infoSlide?.id === "team-info");
    document.querySelector(`[data-presentation-slide-index="${index}"]`).click();
  }, { type, options });
}

async function saved(page, field = "body") {
  return page.evaluate((field) => window.textHarness.getDeck().infoSlides[0][field], field);
}

for (const type of ["team", "technical"]) {
  for (const field of ["body", "title"]) {
    test(`${type}: ${field} survives refresh without a stale blur write`, async ({ page }) => {
      await openHarness(page, type);
      const input = page.locator(`.presentation-info-${field}`);
      await input.fill("New intentional text");
      await input.evaluate((element) => { element.setSelectionRange(4, 9); window.retainedField = element; });
      await page.evaluate(() => window.textHarness.controller.render());
      await expect(input).toHaveValue("New intentional text");
      await expect(input).toBeFocused();
      expect(await input.evaluate((element) => ({ retained: element === window.retainedField,
        start: element.selectionStart, end: element.selectionEnd }))).toEqual({ retained: true, start: 4, end: 9 });
      await input.blur();
      expect(await saved(page, field)).toBe("New intentional text");
    });
  }

  test(`${type}: real Leaderboard retry and local-media completion preserve active text`, async ({ page }) => {
    await openHarness(page, type, { leaderboard: true, media: true });
    const input = page.locator(".presentation-info-body");
    await input.fill("Instructions during background loading");
    const before = await page.evaluate(() => window.textHarness.stats.renders);
    await expect.poll(() => page.evaluate(() => window.textHarness.stats.renders)).toBeGreaterThan(before);
    await expect(input).toHaveValue("Instructions during background loading");
    await expect(input).toBeFocused();
    await page.evaluate(() => window.textHarness.resolveMedia());
    await expect.poll(() => page.evaluate(() => window.textHarness.stats.renders)).toBeGreaterThan(before + 1);
    await expect(input).toHaveValue("Instructions during background loading");
    await input.blur();
    expect(await saved(page)).toBe("Instructions during background loading");
  });

  test(`${type}: delayed sync and concurrent text retain both versions after reload`, async ({ page }, testInfo) => {
    await openHarness(page, type);
    const input = page.locator(".presentation-info-body");
    await input.fill("My draft during a slow response");
    await page.route("**/presentation-delayed-sync", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ json: { body: "Another coach's saved text" } });
    });
    await page.evaluate(() => {
      window.pendingSync = fetch("/presentation-delayed-sync").then((response) => response.json())
        .then(({ body }) => window.textHarness.deliverSync(body));
    });
    await page.evaluate(() => window.pendingSync);
    expect(await page.evaluate(() => window.textHarness.stats.syncRefreshes)).toBe(1);
    await expect(input).toHaveValue("My draft during a slow response");
    await input.blur();
    expect(await saved(page)).toBe("Another coach's saved text");
    await openHarness(page, type);
    await expect(page.locator("[data-presentation-draft-recovery]")).toBeVisible();
    await expect(page.locator("[data-presentation-recovered-text]")).toHaveValue("My draft during a slow response");
    expect(await saved(page)).toBe("Another coach's saved text");
    if (type === "team") await page.screenshot({ path: testInfo.outputPath("draft-conflict.png") });
    await page.getByRole("button", { name: "Use my draft", exact: true }).click();
    expect(await saved(page)).toBe("My draft during a slow response");
  });

  test(`${type}: navigation, close and reload preserve edits under their original context`, async ({ page }) => {
    await openHarness(page, type);
    await page.locator(".presentation-info-body").fill("Saved before programmatic navigation");
    await page.evaluate(() => window.textHarness.controller.open("2026-10-22", window.textHarness.type));
    expect(await saved(page)).toBe("Saved before programmatic navigation");
    await openHarness(page, type);
    await page.locator(".presentation-info-body").fill("Saved on close");
    await page.evaluate(() => window.textHarness.controller.close());
    expect(await saved(page)).toBe("Saved on close");
    await openHarness(page, type);
    await page.locator(".presentation-info-body").fill("Draft before immediate reload");
    await openHarness(page, type);
    await expect(page.locator(".presentation-info-body")).toHaveValue("Draft before immediate reload");
    await page.locator(".presentation-info-body").focus();
    await page.locator(".presentation-info-body").blur();
    expect(await saved(page)).toBe("Draft before immediate reload");
  });
}

test("unchanged fields never write, and failed local persistence keeps a recoverable draft", async ({ page }) => {
  await openHarness(page);
  const input = page.locator(".presentation-info-body");
  const before = await page.evaluate(() => window.textHarness.stats.writes);
  await input.focus(); await input.blur();
  expect(await page.evaluate(() => window.textHarness.stats.writes)).toBe(before);
  await page.evaluate(() => { window.textHarness.failWrites = true; });
  await input.fill("Text despite failed local save"); await input.blur();
  expect(await saved(page)).toBe("Original saved text");
  await openHarness(page);
  await expect(page.locator(".presentation-info-body")).toHaveValue("Text despite failed local save");
});

test("blank edits, actual slide clicks, and meeting-type switches keep their own records", async ({ page }) => {
  await openHarness(page);
  await page.locator(".presentation-info-body").fill("");
  await page.getByRole("button", { name: "Go to Second slide", exact: true }).click();
  expect(await saved(page)).toBe("");
  await page.getByRole("button", { name: "Go to Team Information", exact: true }).click();
  await expect(page.locator(".presentation-info-body")).toHaveValue("");
  await page.locator(".presentation-info-title").fill("Team-only title");
  await page.evaluate(() => window.textHarness.controller.open(window.textHarness.date, "technical"));
  expect(await saved(page, "title")).toBe("Team-only title");
  expect(await page.evaluate(() => window.textHarness.controller.getDeckForDate(window.textHarness.date, "technical").infoSlides[0].title))
    .toBe("Technical Notes");
});

test("a committed local draft survives a later competing server value and unchanged blur", async ({ page }) => {
  await openHarness(page);
  const input = page.locator(".presentation-info-body");
  await input.fill("My locally committed version"); await input.blur();
  expect(await saved(page)).toBe("My locally committed version");
  await page.evaluate(() => window.textHarness.deliverSync("Concurrent server version"));
  await expect(input).toHaveValue("Concurrent server version");
  await expect(page.locator("[data-presentation-recovered-text]")).toHaveValue("My locally committed version");
  await input.focus(); await input.blur();
  expect(await saved(page)).toBe("Concurrent server version");
  await page.getByRole("button", { name: "Keep saved text", exact: true }).click();
  await openHarness(page);
  await expect(input).toHaveValue("Concurrent server version");
  await expect(page.locator("[data-presentation-draft-recovery]")).toHaveCount(0);
});

test("another field's sync does not prevent committing an independent edit", async ({ page }) => {
  await openHarness(page);
  await page.locator(".presentation-info-title").fill("My independent title");
  await page.evaluate(() => window.textHarness.deliverSync("Other coach's body"));
  await expect(page.locator(".presentation-info-body")).toHaveValue("Other coach's body");
  await page.locator(".presentation-info-title").blur();
  expect(await saved(page, "title")).toBe("My independent title");
  expect(await saved(page)).toBe("Other coach's body");
});

test("drafts retain text beyond the saved-field limit and warn instead of silently truncating", async ({ page }) => {
  await openHarness(page);
  const text = "x".repeat(5100);
  await page.locator(".presentation-info-body").fill(text);
  await page.locator(".presentation-info-body").blur();
  await expect(page.locator("[data-presentation-draft-recovery]")).toBeVisible();
  await openHarness(page);
  await expect(page.locator("[data-presentation-recovered-text]")).toHaveValue(text);
});

test("failed recovery storage is visible and prompts before leaving if both stores fail", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => {
    window.textHarness.failWrites = true;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "football-presentation-text-drafts-v1") throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await page.locator(".presentation-info-body").fill("Preserve this text despite storage failure");
  await page.locator(".presentation-info-body").blur();
  await expect(page.locator("[data-presentation-draft-recovery]")).toContainText("Copy your text before leaving");
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await expect(page.locator("[data-presentation-recovered-text]")).toHaveValue("Preserve this text despite storage failure");
});

test("recovery reads legacy drafts without exposing another user's copy", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => sessionStorage.setItem("football-presentation-text-drafts-v1", JSON.stringify({ version: 1, entries: [
    { key: "coach-a:2026-10-21:team:team-info:info.body", scope: "coach-a", recordId: "2026-10-21:team:team-info",
      field: "info.body", baseValue: "Original saved text", value: "Legacy draft", updatedAt: 1 },
    { key: "coach-b:2026-10-21:team:team-info:info.title", scope: "coach-b", recordId: "2026-10-21:team:team-info",
      field: "info.title", baseValue: "Team Information", value: "Another user's private draft", updatedAt: 2 },
  ] })));
  await openHarness(page);
  await expect(page.locator(".presentation-info-body")).toHaveValue("Legacy draft");
  await expect(page.locator(".presentation-info-title")).toHaveValue("Team Information");
  await expect(page.locator("[data-presentation-draft-recovery]")).toHaveCount(0);
});

test("contenteditable text also keeps its node and selection through a background refresh", async ({ page }) => {
  await openHarness(page);
  await page.getByRole("button", { name: "Go to Cover", exact: true }).click();
  const title = page.locator('[data-presentation-text-field="cover.title"]');
  await title.fill("Coaching brief");
  await title.evaluate((element) => {
    window.retainedField = element;
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.evaluate(() => window.textHarness.controller.render());
  await expect(title).toHaveText("Coaching brief");
  await expect(title).toBeFocused();
  expect(await title.evaluate((element) => element === window.retainedField && element.contains(getSelection().anchorNode))).toBe(true);
  await title.blur();
  expect(await page.evaluate(() => window.textHarness.getDeck().textOverrides.cover["cover.title"])).toBe("Coaching brief");
});

test("a focused but untouched field adopts a remote update without creating a stale save", async ({ page }) => {
  await openHarness(page);
  const input = page.locator(".presentation-info-body");
  await input.focus();
  await page.evaluate(() => window.textHarness.deliverSync("New saved instructions"));
  await expect(input).toHaveValue("New saved instructions");
  await input.blur();
  expect(await saved(page)).toBe("New saved instructions");
  await expect(page.locator("[data-presentation-draft-recovery]")).toHaveCount(0);
});

test("closing a browser tab commits ordinary edits, while unresolved conflicts require a leave decision", async ({ page, context }) => {
  await openHarness(page);
  await page.locator(".presentation-info-body").fill("Saved before browser tab closure");
  const url = page.url();
  const reader = await context.newPage();
  await reader.route("**/presentation-text-harness", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await reader.goto(url);
  await Promise.all([page.waitForEvent("close"), page.close({ runBeforeUnload: true })]);
  expect(await reader.evaluate(() => JSON.parse(localStorage.getItem("football-dashboard-presentation-mode-v1"))
    .decks["2026-10-21"].infoSlides[0].body)).toBe("Saved before browser tab closure");
  await openHarness(reader);
  await reader.locator(".presentation-info-body").fill("Conflicting draft before tab closure");
  await reader.evaluate(() => window.textHarness.deliverSync("Other coach's saved version"));
  const dialogPromise = reader.waitForEvent("dialog");
  await reader.close({ runBeforeUnload: true });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(reader.isClosed()).toBe(false);
  expect(await saved(reader)).toBe("Other coach's saved version");
  await expect(reader.locator("[data-presentation-recovered-text]")).toHaveValue("Conflicting draft before tab closure");
});

test("intentional slide deletion does not leave an obsolete draft that blocks browser closure", async ({ page }) => {
  await openHarness(page);
  await page.locator(".presentation-info-body").fill("Text on a deliberately deleted slide");
  await page.locator(".presentation-info-body").blur();
  await page.locator("[data-presentation-delete-slide]").click();
  expect(await page.evaluate(() => window.textHarness.getDeck().infoSlides.some((slide) => slide.id === "team-info"))).toBe(false);
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
});
