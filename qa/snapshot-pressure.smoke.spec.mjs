import { test, expect } from "@playwright/test";

async function boot(page, options = {}) {
  await page.goto("/medical-merge.js");
  await page.evaluate(async options => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    window.scope = "owner"; window.scheduled = new Map(); let sequence = 0;
    const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid", reload() { throw new Error("Unexpected reload"); } },
      setTimeout(fn, ms) { const id = ++sequence; window.scheduled.set(id, { fn, ms }); return id; },
      clearTimeout(id) { window.scheduled.delete(id); }, addEventListener() {} };
    window.safety = createDataSafetyRuntimeService({ win, storageConstructor: Storage, documentRef: document, navigatorRef: {},
      protectedStorageKeys: ["synthetic-work"], getCentralStateBridge: () => ({ getReadScope: () => window.scope, getStatus: () => ({}) }), ...options });
    window.safety.install(); window.scheduled.clear();
    window.setVersion = number => {
      window.safety.rawSetItem("synthetic-work", `${"x".repeat(65536)}:${number}`);
      window.safety.mutateManifest(m => { m.entries["synthetic-work"] = { principalScope: window.scope, pendingCentralSync: true, writes: number + 1 }; });
    };
    window.rows = async () => {
      const db = await window.safety.openSnapshotDatabase();
      return new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    };
    window.runRefresh = () => { for (const [id, job] of window.scheduled) if (job.ms === 900) { window.scheduled.delete(id); job.fn(); } };
  }, options);
}

test("distinct burst has bounded admission, honest refusals and one fresh retry after draining", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const pending = [];
    for (let n = 0; n < 20; n++) { window.setVersion(n); pending.push(window.safety.saveSnapshot("distinct-burst")); }
    const results = await Promise.all(pending);
    const rows = await window.rows();
    return { results, rows: rows.length, state: window.safety.readSnapshotDiagnostics().snapshotOutcome.state,
      current: window.safety.rawGetItem("synthetic-work").slice(-3), entry: window.safety.readManifest().entries["synthetic-work"],
      retries: [...window.scheduled.values()].filter(job => job.ms === 900).length };
  });
  expect(result).toMatchObject({ results: [...Array(4).fill(true), ...Array(16).fill(false)], rows: 4, state: "busy",
    current: ":19", entry: { pendingCentralSync: true, writes: 20 }, retries: 1 });
  await page.evaluate(() => window.runRefresh());
  await expect.poll(() => page.evaluate(() => window.safety.readSnapshotDiagnostics().snapshotOutcome.state)).toBe("available");
  const after = await page.evaluate(async () => ({ rows: (await window.rows()).map(row => row.storage["synthetic-work"].slice(-3)),
    entry: window.safety.readManifest().entries["synthetic-work"] }));
  expect(after.rows).toHaveLength(5); expect(after.rows).toContain(":19");
  expect(after.entry).toMatchObject({ pendingCentralSync: true, writes: 20 });
});

test("serialized byte admission limits a burst before count capacity is reached", async ({ page }) => {
  await boot(page, { maxQueuedSnapshotBytes: 200000 });
  const result = await page.evaluate(async () => {
    window.setVersion(0); const first = window.safety.saveSnapshot("first");
    window.setVersion(1); const second = window.safety.saveSnapshot("second");
    return { results: await Promise.all([first, second]), rows: (await window.rows()).length };
  });
  expect(result).toEqual({ results: [true, false], rows: 1 });
});

test("oversized single capture fails without an automatic retry loop", async ({ page }) => {
  await boot(page, { maxQueuedSnapshotBytes: 1024 });
  const result = await page.evaluate(async () => {
    window.setVersion(0);
    return { ok: await window.safety.saveSnapshot("too-large"), rows: (await window.rows()).length,
      state: window.safety.readSnapshotDiagnostics().snapshotOutcome.state,
      retries: [...window.scheduled.values()].filter(job => job.ms === 900).length };
  });
  expect(result).toEqual({ ok: false, rows: 0, state: "paused", retries: 0 });
});

test("draining an old scope never schedules a snapshot for a newly selected account", async ({ page }) => {
  await boot(page, { maxQueuedSnapshots: 1 });
  const result = await page.evaluate(async () => {
    window.setVersion(0); const first = window.safety.saveSnapshot("old");
    window.setVersion(1); const second = window.safety.saveSnapshot("refused");
    window.scope = "other";
    return { results: await Promise.all([first, second]), retries: [...window.scheduled.values()].filter(job => job.ms === 900).length };
  });
  expect(result).toEqual({ results: [true, false], retries: 0 });
});

test("an exact duplicate joins the existing write even at count capacity", async ({ page }) => {
  await boot(page, { maxQueuedSnapshots: 1 });
  const result = await page.evaluate(async () => {
    window.setVersion(0);
    const results = await Promise.all(Array.from({ length: 20 }, () => window.safety.saveSnapshot("same")));
    return { results, rows: (await window.rows()).length,
      retries: [...window.scheduled.values()].filter(job => job.ms === 900).length };
  });
  expect(result).toEqual({ results: Array(20).fill(true), rows: 1, retries: 0 });
});

for (const trigger of ["timer", "flush"]) {
  test(`a drained retry checks account scope again at ${trigger}`, async ({ page }) => {
    await boot(page, { maxQueuedSnapshots: 1 });
    const result = await page.evaluate(async trigger => {
      window.setVersion(0); const first = window.safety.saveSnapshot("old");
      window.setVersion(1); const refused = window.safety.saveSnapshot("refused");
      await Promise.all([first, refused]);
      const retries = [...window.scheduled.values()].filter(job => job.ms === 900).length;
      window.scope = "other";
      if (trigger === "timer") window.runRefresh();
      else await window.safety.flushQueuedSnapshot();
      return { retries, rows: (await window.rows()).length };
    }, trigger);
    expect(result).toEqual({ retries: 1, rows: 1 });
  });
}

test("busy health message and retry never claim the refused copy was saved", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { addSnapshotHealthPanel } = await import("/src/core/snapshot-health-panel.mjs");
    const { readSnapshotState } = await import("/src/core/snapshot-status.mjs");
    const dialog = document.createElement("section"); document.body.append(dialog);
    const inventoryStatus = document.createElement("p"); dialog.append(inventoryStatus);
    addSnapshotHealthPanel({ doc: document, content: dialog, dialog, scope: "owner", getScope: () => "owner",
      report: { snapshotState: readSnapshotState({ lastSnapshotError: "Busy", snapshotOutcome: { state: "busy", scope: "owner", error: "Busy" } }, "owner") },
      retrySnapshot: async () => ({ ok: false, state: "busy" }), inventoryStatus });
  });
  const status = page.getByRole("status", { name: "Browser snapshot status" });
  await expect(status).toContainText("The latest attempt was not recorded");
  await page.getByRole("button", { name: "Retry browser snapshot" }).click();
  await expect(status).toContainText("The latest attempt was not recorded");
  await expect(page.getByRole("button", { name: "Retry browser snapshot" })).toBeEnabled();
});
