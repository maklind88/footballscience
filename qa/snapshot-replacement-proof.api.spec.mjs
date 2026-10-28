import { test, expect } from "@playwright/test";
import { canReplaceSnapshot } from "../src/core/snapshot-replacement-proof.mjs";
import { canRotateSnapshot } from "../src/core/snapshot-retention-policy.mjs";

function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); }
function snapshot() {
  return { id: "old", schema: "football-science-backup-v1", app: "Football Science", createdAt: "old",
    storage: { work: "pending text", other: "accepted text", library: "unchanged legacy library" },
    saveContext: { scope: "owner", entries: {
      work: { principalScope: "owner", pendingCentralSync: true, pendingBaseRevision: 4, serverRevision: 4,
        writes: 7, updatedAt: "2026-10-27T12:00:00Z", deletedAt: "", hash: hash("pending text") },
      other: { principalScope: "owner", pendingCentralSync: false, serverRevision: 2, hash: hash("accepted text") },
    } }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [] };
}
function acceptedNext(before) {
  const next = structuredClone(before); next.id = "new";
  next.saveContext.entries.work.pendingCentralSync = false;
  next.saveContext.entries.work.serverRevision = 5;
  return next;
}

test("unchanged protected work can be carried forward while acknowledged content changes", () => {
  const before = snapshot(), next = structuredClone(before);
  next.storage.other = "new accepted text";
  next.saveContext.entries.other.hash = hash(next.storage.other);
  expect(canRotateSnapshot(before, "owner")).toBe(false);
  expect(canReplaceSnapshot(before, next)).toBe(true);
  expect(next.saveContext.entries.work.pendingCentralSync).toBe(true);
});

test("exact generation acceptance permits retirement without a global sync timestamp", () => {
  const before = snapshot();
  expect(canReplaceSnapshot(before, acceptedNext(before))).toBe(true);
});

for (const change of ["payload", "writes", "timestamp", "base", "stale-revision", "scope", "prepared", "hash", "missing-generation", "future-field"]) {
  test(`a ${change} mismatch cannot resolve protected work`, () => {
    const before = snapshot(), next = acceptedNext(before), entry = next.saveContext.entries.work;
    if (change === "payload") next.storage.work = "different text";
    if (change === "writes") entry.writes++;
    if (change === "timestamp") entry.updatedAt = "2026-10-27T13:00:00Z";
    if (change === "base") entry.pendingBaseRevision++;
    if (change === "stale-revision") entry.serverRevision = 4;
    if (change === "scope") next.saveContext.scope = "other-owner";
    if (change === "prepared") before.saveContext.entries.work.localWritePrepared = true;
    if (change === "hash") { before.saveContext.entries.work.hash = "wrong"; entry.hash = "wrong"; }
    if (change === "missing-generation") { delete before.saveContext.entries.work.writes; delete entry.writes; }
    if (change === "future-field") { before.futureRecovery = "preserve"; next.futureRecovery = "preserve"; }
    expect(canReplaceSnapshot(before, next)).toBe(false);
  });
}

test("pending tombstones require matching deletion intent and accepted revision", () => {
  const before = snapshot(); delete before.storage.work;
  before.saveContext.entries.work.deletedAt = "2026-10-27T12:00:00Z";
  expect(canReplaceSnapshot(before, acceptedNext(before))).toBe(true);
  before.saveContext.entries.work.deletedAt = "";
  expect(canReplaceSnapshot(before, acceptedNext(before))).toBe(false);
});

for (const field of ["recoveryCopies", "recoveryState", "recoverySeparations"]) {
  test(`${field} must remain intact even after a matching receipt`, () => {
    const before = snapshot(); before[field] = field === "recoverySeparations" ? ["work"] : { work: { payload: "retained", base: 3 } };
    const next = structuredClone(before);
    expect(canReplaceSnapshot(before, next)).toBe(true);
    expect(canReplaceSnapshot(before, acceptedNext(before))).toBe(false);
    next[field] = field === "recoverySeparations" ? [] : {};
    expect(canReplaceSnapshot(before, next)).toBe(false);
  });
}

test("unknown payloads and metadata are retained exactly, not treated as acknowledged", () => {
  const before = snapshot(), next = structuredClone(before);
  next.storage.library = "changed unknown library";
  expect(canReplaceSnapshot(before, next)).toBe(false);
  next.storage.library = before.storage.library;
  next.saveContext.entries.work.writes++;
  expect(canReplaceSnapshot(before, next)).toBe(false);
});

test("foreign-owned entries cannot be retired through an outer snapshot scope", () => {
  const before = snapshot(); before.saveContext.entries.work.principalScope = "another-owner";
  expect(canReplaceSnapshot(before, structuredClone(before))).toBe(false);
});


test("a retained recovery payload cannot lose its surrounding acknowledged context", () => {
  const before = snapshot(); before.recoveryCopies = { copy: "self-contained format not established" };
  const next = structuredClone(before); next.storage.other = "new accepted context";
  expect(canReplaceSnapshot(before, next)).toBe(false);
});
