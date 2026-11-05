// A whole-platform copy is exportable only when every part has the same owner.
// Unknown/legacy recovery formats stay with their module's recovery flow.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = new Set(['id','schema','app','createdAt','reason','source','summary','storage',
  'recoveryCopies','recoveryState','recoverySeparations','saveContext']);
export function isReviewableSnapshot(row, scope, allowedKeys) {
  if (!scope || !object(row) || row.schema !== 'football-science-backup-v1' || row.app !== 'Football Science' ||
      typeof row.id !== 'string' || !row.id || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
      Object.keys(row).some(key => !fields.has(key)) || !object(row.storage) || !Object.keys(row.storage).length ||
      !object(row.saveContext) || row.saveContext.scope !== scope || !object(row.saveContext.entries) ||
      Object.keys(row.saveContext).some(key => !['scope','entries'].includes(key)) ||
      JSON.stringify(row.recoveryCopies) !== '{}' || JSON.stringify(row.recoveryState) !== '{}' ||
      JSON.stringify(row.recoverySeparations) !== '[]') return false;
  if (Object.values(row.saveContext.entries).some(entry => !object(entry) || entry.principalScope !== scope)) return false;
  return Object.entries(row.storage).every(([key,value]) => allowedKeys.has(key) && typeof value === 'string' &&
    row.saveContext.entries[key]?.principalScope === scope);
}
export function encodeSnapshotReview(row, scope, allowedKeys) {
  if (!isReviewableSnapshot(row, scope, allowedKeys)) throw new Error('This copy cannot be verified for this account.');
  // Deliberately lacks the legacy importer's top-level storage/keys properties.
  return JSON.stringify({ schema:'football-science-snapshot-review-v1', purpose:'review-only', scope, versions:[row] });
}
