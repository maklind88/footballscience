import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  applyProofMigration, createProofDatabase, dumpProofDatabase, planProofMigration,
  proofIds as ids, proofScope as scope, proofSnapshot, restoreProofDatabase, sourceFixture,
} from "./helpers/identity-migration-proof.mjs";

let db;
beforeEach(async () => { db = await createProofDatabase(); });
afterEach(async () => { await db?.close(); });

async function replaceSource(body, revision = 13) {
  await db.query("update identity_proof.sources set body=$3,revision=$4 where organization_id=$1 and team_id=$2", [
    scope.organizationId, scope.teamId, body, revision,
  ]);
}
async function migrate() {
  const plan = await planProofMigration(db);
  const operationId = randomUUID();
  await applyProofMigration(db, plan, operationId);
  return { plan, operationId };
}

test("Identity-only migration preserves source content, all history and roster selection", async () => {
  const before = await proofSnapshot(db);
  const { plan } = await migrate();
  const after = await proofSnapshot(db);
  assert.deepEqual(after.sources, before.sources);
  assert.deepEqual(after.memberships, before.memberships);
  assert.equal(after.players.length, 4);
  assert.equal(after.links.length, 4);
  assert.equal(after.references.length, 4);
  assert.equal(plan.mappings.find((row) => row.legacyId === "existing").playerId, ids.playerId);
  assert.equal(plan.mappings.find((row) => row.legacyId === "historical").playerId, ids.historicalPlayerId);
  const historical = after.players.find((row) => row.id === ids.historicalPlayerId);
  assert.equal(historical.archived, true);
  assert.equal(historical.deleted, true);
  for (const ref of after.references) {
    const source = before.sources[0].body[ref.kind === "record" ? "records" : "injuryPlans"].find((row) => row.id === ref.id);
    assert.equal(sha256(ref.payload), sha256(source));
  }
});

test("Same display name never merges two people; missing academy/trialist get distinct IDs", async () => {
  const { plan } = await migrate();
  assert.equal(new Set(plan.mappings.map((row) => row.playerId)).size, 4);
  assert.notEqual(plan.mappings.find((row) => row.legacyId === "academy").playerId, ids.playerId);
  assert.deepEqual(plan.mappings.filter((row) => row.create).map((row) => row.legacyId), ["academy", "trialist"]);
});

test("Missing historical identity is retained as historical, never promoted to the active roster", async () => {
  const source = sourceFixture();
  source.players.push({ id: "old-guest", archived: true, deleted: true, countsInSquad: false, rosterType: "guest" });
  source.injuryPlans.push({ id: "old-plan", playerId: "old-guest", version: 4, note: "Synthetic history" });
  await replaceSource(source);
  const before = await proofSnapshot(db);
  await migrate();
  const after = await proofSnapshot(db);
  const player = after.players.find((row) => row.legacy_id === "old-guest");
  assert.equal(player.archived, true);
  assert.equal(player.deleted, true);
  assert.deepEqual(after.memberships, before.memberships);
  assert.equal(after.references.find((row) => row.id === "old-plan").player_id, player.id);
});

for (const [label, mutate, message] of [
  ["duplicate player", (s) => s.players.push(s.players[0]), /duplicate players/],
  ["missing player ID", (s) => delete s.players[0].id, /players identity/],
  ["orphan recommendation", (s) => { s.injuryPlans[0].playerId = "unknown"; }, /Orphan reference/],
  ["missing history collection", (s) => delete s.records, /Missing records/],
  ["unknown archive state", (s) => delete s.players[1].archived, /Unknown historical state/],
]) {
  test(`${label} blocks planning without a partial migration`, async () => {
    const source = sourceFixture();
    mutate(source);
    await replaceSource(source);
    const before = await proofSnapshot(db);
    await assert.rejects(planProofMigration(db), message);
    assert.deepEqual(await proofSnapshot(db), before);
  });
}

test("Wrong organization/team has no implicit global fallback", async () => {
  for (const invalid of [null, {}, { ...scope, organizationId: "global" }, { ...scope, organizationId: ids.otherOrganizationId }]) {
    await assert.rejects(planProofMigration(db, invalid), /scope|organization|identity/i);
  }
  await assert.rejects(planProofMigration({}), /in-memory proof/);
});

