import { EventEmitter } from "node:events";
import { expect, test } from "@playwright/test";
import { createLiveReadinessProbe } from "./helpers/live-readiness-probe.mjs";

function setup() {
  const page = new EventEmitter();
  let clock = 1000;
  const output = [];
  const probe = createLiveReadinessProbe(page, {
    origin: "https://example.test", attempt: 4, testStartedAt: 0, budgetMs: 90000,
    now: () => clock, emit: (value) => output.push(value),
  });
  return { page, probe, output, tick: (ms) => { clock += ms; } };
}
const request = (url) => ({ url: () => url });

test("readiness timing distinguishes a slow stage from an exhausted total test budget", async () => {
  const { probe, tick, page } = setup();
  tick(87000);
  const original = new Error("private error content");
  await expect(probe.step("central-retry", async () => { tick(2500); throw original; })).rejects.toBe(original);
  probe.readiness("hydrated=true hydrating=true error=none");
  const report = probe.finish(false);
  expect(report.elapsedSinceBeforeEachMs).toBe(90500);
  expect(report.estimatedRemainingMs).toBe(0);
  expect(report.stages).toEqual([{ phase: "central-retry", outcome: "failed", elapsedMs: 2500 }]);
  expect(report.lastReadiness).toEqual({ state: "waiting", hydrated: true, hydrating: true, hasError: false });
  expect(page.eventNames()).toEqual([]);
});

test("diagnostics exclude URLs, query strings, credentials, response content and arbitrary error text", async () => {
  const { page, probe, tick, output } = setup();
  const req = request("https://example.test/api/app-state?token=SECRET&player=PRIVATE");
  const foreign = request("https://private-user:SECRET@foreign.test/api/app-state?record=PRIVATE");
  const other = request("https://example.test/api/medical?record=PRIVATE");
  page.emit("request", req); page.emit("request", foreign); page.emit("request", other);
  page.emit("response", { request: () => req, status: () => 429, text: () => { throw new Error("must not read bodies"); } });
  tick(250);
  page.emit("requestfinished", req);
  probe.readiness("hydrated=false hydrating=false error=SECRET PRIVATE");
  const result = await probe.step("auth-ready", async () => 42);
  expect(result).toBe(42);
  const report = probe.finish(true);
  expect(report.requests["/api/app-state"]).toMatchObject({ started: 1, finished: 1, httpErrors: 1, throttled: 1, maxMs: 250 });
  expect(report.lastReadiness.hasError).toBe(true);
  expect(output.join("")).not.toMatch(/SECRET|PRIVATE|foreign|private-user|api\/medical/);
  expect(probe.finish(false)).toBeUndefined();
  expect(output).toHaveLength(1);
});

test("pending requests, network failures and overflow are bounded and cleaned up", () => {
  const { page, probe, tick } = setup();
  const failed = request("https://example.test/api/client-config");
  page.emit("request", failed);
  tick(30);
  page.emit("requestfailed", failed);
  for (let i = 0; i < 70; i++) page.emit("request", request("https://example.test/api/app-state"));
  tick(200);
  const report = probe.finish(false);
  expect(report.requests["/api/client-config"]).toMatchObject({ failed: 1, maxMs: 30 });
  expect(report.pending["/api/app-state"]).toEqual({ count: 64, oldestMs: 200 });
  expect(report.droppedRequests).toBe(6);
  expect(page.eventNames()).toEqual([]);
});

test("only known phase and readiness labels can enter output", async () => {
  const { probe, output } = setup();
  await expect(probe.step("secret user name", async () => {})).rejects.toThrow("Unknown readiness phase");
  probe.readiness("secret user name");
  expect(probe.finish(true).lastReadiness).toEqual({ state: "unknown" });
  expect(output.join("")).not.toContain("secret user name");
});
