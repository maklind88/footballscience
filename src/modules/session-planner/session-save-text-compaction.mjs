import { sameSessionValue } from "./session-save-protocol.mjs";

// Only a single text field in an existing session/block. Structural edits,
// tombstones, different fields and other authors are deliberately not merged.
function textField(change) {
  const before = change.before, after = change.after;
  if (!before.session || !after.session) return null;
  const candidates = [["session", "title"]];
  for (let i = 0; i < (after.session.blocks || []).length; i++) {
    for (const field of ["title", "objective"]) candidates.push(["session", "blocks", i, field]);
  }
  for (const path of candidates) {
    const get = (root) => path.reduce((value, key) => value?.[key], root);
    if (typeof get(before) !== "string" || typeof get(after) !== "string" || get(before) === get(after)) continue;
    const restored = structuredClone(after);
    const parent = path.slice(0, -1).reduce((value, key) => value[key], restored);
    parent[path.at(-1)] = get(before);
    if (sameSessionValue(before, restored)) return JSON.stringify(path);
  }
  return null;
}

export function canCompactSessionText(previous, next) {
  const elapsed = next.createdAt - previous.createdAt;
  if (previous.status !== "pending" || previous.attempted || !previous.writer || previous.writer !== next.writer
    || previous.scope !== next.scope || previous.change.date !== next.change.date
    || elapsed < 0 || elapsed > 2000000 || !sameSessionValue(previous.change.after, next.change.before)) return false;
  const field = textField(previous.change);
  return Boolean(field && field === textField(next.change));
}
