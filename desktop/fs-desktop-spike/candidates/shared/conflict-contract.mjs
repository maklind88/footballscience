const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function reviewToken(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("Invalid review token.");
  return value;
}
function text(value, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError("Invalid conflict text.");
  return value;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new TypeError("Invalid conflict number.");
  return value;
}
function id(value) {
  if (!uuid.test(text(value, 36))) throw new TypeError("Invalid conflict identity.");
  return value;
}
export function validateConflictReview(value, partitionKey) {
  if (value?.schema !== "fs-desktop-conflict-review-v1" || value.partitionKey !== partitionKey
    || !Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > 200
    || !Array.isArray(value.blocks) || value.blocks.length > 200) throw new TypeError("Invalid conflict review scope.");
  const blocks = value.blocks.map((b) => Object.freeze({ id: id(b.id), localTitle: text(b.localTitle), serverTitle: text(b.serverTitle),
    localMinutes: integer(b.localMinutes, 240), serverMinutes: integer(b.serverMinutes, 240) }));
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length) throw new TypeError("Duplicate block.");
  const operations = value.operations.map((o) => {
    const operation = o.operation?.operationType === "session.rename"
      ? { operationType: "session.rename", title: text(o.operation.title, 120) }
      : o.operation?.operationType === "block.duration.set"
        ? { operationType: "block.duration.set", blockId: id(o.operation.blockId), durationMinutes: integer(o.operation.durationMinutes, 240) }
        : null;
    if (!operation || (operation.blockId && !blocks.some((b) => b.id === operation.blockId))) throw new TypeError("Unsupported conflict operation.");
    return Object.freeze({ operationId: id(o.operationId), baseRevision: integer(o.baseRevision), operation: Object.freeze(operation) });
  });
  if (new Set(operations.map((o) => o.operationId)).size !== operations.length) throw new TypeError("Duplicate operation.");
  return Object.freeze({ schema: value.schema, partitionKey, reviewToken: reviewToken(value.reviewToken), sessionId: id(value.sessionId),
    localRevision: integer(value.localRevision), serverRevision: integer(value.serverRevision),
    localTitle: text(value.localTitle), serverTitle: text(value.serverTitle),
    operations: Object.freeze(operations), blocks: Object.freeze(blocks) });
}
export function validateConflictRecovery(value, partitionKey) {
  if (value?.schema !== "fs-desktop-conflict-recovered-v1" || value.partitionKey !== partitionKey || value.uploaded !== false) {
    throw new TypeError("Invalid local recovery receipt.");
  }
  return Object.freeze({ schema: value.schema, partitionKey, recoveryId: id(value.recoveryId),
    requeuedOperationCount: integer(value.requeuedOperationCount, 200), uploaded: false });
}
