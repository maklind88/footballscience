import { expect, test } from "@playwright/test";

async function boot(page) {
  await page.route("**/qa/session-save-harness", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="open">Review local saves</button></body></html>' }));
  await page.goto("/qa/session-save-harness");
}

test("review archival uses real IndexedDB CAS across tabs and survives reload", async ({ page, context }) => {
  await boot(page);
  const peer = await context.newPage();
  await boot(peer);
  const original = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const { createSessionDateChanges } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    const before = { sessions: {} }, after = { sessions: { "2026-09-10": { blocks: [{ id: "a", title: "Local A" }] } } };
    const row = { change: createSessionDateChanges(before, after, () => "cas-review")[0], scope: "actor:team", writer: "A", createdAt: 1, status: "review" };
    await createSessionSaveStore().put(row);
    return row;
  });
  const newer = structuredClone(original);
  newer.writer = "B"; newer.createdAt = 2; newer.change.after.session.blocks[0].title = "Newer B";
  await peer.evaluate(async (row) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    await createSessionSaveStore().put(row);
  }, newer);
  expect(await page.evaluate(async (row) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    try { await createSessionSaveStore().archiveReviewed(row); return "unexpected success"; } catch { return "retained"; }
  }, original)).toBe("retained");
  await page.reload();
  const result = await page.evaluate(async (expected) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const before = await store.list(expected.scope);
    await store.archiveReviewed(before[0]);
    return { before, after: await store.list(expected.scope) };
  }, newer);
  expect(result.before[0]).toMatchObject(newer);
  expect(result.after[0]).toMatchObject({ ...newer, status: "archived" });
  await peer.close();
});

