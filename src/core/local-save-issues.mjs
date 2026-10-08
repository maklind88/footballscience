// Advisory save failures belong to a module, principal scope and report generation.
// They contain no draft data and never authorize replay or a central receipt.
export function createLocalSaveIssues({ readManifest, mutateManifest, status, getScope, isProtectedKey, createId }) {
  const unpersisted = new Map();
  const identity = issue => JSON.stringify([issue.scope, issue.key]);
  const valid = issue => issue && typeof issue.id === "string" && typeof issue.scope === "string" &&
    typeof issue.message === "string" && isProtectedKey(issue.key);
  const stored = manifest => Array.isArray(manifest.localSaveIssues) ? manifest.localSaveIssues.filter(valid) : [];
  const current = manifest => {
    const rows = new Map(stored(manifest).map(issue => [issue.id, issue]));
    for (const issue of unpersisted.values()) rows.set(issue.id, issue);
    return [...rows.values()];
  };
  const scope = () => String(getScope() || "");
  const remember = issue => {
    status.lastError = issue.message;
    status.lastErrorIssueId = issue.id;
    status.lastErrorIssueMessage = issue.message;
  };

  function report(key, message) {
    const issue = { id: createId(), key, scope: scope(), message };
    unpersisted.set(identity(issue), issue);
    const persisted = mutateManifest(manifest => {
      manifest.localSaveIssues = [...current(manifest).filter(row => identity(row) !== identity(issue)), issue];
      manifest.lastKey = key;
      manifest.lastError = message;
      manifest.lastErrorIssueId = issue.id;
    });
    remember(issue);
    if (persisted && stored(readManifest()).some(row => row.id === issue.id)) unpersisted.delete(identity(issue));
  }

  function capture(key) {
    const owner = scope();
    const ids = current(readManifest()).filter(issue => issue.key === key && issue.scope === owner).map(issue => issue.id);
    return ids.length ? { key, scope: owner, ids } : null;
  }

  function resolve(captured) {
    if (!captured || captured.scope !== scope()) return;
    const ids = new Set(captured.ids);
    if (!current(readManifest()).some(row => ids.has(row.id))) return;
    const persisted = mutateManifest(manifest => {
      // Retire only reports observed before the successful write. A concurrent
      // report (including another tab's) must survive even for the same module.
      manifest.localSaveIssues = current(manifest).filter(row => !ids.has(row.id));
      if (ids.has(manifest.lastErrorIssueId)) {
        const remaining = manifest.localSaveIssues.find(row => row.scope === scope());
        manifest.lastError = remaining?.message || "";
        manifest.lastErrorIssueId = remaining?.id || "";
      }
    });
    // A failed metadata write must retain the warning, including its in-memory fallback.
    if (!persisted || stored(readManifest()).some(row => ids.has(row.id))) return;
    for (const [key, issue] of unpersisted) if (ids.has(issue.id)) unpersisted.delete(key);
    if (ids.has(status.lastErrorIssueId) && status.lastError === status.lastErrorIssueMessage) {
      const remaining = current(readManifest()).find(row => row.scope === scope());
      status.lastError = remaining?.message || "";
      status.lastErrorIssueId = remaining?.id || "";
      status.lastErrorIssueMessage = remaining?.message || "";
    }
  }

  function error(manifest = readManifest()) {
    const issue = current(manifest).find(row => row.scope === scope());
    if (issue) return issue.message;
    // Keep unowned legacy/operational failures visible. Never infer their owner from
    // lastKey, which ordinary writes may already have replaced in older versions.
    const otherError = !status.lastErrorIssueId || status.lastError !== status.lastErrorIssueMessage;
    return (otherError ? status.lastError : "") || (!manifest.lastErrorIssueId ? manifest.lastError : "") || "";
  }

  return { report, capture, resolve, error };
}
