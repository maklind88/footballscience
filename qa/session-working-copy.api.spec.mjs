import { test, expect } from "@playwright/test";
import { createSessionSaveClient } from "../src/modules/session-planner/session-save-client.mjs";

const base = JSON.stringify({ sessions: { "2026-10-14": { date: "2026-10-14", title: "Baseline", blocks: [] } } });
const value = title => JSON.stringify({ sessions: { "2026-10-14": { date: "2026-10-14", title, blocks: [] } } });
function harness() {
  let scope = "actor:team", owner = "actor:org:team:role", denied = true, listDenied = false, sequence = 0;
  const rows = new Map();
  const store = { list: async () => { if (listDenied) throw new Error("Unavailable"); return [...rows.values()]; },
    put: async record => { if (denied) throw new Error("Full"); rows.set(record.change.id, structuredClone(record)); } };
  const client = createSessionSaveClient({ getScope: () => scope, getWorkingScope: () => owner,
    store, makeId: () => `operation-${++sequence}`, send: async () => { throw new Error("No network expected"); } });
  client.observe(base, { revision: 10 });
  return { client, store, rows, allow: () => { denied = false; listDenied = false; }, denyList: () => { listDenied = true; },
    setScope: next => { scope = next; }, setOwner: next => { owner = next; } };
}

test("exact latest working copy remains readable when all durable reads/writes fail", async () => {
  const h = harness();
  const first = h.client.rememberDraft(value("A"), base);
  expect(await h.client.stage(value("A"), { previousValue: base, draftToken: first })).toMatchObject({ ok: false });
  const last = h.client.rememberDraft(value("B"), value("A"));
  h.denyList();
  expect(await h.client.stage(value("B"), { previousValue: value("A"), draftToken: last })).toMatchObject({ ok: false });
  const copy = h.client.workingCopy();
  expect(copy).toMatchObject({ value: value("B"), previousValue: value("A"), token: last, baseRevision: 10 });
  copy.value = "tampered";
  expect(h.client.workingCopy().value).toBe(value("B"));
  h.allow();
  expect(await h.client.stage(value("B"), { previousValue: value("A"), draftToken: last })).toEqual({ ok: true });
  expect(h.client.workingCopy()).toBeNull();
  expect([...h.rows.values()][0].change.before.session.title).toBe("Baseline");
  expect([...h.rows.values()][0].change.after.session.title).toBe("B");
});

for (const other of ["other-account", "other-org", "other-team", "revoked-role", ""]) {
  test(`working copy is hidden for another read owner: ${other || "logged out"}`, () => {
    const h = harness(); h.client.rememberDraft(value("Private A"), base);
    const original = h.client.workingCopy();
    h.setOwner(other); expect(h.client.workingCopy()).toBeNull();
    h.setOwner("actor:org:team:role"); expect(h.client.workingCopy()).toEqual(original);
    h.setScope("other-actor:team"); expect(h.client.workingCopy()).toBeNull();
  });
}

test("a late older local commit cannot retire or replace the newer working copy", async () => {
  const h = harness(); h.allow();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const native = h.store.put;
  h.store.put = async row => { entered(); await new Promise(resolve => { release = resolve; }); await native(row); };
  const a = h.client.rememberDraft(value("A"), base);
  const saving = h.client.stage(value("A"), { previousValue: base, draftToken: a });
  await started;
  const b = h.client.rememberDraft(value("B"), value("A"));
  release(); expect(await saving).toEqual({ ok: true });
  expect(h.client.workingCopy()).toMatchObject({ token: b, value: value("B") });
});

test("refreshing a colleague's changed baseline cannot turn retry into an overwrite", async () => {
  const h = harness();
  const token = h.client.rememberDraft(value("Local"), base);
  expect(await h.client.stage(value("Local"), { previousValue: base, draftToken: token })).toMatchObject({ ok: false });
  h.client.observe(value("Accepted peer"), { revision: 11 });
  expect(h.client.workingCopy()).toMatchObject({ value: value("Local"), baseRevision: 10 });
  h.allow();
  expect(await h.client.stage(value("Local"), { previousValue: base, draftToken: token })).toEqual({ ok: true });
  const [row] = [...h.rows.values()];
  expect(row.change.before.session.title).toBe("Baseline");
  expect(row.change.after.session.title).toBe("Local");
  expect(JSON.parse(h.client.centralValue()).sessions["2026-10-14"].title).toBe("Accepted peer");
});