test("bulk keep-central archives only listed reviews, retains newer edits and never sends", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
    const { createSessionDateChanges } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
    const before = { sessions: { "2026-09-10": { date: "2026-09-10", blocks: [{ id: "a", title: "Before" }] } } };
    const central = structuredClone(before); central.sessions["2026-09-10"].blocks[0].title = "Server";
    const store = createSessionSaveStore();
    for (const id of ["review-a", "review-b"]) {
      const local = structuredClone(before); local.sessions["2026-09-10"].blocks[0].title = id;
      await store.put({ scope: "actor:team", writer: id, createdAt: id === "review-a" ? 1 : 2, status: "review", change: createSessionDateChanges(before, local, () => id)[0] });
    }
    const client = createSessionSaveClient({ getScope: () => "actor:team", store, send: async () => { window.unwantedPosts++; throw new Error("No POST allowed"); } });
    client.observe(JSON.stringify(central), { revision: 12 });
    window.unwantedPosts = 0;
    window.reviewClient = client;
    window.reviewRows = () => store.list("actor:team");
    window.stageNewEdit = async () => {
      const edit = structuredClone(central); edit.sessions["2026-09-10"].blocks[0].minutes = 35;
      await client.stage(JSON.stringify(edit), { previousValue: JSON.stringify(central) });
    };
    document.querySelector("#open").onclick = () => openSessionSaveReview({ document,
      bridge: { hydrate: async () => true, getSessionSaveReviews: () => client.reviews(), resolveSessionSaveReview: (...args) => client.resolve(...args) },
      legacy: { list: async () => [] }, canReview: () => true });
  });
  await page.getByRole("button", { name: "Review local saves", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toHaveText("2 local versions to review");
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.evaluate(() => window.stageNewEdit());
  page.once("dialog", (prompt) => prompt.accept());
  await dialog.getByRole("button", { name: "Keep central for all listed versions", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("No unresolved local versions.");
  const result = await page.evaluate(async () => ({ rows: await window.reviewRows(), posts: window.unwantedPosts,
    view: await window.reviewClient.project(), central: window.reviewClient.centralValue() }));
  expect(result.posts).toBe(0);
  expect(result.rows.filter((row) => row.status === "archived")).toHaveLength(2);
  expect(result.rows.filter((row) => row.status === "pending")).toHaveLength(1);
  expect(JSON.parse(result.central).sessions["2026-09-10"].blocks[0]).toEqual({ id: "a", title: "Server" });
  expect(JSON.parse(result.view.value).sessions["2026-09-10"].blocks[0]).toMatchObject({ title: "Server", minutes: 35 });
});

test("two tabs and a reopened page project durable edits over fresh server fields without acknowledging them", async ({ page, context }) => {
  await boot(page);
  const day = "2026-09-25";
  const baseline = { sessions: { [day]: { date: day, blocks: [{ id: "a", title: "Training", objective: "Before", minutes: 20 }] } } };
  await page.evaluate(async ({ baseline, day }) => {
    const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
    const client = createSessionSaveClient({ getScope: () => "actor:club:team", send: async () => ({ ok: false, status: 0 }) });
    client.observe(JSON.stringify(baseline), { revision: 7 });
    const edited = structuredClone(baseline);
    edited.sessions[day].blocks[0].objective = "Unsent instruction";
    const result = await client.save(JSON.stringify(edited));
    if (result.ok || !result.durablePending) throw new Error("The failed connection must retain its journal row");
  }, { baseline, day });
  const peer = await context.newPage();
  await boot(peer);
  await page.close();
  const fresh = structuredClone(baseline);
  fresh.sessions[day].blocks[0].minutes = 35;
  async function inspect(target, scope) {
    return target.evaluate(async ({ fresh, scope }) => {
      const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
      const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
      const store = createSessionSaveStore();
      const before = await store.list("actor:club:team");
      const client = createSessionSaveClient({ getScope: () => scope, store, send: async () => { throw new Error("Reading must never send"); } });
      client.observe(JSON.stringify(fresh), { revision: 8 });
      const view = await client.project();
      return { view, before, after: await store.list("actor:club:team"), central: client.centralValue() };
    }, { fresh, scope });
  }
  const a = await inspect(peer, "actor:club:team");
  expect(JSON.parse(a.view.value).sessions[day].blocks[0]).toMatchObject({ objective: "Unsent instruction", minutes: 35 });
  expect(a.view.pending).toBe(true);
  expect(a.before).toHaveLength(1);
  expect(a.after).toEqual(a.before);
  expect(JSON.parse(a.central)).toEqual(fresh);
  const reopened = await context.newPage();
  await boot(reopened);
  const b = await inspect(reopened, "actor:club:team");
  expect(b.view.value).toBe(a.view.value);
  expect(b.after).toEqual(a.before);
  const other = await inspect(reopened, "other:club:team");
  expect(other.view.pending).toBe(false);
  expect(JSON.parse(other.view.value)).toEqual(fresh);
  expect(other.after).toEqual(a.before);
  await peer.close(); await reopened.close();
});

for (const failure of ["refresh", "account", "changed-review"]) {
  test(`bulk keep-central stops safely on ${failure} and never chooses local`, async ({ page }) => {
    await boot(page);
    await page.evaluate(async (failure) => {
      const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
      const local = { session: { date: "2026-09-10", title: "Local", blocks: [] }, tombstones: {} };
      const central = { session: { date: "2026-09-10", title: "Central", blocks: [] }, tombstones: {} };
      const rows = ["one", "two"].map((id) => ({ id, date: "2026-09-10", central, local, differences: [] }));
      let reads = 0, allowed = true;
      window.resolved = [];
      document.querySelector("#open").onclick = () => openSessionSaveReview({ document,
        bridge: { hydrate: async () => ++reads === 1 || failure !== "refresh" },
        legacy: { list: async () => rows, resolve: async (row, useLocal) => {
          window.resolved.push({ id: row.id, useLocal });
          if (failure === "account") allowed = false;
          return failure === "changed-review" ? { ok: false, reason: "Training changed. Open the review again." } : { ok: true };
        } }, canReview: () => allowed });
    }, failure);
    await page.getByRole("button", { name: "Review local saves", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("status")).toHaveText("2 local versions to review");
    page.once("dialog", (prompt) => prompt.accept());
    await dialog.getByRole("button", { name: "Keep central for all listed versions", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(failure === "refresh" ? "could not be refreshed" : failure === "account" ? "Account or team changed" : "Training changed");
    expect(await page.evaluate(() => window.resolved)).toEqual(failure === "refresh" ? [] : [{ id: "one", useLocal: false }]);
  });
}

test("legacy cache archival is durable and never resets a reviewed copy", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const context = { scope: "coach:org:team", revision: 10 };
    const raw = JSON.stringify({ sessions: { "2026-09-10": { title: "Unresolved", blocks: [] } } });
    await store.archiveLocal(raw, context);
    const db = await new Promise((resolve) => { const req = indexedDB.open("football-science-data-safety-v1", 1); req.onsuccess = () => resolve(req.result); });
    const read = () => new Promise((resolve) => { const req = db.transaction("snapshots").objectStore("snapshots").getAll(); req.onsuccess = () => resolve(req.result); });
    const [row] = await read();
    await new Promise((resolve) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ ...row, reviewedDates: { "2026-09-10": "reviewed" } }); tx.oncomplete = resolve;
    });
    await store.archiveLocal(raw, { ...context, revision: 11 });
    const rows = await read(); db.close();
    return { rows, raw };
  });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ recovery: { scope: "coach:org:team", baseRevision: 10 }, reviewedDates: { "2026-09-10": "reviewed" } });
  expect(result.rows[0].storage["football-session-planner-v3"]).toBe(result.raw);
});

