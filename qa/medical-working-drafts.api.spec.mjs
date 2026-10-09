import { test, expect } from "@playwright/test";
import { createMedicalWorkingDrafts } from "../src/modules/medical/medical-working-drafts.mjs";
const base = { scope: "owner-a", value: '{"note":"draft"}', previousValue: '{"note":"central"}', baseRevision: 10 };

test("only the exact observed baseline and principal may project an unsaved working version", () => {
  const drafts = createMedicalWorkingDrafts(); drafts.capture(base);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBe(base.value);
  for (const [scope, raw, revision] of [["owner-b", base.previousValue, 10], ["", base.previousValue, 10],
    [base.scope, base.previousValue, 11], [base.scope, base.previousValue, 9],
    [base.scope, '{"note":"new central"}', 10], [base.scope, null, 11]]) {
    expect(drafts.projectUnchangedBaseline(scope, raw, revision)).toBeUndefined();
  }
  expect(drafts.list(base.scope)[0].value).toBe(base.value);
});

test("first edit against known absence survives unchanged absence, not a later central deletion", () => {
  const drafts = createMedicalWorkingDrafts(); drafts.capture({ ...base, previousValue: null, baseRevision: 0 });
  expect(drafts.projectUnchangedBaseline(base.scope, null, 0)).toBe(base.value);
  expect(drafts.projectUnchangedBaseline(base.scope, null, 1)).toBeUndefined();
});

test("observed revision is a read guard even when central save baseline was not ready", () => {
  const drafts = createMedicalWorkingDrafts(); drafts.capture({ ...base, baseRevision: null, observedRevision: 10 });
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBe(base.value);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 11)).toBeUndefined();
});

test("successive working edits coalesce only within the same baseline; divergent branches and owners remain", () => {
  const drafts = createMedicalWorkingDrafts();
  const old = drafts.capture(base);
  expect(drafts.capture(base)).toBe(old);
  const newer = drafts.capture({ ...base, value: '{"note":"next"}' });
  expect(drafts.list(base.scope)).toEqual([newer]);
  const divergent = drafts.capture({ ...base, previousValue: '{"note":"colleague"}', baseRevision: 11 });
  const foreign = drafts.capture({ ...base, scope: "owner-b" });
  expect(drafts.list(base.scope)).toEqual([newer, divergent]);
  expect(drafts.list("owner-b")).toEqual([foreign]);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBeUndefined();
});

test("late commit confirms only its generation and cannot hide a newer failed save", () => {
  const drafts = createMedicalWorkingDrafts(); const old = drafts.capture(base);
  const newer = drafts.capture({ ...base, value: '{"note":"next"}' });
  drafts.committed(old, { id: "old-durable" });
  expect(drafts.list(base.scope)).toEqual([newer]);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBe(newer.value);
});

test("committed rescue is not central acceptance; explicit retirement releases only its working projection", () => {
  const drafts = createMedicalWorkingDrafts(); const row = drafts.capture(base);
  drafts.committed(row, { id: "durable-a" });
  expect(drafts.list(base.scope)).toEqual([]);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBe(base.value);
  drafts.forgetDurable("other");
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBe(base.value);
  drafts.forgetDurable("durable-a");
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBeUndefined();
});


test("a new ordinary save cannot resurrect an earlier failed edit even when its value equals the old baseline", () => {
  const drafts = createMedicalWorkingDrafts(); drafts.capture(base);
  drafts.beginEdit(base.scope);
  expect(drafts.projectUnchangedBaseline(base.scope, base.previousValue, 10)).toBeUndefined();
  expect(drafts.list(base.scope)[0].value).toBe(base.value);
});
