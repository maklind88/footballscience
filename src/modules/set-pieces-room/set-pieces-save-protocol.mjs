import { createEmptySetPiecesState, normalizeSetPiecesState } from "./state.mjs";

export const setPiecesSaveSchema = "set-piece-play-change-v1";

const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
const entityArrayFields = new Map([
  ["variants", "id"],
  ["phases", "id"],
  ["elements", "id"],
  ["drawings", "id"],
  ["assignments", "slotId"],
  ["assignmentOverrides", "slotId"],
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function entityId(value, keyField) {
  return String(value?.[keyField] || "").trim();
}

export function canonicalSetPieceValue(value) {
  if (Array.isArray(value)) return value.map(canonicalSetPieceValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => {
    if (unsafeKeys.has(key)) throw new Error("Invalid Set Pieces field.");
    return [key, canonicalSetPieceValue(value[key])];
  }));
}

export function sameSetPieceValue(first, second) {
  return JSON.stringify(canonicalSetPieceValue(first)) === JSON.stringify(canonicalSetPieceValue(second));
}

export function setPiecePlayValue(state, playId) {
  const play = state?.plays?.find((entry) => entry?.id === playId);
  return play ? copy(play) : null;
}

export function replaceSetPiecePlay(state, playId, play) {
  const next = normalizeSetPiecesState(copy(state || createEmptySetPiecesState()));
  const index = next.plays.findIndex((entry) => entry.id === playId);
  if (play) {
    if (index >= 0) next.plays[index] = copy(play);
    else next.plays.push(copy(play));
  } else if (index >= 0) {
    next.plays.splice(index, 1);
  }
  if (!next.plays.some((entry) => entry.id === next.activePlayId)) {
    next.activePlayId = next.plays[0]?.id || "";
  }
  next.updatedAt = next.plays.reduce((latest, entry) => (
    String(entry.updatedAt || "") > latest ? String(entry.updatedAt) : latest
  ), String(next.updatedAt || ""));
  return normalizeSetPiecesState(next);
}

export function createSetPiecePlayChanges(beforeState, afterState, makeId = () => globalThis.crypto.randomUUID()) {
  const before = normalizeSetPiecesState(beforeState || createEmptySetPiecesState());
  const after = normalizeSetPiecesState(afterState || createEmptySetPiecesState());
  const beforeById = new Map(before.plays.map((play) => [play.id, play]));
  const afterById = new Map(after.plays.map((play) => [play.id, play]));
  return [...new Set([...beforeById.keys(), ...afterById.keys()])].flatMap((playId) => {
    const previous = beforeById.get(playId) || null;
    const next = afterById.get(playId) || null;
    if (sameSetPieceValue(previous, next)) return [];
    return [{
      schema: setPiecesSaveSchema,
      id: makeId(),
      playId,
      before: copy(previous),
      after: copy(next),
    }];
  });
}

export function validateSetPiecePlayChange(change) {
  const playId = String(change?.playId || "").trim();
  if (
    change?.schema !== setPiecesSaveSchema ||
    !/^[\w-]{1,120}$/.test(String(change?.id || "")) ||
    !/^[\w-]{1,140}$/.test(playId) ||
    (change.before !== null && !isObject(change.before)) ||
    (change.after !== null && !isObject(change.after)) ||
    (!change.before && !change.after) ||
    (change.before && change.before.id !== playId) ||
    (change.after && change.after.id !== playId)
  ) {
    throw new Error("Invalid Set Pieces change.");
  }
  canonicalSetPieceValue(change);
  return change;
}

function mergeEntityArray(before, after, current, conflicts, path, keyField) {
  const toMap = (items) => new Map(items.map((item) => [entityId(item, keyField), item]).filter(([id]) => id));
  const previousById = toMap(before);
  const nextById = toMap(after);
  const currentById = toMap(current);
  const mergedById = new Map();
  const allIds = new Set([...previousById.keys(), ...nextById.keys(), ...currentById.keys()]);
  for (const id of allIds) {
    const value = mergeSetPieceValue(
      previousById.get(id),
      nextById.get(id),
      currentById.get(id),
      conflicts,
      `${path}.${id}`
    );
    if (value !== undefined) mergedById.set(id, value);
  }

  const previousOrder = before.map((item) => entityId(item, keyField)).filter(Boolean);
  const nextOrder = after.map((item) => entityId(item, keyField)).filter(Boolean);
  const currentOrder = current.map((item) => entityId(item, keyField)).filter(Boolean);
  const retained = previousOrder.filter((id) => nextById.has(id) && currentById.has(id));
  const localRetained = nextOrder.filter((id) => retained.includes(id));
  const centralRetained = currentOrder.filter((id) => retained.includes(id));
  const localReordered = !sameSetPieceValue(localRetained, retained);
  const centralReordered = !sameSetPieceValue(centralRetained, retained);
  if (localReordered && centralReordered && !sameSetPieceValue(localRetained, centralRetained)) {
    conflicts.push(`${path}.order`);
  }
  const preferredOrder = localReordered && !centralReordered ? nextOrder : currentOrder;
  const order = [...new Set([...preferredOrder, ...nextOrder, ...currentOrder])];
  return order.filter((id) => mergedById.has(id)).map((id) => mergedById.get(id));
}

function mergeSetPieceValue(before, after, current, conflicts, path) {
  if (sameSetPieceValue(before, after) || sameSetPieceValue(after, current)) return copy(current);
  if (sameSetPieceValue(before, current)) return copy(after);
  if (path.endsWith(".updatedAt")) {
    return [after, current].filter(Boolean).sort().at(-1) || "";
  }
  if (path.endsWith(".updatedBy")) {
    return copy(after || current || "");
  }
  if (Array.isArray(after) && Array.isArray(current) && Array.isArray(before)) {
    const field = path.split(".").at(-1);
    const keyField = entityArrayFields.get(field);
    if (keyField) return mergeEntityArray(before, after, current, conflicts, path, keyField);
  }
  if (isObject(after) && isObject(current) && (isObject(before) || before === undefined || before === null)) {
    const merged = {};
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after), ...Object.keys(current)]);
    for (const key of keys) {
      if (unsafeKeys.has(key)) throw new Error("Invalid Set Pieces field.");
      const value = mergeSetPieceValue(before?.[key], after[key], current[key], conflicts, `${path}.${key}`);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  conflicts.push(path);
  return copy(current);
}

export function applySetPiecePlayChange(state, input) {
  const change = validateSetPiecePlayChange(input);
  const currentState = normalizeSetPiecesState(state || createEmptySetPiecesState());
  const current = setPiecePlayValue(currentState, change.playId);
  const conflicts = [];
  const play = mergeSetPieceValue(change.before, change.after, current, conflicts, `play.${change.playId}`);
  return {
    ok: conflicts.length === 0,
    conflicts,
    current,
    play,
    state: conflicts.length ? currentState : replaceSetPiecePlay(currentState, change.playId, play),
  };
}
