// Compare JSON-shaped data without serializing large strings again. Unknown
// object types are unequal; property order stays significant like the old JSON
// comparison. This equality never substitutes a hash for recoverable content.
export function equalSnapshotValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== b.length) return false;
  if (![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(a)) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(b))) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every((key, index) =>
    key === other[index] && equalSnapshotValue(a[key], b[key]));
}