test("Same legacy ID in another organization remains a separate canonical identity", async () => {
  const otherPlayerId = randomUUID();
  await db.query("insert into identity_proof.players values ($1,$2,'existing',false,false)", [ids.otherOrganizationId, otherPlayerId]);
  const source = sourceFixture();
  source.players = [source.players[0]];
  source.records = [source.records[0]];
  source.injuryPlans = [];
  await db.query("insert into identity_proof.sources values ($1,$2,1,$3)", [ids.otherOrganizationId, ids.otherTeamId, source]);
  const planA = await planProofMigration(db);
  const planB = await planProofMigration(db, { organizationId: ids.otherOrganizationId, teamId: ids.otherTeamId });
  assert.equal(planA.mappings[0].playerId, ids.playerId);
  assert.equal(planB.mappings[0].playerId, otherPlayerId);
  await applyProofMigration(db, planA, randomUUID());
  const afterA = await proofSnapshot(db);
  assert.equal(afterA.references.some((row) => row.organization_id === ids.otherOrganizationId), false);
  await applyProofMigration(db, planB, randomUUID());
  const afterB = await proofSnapshot(db);
  assert.equal(afterB.references.filter((row) => row.organization_id === ids.otherOrganizationId).length, 1);
});

test("Real SQL composite foreign keys reject cross-organization links", async () => {
  const before = await proofSnapshot(db);
  await assert.rejects(db.query("insert into identity_proof.links values ($1,$2,'existing',$3)", [
    ids.otherOrganizationId, ids.otherTeamId, ids.playerId,
  ]), (error) => error.code === "23503");
  assert.deepEqual(await proofSnapshot(db), before);
});

test("Real SQL uniqueness rejects a second canonical target for the same scoped legacy ID", async () => {
  await assert.rejects(db.query("insert into identity_proof.players values ($1,$2,'existing',false,false)", [
    ids.organizationId, randomUUID(),
  ]), (error) => error.code === "23505");
});

for (const [label, mutate, revision] of [
  ["new source revision", () => {}, 13],
  ["changed content at the same revision", (s) => { s.records[0].note = "Synthetic newer note"; }, 12],
  ["new player while disconnected", (s) => s.players.push({ id: "new-offline-id", archived: false, deleted: false }), 13],
]) {
  test(`${label} invalidates the old plan without erasing the newer source`, async () => {
    const plan = await planProofMigration(db);
    const source = sourceFixture();
    mutate(source);
    await replaceSource(source, revision);
    const newer = await proofSnapshot(db);
    await assert.rejects(applyProofMigration(db, plan, randomUUID()), /Snapshot changed/);
    assert.deepEqual(await proofSnapshot(db), newer);
  });
}

test("Changed membership after review invalidates the plan and preserves the newer membership", async () => {
  const plan = await planProofMigration(db);
  await db.query("update identity_proof.memberships set active=false,left_on='2026-09-11' where player_id=$1", [ids.playerId]);
  const newer = await proofSnapshot(db);
  await assert.rejects(applyProofMigration(db, plan, randomUUID()), /Snapshot changed/);
  assert.deepEqual(await proofSnapshot(db), newer);
});

test("A failed transaction rolls back identities, references and receipt together; retry succeeds", async () => {
  const plan = await planProofMigration(db);
  const operationId = randomUUID();
  const before = await proofSnapshot(db);
  await assert.rejects(applyProofMigration(db, plan, operationId, { failAfterIdentity: true }), /mid-transaction failure/);
  assert.deepEqual(await proofSnapshot(db), before);
  await applyProofMigration(db, plan, operationId);
  assert.equal((await proofSnapshot(db)).receipts.length, 1);
});

test("Lost acknowledgement can be replayed without a duplicate effect", async () => {
  const { plan, operationId } = await migrate();
  const beforeRetry = await proofSnapshot(db);
  assert.equal((await applyProofMigration(db, plan, operationId)).replayed, true);
  assert.deepEqual(await proofSnapshot(db), beforeRetry);
  const altered = structuredClone(plan);
  altered.references[0].payload.note = "Changed request";
  await assert.rejects(applyProofMigration(db, altered, operationId), /Operation ID reused/);
  assert.deepEqual(await proofSnapshot(db), beforeRetry);
});