test("real IndexedDB retains queued frames after reload and snapshot pruning never removes unresolved copies", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const { createSessionDateChanges } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    const before = { sessions: {} }, after = { sessions: { "2026-09-10": { date: "2026-09-10", blocks: [{ id: "a", tacticalFrames: Array.from({ length: 24 }, (_, i) => ({ id: `f${i}`, elements: [{ id: "p", playerNumber: "CB", x: i, y: 40 }] })) }] } } };
    await createSessionSaveStore().put({ scope: "coach:team", status: "pending", createdAt: 1, change: createSessionDateChanges(before, after, () => "durable-edit")[0] });
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const rows = await store.list("coach:team");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("football-science-data-safety-v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const protectedId = "football-session-planner-v3-quota-fallback:coach:review:1";
    await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite"), snapshots = tx.objectStore("snapshots");
      for (let i = 0; i < 40; i++) snapshots.put({ id: `snapshot-${String(i).padStart(2, "0")}` });
      snapshots.put({ id: protectedId, reason: "session-planner-recovery-review", storage: { important: "Retained" } });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    await createDataSafetyRuntimeService({ maxSnapshots: 3 }).pruneSnapshots(db);
    const remaining = await new Promise((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return { frameCount: rows[0].change.after.session.blocks[0].tacticalFrames.length,
      marker: rows[0].change.after.session.blocks[0].tacticalFrames[0].elements[0],
      otherScope: await store.list("other:team"), remaining, queued: (await store.list("coach:team")).length };
  });
  expect(result).toMatchObject({ frameCount: 24, marker: { playerNumber: "CB", x: 0, y: 40 }, otherScope: [], queued: 1 });
  expect(result.remaining).toHaveLength(4);
  expect(result.remaining.some((row) => row.storage?.important === "Retained")).toBe(true);
});

test("a rebased edit replaces its pending predecessor atomically across reload", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const original = { scope: "rebase:coach:team", status: "pending", createdAt: 1,
      change: { id: "original", date: "2026-09-10", before: {}, after: { session: { objective: "Original" } } } };
    await store.put(original);
    await store.replaceWithRebased(original, { ...original, createdAt: 2,
      change: { ...original.change, id: "rebased", after: { session: { objective: "Rebased" } } } });
  });
  await page.reload();
  const rows = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    return createSessionSaveStore().list("rebase:coach:team");
  });
  expect(rows.map((row) => [row.change.id, row.status])).toEqual([["original", "archived"], ["rebased", "pending"]]);
  expect(rows[1].change.after.session.objective).toBe("Rebased");
});

test("a second tab resolving the old edit prevents a stale rebase", async ({ page, context }) => {
  await boot(page);
  const peer = await context.newPage();
  await peer.goto("/qa/session-save-harness");
  const original = { scope: "rebase:two-tabs", writer: "coach-tab", status: "pending", createdAt: 1,
    change: { id: "old-edit", date: "2026-09-10", before: {}, after: { session: { objective: "Old" } } } };
  await page.evaluate(async (row) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    await createSessionSaveStore().put(row);
  }, original);
  await peer.evaluate(async (row) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    await createSessionSaveStore().put({ ...row, status: "archived" });
  }, original);
  const result = await page.evaluate(async (row) => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    let rejected = false;
    try { await store.replaceWithRebased(row, { ...row, change: { ...row.change, id: "stale-rebase" } }); }
    catch { rejected = true; }
    return { rejected, rows: await store.list(row.scope) };
  }, original);
  expect(result.rejected).toBe(true);
  expect(result.rows.map((row) => [row.change.id, row.status])).toEqual([["old-edit", "archived"]]);
  await peer.close();
});

