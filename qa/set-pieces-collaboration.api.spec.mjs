import { expect, test } from "@playwright/test";
import { createSetPiecesSaveClient } from "../src/modules/set-pieces-room/set-pieces-save-client.mjs";
import {
  applySetPiecePlayChange,
  createSetPiecePlayChanges,
  setPiecePlayValue,
} from "../src/modules/set-pieces-room/set-pieces-save-protocol.mjs";
import { createSetPiecePlay, normalizeSetPiecesState } from "../src/modules/set-pieces-room/state.mjs";

function stateWith(...plays) {
  return normalizeSetPiecesState({
    schemaVersion: 4,
    activePlayId: plays[0]?.id || "",
    plays,
    updatedAt: plays.map((play) => play.updatedAt).sort().at(-1) || "",
  });
}

function play(overrides = {}) {
  return createSetPiecePlay({
    id: overrides.id || "play-corner",
    title: overrides.title || "Corner near post",
    objective: overrides.objective || "Attack first contact",
    updatedAt: overrides.updatedAt || "2026-09-25T12:00:00.000Z",
    updatedBy: overrides.updatedBy || "coach-a",
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryJournal() {
  const rows = new Map();
  return {
    rows,
    async put(row) {
      rows.set(`${row.scope}:${row.id}`, clone({ ...row, recordId: `${row.scope}:${row.id}` }));
    },
    async list(scope) {
      return [...rows.values()].filter((row) => row.scope === scope && row.status !== "applied").map(clone);
    },
    async updateStatus(id, scope, status) {
      const row = rows.get(`${scope}:${id}`);
      if (!row) return false;
      rows.set(`${scope}:${id}`, { ...row, status });
      return true;
    },
  };
}

test("Set Pieces merges different fields on the same routine without losing either coach's work", () => {
  const original = stateWith(play());
  const local = clone(original);
  local.plays[0].title = "Corner screen near post";
  local.plays[0].updatedAt = "2026-09-25T12:01:00.000Z";
  local.plays[0].updatedBy = "coach-local";
  const central = clone(original);
  central.plays[0].objective = "Create space for the second ball";
  central.plays[0].updatedAt = "2026-09-25T12:01:30.000Z";
  central.plays[0].updatedBy = "coach-central";

  const [change] = createSetPiecePlayChanges(original, local, () => "change-one");
  const result = applySetPiecePlayChange(central, change);

  expect(result.ok).toBe(true);
  expect(result.state.plays[0]).toMatchObject({
    title: "Corner screen near post",
    objective: "Create space for the second ball",
    updatedAt: "2026-09-25T12:01:30.000Z",
  });
});

test("Set Pieces keeps unrelated routines while applying another coach's routine change", () => {
  const corner = play({ id: "corner" });
  const throwIn = play({ id: "throw-in", title: "High throw-in" });
  const original = stateWith(corner, throwIn);
  const local = clone(original);
  local.plays[0].objective = "Win the first duel";
  const central = clone(original);
  central.plays[1].title = "High throw-in with blocker";

  const [change] = createSetPiecePlayChanges(original, local, () => "change-two");
  const result = applySetPiecePlayChange(central, change);

  expect(result.ok).toBe(true);
  expect(result.state.plays.map((entry) => [entry.id, entry.title, entry.objective])).toEqual([
    ["corner", "Corner near post", "Win the first duel"],
    ["throw-in", "High throw-in with blocker", "Attack first contact"],
  ]);
});

test("Set Pieces rejects only a real same-field collision and preserves central content", () => {
  const original = stateWith(play());
  const local = clone(original);
  local.plays[0].title = "Local title";
  const central = clone(original);
  central.plays[0].title = "Central title";

  const [change] = createSetPiecePlayChanges(original, local, () => "change-three");
  const result = applySetPiecePlayChange(central, change);

  expect(result.ok).toBe(false);
  expect(result.conflicts).toContain("play.play-corner.title");
  expect(result.state.plays[0].title).toBe("Central title");
});

test("Set Pieces deletion succeeds against an unchanged routine but conflicts with a teammate edit", () => {
  const original = stateWith(play());
  const empty = stateWith();
  const [change] = createSetPiecePlayChanges(original, empty, () => "change-four");

  expect(applySetPiecePlayChange(original, change)).toMatchObject({ ok: true, state: { plays: [] } });
  const central = clone(original);
  central.plays[0].objective = "Teammate changed this routine";
  const conflict = applySetPiecePlayChange(central, change);
  expect(conflict.ok).toBe(false);
  expect(conflict.state.plays[0].objective).toBe("Teammate changed this routine");
});

test("Set Pieces save client durably replays a concurrent merge and acknowledges the exact operation", async () => {
  const original = stateWith(play());
  const central = clone(original);
  central.plays[0].objective = "Central second-ball plan";
  let revision = 8;
  const journal = createMemoryJournal();
  let id = 0;
  const client = createSetPiecesSaveClient({
    getScope: () => "team-a:coach-b",
    journal,
    makeId: () => `set-piece-op-${++id}`,
    send: async (change) => {
      const applied = applySetPiecePlayChange(central, change);
      if (!applied.ok) return { ok: false, status: 409, payload: { conflicts: applied.conflicts, currentRevision: revision } };
      Object.assign(central, applied.state);
      revision += 1;
      return {
        ok: true,
        payload: {
          setPieceChange: { id: change.id, playId: change.playId, value: setPiecePlayValue(central, change.playId) },
          metadata: { revision },
        },
      };
    },
  });
  client.observe(JSON.stringify(original), { revision: 7 });
  const desired = clone(original);
  desired.plays[0].title = "Local screen variation";

  const result = await client.save(JSON.stringify(desired), { previousValue: JSON.stringify(original) });

  expect(result.ok).toBe(true);
  expect(JSON.parse(result.value).plays[0]).toMatchObject({
    title: "Local screen variation",
    objective: "Central second-ball plan",
  });
  expect(await client.isSettled()).toBe(true);
  expect([...journal.rows.values()]).toHaveLength(1);
  expect([...journal.rows.values()][0].status).toBe("applied");
});

test("Set Pieces save client retains a same-field collision as a local review", async () => {
  const original = stateWith(play());
  const journal = createMemoryJournal();
  let id = 0;
  let reviews = 0;
  const client = createSetPiecesSaveClient({
    getScope: () => "team-a:coach-b",
    journal,
    makeId: () => `set-piece-review-${++id}`,
    onReview: () => { reviews += 1; },
    send: async () => ({
      ok: false,
      status: 409,
      payload: { conflicts: ["play.play-corner.title"], currentRevision: 9 },
    }),
  });
  client.observe(JSON.stringify(original), { revision: 8 });
  const desired = clone(original);
  desired.plays[0].title = "Local title that must survive";

  const result = await client.save(JSON.stringify(desired), { previousValue: JSON.stringify(original) });

  expect(result).toMatchObject({ ok: false, reviewRequired: true, durablePending: true });
  expect(reviews).toBe(1);
  expect((await client.reviews())[0].payload.change.after.title).toBe("Local title that must survive");
  expect([...journal.rows.values()][0].status).toBe("review");
});
