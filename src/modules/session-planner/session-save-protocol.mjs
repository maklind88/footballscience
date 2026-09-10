export const sessionSaveSchema = "session-date-change-v1";
const omitted = new Set(["selectedBlockId", "tacticalActiveFrameId"]);
const unsafe = new Set(["__proto__", "constructor", "prototype"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function canonicalSessionValue(value) {
  if (Array.isArray(value)) return value.map(canonicalSessionValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !omitted.has(key)).map((key) => {
    if (unsafe.has(key)) throw new Error("Invalid session field.");
    return [key, canonicalSessionValue(value[key])];
  }));
}

export function sameSessionValue(a, b) {
  return JSON.stringify(canonicalSessionValue(a)) === JSON.stringify(canonicalSessionValue(b));
}

export function sessionDateValue(state, date) {
  return canonicalSessionValue({
    session: state?.sessions?.[date] || null,
    tombstones: state?.blockDeletionTombstones?.[date] || {},
  });
}

export function replaceSessionDate(state, date, value) {
  const next = { ...state, sessions: { ...state.sessions }, blockDeletionTombstones: { ...state.blockDeletionTombstones } };
  if (value.session) next.sessions[date] = copy(value.session);
  next.blockDeletionTombstones[date] = copy(value.tombstones || {});
  return next;
}

export function createSessionDateChanges(before, after, makeId = () => globalThis.crypto.randomUUID()) {
  const dates = new Set([...Object.keys(after?.sessions || {}), ...Object.keys(after?.blockDeletionTombstones || {})]);
  return Array.from(dates).sort().flatMap((date) => {
    const previous = sessionDateValue(before, date);
    const next = sessionDateValue(after, date);
    // An absent date is not a deletion command, including when a cache was evicted.
    if (!next.session || sameSessionValue(previous, next)) return [];
    return [{ schema: sessionSaveSchema, id: makeId(), date, before: previous, after: next }];
  });
}

export function validateSessionDateChange(change) {
  if (change?.schema !== sessionSaveSchema || !/^[\w-]{1,100}$/.test(change.id || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(change.date || "") ||
      new Date(`${change.date}T12:00:00Z`).toISOString().slice(0, 10) !== change.date ||
      !object(change.before) || !object(change.after) || !object(change.after.session)) {
    throw new Error("Invalid session date change.");
  }
  canonicalSessionValue(change);
  for (const value of [change.before, change.after]) {
    if (!object(value.tombstones) || (value.session && value.session.date !== change.date)) throw new Error("Session date mismatch.");
    const blocks = value.session?.blocks || [];
    if (!Array.isArray(blocks) || blocks.length > 200 || blocks.some((block) => !object(block) || typeof block.id !== "string" || !block.id) ||
        new Set(blocks.map((block) => block.id)).size !== blocks.length) throw new Error("Invalid session blocks.");
  }
  const afterIds = new Set(change.after.session.blocks.map((block) => block.id));
  for (const block of change.before.session?.blocks || []) {
    if (!afterIds.has(block.id) && !change.after.tombstones[block.id]) throw new Error("Block deletion requires a tombstone.");
  }
  for (const timestamp of Object.values(change.after.tombstones)) {
    if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid deletion timestamp.");
  }
  return change;
}

function mergeBlocks(before, after, current, conflicts, path) {
  const map = (blocks) => new Map(blocks.map((block) => [block.id, block]));
  const old = map(before), next = map(after), central = map(current);
  const merged = new Map();
  for (const id of new Set([...old.keys(), ...next.keys(), ...central.keys()])) {
    const block = mergeValue(old.get(id), next.get(id), central.get(id), conflicts, `${path}.${id}`);
    if (block !== undefined) merged.set(id, block);
  }
  const oldIds = before.map((block) => block.id);
  const newIds = after.map((block) => block.id);
  const currentIds = current.map((block) => block.id);
  const retained = oldIds.filter((id) => next.has(id) && central.has(id));
  const localOrder = newIds.filter((id) => retained.includes(id));
  const serverOrder = currentIds.filter((id) => retained.includes(id));
  if (!sameSessionValue(localOrder, retained) && !sameSessionValue(serverOrder, retained) && !sameSessionValue(localOrder, serverOrder)) {
    conflicts.push(`${path}.order`);
  }
  const order = sameSessionValue(localOrder, retained) ? currentIds : newIds;
  return Array.from(new Set([...order, ...newIds, ...currentIds])).filter((id) => merged.has(id)).map((id) => merged.get(id));
}

function mergeValue(before, after, current, conflicts, path) {
  if (sameSessionValue(before, after) || sameSessionValue(after, current)) return copy(current);
  if (sameSessionValue(before, current)) return copy(after);
  if (path.endsWith(".updatedAt") || path.includes(".fieldUpdatedAt.")) {
    return [after, current].filter(Boolean).sort().at(-1);
  }
  if (path.endsWith(".blocks") && [before, after, current].every(Array.isArray)) {
    return mergeBlocks(before, after, current, conflicts, path);
  }
  if (object(after) && object(current) && (object(before) || before === undefined || before === null)) {
    const merged = {};
    for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after), ...Object.keys(current)])) {
      if (omitted.has(key)) continue;
      const value = mergeValue(before?.[key], after[key], current[key], conflicts, `${path}.${key}`);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  conflicts.push(path);
  return copy(current);
}

