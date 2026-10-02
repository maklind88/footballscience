import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

for (const organizationSource of ["claims", "profile"]) {
  test(`Set Pieces never replays the same actor's old organization draft after a ${organizationSource} change`, async () => {
    const source = readFileSync(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
    const scopeSource = source.slice(source.indexOf("  function getSetPiecesSaveScope("), source.indexOf("  async function getSetPiecesSaveClient("));
    const authState = { currentUser: { id: "coach", organizationId: "org-a", clubId: "same-club", teamId: "same-team" },
      session: { access_token: "test-token", user: { app_metadata: organizationSource === "claims" ? { organization_id: "org-a" } : {} } } };
    const getScope = runInNewContext(`${scopeSource}\ngetSetPiecesSaveScope`, { authState,
      SET_PIECES_ROOM_STATE_KEY: "football-set-pieces-room-v1", canCurrentUserAutomaticallyWriteCentralStateKey: () => true });
    const oldScope = getScope(), original = stateWith(play()), journal = createMemoryJournal();
    let sends = 0;
    const client = createSetPiecesSaveClient({ getScope, journal, getLatest: async () => ({ value: JSON.stringify(original), metadata: { revision: 1 } }),
      send: async () => { sends += 1; throw new Error("Old organization data must not be sent"); } });
    client.observe(JSON.stringify(original), { revision: 1 });
    const edited = clone(original); edited.plays[0].title = "Private org-a draft";
    expect((await client.stage(JSON.stringify(edited))).ok).toBe(true);
    if (organizationSource === "claims") authState.session.user.app_metadata.organization_id = "org-b";
    else authState.currentUser.organizationId = "org-b";
    expect(getScope()).not.toBe(oldScope);
    client.observe(JSON.stringify(original), { revision: 1 });
    expect((await client.replay()).ok).toBe(true);
    expect(sends).toBe(0);
    expect((await client.project()).value).not.toContain("Private org-a draft");
    expect(await journal.list(oldScope)).toHaveLength(1);
  });
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

test("coaches' local variant and phase navigation never become shared edits", () => {
  const original = stateWith(play());
  const variant = structuredClone(original.plays[0].variants[0]);
  variant.id = "variant-other";
  variant.phases.push({ ...structuredClone(variant.phases[0]), id: "phase-other" });
  original.plays[0].variants.push(variant);
  const navigated = clone(original);
  navigated.plays[0].activeVariantId = variant.id;
  navigated.plays[0].variants[1].activePhaseId = "phase-other";
  expect(createSetPiecePlayChanges(original, navigated)).toEqual([]);
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

test("Set Pieces journals rapid consecutive edits before one network replay", async () => {
  const original = stateWith(play());
  const central = clone(original);
  let revision = 4;
  const journal = createMemoryJournal();
  let id = 0;
  const client = createSetPiecesSaveClient({
    getScope: () => "team-a:coach-fast",
    journal,
    makeId: () => `set-piece-fast-${++id}`,
    send: async (change) => {
      const applied = applySetPiecePlayChange(central, change);
      if (!applied.ok) {
        return { ok: false, status: 409, payload: { conflicts: applied.conflicts, currentRevision: revision } };
      }
      Object.assign(central, applied.state);
      revision += 1;
      return {
        ok: true,
        payload: {
          setPieceChange: {
            id: change.id,
            playId: change.playId,
            value: setPiecePlayValue(central, change.playId),
          },
          metadata: { revision },
        },
      };
    },
  });
  client.observe(JSON.stringify(original), { revision });
  const first = clone(original);
  first.plays[0].title = "Rapid title edit";
  const second = clone(first);
  second.plays[0].objective = "Rapid objective edit";

  await Promise.all([
    client.stage(JSON.stringify(first), { previousValue: JSON.stringify(original) }),
    client.stage(JSON.stringify(second), { previousValue: JSON.stringify(first) }),
  ]);
  const result = await client.replay();

  expect(result.ok).toBe(true);
  expect(central.plays[0]).toMatchObject({
    title: "Rapid title edit",
    objective: "Rapid objective edit",
  });
  expect(await client.isSettled()).toBe(true);
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

test("Set Pieces receipts refresh unrelated routines before publishing the local library", async () => {
  const original = stateWith(play(), play({ id: "throw-in" }));
  let central = clone(original);
  central.plays[1].title = "Teammate throw-in";
  let revision = 4;
  let id = 0;
  const client = createSetPiecesSaveClient({
    getScope: () => "team-a:coach-a", journal: createMemoryJournal(), makeId: () => `refresh-${++id}`,
    getLatest: async () => ({ value: JSON.stringify(central), metadata: { revision } }),
    send: async (change) => {
      const merged = applySetPiecePlayChange(central, change);
      central = merged.state;
      return { ok: true, payload: { metadata: { revision: ++revision },
        setPieceChange: { id: change.id, playId: change.playId, value: setPiecePlayValue(central, change.playId) } } };
    },
  });
  client.observe(JSON.stringify(original), { revision: 3 });
  const desired = clone(original);
  desired.plays[0].title = "Local corner";
  const result = await client.save(JSON.stringify(desired), { previousValue: JSON.stringify(original) });
  expect(JSON.parse(result.value).plays.map((entry) => entry.title)).toEqual(["Local corner", "Teammate throw-in"]);
});

test("Set Pieces refresh projects pending edits and rejects a view captured before a new edit", async () => {
  const original = stateWith(play());
  const journal = createMemoryJournal();
  let id = 0;
  const client = createSetPiecesSaveClient({ getScope: () => "team-a:coach-a", journal, makeId: () => `projection-${++id}` });
  client.observe(JSON.stringify(original), { revision: 1 });
  const oldView = await client.project();
  const desired = clone(original);
  desired.plays[0].title = "Pending corner";
  const staging = client.stage(JSON.stringify(desired), { previousValue: JSON.stringify(original) });
  expect(client.isProjectionCurrent(oldView)).toBe(false);
  await staging;
  const central = clone(original);
  central.plays.push(play({ id: "new-throw" }));
  client.observe(JSON.stringify(central), { revision: 2 });
  const view = await client.project();
  expect(view.pending).toBe(true);
  expect(JSON.parse(view.value).plays.map((entry) => entry.id)).toEqual(["play-corner", "new-throw"]);
  expect(JSON.parse(view.value).plays[0].title).toBe("Pending corner");
});

test("Set Pieces ignores a refresh receipt after the active account changes", async () => {
  let scope = "team-a:coach-a";
  const original = stateWith(play());
  let releaseRead;
  const waiting = new Promise((resolve) => { releaseRead = resolve; });
  const client = createSetPiecesSaveClient({ getScope: () => scope, journal: createMemoryJournal(),
    getLatest: () => waiting, send: () => { throw new Error("Must not send a foreign-account edit"); } });
  client.observe(JSON.stringify(original), { revision: 1 });
  const desired = clone(original);
  desired.plays[0].title = "Account A draft";
  await client.stage(JSON.stringify(desired), { previousValue: JSON.stringify(original) });
  const replay = client.replay();
  await Promise.resolve();
  scope = "team-b:coach-b";
  releaseRead({ value: JSON.stringify(original), metadata: { revision: 2 } });
  expect((await replay).ok).toBe(false);
  expect(await client.pendingState()).toBe(null);
  expect(await client.reviews()).toEqual([]);
});

test("legacy local Set Pieces are archived durably without becoming team writes", async () => {
  const journal = createMemoryJournal();
  const client = createSetPiecesSaveClient({ getScope: () => "team-b:coach-b", journal });
  const local = JSON.stringify(stateWith(play()));
  await client.preserveLegacy(local);
  await client.preserveLegacy(local);
  client.observe(JSON.stringify(stateWith()), { revision: 0 });
  expect([...journal.rows.values()]).toHaveLength(1);
  expect([...journal.rows.values()][0]).toMatchObject({ type: "legacy-recovery", payload: { value: local } });
  expect(await client.pendingState()).toBe(null);
  expect(await client.isSettled()).toBe(true);
});

test("a conflict can save the local routine as a fresh copy while retaining the team routine", async () => {
  const original = stateWith(play());
  let central = clone(original);
  central.plays[0].title = "Team version";
  let revision = 2;
  let id = 0;
  const journal = createMemoryJournal();
  const client = createSetPiecesSaveClient({ getScope: () => "team-a:coach-a", journal, makeId: () => `resolve-${++id}`,
    getLatest: async () => ({ value: JSON.stringify(central), metadata: { revision } }),
    send: async (change) => {
      const merged = applySetPiecePlayChange(central, change);
      if (!merged.ok) return { ok: false, status: 409, payload: { conflicts: merged.conflicts } };
      central = merged.state;
      return { ok: true, payload: { metadata: { revision: ++revision },
        setPieceChange: { id: change.id, playId: change.playId, value: setPiecePlayValue(central, change.playId) } } };
    },
  });
  client.observe(JSON.stringify(original), { revision: 1 });
  const desired = clone(original);
  desired.plays[0].title = "My version";
  expect((await client.save(JSON.stringify(desired), { previousValue: JSON.stringify(original) })).reviewRequired).toBe(true);
  const review = (await client.reviews())[0];
  const result = await client.resolveReview(review.payload.change.playId, review.central, "copy");
  expect(result.ok).toBe(true);
  expect(central.plays.map((entry) => entry.title)).toEqual(["Team version", "My version copy"]);
  expect(central.plays[1].id).not.toBe(central.plays[0].id);
  expect(await client.reviews()).toEqual([]);
});
