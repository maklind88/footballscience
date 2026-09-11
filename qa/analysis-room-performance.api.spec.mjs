import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { sourceFixture, platformFixture, actorId, teamId, otherTeamId } from "./helpers/analysis-performance-fixture.mjs";
const require = createRequire(import.meta.url);
const { normalizeDataset, fetchDataset, SOURCE_URL, MAX_SOURCE_BYTES } = require("../api/_lib/analysis-performance-contract.js");
const { resolvePerformanceContext, performanceRpc } = require("../api/_lib/analysis-performance-database.js");
const { createAnalysisRoomHandler, readFilters } = require("../api/analysis-room.js");
const { hasModulePermission } = require("../src/core/permission-matrix.cjs");

test("content hash excludes generation time and source row ordering, not data corrections", () => {
  const a = sourceFixture();
  const b = structuredClone(a);
  b.dashboardData.generatedAt = "2026-09-11T12:00:00Z";
  b.dashboardData.events.reverse(); b.dashboardData.matches.reverse(); b.playerMinutes.matches.reverse();
  expect(normalizeDataset(a).hash).toBe(normalizeDataset(b).hash);
  b.dashboardData.events[0].outcome = "Attempted";
  expect(normalizeDataset(a).hash).not.toBe(normalizeDataset(b).hash);
});
for (const [name, mutate] of [
  ["duplicate events", (d) => d.dashboardData.events.push(d.dashboardData.events[0])],
  ["duplicate matches", (d) => d.dashboardData.matches.push(d.dashboardData.matches[0])],
  ["incorrect counts", (d) => d.dashboardData.matches[0].cleanEvents++],
  ["new outcome", (d) => d.dashboardData.events[0].outcome = "Successful"],
  ["unknown match", (d) => d.dashboardData.events[0].matchNumber = 8],
  ["wrong opponent", (d) => d.dashboardData.events[0].opponent = "Different team"],
  ["empty dataset", (d) => d.dashboardData.events = []],
  ["local path", (d) => d.playerMinutes.matches[0].sourceFile = "/Users/example/private.csv"],
  ["inline bytes", (d) => d.dashboardData.events[0].playerAttributionNote = "data:video/mp4;base64,abc"],
  ["ambiguous timeline", (d) => d.dashboardData.gameStates.push(d.dashboardData.gameStates[0])],
  ["invalid interval", (d) => d.playerMinutes.matches[0].intervals[0].end = -1],
]) test(`import rejects ${name}`, () => {
  const source = sourceFixture(); mutate(source);
  expect(() => normalizeDataset(source)).toThrow();
});
test("50,000 events validate without truncation", () => {
  const started = Date.now();
  const dataset = normalizeDataset(sourceFixture(50000));
  expect(dataset.events).toHaveLength(50000);
  expect(dataset.summary.eventCount).toBe(50000);
  expect(Date.now() - started).toBeLessThan(10000);
  expect(() => normalizeDataset(sourceFixture(50001))).toThrow();
});
test("source is fixed, redirects are rejected and requests are bounded", async () => {
  let observed;
  await fetchDataset(async (url, opts) => { observed = { url, opts }; return Response.json(sourceFixture()); });
  expect(observed.url).toBe(SOURCE_URL);
  expect(observed.opts.redirect).toBe("error");
  expect(observed.opts.signal).toBeInstanceOf(AbortSignal);
  await expect(fetchDataset(async () => new Response("html", { headers: { "Content-Type": "text/html" } }))).rejects.toThrow("changed format");
  await expect(fetchDataset(async () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": MAX_SOURCE_BYTES + 1 } }))).rejects.toThrow("limit");
  await expect(fetchDataset(async () => { throw Error("network"); })).rejects.toThrow("Saved data has not changed");
});
test("only current authorized staff memberships decide team scope", () => {
  expect(resolvePerformanceContext(platformFixture(), teamId).actor.role).toBe("coach");
  expect(() => resolvePerformanceContext(platformFixture(), otherTeamId)).toThrow("denied");
  for (const role of ["guest", "scout", "medical", "performance"]) {
    expect(() => resolvePerformanceContext(platformFixture(role), teamId)).toThrow();
    expect(hasModulePermission({ role }, "analysis-room", "read")).toBe(false);
  }
  const edited = platformFixture("guest"); edited.actor.role = "admin";
  expect(() => resolvePerformanceContext(edited, teamId)).toThrow();
  const paused = platformFixture(); paused.scope.memberships[0].status = "paused";
  expect(() => resolvePerformanceContext(paused, teamId)).toThrow();
});
test("oversized streamed responses without Content-Length are rejected", async () => {
  const bytes = new Uint8Array(MAX_SOURCE_BYTES + 1);
  await expect(fetchDataset(async () => new Response(bytes, { headers: { "Content-Type": "application/json" } }))).rejects.toMatchObject({ status: 413 });
});
test("filters reject unknown keys, invalid versions and unbounded pages", () => {
  for (const query of ["match=abc", "offset=-1", "offset=999999999", "versionId=bad", "url=https://localhost", "match=1&match=2"]) {
    expect(() => readFilters(new URLSearchParams(query))).toThrow();
  }
  expect(readFilters(new URLSearchParams("match=1&period=1st+Half"))).toEqual({ match: "1", period: "1st Half" });
});
function response() {
  return { statusCode: 0, body: "", headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body = "") { this.body = String(body); } };
}
function harness(overrides = {}) {
  const calls = [];
  const source = normalizeDataset(sourceFixture());
  const handler = createAnalysisRoomHandler({
    getCurrentActor: async () => ({ id: actorId, role: "admin" }), resolvePlatformActorScope: async () => platformFixture(),
    guardApiRequest: () => ({ ok: true }), enforceApiPermission: () => ({ ok: true }),
    env: { ANALYSIS_PERFORMANCE_TEAM_ID: teamId, ANALYSIS_PERFORMANCE_IMPORT_APPROVED: "true" },
    rpc: async (name, context, args) => { calls.push({ name, context, args }); return name === "read" ? { currentRevision: 2, version: { hash: "a".repeat(64), eventCount: 5, matchCount: 2 } } : { revision: 3 }; },
    fetchDataset: async () => { calls.push({ name: "source" }); return source; },
    parseJsonBody: async (req) => req.testBody,
    ...overrides,
  });
  return { calls, source, async invoke(method = "GET", body = {}, url = "/api/analysis-room") {
    const res = response(); await handler({ method, url, headers: {}, testBody: body }, res);
    return { status: res.statusCode, data: JSON.parse(res.body), headers: res.headers };
  } };
}
test("saved reads never contact the analyst site", async () => {
  const h = harness(); const result = await h.invoke();
  expect(result.status).toBe(200); expect(h.calls.map((c) => c.name)).toEqual(["read"]);
  expect(result.headers["Cache-Control"]).toContain("no-store");
});
test("preview is read-only; confirmation requires reviewed content and revision", async () => {
  const h = harness(); const preview = await h.invoke("POST", { action: "preview-import" });
  expect(preview.data.preview.expectedRevision).toBe(2);
  expect(h.calls.some((c) => c.name === "import")).toBe(false);
  const result = await h.invoke("POST", { action: "confirm-import", expectedHash: h.source.hash, expectedRevision: 2 });
  expect(result.status).toBe(200);
  expect(h.calls.at(-1).args.p_events).toHaveLength(6);
});
test("changed source and concurrent revision stop before write", async () => {
  for (const body of [{ expectedHash: "b".repeat(64), expectedRevision: 2 }, { expectedHash: "b".repeat(64), expectedRevision: 1 }]) {
    const h = harness(); const result = await h.invoke("POST", { action: "confirm-import", ...body });
    expect(result.status).toBe(409); expect(h.calls.some((c) => c.name === "import")).toBe(false);
  }
});
test("source outage does not modify saved statistics", async () => {
  const h = harness({ fetchDataset: async () => { throw Object.assign(Error("Unavailable"), { status: 502 }); } });
  expect((await h.invoke("POST", { action: "preview-import" })).status).toBe(502);
  expect(h.calls.map((c) => c.name)).toEqual(["read"]);
});
test("import stays off without approval; data reads remain available", async () => {
  const h = harness({ env: { ANALYSIS_PERFORMANCE_TEAM_ID: teamId } });
  expect((await h.invoke()).data.importAvailable).toBe(false);
  expect((await h.invoke("POST", { action: "preview-import" })).status).toBe(403);
  expect(h.calls.map((c) => c.name)).toEqual(["read"]);
});
test("unauthenticated, wrong-team and method requests fail closed", async () => {
  expect((await harness({ getCurrentActor: async () => null }).invoke()).status).toBe(401);
  const h = harness(); expect((await h.invoke("GET", {}, `/api/analysis-room?teamId=${otherTeamId}`)).status).toBe(403);
  expect((await h.invoke("DELETE")).status).toBe(405); expect(h.calls).toHaveLength(0);
});
test("database failures are mapped without disclosing SQL or credentials", async () => {
  await expect(performanceRpc("read", resolvePerformanceContext(platformFixture(), teamId), {}, {
    config: { url: "https://example.test", serviceRoleKey: "test" },
    fetchImpl: async () => Response.json({ code: "40001", message: "sensitive SQL" }, { status: 400 }),
  })).rejects.toMatchObject({ status: 409, message: "Statistics changed. Preview the import again." });
});
