import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySessionMutationFailure,
  SessionPlannerOfflineController,
  sessionSyncPresentation,
} from "../candidates/shared/session-planner-offline.mjs";

const ids = Object.freeze({
  client: "00000000-0000-4000-8000-000000000010",
  session: "00000000-0000-4000-8000-000000001001",
  block: "00000000-0000-4000-8000-000000001101",
  renameOperation: "00000000-0000-4000-8000-000000002001",
  durationOperation: "00000000-0000-4000-8000-000000002002",
});
const context = Object.freeze({
  actorId: "actor", organizationId: "organization", partitionKey: "partition", authEpoch: 1, frontendBuildId: "build-v1",
});

function slice({ title = "Synthetic MD-1 Session", revision = 7, durationMinutes = 15 } = {}) {
  return Object.freeze({
    projectionSchema: "fs-session-planner-offline-projection-v1",
    partitionKey: "partition",
    session: Object.freeze({ id: ids.session, title, scheduledDate: "2026-09-01", revision }),
    blocks: Object.freeze([Object.freeze({ id: ids.block, position: 1, title: "Activation", blockType: "warmup", durationMinutes })]),
    players: Object.freeze([]), exercises: Object.freeze([]), excludedFields: Object.freeze([]),
  });
}

function status(state = "synced", pendingOperationCount = 0) {
  return Object.freeze({
    schema: "fs-session-sync-status-v1", partitionKey: "partition", state,
    pendingOperationCount, quarantinedOperationCount: 0, blockedReason: null,
  });
}

test("rename and block duration edits use only typed revisioned offline operations", async () => {
  let currentSlice = slice();
  let currentStatus = status();
  const operations = [];
  const operationIds = [ids.renameOperation, ids.durationOperation];
  const bridge = {
    async applySessionOperation(request) {
      operations.push(request);
      const nextRevision = currentSlice.session.revision + 1;
      currentSlice = request.operation.operationType === "session.rename"
        ? slice({ title: request.operation.title, revision: nextRevision, durationMinutes: currentSlice.blocks[0].durationMinutes })
        : slice({ title: currentSlice.session.title, revision: nextRevision, durationMinutes: request.operation.durationMinutes });
      currentStatus = status("pending", operations.length);
      return { operationId: request.operationId, state: "pending", resultingRevision: nextRevision, durableLocally: true };
    },
    async readSelectedSession() { return currentSlice; },
    async getSessionSyncStatus() { return currentStatus; },
  };
  const controller = new SessionPlannerOfflineController({
    bridge, context, clientInstanceId: ids.client, initialSlice: currentSlice, initialSyncStatus: currentStatus,
    uuidFactory: () => operationIds.shift(),
  });

  const renamed = await controller.renameSession("  Offline Matchday Session  ");
  assert.equal(renamed.slice.session.title, "Offline Matchday Session");
  assert.equal(renamed.presentation.state, "pending");
  assert.equal(renamed.busy, false);
  assert.deepEqual(operations[0], {
    operationId: ids.renameOperation, operationVersion: 1, clientInstanceId: ids.client,
    sessionId: ids.session, baseRevision: 7, context,
    operation: { operationType: "session.rename", title: "Offline Matchday Session" },
  });

  const duration = await controller.setBlockDuration(ids.block, 22);
  assert.equal(duration.slice.blocks[0].durationMinutes, 22);
  assert.equal(duration.slice.session.revision, 9);
  assert.equal(duration.syncStatus.pendingOperationCount, 2);
  assert.deepEqual(operations[1].operation, {
    operationType: "block.duration.set", blockId: ids.block, durationMinutes: 22,
  });
  assert.equal(operations[1].baseRevision, 8);
});

test("conflict and revoked responses remain distinct from a successful local save", async () => {
  const conflictController = new SessionPlannerOfflineController({
    bridge: {
      async applySessionOperation() { throw new Error("stale base revision: expected 8"); },
      async readSelectedSession() { return slice(); },
      async getSessionSyncStatus() { return status(); },
    },
    context, clientInstanceId: ids.client, initialSlice: slice(), initialSyncStatus: status(),
    uuidFactory: () => ids.renameOperation,
  });
  const conflict = await conflictController.renameSession("Conflicting title");
  assert.equal(conflict.presentation.state, "conflict");
  assert.equal(conflict.slice.session.revision, 7);

  assert.equal(classifySessionMutationFailure(new Error("authorization revoked")).state, "revoked");
  assert.equal(sessionSyncPresentation("revoked", 1).label, "Access revoked");
  assert.equal(sessionSyncPresentation("synced", 0).label, "Synced");
});

test("invalid UI values never cross the native bridge", async () => {
  let calls = 0;
  const controller = new SessionPlannerOfflineController({
    bridge: {
      async applySessionOperation() { calls += 1; },
      async readSelectedSession() { return slice(); },
      async getSessionSyncStatus() { return status(); },
    },
    context, clientInstanceId: ids.client, initialSlice: slice(), initialSyncStatus: status(),
    uuidFactory: () => ids.renameOperation,
  });
  assert.equal((await controller.renameSession(" ")).presentation.state, "error");
  assert.equal((await controller.setBlockDuration(ids.block, 0)).presentation.state, "error");
  assert.equal(calls, 0);
});
