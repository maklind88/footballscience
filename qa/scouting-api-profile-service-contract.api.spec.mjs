import { expect, test } from "@playwright/test";
import { createScoutingApiProfileService } from "../src/modules/scouting/index.mjs";

const normalizeText = (value = "", limit = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createHarness(options = {}) {
  const calls = {
    fetches: [],
    renders: [],
  };
  const responses = Array.isArray(options.responses) ? options.responses.slice() : [{ ok: true, result: { player: { id: "record-1" } } }];
  let active = options.active !== false;
  let renderAllowed = options.renderAllowed !== false;
  const service = createScoutingApiProfileService({
    fetchApi: async (query) => {
      calls.fetches.push(query);
      const response = responses.shift();
      return response instanceof Promise ? response : response || { ok: true, result: { player: { id: query.recordId } } };
    },
    isActive: () => active,
    normalizeText,
    renderPanel: (recordId, profile, status, error) => calls.renders.push({ recordId, profile, status, error }),
    shouldRender: () => renderAllowed,
  });
  return {
    calls,
    service,
    setActive: (value) => {
      active = Boolean(value);
    },
    setRenderAllowed: (value) => {
      renderAllowed = Boolean(value);
    },
  };
}

test("Scouting API profile service loads and caches master player profiles", async () => {
  const harness = createHarness({ responses: [{ ok: true, result: { player: { id: "record-1" }, seasons: [1, 2] } }] });

  await expect(harness.service.hydrateDetails(" record-1 ")).resolves.toEqual({ player: { id: "record-1" }, seasons: [1, 2] });
  await expect(harness.service.hydrateDetails("record-1")).resolves.toEqual({ player: { id: "record-1" }, seasons: [1, 2] });

  expect(harness.calls.fetches).toEqual([{ action: "profile", recordId: "record-1" }]);
  expect(harness.calls.renders.map((render) => render.status)).toEqual(["loading", "ready", "ready"]);
  expect(harness.service.getCacheEntry("record-1")).toMatchObject({
    status: "ready",
    profile: { player: { id: "record-1" }, seasons: [1, 2] },
  });
});

test("Scouting API profile service dedupes active master profile loads", async () => {
  const deferred = createDeferred();
  const harness = createHarness({ responses: [deferred.promise] });

  const firstLoad = harness.service.hydrateDetails("record-1");
  const secondLoad = harness.service.hydrateDetails("record-1");
  deferred.resolve({ ok: true, result: { player: { id: "record-1" } } });

  await expect(firstLoad).resolves.toEqual({ player: { id: "record-1" } });
  await expect(secondLoad).resolves.toEqual({ player: { id: "record-1" } });

  expect(harness.calls.fetches).toEqual([{ action: "profile", recordId: "record-1" }]);
  expect(harness.calls.renders.map((render) => render.status)).toEqual(["loading", "loading", "ready"]);
});

test("Scouting API profile service retries after load errors", async () => {
  const harness = createHarness({
    responses: [
      { ok: false, reason: "No session" },
      { ok: true, result: { player: { id: "record-1" } } },
    ],
  });

  await expect(harness.service.hydrateDetails("record-1")).resolves.toBeNull();
  expect(harness.service.getCacheEntry("record-1")).toMatchObject({ status: "error", error: "No session" });

  await expect(harness.service.hydrateDetails("record-1")).resolves.toEqual({ player: { id: "record-1" } });

  expect(harness.calls.fetches).toEqual([
    { action: "profile", recordId: "record-1" },
    { action: "profile", recordId: "record-1" },
  ]);
  expect(harness.calls.renders.map((render) => render.status)).toEqual(["loading", "error", "loading", "ready"]);
});

test("Scouting API profile service stays quiet when the API database is inactive", () => {
  const harness = createHarness({ active: false });

  expect(harness.service.hydrateDetails("record-1")).toBeNull();

  expect(harness.calls.fetches).toEqual([]);
  expect(harness.calls.renders).toEqual([]);
});

test("Scouting API profile service avoids stale modal renders after a profile switch", async () => {
  const deferred = createDeferred();
  const harness = createHarness({ responses: [deferred.promise] });

  const load = harness.service.hydrateDetails("record-1");
  harness.setRenderAllowed(false);
  deferred.resolve({ ok: true, result: { player: { id: "record-1" } } });

  await expect(load).resolves.toEqual({ player: { id: "record-1" } });

  expect(harness.calls.renders).toEqual([{ recordId: "record-1", profile: null, status: "loading", error: "" }]);
});
