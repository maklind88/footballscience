import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createSessionSaveLoadedPilot } from "../src/modules/session-planner/session-save-loaded-pilot.mjs";
import { initial, principal, date } from "./helpers/session-save-pilot-harness.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const scope = (context) => JSON.stringify(["sessions-receipts-v1", context.actorId, context.organizationId, context.clubId, context.teamId]);
function harness() {
  let context = structuredClone(principal), id = 0, serverRevision = 10, confirmedRevision = 10;
  const rows = [];
  const store = {
    protocol: "sessions-queue-v2",
    withReplay: async (_scope, work) => work(),
    async list(expected) { return rows.filter((row) => row.scope === expected).map((row) => structuredClone(row)); },
    async putMany(records) { rows.push(...records.map((row, index) => ({ ...structuredClone(row), attempted: false, ordinal: rows.length + index + 1 }))); },
    async *replayRows() {},
    async confirmedRevision() { return confirmedRevision; },
  };
  const request = async (options) => {
    const body = JSON.parse(options.body);
    if (body.action !== "snapshot") throw new Error("Unexpected write in read lifecycle test.");
    const value = JSON.stringify(initial);
    return { ok: true, status: 200, payload: { ok: true, snapshot: { schema: "session-save-initial-snapshot-v1",
      key: "football-session-planner-v3", ...context, revision: serverRevision, hash: hash(value), value } } };
  };
  return { client: createSessionSaveLoadedPilot({ getContext: () => context, request, store, makeId: () => `op-${++id}` }),
    store, rows, get context() { return context; }, set context(value) { context = value; },
    set serverRevision(value) { serverRevision = value; }, set confirmedRevision(value) { confirmedRevision = value; } };
}

test("loaded pilot requires a verified snapshot before it can stage an edit", async () => {
  const h = harness();
  expect(await h.client.stage(JSON.stringify(initial))).toMatchObject({ ok: false, status: 409 });
  expect(await h.client.refresh()).toMatchObject({ ok: true, metadata: { revision: 10 }, pendingOperations: [] });
});

test("loaded pilot overlays a durable local edit after a fresh read without sending it", async () => {
  const h = harness(); await h.client.refresh();
  const changed = structuredClone(initial); changed.sessions[date].title = "Keep local draft";
  expect(await h.client.stage(JSON.stringify(changed), { previousValue: JSON.stringify(initial) })).toMatchObject({ ok: true });
  const view = await h.client.view();
  expect(JSON.parse(view.value).sessions[date].title).toBe("Keep local draft");
  expect(view.pendingOperations).toHaveLength(1); expect(h.rows).toHaveLength(1);
});

test("loaded pilot blocks a stale authenticated result after the account epoch changes", async () => {
  const h = harness(); await h.client.refresh();
  h.context = { ...h.context, epoch: "next-login" };
  expect(await h.client.view()).toMatchObject({ ok: false, status: 409 });
  expect(await h.client.refresh()).toMatchObject({ ok: true, metadata: { revision: 10 } });
});

test("loaded pilot rejects a fresh snapshot below the locally confirmed revision", async () => {
  const h = harness(); h.confirmedRevision = 11;
  expect(await h.client.refresh()).toMatchObject({ ok: false, status: 409 });
  expect(await h.client.view()).toMatchObject({ ok: false, status: 409 });
});
