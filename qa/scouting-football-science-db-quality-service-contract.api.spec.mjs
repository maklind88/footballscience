import { expect, test } from "@playwright/test";
import { createFootballScienceDbQualityService } from "../src/modules/scouting/index.mjs";

function createHarness(options = {}) {
  const calls = {
    fetches: [],
    renders: [],
    normalized: [],
  };
  const responses = Array.isArray(options.responses) ? options.responses.slice() : [{ ok: true, result: { totals: { players: 10 } } }];
  const service = createFootballScienceDbQualityService({
    fetchApi: async (query) => {
      calls.fetches.push(query);
      const response = responses.shift();
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
    normalizeSummary: (summary) => {
      calls.normalized.push(summary);
      return { normalized: true, ...summary };
    },
    renderWorkspace: (options) => calls.renders.push(options),
  });
  return { calls, service };
}

test("Football Science DB quality service loads and caches a normalized summary", async () => {
  const harness = createHarness({ responses: [{ ok: true, result: { totals: { players: 42 } } }] });

  await expect(harness.service.load()).resolves.toEqual({ normalized: true, totals: { players: 42 } });
  await expect(harness.service.load()).resolves.toEqual({ normalized: true, totals: { players: 42 } });

  expect(harness.calls.fetches).toEqual([{ action: "quality" }]);
  expect(harness.calls.normalized).toEqual([{ totals: { players: 42 } }]);
  expect(harness.service.getCache()).toMatchObject({
    status: "ready",
    summary: { normalized: true, totals: { players: 42 } },
    error: "",
  });
});

test("Football Science DB quality service dedupes active loads and supports force reload", async () => {
  let resolveFirst;
  const firstResponse = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const harness = createHarness({
    responses: [
      firstResponse,
      { ok: true, result: { totals: { players: 2 } } },
    ],
  });

  const firstLoad = harness.service.load();
  const secondLoad = harness.service.load();
  expect(firstLoad).toBe(secondLoad);
  expect(harness.service.getCache().status).toBe("loading");
  resolveFirst({ ok: true, result: { totals: { players: 1 } } });
  await expect(firstLoad).resolves.toMatchObject({ totals: { players: 1 } });

  await expect(harness.service.load({ force: true })).resolves.toMatchObject({ totals: { players: 2 } });
  expect(harness.calls.fetches).toEqual([{ action: "quality" }, { action: "quality" }]);
});

test("Football Science DB quality service records errors while preserving previous summaries", async () => {
  const harness = createHarness({
    responses: [
      { ok: true, result: { totals: { players: 5 } } },
      { ok: false, reason: "Quality unavailable" },
    ],
  });

  await harness.service.load();
  await expect(harness.service.load({ force: true })).rejects.toThrow("Quality unavailable");

  expect(harness.service.getCache()).toMatchObject({
    status: "error",
    summary: { normalized: true, totals: { players: 5 } },
    error: "Quality unavailable",
  });
});

test("Football Science DB quality service queues loads and renders after success or failure", async () => {
  const success = createHarness({ responses: [{ ok: true, result: { totals: { players: 3 } } }] });

  await success.service.queueLoad();
  expect(success.calls.renders).toEqual([{ preserveFocus: true }]);
  expect(success.service.queueLoad()).toBeNull();

  const failure = createHarness({ responses: [{ ok: false, reason: "No session" }] });
  await failure.service.queueLoad();
  expect(failure.calls.renders).toEqual([{ preserveFocus: true }]);
  expect(failure.service.getCache()).toMatchObject({ status: "error", error: "No session" });
});

test("Football Science DB quality service can surface profile-queue errors without changing status", async () => {
  const harness = createHarness({ responses: [{ ok: true, result: { totals: { players: 9 } } }] });

  await harness.service.load();
  const cache = harness.service.setError("Profile could not be opened");

  expect(cache).toMatchObject({
    status: "ready",
    summary: { normalized: true, totals: { players: 9 } },
    error: "Profile could not be opened",
  });
});
