import { expect, test } from "@playwright/test";
import { createIsolatedStagingProbe } from "./helpers/isolated-staging-probe.mjs";
import { createScheduleStagingWriteGuard } from "./helpers/schedule-staging-write-guard.mjs";
import { createDefaultScheduleState, scheduleStorageKey } from "../src/modules/schedule/schedule-state.mjs";

const stage = "https://staging.footballscience.xyz";
const live = "https://footballscience.xyz";
const stageRef = "pokrksgempkuraueglpu";
const liveRef = "bustidorxevacosqhkcz";
const expectedBuild = "2".repeat(40);
const env = {
  STAGING_QA_BASE_URL: stage,
  STAGING_SUPABASE_PROJECT_REF: stageRef,
  SUPABASE_PROJECT_REF: liveRef,
  STAGING_QA_USERNAME: "synthetic-stage-account",
  STAGING_QA_PASSWORD: "synthetic-test-password",
  SCHEDULE_QA_EXPECTED_BUILD: expectedBuild,
};

test("Schedule staging isolation proves live and staging config before authorizing the probe", async () => {
  const requests = [];
  const fetchImpl = (url, options) => {
    requests.push(url);
    const isStage = url.startsWith(stage);
    expect(options.redirect).toBe("error");
    expect(options.headers).toBeUndefined();
    return Response.json({
      ok: true,
      buildId: isStage ? expectedBuild : "1".repeat(40),
      url: `https://${isStage ? stageRef : liveRef}.supabase.co`,
    });
  };

  for (const config of [
    { STAGING_QA_BASE_URL: live },
    { STAGING_SUPABASE_PROJECT_REF: liveRef },
    { SUPABASE_PROJECT_REF: stageRef },
    { SCHEDULE_QA_EXPECTED_BUILD: "latest" },
  ]) {
    await expect(createIsolatedStagingProbe({ env: { ...env, ...config }, fetchImpl })).rejects.toThrow();
  }
  expect(requests).toEqual([]);
  const probe = await createIsolatedStagingProbe({ env, fetchImpl });
  await probe.identity();
  expect(requests).toEqual([stage, live, stage, live].map(origin => origin + "/api/client-config"));
  expect(probe.origin).toBe(stage);
  expect(probe.expectedBuild).toBe(expectedBuild);
});

test("staging aliases pointing to production, stale builds and noncanonical backends all fail closed", async () => {
  for (const body of [
    { url: `https://${liveRef}.supabase.co` },
    { url: "https://other.supabase.co" },
    { buildId: "3".repeat(40) },
  ]) {
    const fetchImpl = url => Response.json(url.startsWith(stage)
      ? { ok: true, buildId: expectedBuild, url: `https://${stageRef}.supabase.co`, ...body }
      : { ok: true, buildId: "1".repeat(40), url: `https://${liveRef}.supabase.co` });
    await expect(createIsolatedStagingProbe({ env, fetchImpl })).rejects.toThrow("isolation or exact build");
  }
});

const date = "2090-04-18";
const title = "QA Live 1234567890-abcdef";
const owned = { id: "event-1234567890-abcdef", date, title, type: "training", time: "", note: "" };
const existing = { ...owned, id: "event-existing", date: "2090-04-17", title: "Already saved", note: "Preserve" };
const schedule = { ...createDefaultScheduleState(new Date("2090-04-01T13:00:00Z")), events: [existing], dayNotes: { "2090-04-17": "Preserve" } };
const revision = 11;
const current = { state: schedule, revision };
const body = (state, baseRevision = revision) => ({
  key: scheduleStorageKey, value: JSON.stringify(state), removed: false,
  baseRevision, metadata: { baseRevision, revision: baseRevision },
});

test("only the exact staging event is added and removed, preserving central view and saved work", () => {
  const guard = createScheduleStagingWriteGuard();
  const state = { ...schedule, events: [existing, owned] };
  expect(() => guard.prepare(body(state), current, "create")).toThrow("outside the run-owned");
  guard.arm({ title, date });
  const accepted = guard.prepare(body({ ...state, selectedDate: date }), current, "create");
  expect(JSON.parse(accepted.value)).toStrictEqual(state);
  const cleanup = guard.prepare(body(schedule, revision + 1), { state, revision: revision + 1 }, "cleanup");
  expect(JSON.parse(cleanup.value)).toStrictEqual(schedule);
});

test("stale revisions, other records, notes, duplicate dates and unexpected commands are blocked", () => {
  const guard = createScheduleStagingWriteGuard();
  guard.arm({ title, date });
  const state = { ...schedule, events: [existing, owned] };
  for (const [outbound, canonical] of [
    [body(state, revision - 1), current],
    [body({ ...state, events: [{ ...existing, note: "Mutated" }, owned] }), current],
    [body({ ...state, events: [owned] }), current],
    [body({ ...state, events: [existing, owned, { ...owned, id: "event-1234567890-other" }] }), current],
    [body({ ...state, events: [existing, { ...owned, id: existing.id }] }), current],
    [body({ ...state, dayNotes: {} }), current],
    [body(state), { ...current, state: { ...schedule, events: [{ ...existing, date }] } }],
    [{ ...body(state), entries: { "other-module": "changed" } }, current],
    [{ ...body(state), key: "other-module" }, current],
    [{ ...body(state), removed: true }, current],
  ]) {
    expect(() => guard.prepare(outbound, canonical, "create")).toThrow("outside the run-owned");
  }
  guard.prepare(body(state), current, "create");
  const compromised = { ...state, events: [existing, { ...owned, note: "Edited externally" }] };
  expect(() => guard.prepare(body(schedule, revision + 1), { state: compromised, revision: revision + 1 }, "cleanup"))
    .toThrow("outside the run-owned");
});
