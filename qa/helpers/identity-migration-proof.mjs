// Executable design model, not a product adapter or authorized backfill runner.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canonicalJson, sha256 } from "../../scripts/lib/platform-identity-snapshot.mjs";

export const proofIds = Object.freeze({
  organizationId: "10000000-0000-4000-8000-000000000001",
  teamId: "20000000-0000-4000-8000-000000000001",
  otherOrganizationId: "10000000-0000-4000-8000-000000000002",
  otherTeamId: "20000000-0000-4000-8000-000000000002",
  playerId: "30000000-0000-4000-8000-000000000001",
  historicalPlayerId: "30000000-0000-4000-8000-000000000002",
});
export const proofScope = Object.freeze({ organizationId: proofIds.organizationId, teamId: proofIds.teamId });
const tables = ["teams", "sources", "players", "memberships", "links", "references", "receipts"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const databases = new WeakSet();

function requireProof(db) {
  if (!databases.has(db)) throw new Error("Only a factory-created in-memory proof database is allowed");
}

export function sourceFixture() {
  return {
    players: [
      { id: "existing", name: "Synthetic Same Name", rosterType: "squad", countsInSquad: true, archived: false, deleted: false },
      { id: "academy", name: "Synthetic Same Name", rosterType: "academy", countsInSquad: false, archived: false, deleted: false },
      { id: "historical", name: "Synthetic Archived", rosterType: "guest", countsInSquad: false, archived: true, deleted: true },
      { id: "trialist", name: "Synthetic Trial", rosterType: "trialist", countsInSquad: false, archived: false, deleted: false },
    ],
    records: [
      { id: "r1", playerId: "existing", note: "Synthetic record", version: 2 },
      { id: "r2", playerId: "historical", note: "Synthetic history", version: 7 },
      { id: "r3", playerId: "academy", note: "Synthetic record", version: 1 },
    ],
    injuryPlans: [{ id: "p1", playerId: "historical", recommendation: "Synthetic only", version: 3 }],
  };
}

// No connection string, credentials, environment variables or file paths accepted.
export async function createProofDatabase() {
  const db = await PGlite.create();
  databases.add(db);
  try {
    await db.exec(await readFile(new URL("../fixtures/identity-migration-proof.sql", import.meta.url), "utf8"));
    await db.query("insert into identity_proof.teams values ($1,$2),($3,$4)", [
      proofIds.organizationId, proofIds.teamId, proofIds.otherOrganizationId, proofIds.otherTeamId,
    ]);
    await db.query("insert into identity_proof.sources values ($1,$2,12,$3)", [proofIds.organizationId, proofIds.teamId, sourceFixture()]);
    await db.query("insert into identity_proof.players values ($1,$2,'existing',false,false),($1,$3,'historical',true,true)", [
      proofIds.organizationId, proofIds.playerId, proofIds.historicalPlayerId,
    ]);
    await db.query("insert into identity_proof.memberships values ($1,$2,$3,'2025-01-01',null,true),($1,$2,$4,'2024-01-01','2024-12-31',false)", [
      proofIds.organizationId, proofIds.teamId, proofIds.playerId, proofIds.historicalPlayerId,
    ]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function dumpProofDatabase(db) {
  requireProof(db);
  return db.dumpDataDir("none");
}

export async function restoreProofDatabase(archive) {
  const db = await PGlite.create({ loadDataDir: archive });
  databases.add(db);
  return db;
}

export async function proofSnapshot(db) {
  requireProof(db);
  const result = {};
  for (const table of tables) {
    const { rows } = await db.query(`select to_jsonb(t) as row from identity_proof.${table} t`);
    result[table] = rows.map(({ row }) => row).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  }
  return result;
}

async function readInputs(db, scope) {
  if (!uuid.test(scope?.organizationId) || !uuid.test(scope?.teamId)) throw new Error("Explicit scoped identity required");
  const args = [scope.organizationId, scope.teamId];
  const { rows: sources } = await db.query("select * from identity_proof.sources where organization_id=$1 and team_id=$2", args);
  if (sources.length !== 1) throw new Error("Missing source in exact organization/team");
  const { rows: players } = await db.query("select * from identity_proof.players where organization_id=$1 order by id", args.slice(0, 1));
  const { rows: memberships } = await db.query("select to_jsonb(m) as row from identity_proof.memberships m where organization_id=$1 order by team_id,player_id,joined_on", args.slice(0, 1));
  return { source: sources[0], players, memberships: memberships.map(({ row }) => row) };
}

function assertUnique(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`Missing ${label}`);
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry?.id !== "string" || !entry.id.trim() || entry.id.trim() !== entry.id || seen.has(entry.id)) {
      throw new Error(`Missing or duplicate ${label} identity`);
    }
    seen.add(entry.id);
  }
}

function buildPlan(input, scope, allocateId) {
  const source = input.source.body;
  assertUnique(source.players, "players");
  assertUnique(source.records, "records");
  assertUnique(source.injuryPlans, "plans");
  const usedIds = new Set();
  const mappings = source.players.map((player) => {
    if (typeof player.archived !== "boolean" || typeof player.deleted !== "boolean") throw new Error("Unknown historical state");
    const target = input.players.find((row) => row.legacy_id === player.id);
    const playerId = target?.id || allocateId(player.id);
    if (!uuid.test(playerId) || usedIds.has(playerId) || (!target && input.players.some((row) => row.id === playerId))) {
      throw new Error("Invalid or conflicting canonical identity");
    }
    usedIds.add(playerId);
    return {
      legacyId: player.id, playerId, create: !target,
      archived: target?.archived ?? player.archived, deleted: target?.deleted ?? player.deleted,
    };
  });
  const known = new Set(mappings.map((row) => row.legacyId));
  const references = [
    ...source.records.map((payload) => ({ kind: "record", payload })),
    ...source.injuryPlans.map((payload) => ({ kind: "plan", payload })),
  ];
  if (references.some(({ payload }) => !known.has(payload.playerId))) throw new Error("Orphan reference");
  return {
    schema: "identity-migration-synthetic-proof-v1", scope: structuredClone(scope),
    inputHash: sha256(input), sourceRevision: input.source.revision, mappings, references,
  };
}

export async function planProofMigration(db, scope = proofScope) {
  requireProof(db);
  const input = await db.transaction((tx) => readInputs(tx, scope));
  return buildPlan(input, scope, () => randomUUID());
}

// This transaction/receipt protocol belongs ONLY to the acceptance model.
export async function applyProofMigration(db, plan, operationId, { failAfterIdentity = false } = {}) {
  requireProof(db);
  if (!uuid.test(operationId)) throw new Error("Stable operation ID required");
  if (plan.schema !== "identity-migration-synthetic-proof-v1") throw new Error("Unknown proof protocol");
  const scope = [plan.scope.organizationId, plan.scope.teamId];
  const requestHash = sha256(plan);
  return db.transaction(async (tx) => {
    const { rows: receipts } = await tx.query("select * from identity_proof.receipts where organization_id=$1 and team_id=$2 and operation_id=$3", [...scope, operationId]);
    if (receipts.length) {
      if (receipts[0].request_hash !== requestHash) throw new Error("Operation ID reused with different request");
      return { replayed: true, sourceRevision: receipts[0].source_revision };
    }
    const input = await readInputs(tx, plan.scope);
    if (sha256(input) !== plan.inputHash) throw new Error("Snapshot changed; fresh reconciliation required");
    const expected = buildPlan(input, plan.scope, (legacyId) => plan.mappings.find((row) => row.legacyId === legacyId)?.playerId);
    if (sha256(expected) !== requestHash) throw new Error("Plan differs from exact source/identity evidence");
    for (const row of plan.mappings) {
      if (row.create) {
        await tx.query("insert into identity_proof.players values ($1,$2,$3,$4,$5)", [scope[0], row.playerId, row.legacyId, row.archived, row.deleted]);
      }
      const { rows } = await tx.query(`insert into identity_proof.links values ($1,$2,$3,$4)
        on conflict (organization_id,team_id,legacy_id) do update set player_id=excluded.player_id
        where identity_proof.links.player_id=excluded.player_id returning player_id`, [...scope, row.legacyId, row.playerId]);
      if (rows.length !== 1) throw new Error("Existing identity cannot be relinked");
    }
    if (failAfterIdentity) throw new Error("Synthetic mid-transaction failure");
    for (const ref of plan.references) {
      const mapping = plan.mappings.find((row) => row.legacyId === ref.payload.playerId);
      const { rows } = await tx.query(`insert into identity_proof.references values ($1,$2,$3,$4,$5,$6,$7)
        on conflict (organization_id,team_id,kind,id) do update set payload=excluded.payload
        where identity_proof.references.player_id=excluded.player_id returning id`, [
        ...scope, ref.kind, ref.payload.id, mapping.legacyId, mapping.playerId, ref.payload,
      ]);
      if (rows.length !== 1) throw new Error("Historical reference cannot be relinked");
    }
    await tx.query("insert into identity_proof.receipts values ($1,$2,$3,$4,$5)", [...scope, operationId, requestHash, plan.sourceRevision]);
    return { replayed: false, sourceRevision: plan.sourceRevision };
  });
}