export function applySessionDateChange(state, input) {
  const change = validateSessionDateChange(input);
  const current = sessionDateValue(state, change.date);
  const conflicts = [];
  const next = mergeValue(change.before, change.after, current, conflicts, change.date);
  // A saved deletion is never undone by an old/offline participant.
  next.tombstones = { ...change.before.tombstones, ...change.after.tombstones, ...current.tombstones };
  if (next.session) next.session.blocks = next.session.blocks.filter((block) => !next.tombstones[block.id]);
  return { ok: !conflicts.length, conflicts, current, next, state: conflicts.length ? state : replaceSessionDate(state, change.date, next) };
}

export function describeSessionDifferences(before, after, date) {
  const differences = [];
  const old = before?.session;
  const next = after?.session;
  for (const field of new Set([...Object.keys(old || {}), ...Object.keys(next || {})])) {
    if (["id", "date", "blocks", "createdAt", "updatedAt", "fieldUpdatedAt", ...omitted].includes(field)) continue;
    if (!sameSessionValue(old?.[field], next?.[field])) differences.push({ date, blockId: "", title: next?.title || old?.title || "Session", field, before: old?.[field], after: next?.[field] });
  }
  const oldOrder = (old?.blocks || []).map((block) => block.id);
  const nextOrder = (next?.blocks || []).map((block) => block.id);
  if (!sameSessionValue(oldOrder, nextOrder)) differences.push({ date, blockId: "", title: "Session", field: "blockOrder", before: oldOrder, after: nextOrder });
  if (!sameSessionValue(before?.tombstones || {}, after?.tombstones || {})) differences.push({ date, blockId: "", title: "Session", field: "deletedExercises", before: before?.tombstones, after: after?.tombstones });
  const beforeBlocks = new Map((old?.blocks || []).map((block) => [block.id, block]));
  const afterBlocks = new Map((next?.blocks || []).map((block) => [block.id, block]));
  for (const id of new Set([...beforeBlocks.keys(), ...afterBlocks.keys()])) {
    const a = beforeBlocks.get(id), b = afterBlocks.get(id);
    const title = b?.title || a?.title || "Exercise";
    if (!a || !b) { differences.push({ date, blockId: id, title, field: "exercise", before: a, after: b }); continue; }
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (["id", "createdAt", "updatedAt", "fieldUpdatedAt", ...omitted].includes(field)) continue;
      if (!sameSessionValue(a[field], b[field])) differences.push({ date, blockId: id, title, field, before: a[field], after: b[field] });
    }
  }
  return differences;
}