test("Plan tampering cannot relink an identity or silently change a clinical payload", async () => {
  const plan = await planProofMigration(db);
  const before = await proofSnapshot(db);
  for (const mutate of [
    (p) => { p.mappings[0].playerId = randomUUID(); },
    (p) => { p.mappings[2].archived = false; },
    (p) => { p.references[0].payload.note = "Changed request"; },
  ]) {
    const altered = structuredClone(plan);
    mutate(altered);
    await assert.rejects(applyProofMigration(db, altered, randomUUID()), /Plan differs/);
    assert.deepEqual(await proofSnapshot(db), before);
  }
});

test("New players and training recommendations can be reconciled later without changing prior IDs", async () => {
  await migrate();
  const before = await proofSnapshot(db);
  const source = sourceFixture();
  source.players.push({ id: "next-player", archived: false, deleted: false, rosterType: "guest", countsInSquad: false });
  source.records.push({ id: "next-training", playerId: "next-player", version: 1, note: "Synthetic new recommendation" });
  await replaceSource(source);
  const { plan } = await migrate();
  const after = await proofSnapshot(db);
  for (const player of before.players) assert.deepEqual(after.players.find((row) => row.id === player.id), player);
  assert.deepEqual(after.memberships, before.memberships);
  assert.equal(plan.mappings.filter((row) => row.create).length, 1);
  assert.equal(after.players.length, 5);
  assert.equal(after.references.length, 5);
});

test("New team links reuse organization-scoped player IDs without rewriting membership history", async () => {
  await migrate();
  const before = await proofSnapshot(db);
  const teamId = randomUUID();
  await db.query("insert into identity_proof.teams values ($1,$2)", [ids.organizationId, teamId]);
  await db.query("insert into identity_proof.sources values ($1,$2,1,$3)", [ids.organizationId, teamId, sourceFixture()]);
  const plan = await planProofMigration(db, { organizationId: ids.organizationId, teamId });
  assert.equal(plan.mappings.filter((row) => row.create).length, 0);
  await applyProofMigration(db, plan, randomUUID());
  const after = await proofSnapshot(db);
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.memberships, before.memberships);
  assert.equal(after.links.filter((row) => row.team_id === teamId).length, 4);
});

test("Synthetic database archive restores counts, canonical content, revisions, receipts and constraints", async () => {
  const { plan, operationId } = await migrate();
  const baseline = await proofSnapshot(db);
  const archive = await dumpProofDatabase(db);
  assert.ok(archive.size > 0);
  const restored = await restoreProofDatabase(archive);
  try {
    const snapshot = await proofSnapshot(restored);
    assert.equal(sha256(snapshot), sha256(baseline));
    assert.equal(canonicalJson(snapshot), canonicalJson(baseline));
    assert.equal((await applyProofMigration(restored, plan, operationId)).replayed, true);
    await assert.rejects(restored.query("insert into identity_proof.players values ($1,$2,'existing',false,false)", [ids.organizationId, randomUUID()]), (e) => e.code === "23505");
    assert.deepEqual(await proofSnapshot(restored), baseline);
    assert.deepEqual(await proofSnapshot(db), baseline);
  } finally {
    await restored.close();
  }
});

test("Restoring a pre-migration archive discards no original history and allows one reviewed retry", async () => {
  const plan = await planProofMigration(db);
  const before = await proofSnapshot(db);
  const archive = await dumpProofDatabase(db);
  const operationId = randomUUID();
  await applyProofMigration(db, plan, operationId);
  const restored = await restoreProofDatabase(archive);
  try {
    assert.deepEqual(await proofSnapshot(restored), before);
    assert.equal((await proofSnapshot(restored)).receipts.length, 0);
    await applyProofMigration(restored, plan, operationId);
    assert.equal((await applyProofMigration(restored, plan, operationId)).replayed, true);
    const after = await proofSnapshot(restored);
    assert.deepEqual(after.sources, before.sources);
    assert.deepEqual(after.memberships, before.memberships);
    assert.equal(after.references.length, 4);
    assert.deepEqual(after.players, (await proofSnapshot(db)).players);
  } finally {
    await restored.close();
  }
});
