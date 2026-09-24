import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function loadCleanup() {
  const source = readFileSync(new URL("./central-state-revision.smoke.spec.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function closeCentralStateContext(context)");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\ntest(", start);
  expect(end).toBeGreaterThan(start);
  return runInNewContext(`${source.slice(start, end)}\ncloseCentralStateContext`, {
    // An elapsed timer cannot be substituted for the outstanding close promise.
    setTimeout: (callback) => { callback(); return 1; },
  });
}

test("central browser cleanup waits for terminal context and trace closure", async () => {
  let finish;
  const closing = new Promise((resolve) => { finish = resolve; });
  let completed = false, calls = 0;
  const cleanup = loadCleanup()({ close: () => { calls++; return closing; } });
  cleanup.then(() => { completed = true; });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(calls).toBe(1);
  expect(completed).toBe(false);
  finish(); await cleanup;
  expect(completed).toBe(true);
});

test("central browser cleanup surfaces trace errors instead of hiding a broken run", async () => {
  const failure = new Error("ENOENT: missing .trace file");
  await expect(loadCleanup()({ close: async () => { throw failure; } })).rejects.toBe(failure);
});