for (const width of [1470, 390]) {
  test(`local review is readable, keyboard accessible and archives without deleting at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 752 });
    await boot(page);
    await page.evaluate(async () => {
      const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
      await createSessionSaveStore().list("initialize");
      const { createSessionLocalReviewService } = await import("/src/modules/session-planner/session-local-review-service.mjs");
      const { getSessionPlannerQuotaSnapshotId } = await import("/src/modules/session-planner/session-planner-recovery-controller.mjs");
      const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
      const context = { scope: "review-coach:team", ready: true, revision: 12 };
      const key = "football-session-planner-v3", date = "2026-09-10";
      const central = { sessions: { [date]: { date, title: "Training", blocks: [{ id: "a", title: "Press", objective: "Central instruction" }] } } };
      const local = structuredClone(central); local.sessions[date].blocks[0].objective = '<img src=x onerror="window.unsafe=true"> Local instruction';
      const db = await new Promise((resolve) => { const request = indexedDB.open("football-science-data-safety-v1", 1); request.onsuccess = () => resolve(request.result); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put({ id: getSessionPlannerQuotaSnapshotId(key, context), reason: "session-planner-quota-fallback", recovery: { scope: context.scope }, storage: { [key]: JSON.stringify(local) } });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      window.reviewWrites = 0; window.refreshes = 0;
      const legacy = createSessionLocalReviewService({ openDatabase: async () => db, getContext: () => context, getCentralValue: () => JSON.stringify(central), save: async () => { window.reviewWrites++; return { ok: true }; } });
      window.readSnapshots = () => new Promise((resolve) => { const req = db.transaction("snapshots").objectStore("snapshots").getAll(); req.onsuccess = () => resolve(req.result); });
      document.querySelector("#open").addEventListener("click", (event) => openSessionSaveReview({ document, legacy, canReview: () => true, returnFocus: event.currentTarget,
        bridge: { hydrate: async () => { window.refreshes++; return true; }, getSessionSaveReviews: async () => [] } }));
    });
    await page.locator("#open").click();
    const dialog = page.getByRole("dialog", { name: "Review local saves" });
    await expect(dialog).toBeVisible();
    await dialog.locator("summary").click();
    await expect(dialog.getByText("Central instruction", { exact: true })).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(0);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`review-${width}.png`) });
    page.once("dialog", (prompt) => prompt.accept());
    await dialog.getByRole("button", { name: "Keep central version" }).click();
    await expect(dialog.getByRole("status")).toHaveText("No unresolved local versions.");
    const result = await page.evaluate(async () => ({ writes: window.reviewWrites, refreshes: window.refreshes, snapshots: await window.readSnapshots(), unsafe: Boolean(window.unsafe) }));
    expect(result.writes).toBe(0);
    expect(result.unsafe).toBe(false);
    expect(result.refreshes).toBeGreaterThanOrEqual(2);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].reviewedDates["2026-09-10"]).toBeTruthy();
    expect(result.snapshots[0].storage["football-session-planner-v3"]).toContain("Local instruction");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#open")).toBeFocused();
  });
}

test("local review restores keyboard focus without an explicit opener", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
    document.querySelector("#open").addEventListener("click", () => openSessionSaveReview({
      document, canReview: () => true, bridge: {}, legacy: { list: async () => [] },
    }));
  });
  await page.locator("#open").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Review local saves" });
  await expect(dialog.getByRole("status")).toHaveText("No unresolved local versions.");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#open")).toBeFocused();
});

test("local review does not refocus an opener removed while the dialog is open", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
    const opener = document.querySelector("#open");
    window.removedFocusCalls = 0;
    await openSessionSaveReview({ document, returnFocus: opener, canReview: () => true,
      bridge: {}, legacy: { list: async () => [] } });
    opener.remove();
    opener.focus = () => { window.removedFocusCalls++; };
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.removedFocusCalls)).toBe(0);
});
